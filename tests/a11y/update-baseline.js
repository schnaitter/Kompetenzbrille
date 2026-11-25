/* Deliberate, reviewed baseline update for the WCAG scans.
 *
 * Copies the current reports from results/ into tests/a11y/baselines/ and
 * prints every accepted violation count. Run this only after reviewing the
 * findings (e.g. when a fix phase removes findings or the DOM shifts xpaths);
 * commit the baseline changes with the fix so they show up in the PR diff.
 * NEVER run this automatically in CI.
 *
 *   npm run test:a11y            # produce results/
 *   npm run test:a11y:baseline   # accept them as the new baseline
 */
"use strict";

const fs = require("fs");
const path = require("path");

const resultsDir = path.join(__dirname, "../../results");
const baselineDir = path.join(__dirname, "baselines");

const files = fs.existsSync(resultsDir)
  ? fs.readdirSync(resultsDir).filter((f) => f.endsWith(".json") && !f.startsWith("summary"))
  : [];
if (!files.length) {
  console.error("No reports in results/ — run `npm run test:a11y` first.");
  process.exit(1);
}

fs.mkdirSync(baselineDir, { recursive: true });
for (const f of files) {
  const report = JSON.parse(fs.readFileSync(path.join(resultsDir, f), "utf8"));
  fs.copyFileSync(path.join(resultsDir, f), path.join(baselineDir, f));
  console.log(`baselined ${report.label}: ${report.summary.counts.violation} violations accepted`);
}
console.log("\nReview the baseline diff before committing it with your change.");
