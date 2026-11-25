/* Automated WCAG 2.2 AA scans with Playwright + IBM Equal Access.
 *
 * Runs against a static server (CI starts one; locally: `npm run serve`
 * in a second terminal, then `npm run test:a11y`).
 *
 * Scan states are driven by the app's hash parameters (#view=, #lang=,
 * #program=, #programs=) so no manual clicking is needed. Reports land
 * in results/ (json + html), uploaded as a CI artifact on every PR and
 * push to main. Exit code 1 = at least one scan failed its baseline /
 * has violations; in phase 0 the workflow step is continue-on-error.
 */
"use strict";

const { chromium } = require("playwright");
const aChecker = require("accessibility-checker");
const fs = require("fs");
const path = require("path");

/* inlined into isolated dialog scans so color/spacing rules keep their styles */
const CSS = fs.readFileSync(path.join(__dirname, "../../css/style.css"), "utf8");

const BASE = process.env.BASE_URL || "http://127.0.0.1:4173";
const PROGRAM = "hu-berlin-ma-is";
const PROGRAMS_2 = "hu-berlin-ma-is,hu-berlin-ba-biw";

const scans = [
  {
    label: "viewer-program-de",
    path: `index.html#view=program&lang=de&program=${PROGRAM}`,
    wait: ".coverage"
  },
  {
    label: "viewer-program-en",
    path: `index.html#view=program&lang=en&program=${PROGRAM}`,
    wait: ".coverage"
  },
  {
    label: "viewer-framework-2-programs-de",
    path: `index.html#view=framework&lang=de&programs=${PROGRAMS_2}`,
    wait: ".picker-btn"
  },
  {
    label: "viewer-framework-2-programs-en",
    path: `index.html#view=framework&lang=en&programs=${PROGRAMS_2}`,
    wait: ".picker-btn"
  },
  {
    label: "viewer-matrix-de",
    path: `index.html#view=matrix&lang=de&program=${PROGRAM}`,
    wait: "table.matrix"
  },
  {
    label: "viewer-matrix-en",
    path: `index.html#view=matrix&lang=en&program=${PROGRAM}`,
    wait: "table.matrix"
  },
  {
    label: "viewer-help-modal-de",
    path: `index.html#view=program&lang=de&program=${PROGRAM}`,
    wait: ".coverage",
    dialog: true,
    action: async (page) => {
      await page.click('[data-action="open-help"]');
      await page.waitForSelector(".modal #modal-title");
    }
  },
  {
    label: "viewer-module-modal-de",
    path: `index.html#view=program&lang=de&program=${PROGRAM}`,
    wait: ".coverage",
    dialog: true,
    action: async (page) => {
      await page.click('.mod-chip[data-action="open-module"]');
      await page.waitForSelector(".modal #modal-title");
    }
  },
  {
    label: "editor-de",
    path: "editor.html",
    wait: "#ed-pick-program"
  }
];

(async () => {
  /* reports are generated artifacts: start clean so stale labels (e.g. from
   * experiments) can never leak into a baseline update */
  fs.rmSync(path.join(__dirname, "../../results"), { recursive: true, force: true });
  const browser = await chromium.launch();
  const summary = [];
  let failed = 0;

  for (const s of scans) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      reducedMotion: "reduce"
    });
    try {
      await page.goto(`${BASE}/${s.path}`, { waitUntil: "networkidle" });
      await page.waitForSelector(s.wait);
      if (s.action) await s.action(page);

      /* Modal states: scan only the dialog. The background is inert/aria-hidden
       * while a dialog is open, so scanning the whole page would report
       * findings for content that is intentionally unreachable. */
      let content = page;
      if (s.dialog) {
        const html = await page.locator(".modal").evaluate((el) => el.outerHTML);
        content =
          '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Dialog scan</title><style>' +
          CSS + "</style></head><body><main>" + html + "</main></body></html>";
      }

      const { report } = await aChecker.getCompliance(content, s.label);
      const code = aChecker.assertCompliance(report);
      const violations =
        (report.summary && report.summary.counts && report.summary.counts.violation) ?? "?";
      const ok = code === 0;
      if (!ok) failed++;
      summary.push({ label: s.label, ok, violations });
      console.log(`[${ok ? "PASS" : "FAIL"}] ${s.label} (violations: ${violations})`);
      if (!ok) console.log(aChecker.stringifyResults(report));
    } catch (err) {
      failed++;
      summary.push({ label: s.label, ok: false, violations: "error" });
      console.error(`[ERROR] ${s.label}: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await aChecker.close();
  await browser.close();

  console.log("\n=== Summary ===");
  for (const r of summary) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.label}  (violations: ${r.violations})`);
  }
  console.log(`${summary.length - failed}/${summary.length} scans passed`);
  process.exit(failed ? 1 : 0);
})();
