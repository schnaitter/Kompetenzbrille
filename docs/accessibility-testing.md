# Accessibility testing guide & release checklist

Target: **WCAG 2.2 AA** (viewer + editor; editor additionally ATAG 2.0 Part A,
see `docs/editor-atag.md`). Automated coverage runs in CI on every PR and push
to `main` (`.github/workflows/accessibility.yml`): IBM Equal Access scans of ten
states plus static HTML validation. This guide covers what automation cannot.

## Setup

- Browser matrix: Firefox + NVDA (Windows), Safari + VoiceOver (macOS/iOS),
  Chrome keyboard-only.
- Serve the app over HTTP (e.g. `npm run serve`), or use the GitHub Pages deploy.
- States are reachable via hash params, e.g.
  `index.html#view=matrix&lang=de&program=hu-berlin-ma-is`,
  `index.html#view=framework&lang=en&programs=hu-berlin-ma-is,hu-berlin-ba-biw`.

## 1 Keyboard (every view + editor)

- [ ] Tab/Shift+Tab order follows the visual order; skip link appears on first
      Tab and jumps to main content
- [ ] Every action reachable and activatable with Enter/Space (matrix cells,
      headers, chips, cards, picker, filters, editor buttons)
- [ ] No focus trap outside dialogs; no focus loss after view/filter changes,
      after add/remove/mark in the editor, or after closing dialogs (focus
      returns to the trigger)
- [ ] Focus ring visible on every stop; focused matrix cells scroll clear of
      the sticky column and topbar
- [ ] Esc closes dialogs and dismisses popovers without moving focus

## 2 Screen reader

- [ ] Dialogs announce title (`aria-labelledby`) and behave as modal; background
      not reachable while open
- [ ] Matrix: moving across cells announces module (column), competency (row)
      and depth ("Tiefe 2: teilweise"); empty cells announce "keine Zuordnung"
- [ ] View/filter changes announced via the status region; editor notices and
      validation errors announced; error fields read their message
      (`aria-invalid` + `aria-describedby`)
- [ ] Language switch: UI reads in the selected language; German module content
      in the English UI reads with German voice (`lang` markup)
- [ ] Comparison status and diff states read as text, not only color

## 3 Zoom, reflow, spacing

- [ ] 200 % and 400 % zoom (or 640/320 px viewport): no horizontal scrolling
      except the matrix table (2D content); no clipped or overlapping content
- [ ] Text spacing override (line-height 1.5, letter-spacing .12em,
      word-spacing .16em, paragraph spacing 2em): no loss of content
- [ ] `prefers-reduced-motion`: no smooth scrolling or transitions

## 4 Contrast & forced colors

- [ ] Windows High Contrast / `forced-colors: active`: level digits, comparison
      marks, program dots, deletion marks and focus remain distinguishable
- [ ] Spot-check phase badges and level blocks against their backgrounds
      (CI scans cover the computed values)

## 5 Editor (ATAG)

- [ ] Run the checklist in `docs/editor-atag.md` (focus after structural edits,
      keyboard upload, draft dialogs, diff text)

## Release checklist

Before tagging/deploying a release:

1. CI green on `main` (Accessibility + Validate data workflows).
2. Sections 1–5 above executed on the release candidate; record browser/AT
   versions and date in the release notes.
3. New findings filed as issues with reproduction steps (label `accessibility`).
4. `accessibility.html` statement date and known-limitations list reviewed.
5. Baseline changes in the release diff reviewed (no silently accepted
   violations).

## Triaging automated findings

- `violation` → fix, or file an issue with justification; never baseline away
  without review.
- `potentialviolation` / `recommendation` → manual check; document the decision
  in the PR if dismissed. CI reports violations only (potentials are geometry-
  and font-dependent across machines); to triage them locally, temporarily set
  `reportLevels: ["violation", "potentialviolation", "recommendation"]` in
  `aceconfig.js`, run `npm run test:a11y`, and revert before committing.
- Baseline updates (`npm run test:a11y:baseline`) are deliberate commits whose
  diff is reviewed like code.
