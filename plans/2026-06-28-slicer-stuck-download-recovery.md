# Slicer Stuck Download Recovery Plan

## TLDR
- Request: Sloth reported a manually submitted Slicer stream stuck in the Clips tab at download/processing state for well over an hour.
- Status: Fixed and live. Job `1b8519f0-9023-44eb-bd94-0eb78de9eee5` completed with 10 clips.

## Context
- Active app: `C:\Users\HENRI\.openclaw\workspace\slicer-dev`.
- The stuck job was created at `2026-06-28T23:56:44Z` for `https://x.com/i/broadcasts/1MJgNNOMmQqGL`.
- `slicer-api` was restarted at about `2026-06-28T23:57Z` during UI refinement work, shortly after the backend started `yt-dlp`.
- The job stayed `status=processing`, `phase=downloading`, `sourceReady=false`, `deliveredClipCount=0`.

## Hypothesis
- `server/youtube-api.js` owns the async `job-start` promise in memory.
- Restarting `slicer-api` while `ensureDownloadedSource()` is running kills that promise and any child download state.
- The database row remains `processing/downloading`.
- Dashboard recovery only fails jobs after 2 hours, so the user sees a stuck job for too long.

## Fix Scope
- Rerun the existing job ID via backend `/job-start`, without creating a duplicate job.
- Patch dashboard/poll stale recovery to treat interrupted `downloading` jobs as stale after 45 minutes.
- Keep the 2-hour timeout for later processing phases so long transcribe/analyze runs are not marked failed too aggressively.

## Acceptance Checks
- Existing stuck job moves out of dead pre-restart state.
- `npm run build` passes.
- `server/youtube-api.js` syntax check passes.
- Public dashboard and API health return OK after restart.

## Result
- Updated `yt-dlp` from `2026.3.17` to `2026.6.9`.
- Retried the existing job ID; final source downloaded as `db8c8ddfff4b3e5d-1MJgNNOMmQqGL.mp4`.
- Transcription processed 10,557 words from a 120-minute replay.
- Clip scoring completed with 10 delivered clips.
- Patched future behavior:
  - X/Twitch/default downloads prefer 720p unless the job explicitly asks for 1080p.
  - Downloading jobs become stale after 45 minutes, while later processing phases keep the 2-hour timeout.
  - Active downloads send periodic DB heartbeats with received MB so growing downloads do not look dead.
  - `yt-dlp` child process is killed after no media progress for the stall window.
  - Whisper/Groq command logging redacts the API key.

## Risks
- X broadcast downloads can be slow or fail because of `yt-dlp`/X behavior. If rerun fails, the job should become visibly failed/retryable rather than silently stuck.
