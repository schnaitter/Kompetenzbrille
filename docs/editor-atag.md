# Editor accessibility — ATAG 2.0 Part A checklist

The editor (`editor.html`) is an authoring tool, so WCAG 2.2 AA alone is not
enough: ATAG 2.0 Part A applies to the tool itself. This checklist maps the
requirements to what is implemented and what still needs a manual check.
Automated coverage: the `editor-de` state of `npm run test:a11y`
(WCAG 2.2 AA policy, blocking in CI).

## A.1 Authoring interfaces must be accessible

- [x] All actions are native buttons/links/selects/inputs (keyboard + AT)
- [x] Full keyboard operability: Tab/Shift+Tab, Enter/Space, Esc (dialogs)
- [x] Visible focus ring on every interactive element (`:focus-visible`)
- [x] Focus is not obscured by sticky headers (`scroll-padding-top`)
- [x] Modal dialogs: focus trap, focus restore, `aria-labelledby`, inert
      background (shared `js/dialog.js`)
- [x] Upload is a real button triggering a hidden file input (keyboard reachable)
- [x] `<html lang>` follows the UI language; foreign content carries `lang`

## A.2 Authoring interfaces must support accessible production

- [x] Validation errors are announced (`role=status` live region) and linked
      to fields (`aria-invalid` + `aria-describedby` → error list entries)
- [x] Error summary provides jump links that focus the offending field
- [x] Notices use `role=status` / `role=alert`
- [x] Focus survives structural edits: add category/module/topic/mapping
      focuses the new field; remove focuses the list's add button;
      mark-for-deletion keeps focus on the mark button
- [x] Diff/status information is not color-only: strikethrough (removed),
      bold (added), text badges and screen-reader status prefixes
- [x] Deletion marks are strikethrough + dimmed, with a text button to undo
- [x] Draft resume/delete are labelled buttons; autosave is announced via
      the status region

## A.3 Templates and automated content must be accessible

- [x] New modules/mappings start from schema-valid templates; validation
      guides the author to accessible, well-formed data
- [x] Exported YAML round-trips through the same validator as the viewer

## Manual checks (repeat before releases, see accessibility-testing.md)

- [ ] Tab through the whole editor without a mouse: source → base info →
      categories → modules → mappings → framework panel → export
- [ ] Screen reader (NVDA/Firefox or VoiceOver/Safari): error list, notices,
      dialog titles, diff badges announce meaningful text
- [ ] Add/remove/mark with keyboard only: focus never lands on `<body>`
- [ ] 200 % zoom and 320 px width: no loss of content or functionality
- [ ] forced-colors mode: marks, diffs and focus remain distinguishable
