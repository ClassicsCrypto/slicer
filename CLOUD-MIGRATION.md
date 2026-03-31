# Slicer Cloud Migration — Remove Laptop Dependency

## Current Architecture (What Requires Your Laptop)

Two things run on localhost:3001:

1. **YouTube/Twitch Download** (`POST /download`) — uses `yt-dlp` to download videos, uploads to Supabase Storage
2. **Clip Export** (`POST /clip`) — uses `FFmpeg` to cut clips with burned-in subtitles

Everything else already runs in the cloud:
- ✅ Frontend → Vercel
- ✅ Database → Supabase
- ✅ Transcription → AssemblyAI API
- ✅ AI Scoring → Groq API
- ✅ File Storage → Supabase Storage

---

## Option A: Cheap VPS ($5-10/mo) — RECOMMENDED

**What:** Move the local Node.js server (yt-dlp + FFmpeg) to a small cloud VPS.

**Provider options:**
- **Railway** ($5/mo) — Deploy with Dockerfile, auto-scaling, easy
- **Hetzner** ($4/mo) — CX22, 2 vCPU, 4GB RAM, more control
- **DigitalOcean** ($6/mo) — Basic droplet, familiar
- **Fly.io** ($5-8/mo) — Dockerfile deploy, scales to zero when idle

**How it works:**
1. Deploy `server/youtube-api.js` + yt-dlp + FFmpeg to a Docker container
2. Change frontend `localhost:3001` calls → `https://slicer-api.railway.app` (or wherever)
3. Everything works the same, laptop stays off

**Pros:**
- Simplest migration (just move the server, 2 URL changes in frontend)
- yt-dlp + FFmpeg work great on Linux
- Fonts bundled in Docker image
- Can handle multiple users simultaneously
- 24/7 availability

**Cons:**
- $5-10/month recurring cost
- Large video files eat bandwidth

**Effort:** ~2 hours. Write a Dockerfile, deploy, update 2 URLs.

---

## Option B: Serverless Functions (Vercel + External FFmpeg API)

**What:** Replace localhost calls with serverless functions + a cloud FFmpeg service.

**For YouTube downloads:**
- Use a cloud yt-dlp service (cobalt.tools API, or self-host yt-dlp on a serverless function)
- OR: Use Vercel serverless function with yt-dlp WASM (experimental, unreliable)

**For clip export:**
- Use **Shotstack API** ($25/mo starter) or **Transloadit** (pay-per-use) for FFmpeg in the cloud
- OR: Use **FFmpeg.wasm** in the browser (slow, 30+ seconds per clip, no font support)

**Pros:**
- No server to manage
- Scales automatically
- Pay only for usage

**Cons:**
- More complex architecture
- Shotstack/Transloadit adds cost ($25+/mo) and another API dependency
- yt-dlp in serverless is hacky — 10s timeout limits on Vercel free tier
- Subtitle burn-in quality may differ
- More points of failure

**Effort:** ~6-8 hours. Multiple integrations, testing, error handling.

---

## Option C: Browser-Side FFmpeg (No Server At All)

**What:** Run FFmpeg entirely in the browser using FFmpeg.wasm.

**Pros:**
- Zero server cost
- No infrastructure to manage

**Cons:**
- Very slow (30-60s per clip vs 5-10s on server)
- No custom font support in FFmpeg.wasm
- YouTube download still needs a server — can't do yt-dlp in browser
- Large WASM download (~30MB) on first use
- Mobile browsers may crash on large files
- Still needs a server for YouTube, so this only half-solves the problem

**Effort:** ~4-5 hours, and YouTube still needs a server.

---

## My Recommendation: Option A (Railway)

**Why:**
- Cheapest ($5/mo)
- Fastest to implement (~2 hours)
- Identical behavior to current setup
- Already have everything we need (the server code, FFmpeg, yt-dlp, bundled fonts)
- Railway makes Docker deploys trivial — `railway up` and done
- Free trial available to test before committing

**Migration plan:**
1. Create a `Dockerfile` in `server/` with Node.js + yt-dlp + FFmpeg + fonts
2. Deploy to Railway (or Hetzner/DO)
3. Set environment variables (Supabase keys)
4. Update frontend: `localhost:3001` → `https://slicer-api.up.railway.app`
5. Test YouTube download + clip export
6. Done. Laptop can stay closed.

---

## Decision Needed

Let me know which option you want and I'll implement it. Option A is my strong recommendation — simple, cheap, reliable.
