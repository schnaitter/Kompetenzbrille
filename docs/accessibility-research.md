# Accessibility research & issue drafts

Status: research only — nothing in this document is implemented or filed yet.
Date: 2026-11-19.

## 1. What standard should we target?

**Recommendation: WCAG 2.2 Level AA, plus the public-sector requirements of
BITV 2.0 / EN 301 549 where they apply.**

| Standard | Status | Relevance here |
| --- | --- | --- |
| WCAG 2.2 (W3C Recommendation, Oct 2023; ISO/IEC 40500:2025) | Current | The testable target. All new work should meet 2.2 AA. |
| WCAG 2.1 | Superseded by 2.2 | Not needed separately; 2.2 is a superset in practice. |
| WCAG 3.0 | W3C Working Draft | **Not** a conformance target yet. Do not make acceptance criteria depend on it. |
| EN 301 549 v4.1.1 (ETSI, Sept 2026) | Current EU harmonised standard | Updated to align with **WCAG 2.2** (verified in the published PDF). Relevant if the app is procured/offered in the EU. |
| BITV 2.0 (Germany) | In force; still references WCAG 2.1 / EN 301 549 | This is a university project (HU Berlin), so public-body rules apply. Meeting WCAG 2.2 AA covers the technical criteria; the *Erklärung zur Barrierefreiheit* and feedback mechanism are additional organisational duties. |
| European Accessibility Act (EAA) / BFSG | Applies since 28 June 2025 | Depends on whether the offer counts as a consumer service; the public-sector route is the safer assumption. |
| ATAG 2.0 | W3C Recommendation | Relevant for `editor.html`, which is an authoring tool. Part A (accessible authoring UI) clearly applies. |

Automated tools can only check part of WCAG — commonly estimated at ~30–50 %
of success criteria. The CI gate is necessary but not sufficient; keyboard and
screen-reader tests remain mandatory for the issues below.

## 2. Tooling research

### 2.1 IBM Equal Access Accessibility Checker (recommended primary CI engine)

The package the user remembered is **`accessibility-checker`** (IBM Equal
Access, Apache-2.0). Verified locally:

- current version **4.0.35**, actively maintained (`IBMa/equal-access`, last
  push 2026-11-13);
- works with a **Playwright page object** directly;
- has an explicit **`WCAG_2_2` (A, AA)** policy (also `WCAG_2_1`, `IBM_Accessibility`);
- supports **baseline files** (`baselineFolder`) so legacy findings can be
  stored while CI blocks *new* issues;
- outputs JSON, HTML, CSV, XLSX; `failLevels` controls what breaks the build;
- no SARIF output built in (a small converter or the HTML report is enough).

Policies verified with `npx achecker archives`:

```
Latest Deployment [latest]
  - IBM Accessibility 7.3 [IBM_Accessibility]
  - WCAG 2.2 (A, AA) [WCAG_2_2]
  - WCAG 2.1 (A, AA) [WCAG_2_1]
  - WCAG 2.0 (A, AA) [WCAG_2_0]
```

Baselines match on **ruleId + XPath**. That is useful for a quick rollout but
brittle for a heavily re-rendered SPA: DOM changes invalidate entries. Treat
baselines as a temporary burn-down list, not as permanent waivers.

### 2.2 axe-core (recommended second opinion / best-practice rules)

`@axe-core/playwright` (axe-core 4.14) is the de-facto community standard. It
supports WCAG 2.0/2.1/2.2 tags plus `best-practice` rules and is easy to add.
It has no first-class per-selector baseline, so it is better as a second engine
once the app is mostly clean. Running two engines from day one doubles triage
noise; pick one gate first.

### 2.3 Other tools

| Tool | Use | Verdict |
| --- | --- | --- |
| `html-validate` (v11) | Static HTML validation (`index.html`, `editor.html`) | Cheap, useful, but does not see JS-generated DOM. Add as a second CI job. |
| `pa11y-ci` (v5) | URL sweeps | Simple, but cannot reach the app's views/modals/editor states without scripting. Not a good primary gate here. |
| Lighthouse CI | Perf/SEO plus a small axe subset | Too narrow for a11y; not recommended as the a11y gate. |
| Browser extensions (IBM/axe DevTools) | Manual spot checks | Good for development, not CI. |
| NVDA + Firefox, VoiceOver + Safari, keyboard only, 200 %/400 % zoom, forced-colors | Manual audit | Mandatory; see issue #3. |

### 2.4 What a realistic CI gate looks like

1. **Phase 0 — report only.** Run the scan on every PR, upload the HTML/JSON
   report as an artifact, but `continue-on-error: true`. Collect the real state.
2. **Phase 1 — block violations.** Commit the current findings as baselines and
   fail on `violation` only. New violations break the build; existing ones must
   be removed when a fix lands.
3. **Phase 2 — block potential violations** after triage (IBM uses
   `potentialviolation` for things like focus visibility, which are real but
   noisy).
4. **Phase 3 — remove baselines** file by file; add a script/check that the
   baseline count may only shrink, so a PR cannot silently accept a regression.
5. Keep `axe-core` as a separate optional job for best-practice rules.

## 3. Proposed setup (files, config, CI)

Add to `devDependencies`:

```bash
npm i -D playwright accessibility-checker html-validate http-server wait-on
npx playwright install chromium
```

`package.json` scripts:

```json
{
  "scripts": {
    "serve": "http-server . -p 4173 -c-1",
    "test:a11y": "node tests/a11y/run.js",
    "test:a11y:baseline": "node tests/a11y/update-baseline.js",
    "test:html": "html-validate index.html editor.html",
    "test": "npm run test:html && npm run test:a11y"
  }
}
```

`aceconfig.js`:

```js
module.exports = {
  policies: ["WCAG_2_2"],
  ruleArchive: "latest",
  failLevels: ["violation"],              // phase 2: add "potentialviolation"
  reportLevels: ["violation", "potentialviolation", "recommendation"],
  outputFormat: ["json", "html"],
  outputFolder: "results",
  baselineFolder: "tests/a11y/baselines"
};
```

`tests/a11y/run.js` (sketch):

```js
const { chromium } = require("playwright");
const aChecker = require("accessibility-checker");

const BASE = process.env.BASE_URL || "http://127.0.0.1:4173";
const scans = [
  { label: "viewer/program-de", path: "index.html#view=program&lang=de",
    wait: ".phase-section" },
  { label: "viewer/framework-2-programs",
    path: "index.html#view=framework&lang=de&programs=hu-berlin-ma-is,hu-berlin-ma-wf",
    wait: ".picker-btn" },
  { label: "viewer/matrix", path: "index.html#view=matrix&lang=de",
    wait: "table.matrix" },
  { label: "viewer/help-modal", path: "index.html#view=program&lang=de",
    wait: ".phase-section", action: p => p.click('[data-action="open-help"]') },
  { label: "viewer/module-modal", path: "index.html#view=program&lang=de",
    wait: ".phase-section", action: p => p.click('[data-action="open-module"]') },
  { label: "editor", path: "editor.html", wait: "#editor-main" }
];

(async () => {
  const browser = await chromium.launch();
  let failed = 0;
  for (const s of scans) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      reducedMotion: "reduce"
    });
    await page.goto(`${BASE}/${s.path}`, { waitUntil: "networkidle" });
    await page.waitForSelector(s.wait);
    if (s.action) await s.action(page);

    const { report } = await aChecker.getCompliance(page, s.label);
    const code = aChecker.assertCompliance(report); // 0 = pass/baseline match
    console.log(`[${code === 0 ? "PASS" : "FAIL"}] ${s.label}`);
    if (code !== 0) {
      failed++;
      console.log(aChecker.stringifyResults(report));
    }
    await page.close();
  }
  await aChecker.close();
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
```

The hash parameters make scans deterministic (`#view=`, `#programs=`, `#comp=`,
`#cf=`) — no clicking through the UI needed.

Baseline generation (deliberate, reviewed step):

```bash
# run once without baselines, then copy the generated report for each label
npm run test:a11y
cp results/viewer/program-de.json tests/a11y/baselines/viewer/program-de.json
# repeat for every label; commit the baselines with the PR
```

`update-baseline.js` can automate this, but must print every accepted finding
and should never run automatically in CI.

`.github/workflows/accessibility.yml`:

```yaml
name: Accessibility
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  a11y:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - name: Start static server
        run: npx http-server . -p 4173 -c-1 --silent &
      - run: npx wait-on http://127.0.0.1:4173/index.html
      - run: npm run test:a11y
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: a11y-report
          path: results/
      - run: npm run test:html
```

Optional: add `continue-on-error: true` to the scan step for phase 0 only, and
remove it once baselines are committed.

For GitHub code scanning, axe results can be converted to SARIF with
`axe-sarif-converter`; IBM's JSON can be converted with a short script. Not
required for the first iteration.

## 4. Actual findings from a trial scan

Trial run: IBM `accessibility-checker` 4.0.35, policy `WCAG_2_2`, Playwright
Chromium, local static server, 2026-11-19. These are **sample counts**, not a
baseline; the matrix page dominates because every cell is a header/semantics
finding.

| Page/state | Violations | Top rules |
| --- | ---: | --- |
| Viewer, program view | 20 | 15 `text_contrast_sufficient`, 2 `input_label_exists`, 2 `target_spacing_sufficient`, 1 `aria_complementary_labelled` |
| Viewer, framework view | 14 | 12 `text_contrast_sufficient`, 1 `aria_complementary_labelled`, 1 `input_label_exists` |
| Viewer, matrix view | 249 | **233 `table_headers_related`**, 11 contrast, 2 input labels, 2 target spacing, 1 `aria_accessiblename_exists` |
| Viewer, module/help modal | 20 | 15 contrast, 2 input labels, 2 target spacing, 1 `aria_complementary_labelled`; 23 potential `element_tabbable_unobscured` |
| Editor | 51 | 48 contrast, 2 unlabelled `aside`, 1 unlabelled `select`; 26+ potential `style_focus_visible` |

Recurring potential findings everywhere: `style_focus_visible` (24+),
`element_tabbable_unobscured` (15+), `input_checkboxes_grouped` (28),
`aria_landmark_name_unique` (2), `style_color_misuse` (1).

Manual/code findings not fully covered by the scanner:

- clickable `<td>`, `<th>`, `<span>`, `<div>` elements with no `tabindex`,
  role, or keyboard handler (`js/app.js` matrix, chips, cards, pickers);
- modals have `role="dialog"`/`aria-modal` but no focus trap, no initial focus,
  no focus restore, no `aria-labelledby`;
- popovers open on `mouseover` only and rely on `title` attributes;
- language switch never updates `<html lang>`;
- no skip link; sidebars are unlabelled; heading order skips levels;
- matrix has no `<caption>` and no `scope` attributes;
- level/program/phase meaning is colour-only; several colour pairs fail
  contrast (measured):
  - `#c6ccd6` empty-cell text on white: **1.61:1**
  - white on phase 2 `#2f9ad0`: 3.16:1; phase 3 `#2ea88a`: 2.96:1;
    phase 4 `#d9932b`: 2.57:1; phase 5 `#d05858`: 4.02:1
  - phase-coloured code text on white: same values (normal text needs 4.5:1)
  - level-1 block `#c9d4e6` on white: ~1.5:1 (graphic needs 3:1)
  - program dot `#d17b1f` on white: 3.20:1 (passes 3:1, but colour-only)
- editor: file input is `hidden` inside a label (not keyboard reachable),
  framework filter has placeholder only, topic input has no label;
- editor notices/validation errors are not announced (`aria-live` missing);
- `scrollIntoView({ behavior: "smooth" })` ignores `prefers-reduced-motion`;
- matrix horizontal scroll container is not keyboard focusable/labelled;
- published PDFs in `assets/` are linked but not checked for PDF/UA.

## 5. Issue drafts

Conventions: labels `a11y`, `wcag-2.2-aa`, plus `ci` / `editor` / `P1`–`P3`.
Titles in German to match the existing issue tracker; bodies can be translated
if preferred.

### Issue 1 — [CI] Automatisierte WCAG-2.2-AA-Prüfung mit Playwright + IBM Equal Access

**Labels:** `ci`, `a11y`, `P1`

**Problem**
Es gibt keine automatische Barrierefreiheitsprüfung. Regressionen fallen erst
bei manuellen Tests auf.

**Vorschlag**
`accessibility-checker` (IBM Equal Access) mit Policy `WCAG_2_2` und
Playwright einsetzen; Scan-Zustände über die vorhandenen Hash-Parameter
(`#view=`, `#programs=`, `#comp=`, `#cf=`) ansteuern. Die vollständige
Konfiguration und ein Workflow-Entwurf stehen in `docs/accessibility-research.md`
(Abschnitt 3).

**Aufgaben**
- [ ] `playwright`, `accessibility-checker`, `http-server`, `wait-on` als devDependencies
- [ ] `aceconfig.js` mit `WCAG_2_2`, `failLevels: ["violation"]`, `baselineFolder`
- [ ] `tests/a11y/run.js` mit Zuständen: Programm, Framework (2 Programme), Matrix, DE/EN, Hilfe-Modal, Modul-Modal, Editor
- [ ] `.github/workflows/accessibility.yml` inkl. Artefakt-Upload (`results/`)
- [ ] Phase 0: `continue-on-error: true`, Bericht als Artefakt
- [ ] Phase 1: Baseline committen, Scan blockierend schalten
- [ ] `npm run test:a11y` und `npm run serve` dokumentieren

**Akzeptanzkriterien**
- [ ] CI läuft auf jedem PR und Pushen auf `main`
- [ ] Der Bericht ist als Artefakt abrufbar
- [ ] Ein absichtlich eingebauter Kontrastfehler lässt den Job fehlschlagen
- [ ] Neue Scans brauchen keine manuellen Klicks (Hash-Parameter)
- [ ] Baseline-Änderungen sind im PR-Diff sichtbar und werden reviewt

---

### Issue 2 — [CI] Statische HTML-Prüfung und A11y-Definition-of-Done

**Labels:** `ci`, `a11y`, `P2`

**Problem**
`index.html` und `editor.html` werden nicht statisch validiert; Barrierefreiheit
ist kein Teil der Definition of Done.

**Vorschlag**
`html-validate` mit `html-validate:recommended` als eigener CI-Schritt.
README-Abschnitt „Barrierefreiheit“ mit Zielstandard (WCAG 2.2 AA), lokalen
Kommandos und manueller Checkliste ergänzen. PR-Template um A11y-Punkte
erweitern (Tastatur, Fokus, Labels, Kontrast, Sprachumschaltung).

**Akzeptanzkriterien**
- [ ] `npm run test:html` prüft beide HTML-Dateien
- [ ] CI-Job ist blockierend
- [ ] README nennt Standard, Tools und Ansprechperson/Feedbackweg
- [ ] PR-Template enthält die A11y-Checkliste

---

### Issue 3 — [A11y] Manueller Testleitfaden und Release-Checkliste

**Labels:** `a11y`, `P1`

**Problem**
Automatisierte Scans finden nur einen Teil der Probleme. Tastatur-,
Screenreader-, Zoom- und Kontrast-Tests sind nicht dokumentiert und passieren
unsystematisch.

**Vorschlag**
Kurzen Testleitfaden (ca. 1 Seite) mit reproduzierbaren Schritten anlegen:
Tastatur (Tab/Shift+Tab/Enter/Space/Esc, sichtbarer Fokus, keine Falle),
Screenreader (NVDA+Firefox, VoiceOver+Safari; Tabellen- und Dialog-Navigation),
Zoom 200 %/400 % und 320 px Breite, Windows High Contrast/forced-colors,
`prefers-reduced-motion`, Sprachumschaltung DE/EN. Ergebnisse als
Release-Checkliste festhalten.

**Akzeptanzkriterien**
- [ ] Leitfaden liegt im Repo (z. B. `docs/accessibility-testing.md`)
- [ ] Jede Ansicht (Programm, Framework, Matrix, Editor, Modals) ist abgedeckt
- [ ] Checkliste ist Teil des Release-/PR-Prozesses
- [ ] Gefundene Probleme werden als Issues mit Reproduktionsschritten angelegt

---

### Issue 4 — [A11y] Klickbare `td`/`th`/`span`/`div` durch echte Buttons/Links ersetzen

**Labels:** `a11y`, `P1`

**Problem**
Viele Aktionen hängen an `click`-Handlern auf nicht interaktiven Elementen:
Matrix-Header (`th`), Matrix-Zellen (`td`), Competency-Codes (`span`),
Modul-Chips (`span`), Karten (`article`/`div`), Picker (`button` ist ok).
Diese Elemente sind nicht per Tab erreichbar, haben keine Rolle und reagieren
nicht auf Enter/Space. Betroffen: `js/app.js` (`pickerButton`, `renderMatrixView`,
`moduleChip`, `orientationCard`, `frameworkModuleCard`, `renderByCompetency`,
`renderByModule`), `js/editor.js` (falls zutreffend).

**Vorschlag**
Native `<button type="button">` (oder `<a>` für Navigation) verwenden. In
Tabellenzellen den Button in die Zelle legen, statt die Zelle klickbar zu machen.
Nur wo das nicht geht: `role="button"`, `tabindex="0"`, Enter/Space-Handler und
`aria-label`. Fokus-Styling ergänzen.

**Akzeptanzkriterien**
- [ ] Jede Aktion ist mit Tab erreichbar und mit Enter/Space auslösbar
- [ ] Screenreader nennen Rolle, Name und ggf. Zustand (`aria-pressed`/`aria-expanded`)
- [ ] `cursor: pointer` ist kein Ersatz für Semantik
- [ ] Kein `data-action`-Element ohne native Rolle oder vollständiges ARIA-Muster
- [ ] Manueller Tastaturdurchlauf durch Programm-, Framework- und Matrix-Sicht erfolgreich

---

### Issue 5 — [A11y] Modale Dialoge: Fokus, Labels, Hintergrund inert

**Labels:** `a11y`, `P1`

**Problem**
`openModal` in `js/app.js` und `js/editor.js` erzeugt `role="dialog"`
`aria-modal="true"`, aber:
- der Fokus wird nicht in den Dialog gesetzt und nicht darin gehalten;
- nach dem Schließen geht der Fokus verloren (nicht zum Auslöser zurück);
- der Titel ist nicht per `aria-labelledby` verknüpft;
- im Viewer hat der Schließen-Button nur `title`, kein `aria-label`;
- der Hintergrund ist nicht `inert`/`aria-hidden`;
- `Escape` funktioniert, Klick auf Overlay schließt ebenfalls.

**Vorschlag**
Gemeinsamen Dialog-Helper einführen: Fokus auf Überschrift/Schließen setzen,
Tab/Shift+Tab im Dialog halten, Fokus beim Schließen zurückgeben,
`aria-labelledby`/`aria-describedby`, `inert` auf den Rest der Seite, Scroll-Lock.
Der Viewer-Close-Button bekommt ein übersetztes `aria-label`.

**Akzeptanzkriterien**
- [ ] Fokus springt beim Öffnen in den Dialog
- [ ] Tab verlässt den Dialog nicht
- [ ] Esc und Schließen geben den Fokus an den Auslöser zurück
- [ ] Screenreader liest Titel und Inhalt als Dialog vor
- [ ] Hintergrund ist für AT nicht erreichbar, solange der Dialog offen ist

---

### Issue 6 — [A11y] Matrix-Tabelle semantisch auszeichnen

**Labels:** `a11y`, `P1`

**Problem**
Der Trial-Scan meldet 233 × `table_headers_related` in der Matrix. Die Tabelle
hat kein `<caption>`, keine `scope`-Attribute, die Phasenzeilen sind normale
`td`s, und die Zellen enthalten nur einen farbigen Block ohne Text. Screenreader
können Zelle → Modul/Kompetenz nicht zuordnen.

**Vorschlag**
`<caption>` (visuell versteckt oder sichtbar), `scope="col"` für Modul-Header,
`scope="row"` für Kompetenz-Header, Phasenzeilen als eigene `<tbody>`-Gruppe
oder `<th scope="rowgroup">`, Level als Text („Level 2“) im DOM, visuell
ausgeblendet, leerer Zustand als klarer Text statt „–“. Legende per
`aria-describedby` verknüpfen.

**Akzeptanzkriterien**
- [ ] Screenreader kündigen beim Zellwechsel Modul, Kompetenz und Level an
- [ ] `table_headers_related` ist im Scan nicht mehr enthalten
- [ ] Die Tabelle hat eine zugängliche Beschreibung
- [ ] Die visuelle Darstellung bleibt unverändert

---

### Issue 7 — [A11y] Farbe nie als alleiniger Informationsträger + Kontraste

**Labels:** `a11y`, `P1`

**Problem**
Level (3 Blautöne), Programmzugehörigkeit (farbige Punkte), Phasen (farbige
Ränder/Punkte), Vergleichsmodus (nur Hintergrundfarbe) und Coverage (Opazität)
werden ausschließlich über Farbe transportiert. Zusätzlich fallen gemessene
Kontraste durch:
- leerer Zelltext `#c6ccd6` auf Weiß = **1,61:1**;
- weiße Schrift auf Phase 2/3/4/5 = 3,16 / 2,96 / 2,57 / 4,02:1;
- phasenfarbene Kompetenz-Codes auf Weiß = gleiche Werte;
- Level-1-Block `#c9d4e6` auf Weiß ≈ 1,5:1 (Grafik braucht 3:1).

**Vorschlag**
Textliche oder ikonografische Ergänzung: „L1/L2/L3“ in Zellen, Formen/Muster
für Level, Textlabel für Programm-Punkte, Coverage-Zahl neben dem Balken,
Vergleichsmodus zusätzlich per Label/Icon. Für Text eigene, dunklere
`--phase-text`-Farben einführen; Füllfarben dürfen für Grafiken heller bleiben,
müssen aber 3:1 erreichen. Badge-Kontraste erneut prüfen.

**Akzeptanzkriterien**
- [ ] Alle Informationen sind ohne Farbwahrnehmung verfügbar
- [ ] Text erfüllt 4,5:1 (normale Größe), große Texte 3:1
- [ ] UI-Komponenten und informative Grafiken erfüllen 3:1
- [ ] In forced-colors/High-Contrast bleibt die Bedeutung erhalten
- [ ] `style_color_misuse` und die Kontrast-Findings sind behoben

---

### Issue 8 — [A11y] Sichtbarer Fokus, Zielgrößen und nicht verdeckter Fokus

**Labels:** `a11y`, `P2`

**Problem**
Nur GitHub-/Hilfe-Link haben explizite `:focus-visible`-Styles. Der Scanner
meldet 24+ × `style_focus_visible` und 15+ × `element_tabbable_unobscured`
(die sticky Topbar verdeckt fokussierte Elemente). Einige Ziele sind sehr klein
(z. B. Filter-Buttons, Entfernen-Buttons).

**Vorschlag**
Globalen, gut sichtbaren Fokusring für alle interaktiven Elemente definieren
(`:focus-visible`, 2–3 px, ausreichender Kontrast, nicht nur Farbe).
`scroll-margin-top`/`scroll-padding-top` für sticky Header ergänzen, damit
fokussierte Elemente nicht verdeckt werden. Zielgrößen auf mindestens
24 × 24 px bringen (WCAG 2.5.8) und Abstände prüfen.

**Akzeptanzkriterien**
- [ ] Jedes interaktive Element zeigt einen sichtbaren Fokus
- [ ] Fokus wird nicht von der sticky Topbar verdeckt
- [ ] Alle Ziele sind mindestens 24 × 24 px groß (oder haben ausreichend Abstand)
- [ ] `element_tabbable_unobscured` und `style_focus_visible` sind triagiert/behoben

---

### Issue 9 — [A11y] Seitenstruktur: Skip-Link, Landmarks, Überschriften, aktive Ansicht

**Labels:** `a11y`, `P2`

**Problem**
Es gibt keinen Skip-Link. Beide `<aside>`-Elemente sind unbenannt
(`aria_complementary_labelled`, `aria_landmark_name_unique`). Die
Überschriftenhierarchie springt (h1 → h3 in der Sidebar, danach h2 im Main).
Die aktive Ansicht wird nur visuell markiert. `aria-label="Views"` ist auf der
deutschen Seite englisch.

**Vorschlag**
Skip-Link „Zum Inhalt springen“ als erstes fokussierbares Element, Ziel
`#main`. Beide Sidebars mit `aria-label` versehen. Überschriften auf
h1 → h2 → h3 normalisieren (Sidebar-Abschnitte als h2, Untergruppen als h3).
Aktive Ansicht per `aria-current="page"` (Links) bzw. `aria-pressed` (Buttons)
markieren. Navigationslabel übersetzen.

**Akzeptanzkriterien**
- [ ] Skip-Link ist bei Tastaturfokus sichtbar und funktioniert
- [ ] Alle Landmarks haben eindeutige, übersetzte Namen
- [ ] Keine Überschriftenebene wird übersprungen
- [ ] Die aktive Ansicht wird von Screenreadern angesagt
- [ ] `aria_complementary_labelled` und `aria_landmark_name_unique` sind behoben

---

### Issue 10 — [A11y] Sprachumschaltung: `<html lang>` und Sprachwechsel im Inhalt

**Labels:** `a11y`, `P2`

**Problem**
Beim Umschalten der Sprache wird `document.documentElement.lang` nicht
aktualisiert; die Seite bleibt auf `lang="de"`, auch wenn die UI englisch ist.
Zusätzlich können Framework-Inhalte (EN) und Modultitel (DE) gemischt sein.

**Vorschlag**
Beim Boot und bei jedem Sprachwechsel `document.documentElement.lang` setzen.
Inhalte, die in einer anderen Sprache als die UI sind, mit `lang` auszeichnen
(z. B. englische Framework-Titel in der deutschen UI). `aria-label`, `title`
und Fehlermeldungen mit übersetzen.

**Akzeptanzkriterien**
- [ ] `<html lang>` entspricht immer der aktiven UI-Sprache
- [ ] Fremdsprachige Inhalte sind korrekt ausgezeichnet, sofern bekannt
- [ ] Screenreader sprechen UI und Inhalte passend aus
- [ ] Keine hartcodierten deutschen ARIA-Labels in der englischen UI

---

### Issue 11 — [A11y] Dynamische Änderungen und Statusmeldungen

**Labels:** `a11y`, `P2`

**Problem**
Ansichts-/Filterwechsel rendern `#main` komplett neu; der Fokus geht verloren,
und Änderungen werden nicht angesagt. Im Editor werden Notices/Validierungsfehler
nicht per `aria-live` angekündigt; Fehlerfelder haben kein `aria-invalid` /
`aria-describedby`.

**Vorschlag**
Nach einem Ansichtswechsel den Fokus auf die neue Hauptüberschrift setzen
(`main` ist bereits `tabindex="-1"`). Ergebniszahlen in eine `aria-live="polite"`
Region schreiben („Matrix: 42 Module, 18 Kompetenzen“). Editor-Notices als
`role="status"`/`role="alert"`; Fehlerzusammenfassung mit Links zu den Feldern,
`aria-invalid` und `aria-describedby` an den Eingaben.

**Akzeptanzkriterien**
- [ ] Screenreader bekommen Ansichts-/Filterwechsel mit
- [ ] Der Fokus geht nach dem Wechsel nicht verloren
- [ ] Editor-Notices und Fehler werden angesagt
- [ ] Fehlerfelder sind mit ihrer Meldung verknüpft
- [ ] Beim Entfernen/Hinzufügen von Listeneinträgen bleibt der Fokus sinnvoll

---

### Issue 12 — [A11y] Popover/Tooltips: fokus- und tastaturzugänglich statt nur Hover/`title`

**Labels:** `a11y`, `P2`

**Problem**
Matrix-Header und Zeilenköpfe öffnen Popover nur per `mouseover` (nach 160 ms);
es gibt keinen Fokus-Trigger, keine Esc-Schließung und keine persistente
Anzeige. Viele Informationen stecken ausschließlich in `title`-Attributen, die
per Tastatur/Touch nicht zuverlässig erreichbar sind (WCAG 1.4.13).

**Vorschlag**
Popover zusätzlich bei `focus` öffnen, per Esc schließen, bei Hover über das
Popover offen halten und per Klick/Fokus erneut öffnen. Anker fokussierbar
machen (siehe Issue 4). Wichtige Informationen nicht nur in `title` ablegen,
sondern im zugänglichen Namen oder im Popover-Inhalt. Auf Touch-Geräten
alternativ per Klick öffnen.

**Akzeptanzkriterien**
- [ ] Popover ist per Tastatur erreichbar und schließbar
- [ ] Esc schließt das Popover und gibt den Fokus zurück
- [ ] Popover bleibt bei Hover über dem Inhalt offen
- [ ] Keine relevante Information ausschließlich im `title`
- [ ] Funktioniert auf Touch (Klick/Tap)

---

### Issue 13 — [A11y] Formulare und Filter: Labels, Fieldsets, Gruppen

**Labels:** `a11y`, `P2`

**Problem**
Der Scanner meldet `input_label_exists` und 28 × `input_checkboxes_grouped`.
Betroffen sind u. a. Sidebar-Selects (Programm, Mindestlevel), die
Checkbox-Gruppen (Phasen, Kompetenzen, Dimensionen), der Framework-Filter im
Editor (nur Placeholder) und das Topic-Eingabefeld. Das Datei-Upload-Feld ist
`hidden` und damit nicht per Tastatur bedienbar.

**Vorschlag**
Jedes Select und jede Eingabe mit `<label for>` oder `aria-label` versehen.
Checkbox-Gruppen in `<fieldset>` + `<legend>` zusammenfassen (die sichtbare
Überschrift kann als Legend dienen). Gruppen-Buttons (Alle/Keine) mit
`aria-label` und Bezug zur Gruppe. Datei-Upload sichtbar und fokussierbar
machen oder per Button + verstecktem Input mit Label. Entfernen-Buttons
kontextbezogen benennen („Modul X entfernen“, „Zuordnung zu Y entfernen“).

**Akzeptanzkriterien**
- [ ] Jedes Formularelement hat einen zugänglichen Namen
- [ ] Zusammengehörige Checkboxen sind gruppiert und benannt
- [ ] Upload ist ohne Maus bedienbar
- [ ] Entfernen-Buttons sind eindeutig benannt
- [ ] `input_label_exists` und `input_checkboxes_grouped` sind behoben

---

### Issue 14 — [Editor/ATAG] Editor barrierefrei machen

**Labels:** `a11y`, `editor`, `P2`

**Problem**
Der Editor ist ein Autorenwerkzeug (ATAG 2.0 Part A). Neben den allgemeinen
Formularproblemen (Issue 13) fehlen: Fokusmanagement nach Add/Remove,
zugängliche Draft-/Löschdialoge, angekündigte Validierungsfehler, nicht
farbcodierte Diff-/Statusanzeigen und ein tastaturbedienbarer Upload.

**Vorschlag**
Die Dialog- und Formular-Fixes aus Issues 5 und 13 übernehmen. Zusätzlich:
Fokus nach strukturellen Änderungen auf das neue/geänderte Element setzen,
Diff-Zusammenfassung textlich beschreiben, Validierungsfehler mit
Sprunglinks und `aria-invalid` versehen, Statusmeldungen per `aria-live`.
Optional: ATAG-Checkliste für den Editor dokumentieren.

**Akzeptanzkriterien**
- [ ] Der Editor ist vollständig per Tastatur bedienbar
- [ ] Dialoge und Validierungsfehler sind für Screenreader verständlich
- [ ] Nach Add/Remove geht der Fokus nicht verloren
- [ ] Diff-/Statusinformationen sind nicht nur farbcodiert
- [ ] ATAG-Part-A-Checkliste ist dokumentiert und abgehakt

---

### Issue 15 — [A11y] Reflow, Zoom, Textabstand und reduzierte Bewegung

**Labels:** `a11y`, `P3`

**Problem**
Die Matrix scrollt horizontal in einem Container, der nicht fokussierbar und
nicht benannt ist; bei 320 px/400 % Zoom ist das per Tastatur nicht erreichbar.
`scrollIntoView({ behavior: "smooth" })` und CSS-Transitions ignorieren
`prefers-reduced-motion`. Textabstand (WCAG 1.4.12) ist nicht geprüft.

**Vorschlag**
Matrix-Container mit `tabindex="0"`, `role="region"` und `aria-label` versehen,
damit er per Tastatur scrollbar ist. Bei `prefers-reduced-motion: reduce` auf
smooth scrolling und Transitions verzichten. Layout bei 320 px Breite und
400 % Zoom prüfen; Textabstand-Test (Line-Height 1.5, Absatzabstand 2em,
Letter-Spacing 0.12em, Word-Spacing 0.16em) durchführen.

**Akzeptanzkriterien**
- [ ] Matrix ist bei 320 px/400 % Zoom per Tastatur scrollbar
- [ ] Kein horizontales Scrollen der gesamten Seite (außer Tabelle)
- [ ] `prefers-reduced-motion` wird respektiert
- [ ] Textabstand-Test verursacht keinen Inhaltsverlust
- [ ] `target_spacing_sufficient` ist triagiert/behoben

---

### Issue 16 — [A11y] Erklärung zur Barrierefreiheit, Feedbackweg und Metadaten

**Labels:** `a11y`, `P2`

**Problem**
Für öffentliche Stellen (BITV 2.0 / EN 301 549) fehlen die Erklärung zur
Barrierefreiheit, ein Feedback-/Kontaktweg und Angaben zum Stand der
Vereinbarkeit. Auch die JSON-LD-Daten enthalten keine Accessibility-Metadaten.

**Vorschlag**
Seite/Footer-Link „Erklärung zur Barrierefreiheit“ mit Geltungsbereich,
Konformitätsstatus (z. B. „teilweise konform zu WCAG 2.2 AA“), bekannten
Barrieren (Verweis auf Issues), Feedback-Kontakt und Durchsetzungsstelle.
DE/EN. Optional `accessibilityFeature`, `accessibilitySummary` und
`accessibilityAPI` im JSON-LD ergänzen.

**Akzeptanzkriterien**
- [ ] Erklärung ist von beiden Seiten aus erreichbar
- [ ] Feedback-Weg funktioniert und ist dokumentiert
- [ ] Bekannte Barrieren sind benannt und verlinkt
- [ ] Bei Konformität: keine falschen Aussagen; sonst ehrlicher Status
- [ ] Optional: JSON-LD enthält Accessibility-Metadaten

---

### Issue 17 — [Assets] PDFs auf Barrierefreiheit prüfen bzw. ersetzen

**Labels:** `a11y`, `P3`

**Problem**
Mehrere PDFs unter `assets/` werden verlinkt (Studienordnungen,
Modulübersichten, Framework-PDFs). Sie sind nicht auf Tags/PDF-UA geprüft und
für Screenreader möglicherweise nicht nutzbar.

**Vorschlag**
PDFs mit einem PDF/UA-Checker prüfen (z. B. PAC, Acrobat). Nicht barrierefreie
Dokumente entweder als barrierefreie PDFs neu exportieren oder zusätzlich eine
HTML-Zusammenfassung anbieten. Linktexte mit Dateityp/Größe ergänzen.

**Akzeptanzkriterien**
- [ ] Alle verlinkten PDFs sind geprüft und das Ergebnis dokumentiert
- [ ] Nicht konforme PDFs haben eine barrierefreie Alternative
- [ ] Linktexte beschreiben Ziel und Format
- [ ] Kein Verweis auf PDFs ohne Alternative in kritischen Flows

## 6. Suggested order of work

1. Issue 3 (manual protocol) and Issue 1 (CI, report-only) — establish visibility.
2. Issue 4 (keyboard semantics) and Issue 5 (modals) — biggest interaction blockers.
3. Issue 6 (matrix semantics), Issue 7 (colour/contrast), Issue 8 (focus) — highest automated counts.
4. Issue 9–13 (structure, language, live regions, popovers, forms).
5. Issue 14–17 (editor, reflow, statement, PDFs).

## 7. Sources

- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- WCAG 3.0 (Working Draft): https://www.w3.org/TR/wcag-3.0/
- EN 301 549 v4.1.1 (PDF, Sept 2026): https://www.etsi.org/deliver/etsi_en/301500_301599/301549/04.01.01_60/en_301549v040101p.pdf
- BITV 2.0 / Germany policy: https://www.w3.org/WAI/policies/germany/
- IBM Equal Access: https://github.com/IBMa/equal-access
- `accessibility-checker` on npm: https://www.npmjs.com/package/accessibility-checker
- axe-core: https://github.com/dequelabs/axe-core
- `@axe-core/playwright`: https://www.npmjs.com/package/@axe-core/playwright
- html-validate: https://html-validate.org/
- W3C evaluation tools list: https://www.w3.org/WAI/test-evaluate/tools/list/
