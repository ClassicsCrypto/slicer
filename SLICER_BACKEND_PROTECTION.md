# Slicer Backend Protection

The compute backend (`server/youtube-api.js`, port 3001) runs yt-dlp downloads,
ffmpeg clipping, uploads, and paid transcription/scoring. It is exposed to the
internet through a Cloudflare tunnel, and its URL is discoverable via the public
`/api/runtime-config` endpoint. Without protection, anyone can run unmetered
compute and spend paid API credits on this box — and the Next session/API-key
layer is bypassable entirely.

Protection has two layers. **Layer 1 (in this repo) is mandatory. Layer 2
(Cloudflare dashboard) is the approved long-term design.**

## Layer 1 — Internal token (code-level, this repo)

Endpoints whose only legitimate callers are server-side require
`Authorization: Bearer ${SLICER_INTERNAL_TOKEN}`:

| Gated (server-called only) | Open (browser-called by design) |
|---|---|
| `POST /job-start` | `POST /info` |
| `POST /download`, `POST /download-start`, `GET /download-poll/*` | `POST /upload` |
| `POST /transcribe-local`, `GET /transcribe-poll/*` | `POST /clip` |
| `POST /score-clips` | `GET/POST /thumbnail` (used as `<img src>` — cannot carry headers) |
| `GET /still` | `GET /serve/*`, `GET /health` |

Notes:

- **Fail-open on missing env:** if `SLICER_INTERNAL_TOKEN` is unset the backend
  logs a loud startup warning and gates nothing (preserves behavior on boxes
  that haven't been configured yet). Set the token — the warning means the hole
  is still open.
- **No loopback exemption, ever.** cloudflared delivers all public tunnel
  traffic to this process from `127.0.0.1`, so source-IP trust is meaningless
  here. Auth is purely token-based.
- Next routes attach the token via `backendAuthHeaders()` in
  `lib/api-url-server.ts`. It deliberately does **not** reuse
  `getInternalRequestHeaders()` (`lib/internal-request.ts`), which prefers
  `AUTOCLIP_POLL_SECRET` and would silently send the wrong token if the two
  secrets differ.
- The backend's own pipeline self-calls (`/transcribe-local`, `/score-clips`
  over loopback inside `handleJobStart`) also send the token.
- The still-export Next proxy (`/api/stills/*`) is itself in
  `PROTECTED_PREFIXES` so gating backend `/still` doesn't just move the open
  ffmpeg endpoint one hop.

### Setup

1. Generate a token:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Put `SLICER_INTERNAL_TOKEN=<token>` in repo-root `.env.local` (the backend
   parses this file itself) **and** in the Next runtime env (Vercel project env
   if the frontend deploys there; the same `.env.local` if self-hosted).
3. Deploy/restart the **Next app first** (the extra header is ignored by an
   un-gated backend, so this order is zero-downtime), then restart
   `node server/youtube-api.js`.

### Residual exposure after Layer 1

`/info`, `/upload`, `/clip`, `/thumbnail`, `/serve` remain anonymous because
the browser calls them directly with no way to carry a secret. That residue is
real (browser-driven ffmpeg/disk abuse) and is what Layer 2 addresses.

## Layer 2 — Cloudflare Access (dashboard, approved direction)

Goal: terminate all backend access at Cloudflare so even the open endpoints are
protected, with a service token for server-to-server calls.

1. In Cloudflare Zero Trust, create an **Access application** for the backend
   tunnel hostname (e.g. `slicer-api.<domain>`).
2. Create a **service token** (Client ID + Secret) and add an Access policy
   that accepts it ("Service Auth" decision).
3. Put the credentials in the Next runtime env as `CF_ACCESS_CLIENT_ID` /
   `CF_ACCESS_CLIENT_SECRET`. `backendAuthHeaders()` already attaches them to
   every Next→backend call — no further code change needed for the
   server-side paths.
4. **Browser-called endpoints are the catch:** the dashboard currently calls
   `/info`, `/upload`, `/clip`, `/thumbnail`, `/serve` on the tunnel hostname
   directly, and a browser cannot present a service token. Until those flows
   are proxied through Next (follow-up work), the Access app needs either
   bypass/`Allow` policies scoped to exactly those paths, or the lockdown must
   wait for the proxy routes. Do not enable a blanket Access policy on the
   hostname before that, or upload/clip-export/thumbnails break.

## Verification matrix

Let `TUNNEL` be the backend URL from `/api/runtime-config` and `TOKEN` the
secret.

```sh
# 1. Gating: expect 401 without token, handler reached (400/500, not 401) with it
curl -s -o /dev/null -w "%{http_code}\n" -X POST $TUNNEL/job-start -H "Content-Type: application/json" -d "{}"
curl -s -o /dev/null -w "%{http_code}\n" -X POST $TUNNEL/job-start -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{}"
# repeat the pair for: POST /download, POST /download-start, GET /download-poll/x,
# POST /transcribe-local, GET /transcribe-poll/x, POST /score-clips,
# GET "/still?sourceUrl=x&timestamp=1"

# 2. Open endpoints unchanged (no 401)
curl -s $TUNNEL/health        # 200 {"status":"ok"}
# POST /info, POST /clip, GET /thumbnail?..., GET /serve/<file> behave as before

# 3. Self-call regression (critical): run a full job from the dashboard and watch
#    the server console — must pass "starting transcription..." through
#    transcribing/analyzing/complete with no 401 on /transcribe-local or /score-clips.

# 4. Next proxy auth: /api/stills/export without a session cookie -> 401;
#    same URL from a logged-in dashboard tab -> 200 image.

# 5. v1 API: GET /api/v1/clips/<clipId>/download with a valid developer key returns MP4.

# 6. Env-mismatch guard: set AUTOCLIP_POLL_SECRET to a different value, restart,
#    start a job — must still work (call sites use SLICER_INTERNAL_TOKEN explicitly).

# 7. Fail-open warning: start the backend with SLICER_INTERNAL_TOKEN unset —
#    warning prints, /job-start reachable. Set it back.
```
