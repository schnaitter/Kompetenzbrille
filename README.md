# Kompetenzbrille

A plain client-side HTML/CSS/JavaScript app that loads representations of
**competency frameworks** and **study programs** and provides bidirectional
views/filters. Currently it focuses on the **QUADRIGA data literacy framework
v4** (the two translations DE + EN are built in) and four study programs of the
Institut für Bibliotheks- und Informationswissenschaft (HU Berlin):

- BA Bibliotheks- und Informationswissenschaft
- MA Information Science
- MA Bibliotheks- und Informationswissenschaft (weiterbildend, Fernstudium)
- MA Wissenschaftsforschung

It provides bidirectional views/filters:

- **Program view** (Programm-Sicht): for a selected study program, show which
  parts of the framework are addressed where — as competency cards annotated with
  module chips, or arranged by module. Filter by phases, individual
  competencies, framework dimensions (knowledge / skills / examples), module
  type, and mapping depth.
- **Framework view** (Framework-Sicht): pick a competency and see which modules
  of one or more study programs address it, including the rationale for each
  mapping.
- **Matrix view**: heatmap of competencies × modules for a program.

The QUADRIGA **Orientierungswissen** (the grey box of prior knowledge outside
the data-flow phases; English: “conceptual knowledge”) is shown as a
foundation strip above the phases; it is not mapped to individual modules.

A single **Language** switcher (Sprache) controls the UI strings, the framework
translation and the bilingual mapping notes at once.

> **Note:** the QUADRIGA framework is fixed (its two translations are loaded
> from `data/frameworks/`); additional frameworks cannot be added via the
> manifest.

## Run locally

No build step, no external dependencies (the YAML parser `js-yaml` 4.1.0,
MIT, is vendored at `js/vendor/js-yaml.min.js`) — but the app needs to be
served over HTTP, since `fetch()` of the data files does not work from
`file://`:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static file server works (`npx serve`, nginx, …).

## Deploy to GitHub Pages

The repo includes `.github/workflows/pages.yml` (plus `.nojekyll`).
One-time setup: in the repository settings → *Pages* → *Build and deployment* →
**Source: GitHub Actions**. Every push to `main` then deploys automatically.
All asset paths are relative, so project pages (`user.github.io/<repo>/`) work.

## Data model

All data files are **YAML** (parsed client-side with the vendored `js-yaml`)
for easy hand-editing. Study programs live in `data/programs/*.yaml` and are
registered in `data/manifest.yaml`:

```yaml
programs:
  - data/programs/hu-biw-ba.yaml
  - …
```

To add another study program, add a YAML file and list it in the manifest —
no code changes needed. The framework itself is fixed to the two QUADRIGA
translations in `data/frameworks/` (mappings' `framework` must reference
`quadriga-dlf`).

### Framework (`data/frameworks/*.yaml`, fixed)

```yaml
id: quadriga-dlf          # mappings reference this id
version: "4"
language: de              # locale of this file
title: …
source: assets/….pdf      # optional link
doi: https://doi.org/…    # optional
orientation:             # optional; prior knowledge outside the phases
  title: Orientierungswissen
  text: …
phases:
  - id: "1"
    title: Planung
dimensions:
  - id: knowledge
    label: Wissen
competencies:
  - code: "1.1"           # keys of the dimension rows = dimension ids
    phase: "1"
    title: Identifikation
    knowledge: …
    skills: …
    examples: …
```

The two files (DE / EN) are the locales of the same framework; the header's
language switcher selects between them.

### Study program (`data/programs/*.yaml`)

```yaml
id: hu-berlin-biw-ba
title: …
source: assets/….pdf
sourceLabel: …
categories:
  - id: pflicht
    label: Pflicht
modules:
  - code: BP1
    title: …
    credits: 10
    category: pflicht        # must match a category id
    goals: …                 # Lern- und Qualifikationsziele
    topics:
      - …
    mappings:
      - framework: quadriga-dlf   # framework id
        competency: "1.1"         # competency code (quote to keep 1.1 a string!)
        level: 2                  # 1 = peripheral, 2 = partial, 3 = core
        note:                     # rationale (plain string also allowed)
          de: …
          en: …
```

**Note:** the module ↔ competency mappings are an editorial approximation
derived from the module descriptions; adjust `level`/`note` in the data files
to refine them. Careful with YAML types: quote codes like `"1.1"` and ids like
`"4"` so they stay strings, not floats/ints.

**Note:** the module lists are complete catalogues as defined in the SPOs,
including elective modules that are alternatives, so summing the credits does
*not* yield the degree total: the MA Information Science requires three of its
twelve elective modules (30 of the 120 elective LP shown) plus 20 LP in the
überfachliche Wahlpflichtbereich, the MA Wissenschaftsforschung requires two of
its seven elective modules, and the BA is a Kombinationsstudiengang (Kernfach
90 LP) whose Ergänzungsbereich is not part of this data.

For study programs offered in German only, the German content is shown in both
UI languages.

## Structure

```
index.html               app shell
css/style.css            styles
js/i18n.js               UI strings (de/en)
js/app.js                data loading, state, rendering
js/vendor/js-yaml.min.js  vendored YAML parser (js-yaml 4.1.0, MIT)
data/manifest.yaml       registry of the study programs
data/frameworks/         QUADRIGA v4 framework (fixed: de + en)
data/programs/           study program representations (HU Berlin: BA BIW,
                        MA Information Science, MA BIW weiterbildend,
                        MA Wissenschaftsforschung)
assets/                  source PDFs
.github/workflows/       GitHub Pages deployment
```
