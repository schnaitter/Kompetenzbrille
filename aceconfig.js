/* IBM Equal Access Accessibility Checker configuration.
 * Used by tests/a11y/run.js (locally and in .github/workflows/accessibility.yml).
 * Policy: WCAG 2.2 AA. Phase 0: violations are reported but the CI job is
 * non-blocking; once baselines are committed the job becomes blocking.
 */
module.exports = {
  policies: ["WCAG_2_2"],
  ruleArchive: "latest",
  failLevels: ["violation"],
  /* violations only: potential/recommendation findings are geometry- and
   * font-dependent and differ between CI and local machines, which would
   * make baselines flaky. Widen locally for triage (see testing guide). */
  reportLevels: ["violation"],
  outputFormat: ["json", "html"],
  outputFolder: "results",
  baselineFolder: "tests/a11y/baselines"
};
