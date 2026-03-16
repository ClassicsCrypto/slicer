# ✂️ Slicer — AI Video Clipping Tool by MCV

> **AI-Powered Clips. Zero Effort.**
> The premier video clipping and subtitle generator by [Mars Cats Voyage](https://marscatsvoyage.com).

---

## Overview

Slicer is a full-stack Next.js 14 web application that lets users drop a video (or paste a URL), configure clip preferences, and receive AI-generated short-form clips with burned-in subtitles — formatted and ready for TikTok, Twitter/X, YouTube Shorts, or any custom aspect ratio.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend | Next.js API routes (serverless) |
| Database | Supabase (PostgreSQL + Row Level Security) |
| Auth | Supabase Auth (Google, Twitter/X, Discord OAuth) |
| Storage | Cloudflare R2 (S3-compatible) |
| AI / Subtitles | OpenAI Whisper API (`whisper-1`) |
| Video | FFmpeg via `fluent-ffmpeg` |

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/your-org/slicer.git
cd slicer
npm install
```

### 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in the values in `.env.local`:

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → Settings → API |
| `R2_ACCOUNT_ID` | Cloudflare dashboard → R2 |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 → Manage API tokens |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 → Manage API tokens |
| `R2_BUCKET_NAME` | Your R2 bucket name (default: `slicer-videos`) |
| `R2_PUBLIC_URL` | R2 bucket public domain (enable in R2 settings) |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) (optional — subtitles) |

### 3. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run:
   ```sql
   -- paste contents of supabase/migrations/001_initial.sql
   ```
3. Enable OAuth providers:
   - Go to **Authentication → Providers**
   - Enable **Google**, **Twitter/X**, and **Discord**
   - Add your OAuth credentials from each platform
4. Set the **Redirect URL** in each provider to:
   ```
   https://your-project.supabase.co/auth/v1/callback
   ```
5. In your Next.js app config, also set redirect to:
   ```
   http://localhost:3000/api/auth/callback
   ```

### 4. Set up Cloudflare R2

1. Create an R2 bucket named `slicer-videos`
2. Enable public access (or use signed URLs)
3. Create an API token with **R2 read & write** permissions
4. Add CORS rules to allow requests from your domain

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Project Structure

```
slicer/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── layout.tsx                  # Root layout
│   ├── globals.css                 # Global styles + animations
│   ├── dashboard/
│   │   └── page.tsx                # Dashboard (Upload / Clips / Settings)
│   └── api/
│       ├── upload/route.ts         # POST — upload video to R2
│       ├── process/route.ts        # POST — start a clip job
│       ├── auth/callback/route.ts  # Supabase OAuth callback
│       └── jobs/
│           ├── route.ts            # GET — list user's jobs
│           └── [jobId]/route.ts    # GET / DELETE — job by ID
├── components/
│   ├── landing/
│   │   ├── Hero.tsx                # Hero section with cat animation
│   │   ├── FeatureMarquee.tsx      # Auto-scrolling feature cards
│   │   └── SocialLogin.tsx         # Google / X / Discord login buttons
│   ├── dashboard/
│   │   ├── UploadTab.tsx           # Drag & drop + URL paste
│   │   ├── OptionsModal.tsx        # Clip configuration modal
│   │   ├── ProcessingView.tsx      # Cat animation + live checklist
│   │   ├── ClipsGallery.tsx        # Previously processed clips grid
│   │   └── SettingsTab.tsx         # Account & defaults settings
│   └── ui/
│       ├── Button.tsx              # Reusable button component
│       ├── Modal.tsx               # Reusable modal component
│       └── Badge.tsx               # Status/count badges
├── lib/
│   ├── supabase.ts                 # Supabase client helpers
│   ├── r2.ts                       # Cloudflare R2 operations
│   └── ffmpeg.ts                   # FFmpeg clip extraction + subtitle burn
├── types/
│   └── index.ts                    # Shared TypeScript types
├── middleware.ts                   # Auth route protection
├── supabase/migrations/
│   └── 001_initial.sql             # Full DB schema with RLS
├── .env.local.example
├── tailwind.config.ts
└── package.json
```

---

## Features

### 🎬 Upload
- Drag & drop video files (MP4, MOV, AVI, WebM, MKV — up to 2GB)
- Paste YouTube, Twitch, or Twitter/X video URLs
- Configure clip options in a rich modal

### ⚙️ Options
- **Clip count:** 1–20 clips
- **Clip length:** 15s / 30s / 45s / 60s / 90s / custom
- **Detection mode:** Auto (AI highlights) or Manual timestamps
- **Subtitles:** Style, size, color, background toggle
- **Output quality:** 720p / 1080p / 4K
- **Platform format:** TikTok, Twitter/X, YouTube Shorts, Custom

### ⚡ Processing
- Live animated MCV cat with teal glow
- Real-time checklist updates via Supabase Realtime
- Estimated time remaining countdown

### 📦 Gallery
- Grid view of all past jobs with thumbnails
- Per-job status badges (Pending / Processing / Complete / Failed)
- Preview modal, download, and delete actions
- Bulk select + delete

### ⚙️ Settings
- Account management (name, avatar)
- Default output preferences
- Connected accounts (Phase 3)
- Danger zone: account deletion

---

## Deployment

### Vercel (recommended)

```bash
npm install -g vercel
vercel
```

Set all environment variables in the Vercel dashboard.

**Note:** FFmpeg processing won't work on Vercel's default serverless functions. For production, use one of:
- [Vercel Pro + Fluid compute](https://vercel.com/docs/functions/fluid-compute) (up to 800MB memory)
- A separate worker service (Railway, Fly.io) for heavy FFmpeg tasks
- [Modal.com](https://modal.com) for GPU-accelerated processing

---

## Phase 3 Roadmap (not yet built)

> **DO NOT BUILD** — documented for future reference only.

### 🔐 Wallet Login
- RainbowKit + wagmi integration
- Sign-in with Ethereum (SIWE)

### 🪙 $CREAM Token Gating
- Hold ≥ 100 $CREAM → unlock 4K quality + unlimited clips
- Smart contract read on Ethereum/Base

### 📤 Direct Social Posting
- Post clips directly to X, TikTok, YouTube from the dashboard
- OAuth 2.0 integration with posting scopes

---

## Credits

Built with ❤️ for **Mars Cats Voyage** by the MCV dev team.

- [Next.js](https://nextjs.org)
- [Supabase](https://supabase.com)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)
- [FFmpeg](https://ffmpeg.org)
- [OpenAI Whisper](https://openai.com/research/whisper)
