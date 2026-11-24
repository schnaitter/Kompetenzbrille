/* IBM Equal Access Accessibility Checker configuration.
 * Used by tests/a11y/run.js (locally and in .github/workflows/accessibility.yml).
 * Policy: WCAG 2.2 AA. Phase 0: violations are reported but the CI job is
 * non-blocking; once baselines are committed the job becomes blocking.
 */
module.exports = {
  policies: ["WCAG_2_2"],
  ruleArchive: "latest",
  failLevels: ["violation"],
  reportLevels: ["violation", "potentialviolation", "recommendation"],
  outputFormat: ["json", "html"],
  outputFolder: "results",
  baselineFolder: "tests/a11y/baselines"
};
