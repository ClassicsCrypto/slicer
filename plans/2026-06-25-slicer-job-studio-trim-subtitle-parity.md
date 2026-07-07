# Slicer Job Studio Trim + Subtitle Parity Plan

## TLDR
Add real trim start/end controls to the Job Studio red timeline and make preview subtitle sizing/layout match export behavior more closely.

## Scope
- Touch Job Studio UI only unless export payload wiring requires a small route/backend change.
- Preserve current real-clip loading and play/pause behavior.
- Verify with `npm run build` and restart `slicer-preview`.

## Acceptance
- Red bar has draggable start/end handles.
- Dragging handles changes play bounds and playhead clamps inside the trim range.
- UI shows start/end/trim duration clearly.
- Preview caption font sizing/positioning uses export-like pixel ratios instead of responsive Tailwind text classes.
- Job Studio export subtitle render stays visually stable and matches the preview cue text instead of flickering per-word ASS events.
- Preview canvas uses the selected export aspect ratio immediately, before video metadata or hover-enlarge state.
- Build passes and preview process restarts.

## Risks
- Actual export endpoint may still ignore Job Studio local trim/subtitle options if the export button remains placeholder-only. Note any remaining gap.

## 2026-06-28 Resume Note
- Sloth reported exported clips differ from previews: subtitle flicker in exports and preview aspect ratio wrong until hover-enlarge.
- Fix direction: keep export subtitle events stable at phrase/cue level and make preview aspect ratio deterministic from selected format.
