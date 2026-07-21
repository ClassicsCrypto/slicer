# X Broadcast Download Timeout

## TLDR / Status

- Status: fixed, locally deployed, and end-to-end verified.
- A valid X broadcast downloaded continuously to 1,403,229,932 bytes, then Slicer's fixed 30-minute child-process timeout terminated `yt-dlp`.
- The existing 3-minute no-progress watchdog already handles genuine stalls, so the fixed wall-clock timeout is redundant and breaks large/slow downloads.

## Context

- Reported URL: `https://x.com/i/broadcasts/1qJDzzeNpDLKV`
- Partial file: `server/temp/0fa6fa9aee205bd6.mp4.part`
- Observed creation: 2026-07-20 22:58:52 EDT
- Observed last write: 2026-07-20 23:28:49 EDT
- Observed bytes: 1,403,229,932
- `yt-dlp --simulate` succeeds and selects `replay-5500`.

## Root Cause

`server/youtube-api.js` launches `yt-dlp` with `timeout: 30 * 60 * 1000`. Node terminates a healthy long-running download at 30 minutes. Because `stderr` is empty on this timeout, the surfaced error falls back to `err.message`, which is the unhelpful full command string.

## Proposed Changes

1. Remove the fixed 30-minute wall-clock timeout from the download child process.
2. Keep the existing progress-aware `DOWNLOAD_STALL_TIMEOUT_MS` watchdog as the termination mechanism.
3. Preserve `.part` files so retry can resume with yt-dlp's default continuation behavior.
4. Surface a specific timeout/stall message instead of the raw command.
5. Add focused tests for long active downloads, stalled downloads, retry/resume, and error formatting.

## Acceptance Checks

- A simulated download that remains active beyond the former wall-clock boundary is not killed.
- A download with no media-file progress for the configured stall window is killed.
- Retry reuses the matching `.part` file rather than restarting from byte zero.
- UI/API errors distinguish a stall from extractor/network failures and do not expose the full command.
- Existing build and focused server tests pass.

## Risks

- Removing the wall-clock limit requires the progress watchdog to remain reliable.
- Retry must use the same output prefix to resume the partial; current job retry behavior must be verified before claiming resume support.
- The 1.4 GB partial is user data and must not be deleted without explicit authorization.

## Resume Notes

- Branch: `fix/x-broadcast-download-timeout`
- The old partial was preserved and moved to the stable retry prefix `download-ed2c663191f3646d`.
- Resume proof advanced the existing partial by 16,691,768 bytes without retransmitting from zero.
- End-to-end local API verification completed the source and produced `download-ed2c663191f3646d-1qJDzzeNpDLKV.mp4` (1,389,446,071 bytes; 6,793.520333 seconds).
- `npm run test:yt-dlp-download`, `node --check server/youtube-api.js`, `npm run build`, `git diff --check`, API health, and the real X download all passed.
- PM2 `slicer-api` was restarted once and is serving the fixed code.
