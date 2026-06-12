# Slicer Auth Provider Setup

## Jay-needed

- **Email login sender setup** — choose/provide the email service Slicer should send one-time login codes from.
  - Recommended: **Resend** with an MCV-owned domain/email.
  - Needed from Jay: sender service choice, verified sender/domain, API key or SMTP credentials, and the “from” address — example: `Slicer <login@marscatsvoyage.com>`.

## Super simple Jay links

1. Twitch Developer Console — auto-clipping app/provider setup  
   https://dev.twitch.tv/console/apps

2. Google Cloud OAuth Clients — Google sign-in app  
   https://console.cloud.google.com/apis/credentials

3. Google OAuth consent screen  
   https://console.cloud.google.com/apis/credentials/consent

## What is already wired in code

Slicer now supports Resend for email login codes without adding a package dependency. Set these env vars in production/stable:

```env
AUTH_EMAIL_PROVIDER=resend
RESEND_API_KEY=...
AUTH_EMAIL_FROM="Slicer <login@marscatsvoyage.com>"
NEXT_PUBLIC_APP_URL=https://slicer.marscatsvoyage.com
```

If those vars are missing, email login is **unavailable** (the request endpoint returns 503 and no code is minted). For local preview testing only, set `AUTH_EMAIL_DEBUG=true` in a non-production build to get the `devCode` response; the flag is ignored when `NODE_ENV=production`. Do **not** work around an unconfigured mailer with `SKIP_AUTH=true` — that disables auth entirely.

## Recommended Resend path

1. Create/use an MCV-owned Resend account.
2. Add and verify `marscatsvoyage.com` or a dedicated subdomain.
3. Create an API key with send access.
4. Pick the sender address, recommended: `Slicer <login@marscatsvoyage.com>`.
5. Add the env vars above to the Slicer deployment.
6. Test a real login code email before turning debug/off-preview flows over to the team.

## OAuth callback URLs

Use the deployed Slicer URL as the base.

```text
Google callback:  https://slicer.marscatsvoyage.com/api/auth/callback/google
Discord callback: https://slicer.marscatsvoyage.com/api/auth/callback/discord
```

For local testing:

```text
Google callback:  http://localhost:3000/api/auth/callback/google
Discord callback: http://localhost:3000/api/auth/callback/discord
```

## Twitch app notes

Create the Twitch Developer Console app/provider with the production callback/domain Slicer will use for auto-clipping. Keep the client secret private and add it to deployment env only; do not paste it in Discord.
