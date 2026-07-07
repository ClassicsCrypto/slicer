# Slicer Clip Preview Refinement Plan

## TLDR
- Request: make Edit buttons green, make Clip tab preview cropping match Job Studio, let custom subtitle placement reach the top of the clip, and keep the Clip tab card size stable when changing aspect ratio.
- Status: Implemented and live after PM2 restart.

## Scope
- `components/ui/Button.tsx`
- `components/dashboard/ClipsGallery.tsx`
- `components/dashboard/ClipPlayer.tsx`
- `components/dashboard/JobStudioTab.tsx`
- `types/index.ts`
- `server/youtube-api.js`

## Acceptance Checks
- Buttons labeled `Edit` / `Edit Clips` are green.
- Clip tab preview uses `object-cover` for cropped export formats and `object-contain` for original/custom.
- Clip tab preview keeps a stable 16:9 outer card while changing the inner crop frame to 16:9, 9:16, or 1:1.
- Job Studio custom subtitle offset slider can reach the top of the clip and export receives the same offset value.
- `npm run build` passes.
- Public dashboard and API health checks pass after restart.

## Risks
- Working tree already contains active Slicer changes; keep this patch narrowly scoped and do not revert unrelated files.
