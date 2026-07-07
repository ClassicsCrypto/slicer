# Slicer Streams To Job Studio Default Plan

## TLDR

- Goal: Make the dashboard treat Streams as the main job overview and Job Studio as the focused editor for one selected job.
- Current status: Implemented, including clip-level Edit from Streams into Job Studio, and production build passed.
- Next action: Product review in the Slicer III thread.
- Risk/approval needed: No public deployment from this task; local build verification only.

## Context

- Request/source: Sloth in Discord thread `#slicer-iii-refinement` asked to implement the agreed flow.
- Relevant systems: Next.js dashboard, `ClipsGallery`, `JobStudioTab`, `/api/jobs`.
- Important constraints: Keep existing processing, preview, export, stills, delete, retry, rescore behavior intact.
- Prior related work: Job Studio already exists and currently auto-loads the first job with clips.

## Approach

1. Make Streams/Jobs overview the default dashboard tab and relabel the old Clips tab.
2. Add a per-job `Edit Clips` action from the Streams overview that selects that job.
3. Update `JobStudioTab` to accept a selected job id/initial job and scope clips to that job only, with a fallback state when none is selected.
4. Preserve polling so the selected job stays fresh as clips/status update.

## Files And Systems To Touch

- `app/dashboard/page.tsx`
- `components/dashboard/ClipsGallery.tsx`
- `components/dashboard/JobStudioTab.tsx`

## Acceptance Checks

- [x] Dashboard opens to Streams by default.
- [x] Streams overview shows job-level details and an Edit Clips action.
- [x] Edit Clips opens Job Studio scoped to only that selected job's clips.
- [x] Opening a clip in Streams exposes one Edit button that opens Job Studio with that clip selected.
- [x] TypeScript/build passes.
- [x] Memory updated before moving on.

## Risks And Guardrails

- Avoid deleting the existing clip preview/export/still tools unless replaced by the new Studio path.
- Do not change backend job or clip storage.

## Resume Notes

- Last completed step: Patched dashboard tab state, gallery callback, studio selected-job behavior, and clip-level Studio selection; `npm run build` passed and `slicer-preview` restarted.
- Next step: Review the UX in browser/preview if the team wants a visual pass.
- Commands already run: `rg` searches for Slicer UI strings and file reads for dashboard/gallery/studio; `npm run build`.
- Open questions: None blocking.
