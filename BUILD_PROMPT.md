# Slicer — AI Video Clipping & Subtitle Tool
## Build Prompt for Claude Code

Build a full-stack Next.js 14 web application called **Slicer** — an AI-powered video clipping and subtitle tool for Mars Cats Voyage (MCV).

---

## Tech Stack
- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend:** Next.js API routes (serverless on Vercel)
- **Database:** Supabase (PostgreSQL + auth)
- **Storage:** Cloudflare R2 (video files)
- **AI/Processing:** Whisper (local via API route calling whisper.cpp or openai-whisper), FFmpeg (via fluent-ffmpeg)
- **Auth:** Supabase Auth (Google, Twitter/X, Discord OAuth)

---

## Color Theme
- Primary: Teal `#00BFA5` / Green `#00E676`
- Background: Dark `#0A0E1A`
- Surface: `#111827`
- Text: White `#FFFFFF`, Muted `#9CA3AF`
- Accent: `#00BFA5`

---

## Pages & Components

### 1. Welcome / Landing Page (`/`)
- MCV-branded header with Slicer logo (teal/green)
- Hero section with tagline: "AI-Powered Clips. Zero Effort."
- Auto-scrolling feature cards (horizontal marquee):
  - 🎬 Auto Clip Detection
  - 📝 AI Subtitles
  - 📱 Platform-Ready Formats
  - 🎨 Custom Subtitle Styles
  - ⚡ Fast Processing
  - 🔒 Secure Storage
- Social login buttons: Google, Twitter/X, Discord
- Footer with MCV branding

### 2. Dashboard (`/dashboard`)
Three tabs:

#### Tab 1: Upload
- Drag & drop zone (accepts mp4, mov, avi, webm, mkv — max 2GB)
- OR paste a YouTube / Twitch / Twitter video URL
- On file/URL ready → trigger **Options Popup**

#### Options Popup (modal)
Fields:
- **Clip Count:** slider 1–20 (default 5)
- **Clip Length:** dropdown: 15s / 30s / 45s / 60s / 90s / Custom
- **Detection Mode:** toggle Auto (AI picks highlights) / Manual (user marks timestamps)
- **Subtitles:** toggle on/off
  - Style: dropdown (Bold, Clean, Shadow, Outline, Karaoke)
  - Size: Small / Medium / Large
  - Color: color picker (default white)
  - Background: toggle on/off
- **Output Quality:** 720p / 1080p / 4K
- **Platform Format:**
  - TikTok (9:16, max 60s)
  - Twitter/X (16:9, max 140s)
  - YouTube Shorts (9:16, max 60s)
  - Custom (original aspect ratio)
- **[Start Processing]** button

#### Processing Screen (replaces upload tab content while processing)
- MCV cat animation (CSS/Lottie animated cat, teal glow)
- Live checklist:
  - [ ] Uploading video
  - [ ] Analyzing content with AI
  - [ ] Detecting highlight moments
  - [ ] Generating subtitles
  - [ ] Rendering clips
  - [ ] Finalizing export
- Estimated time remaining (countdown)
- Cancel button

#### Tab 2: Previously Clipped
- Grid gallery of past clip jobs (card per job):
  - Thumbnail (first frame)
  - Video title / source
  - Date processed
  - Clip count badge
  - Status badge (Processing / Complete / Failed)
- Per-clip actions: Preview (modal player), Download, Delete
- Bulk actions: Select All, Download Selected, Delete Selected
- Empty state with CTA to upload first video

#### Tab 3: Settings
Sections:
- **Connected Accounts:** Connect/disconnect X, YouTube, Twitch, TikTok, Instagram (OAuth placeholder for Phase 2 direct posting)
- **Video Output Defaults:** default quality, format, subtitle style
- **Account Management:** display name, email, avatar
- **Danger Zone:** Delete Account (confirm modal)

---

## API Routes

### `POST /api/process`
Accepts: `{ videoUrl?, filePath?, options: ProcessingOptions }`
Returns: `{ jobId: string }`
- Creates a Supabase job record
- Enqueues processing (use background worker pattern)

### `GET /api/jobs/[jobId]`
Returns job status + progress checklist state

### `GET /api/jobs`
Returns list of all jobs for authenticated user

### `DELETE /api/jobs/[jobId]`
Deletes job + associated clips from R2

### `POST /api/upload`
Handles direct file upload → streams to R2
Returns: `{ r2Key: string, duration: number }`

---

## Database Schema (Supabase)

```sql
-- Users handled by Supabase Auth

-- Jobs table
create table jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text,
  source_url text,
  r2_key text,
  status text default 'pending', -- pending | processing | complete | failed
  options jsonb,
  progress jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Clips table
create table clips (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs not null,
  user_id uuid references auth.users not null,
  r2_key text not null,
  thumbnail_r2_key text,
  duration integer, -- seconds
  start_time integer,
  end_time integer,
  subtitle_track jsonb,
  created_at timestamptz default now()
);
```

---

## Environment Variables (`.env.local.example`)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=slicer-videos
R2_PUBLIC_URL=
OPENAI_API_KEY= # optional, for Whisper API fallback
```

---

## File Structure
```
slicer/
├── app/
│   ├── page.tsx              # Landing page
│   ├── dashboard/
│   │   └── page.tsx          # Dashboard with tabs
│   ├── api/
│   │   ├── process/route.ts
│   │   ├── upload/route.ts
│   │   └── jobs/
│   │       ├── route.ts
│   │       └── [jobId]/route.ts
│   └── layout.tsx
├── components/
│   ├── landing/
│   │   ├── Hero.tsx
│   │   ├── FeatureMarquee.tsx
│   │   └── SocialLogin.tsx
│   ├── dashboard/
│   │   ├── UploadTab.tsx
│   │   ├── OptionsModal.tsx
│   │   ├── ProcessingView.tsx
│   │   ├── ClipsGallery.tsx
│   │   └── SettingsTab.tsx
│   └── ui/
│       ├── Button.tsx
│       ├── Modal.tsx
│       └── Badge.tsx
├── lib/
│   ├── supabase.ts
│   ├── r2.ts
│   └── ffmpeg.ts
├── types/
│   └── index.ts
└── package.json
```

---

## Key Implementation Notes
1. Use `@aws-sdk/client-s3` for R2 (S3-compatible API)
2. FFmpeg processing should be done in API routes using `fluent-ffmpeg`
3. Whisper integration: call `openai.audio.transcriptions.create` with Whisper-1 model (falls back gracefully if no API key — skips subtitles)
4. Processing is async — use Supabase realtime to stream progress updates to the frontend
5. Auth middleware: protect `/dashboard` and all `/api/` routes
6. The MCV cat animation on the processing screen: use a CSS keyframe animation with an SVG cat silhouette (teal/green glow effect)
7. All forms must have proper loading states and error handling
8. Mobile-first responsive design

---

## Deliverables
1. Complete Next.js 14 project (all pages, components, API routes)
2. `README.md` with setup instructions
3. `.env.local.example` with all required env vars
4. `supabase/migrations/001_initial.sql` with full schema
5. Deployed and working locally with `npm run dev`

---

## Phase 3 (DO NOT BUILD YET — document only in README)
- Wallet login (RainbowKit + wagmi)
- $CREAM token-gating: hold 100 $CREAM → unlock 4K quality + unlimited clips
- Premium tier: direct social posting (X, TikTok, YouTube)

---

When completely finished, run this command to notify:
openclaw system event --text "Slicer build complete — full Next.js 14 app scaffolded in C:\Users\HENRI\.openclaw\workspace\projects\slicer" --mode now
