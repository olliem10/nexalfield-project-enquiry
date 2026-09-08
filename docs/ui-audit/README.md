# UI/UX audit — before and after

Screenshots either side of the polish pass, captured by `scripts/ui-audit.mjs`
against the running application at five viewports (360, 390, 768, 1024, 1440).

Re-run with:

```bash
npm run start:local          # in one shell
node scripts/ui-audit.mjs before   # or `after`
```

The harness pairs screenshots with measurements a screenshot cannot make:
horizontal overflow, elements past the right edge, tap targets under 44px
(measured in a separate touch pass — see below), text under 12px, and contrast
against WCAG AA.

## Measured result

| Issue class | Before | After |
| --- | ---: | ---: |
| Contrast below AA | 370 | 0 |
| Text under 12px | 180 | 0 |
| Tap target under 44px (touch) | 28 | 0 |
| Horizontal overflow | 0 | 0 |
| **Total** | **578** | **0** |

## Two things worth knowing about the harness

- **Touch targets are measured in their own pass.** Chromium drops touch
  emulation the first time a `fullPage` screenshot is taken and never restores
  it, so `pointer: coarse` stops matching and every touch-only rule reads as
  absent. `touchPass()` therefore runs in a context that takes no screenshots.
- **`fullPage` screenshots misplace sticky and fixed elements.** The progress
  panel and the bottom navigation are drawn once, at their viewport position,
  so they appear to overlap content in the middle of a tall capture. They do
  not overlap in the running application; the `*-viewport.png` files are
  clipped to the viewport and show the real behaviour.
