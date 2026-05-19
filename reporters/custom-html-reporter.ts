import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import * as fs from "fs";
import * as path from "path";

interface TestEntry {
  title: string;
  fullTitle: string;
  suite: string;
  project: string;
  status: "passed" | "failed" | "timedOut" | "skipped" | "interrupted";
  duration: number;
  retry: number;
  errors: string[];
  screenshots: string[];
  stdout: string[];
  stderr: string[];
}

interface SuiteStats {
  name: string;
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  duration: number;
}

class CustomHtmlReporter implements Reporter {
  private tests: TestEntry[] = [];
  private startTime: number = 0;
  private endTime: number = 0;
  private outputDir: string = "";
  private config!: FullConfig;

  onBegin(config: FullConfig, _suite: Suite): void {
    this.config = config;
    this.startTime = Date.now();
    this.outputDir = path.resolve(config.rootDir, "test-results");
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const suitePath = this.getSuitePath(test);
    const entry: TestEntry = {
      title: test.title,
      fullTitle: test.titlePath().join(" > "),
      suite: suitePath,
      project: test.parent?.project()?.name || "default",
      status: result.status,
      duration: result.duration,
      retry: result.retry,
      errors: result.errors.map((e) => e.message || e.stack || String(e)),
      screenshots: [],
      stdout: result.stdout.map((s) =>
        typeof s === "string" ? s : s.toString("utf-8"),
      ),
      stderr: result.stderr.map((s) =>
        typeof s === "string" ? s : s.toString("utf-8"),
      ),
    };

    // Collect screenshot attachments
    for (const attachment of result.attachments) {
      if (attachment.contentType?.startsWith("image/") && attachment.path) {
        // Copy screenshot to report directory and use relative path
        const screenshotName = `screenshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
        const destDir = path.join(this.outputDir, "screenshots");
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        const destPath = path.join(destDir, screenshotName);
        try {
          fs.copyFileSync(attachment.path, destPath);
          entry.screenshots.push(`screenshots/${screenshotName}`);
        } catch {
          // If copy fails, try embedding as base64
          try {
            const data = fs.readFileSync(attachment.path);
            entry.screenshots.push(
              `data:image/png;base64,${data.toString("base64")}`,
            );
          } catch {
            // Skip this screenshot
          }
        }
      }
    }

    this.tests.push(entry);
  }

  onEnd(result: FullResult): void {
    this.endTime = Date.now();
    const html = this.generateHtml(result);
    const outputPath = path.join(this.outputDir, "custom-report.html");
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, html, "utf-8");
    console.log(`\n📊 Custom report generated: ${outputPath}\n`);
  }

  private getSuitePath(test: TestCase): string {
    const parts: string[] = [];
    let parent = test.parent;
    while (parent) {
      if (parent.title && !parent.project()) {
        parts.unshift(parent.title);
      }
      parent = parent.parent;
    }
    return parts.join(" > ") || test.location.file.replace(/.*\/tests\//, "");
  }

  private generateHtml(result: FullResult): string {
    const totalDuration = this.endTime - this.startTime;
    const passed = this.tests.filter((t) => t.status === "passed").length;
    const failed = this.tests.filter(
      (t) => t.status === "failed" || t.status === "timedOut",
    ).length;
    const skipped = this.tests.filter((t) => t.status === "skipped").length;
    const total = this.tests.length;
    const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : "0";

    const failures = this.tests.filter(
      (t) => t.status === "failed" || t.status === "timedOut",
    );
    const suiteStats = this.computeSuiteStats();
    const slowest = [...this.tests]
      .filter((t) => t.status === "passed")
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SmugMug Image Display Tests — Report</title>
<style>
${this.getStyles()}
</style>
</head>
<body>
<div class="container">
  ${this.renderHeader(totalDuration, result)}
  ${this.renderSummary(passed, failed, skipped, total, passRate, totalDuration)}
  ${failures.length > 0 ? this.renderFailures(failures) : ""}
  ${this.renderSuiteBreakdown(suiteStats)}
  ${slowest.length > 0 ? this.renderSlowest(slowest) : ""}
  ${this.renderMetadata(result, totalDuration)}
</div>
<script>
${this.getScript()}
</script>
</body>
</html>`;
  }

  private computeSuiteStats(): SuiteStats[] {
    const map = new Map<string, SuiteStats>();
    for (const t of this.tests) {
      const key = t.project || t.suite;
      if (!map.has(key)) {
        map.set(key, {
          name: key,
          passed: 0,
          failed: 0,
          skipped: 0,
          total: 0,
          duration: 0,
        });
      }
      const s = map.get(key)!;
      s.total++;
      s.duration += t.duration;
      if (t.status === "passed") s.passed++;
      else if (t.status === "failed" || t.status === "timedOut") s.failed++;
      else if (t.status === "skipped") s.skipped++;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }

  private renderHeader(totalDuration: number, result: FullResult): string {
    const statusIcon = result.status === "passed" ? "✅" : "❌";
    return `
  <header class="header">
    <div class="brand">
      <h1>SmugMug Image Display Tests</h1>
      <span class="badge badge-${result.status === "passed" ? "pass" : "fail"}">${statusIcon} ${result.status.toUpperCase()}</span>
    </div>
    <p class="subtitle">Automated test report — ${new Date(this.startTime).toLocaleString()}</p>
  </header>`;
  }

  private renderSummary(
    passed: number,
    failed: number,
    skipped: number,
    total: number,
    passRate: string,
    totalDuration: number,
  ): string {
    return `
  <section class="summary">
    <div class="stat-card stat-total">
      <div class="stat-value">${total}</div>
      <div class="stat-label">Total Tests</div>
    </div>
    <div class="stat-card stat-passed">
      <div class="stat-value">${passed}</div>
      <div class="stat-label">Passed</div>
    </div>
    <div class="stat-card stat-failed">
      <div class="stat-value">${failed}</div>
      <div class="stat-label">Failed</div>
    </div>
    <div class="stat-card stat-skipped">
      <div class="stat-value">${skipped}</div>
      <div class="stat-label">Skipped</div>
    </div>
    <div class="stat-card stat-rate">
      <div class="stat-value">${passRate}%</div>
      <div class="stat-label">Pass Rate</div>
    </div>
    <div class="stat-card stat-duration">
      <div class="stat-value">${this.formatDuration(totalDuration)}</div>
      <div class="stat-label">Duration</div>
    </div>
  </section>`;
  }

  private renderFailures(failures: TestEntry[]): string {
    const cards = failures
      .map((f, i) => {
        const errorHtml = f.errors
          .map((e) => `<pre class="error-message">${this.escapeHtml(e)}</pre>`)
          .join("");

        const screenshotHtml =
          f.screenshots.length > 0
            ? `<div class="screenshot-section">
            <button class="toggle-btn" onclick="toggleSection('screenshots-${i}')">📸 Screenshots (${f.screenshots.length})</button>
            <div id="screenshots-${i}" class="collapsible">
              ${f.screenshots.map((s) => `<img src="${s}" class="screenshot" alt="Failure screenshot" loading="lazy">`).join("")}
            </div>
          </div>`
            : "";

        const consoleHtml =
          f.stdout.length > 0 || f.stderr.length > 0
            ? `<div class="console-section">
            <button class="toggle-btn" onclick="toggleSection('console-${i}')">🖥️ Console Output</button>
            <div id="console-${i}" class="collapsible">
              ${f.stdout.map((s) => `<pre class="console-stdout">${this.escapeHtml(s)}</pre>`).join("")}
              ${f.stderr.map((s) => `<pre class="console-stderr">${this.escapeHtml(s)}</pre>`).join("")}
            </div>
          </div>`
            : "";

        return `
    <div class="failure-card">
      <div class="failure-header">
        <span class="failure-icon">❌</span>
        <div class="failure-info">
          <h3 class="failure-title">${this.escapeHtml(f.title)}</h3>
          <span class="failure-meta">${this.escapeHtml(f.project)} · ${this.escapeHtml(f.suite)} · ${this.formatDuration(f.duration)}</span>
        </div>
      </div>
      <div class="failure-body">
        ${errorHtml}
        ${screenshotHtml}
        ${consoleHtml}
      </div>
    </div>`;
      })
      .join("");

    return `
  <section class="failures">
    <h2 class="section-title">🚨 Failures (${failures.length})</h2>
    ${cards}
  </section>`;
  }

  private renderSuiteBreakdown(suites: SuiteStats[]): string {
    const rows = suites
      .map((s) => {
        const passPercent =
          s.total > 0 ? ((s.passed / s.total) * 100).toFixed(0) : "0";
        const failPercent =
          s.total > 0 ? ((s.failed / s.total) * 100).toFixed(0) : "0";
        const skipPercent =
          s.total > 0 ? ((s.skipped / s.total) * 100).toFixed(0) : "0";
        return `
      <div class="suite-row">
        <div class="suite-name">${this.escapeHtml(s.name)}</div>
        <div class="suite-stats-inline">
          <span class="pass-count">${s.passed}✓</span>
          <span class="fail-count">${s.failed}✗</span>
          <span class="skip-count">${s.skipped}⊘</span>
          <span class="suite-duration">${this.formatDuration(s.duration)}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-pass" style="width: ${passPercent}%"></div>
          <div class="progress-fail" style="width: ${failPercent}%"></div>
          <div class="progress-skip" style="width: ${skipPercent}%"></div>
        </div>
      </div>`;
      })
      .join("");

    return `
  <section class="suite-breakdown">
    <h2 class="section-title">📦 Suite Breakdown</h2>
    ${rows}
  </section>`;
  }

  private renderSlowest(tests: TestEntry[]): string {
    const rows = tests
      .map(
        (t, i) => `
      <tr>
        <td class="rank">${i + 1}</td>
        <td class="test-name">${this.escapeHtml(t.title)}</td>
        <td class="test-project">${this.escapeHtml(t.project)}</td>
        <td class="test-duration">${this.formatDuration(t.duration)}</td>
      </tr>`,
      )
      .join("");

    return `
  <section class="slowest">
    <h2 class="section-title">🐢 Slowest Tests</h2>
    <table class="slowest-table">
      <thead>
        <tr><th>#</th><th>Test</th><th>Project</th><th>Duration</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
  }

  private renderMetadata(result: FullResult, totalDuration: number): string {
    const env = process.env.ENVIRONMENT || "unknown";
    const workers = this.config.workers;
    const retries = this.config.projects?.[0]?.retries ?? 0;

    return `
  <section class="metadata">
    <h2 class="section-title">ℹ️ Run Metadata</h2>
    <div class="metadata-grid">
      <div class="meta-item"><span class="meta-label">Status</span><span class="meta-value">${result.status}</span></div>
      <div class="meta-item"><span class="meta-label">Environment</span><span class="meta-value">${env}</span></div>
      <div class="meta-item"><span class="meta-label">Started</span><span class="meta-value">${new Date(this.startTime).toISOString()}</span></div>
      <div class="meta-item"><span class="meta-label">Finished</span><span class="meta-value">${new Date(this.endTime).toISOString()}</span></div>
      <div class="meta-item"><span class="meta-label">Duration</span><span class="meta-value">${this.formatDuration(totalDuration)}</span></div>
      <div class="meta-item"><span class="meta-label">Workers</span><span class="meta-value">${workers}</span></div>
      <div class="meta-item"><span class="meta-label">Retries</span><span class="meta-value">${retries}</span></div>
      <div class="meta-item"><span class="meta-label">Playwright</span><span class="meta-value">${this.config.version}</span></div>
    </div>
  </section>`;
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    const mins = Math.floor(ms / 60_000);
    const secs = ((ms % 60_000) / 1000).toFixed(0);
    return `${mins}m ${secs}s`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  private getStyles(): string {
    return `
:root {
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --bg-tertiary: #21262d;
  --border: #30363d;
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --text-muted: #6e7681;
  --accent-green: #3fb950;
  --accent-red: #f85149;
  --accent-yellow: #d29922;
  --accent-blue: #58a6ff;
  --accent-purple: #bc8cff;
  --brand-green: #6cc644;
  --radius: 8px;
  --shadow: 0 2px 8px rgba(0,0,0,0.3);
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.6;
  padding: 2rem;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
}

/* Header */
.header {
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.brand h1 {
  font-size: 1.75rem;
  font-weight: 700;
  background: linear-gradient(135deg, var(--brand-green), var(--accent-blue));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.badge {
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.badge-pass { background: rgba(63,185,80,0.15); color: var(--accent-green); border: 1px solid var(--accent-green); }
.badge-fail { background: rgba(248,81,73,0.15); color: var(--accent-red); border: 1px solid var(--accent-red); }

.subtitle {
  color: var(--text-secondary);
  margin-top: 0.5rem;
  font-size: 0.9rem;
}

/* Summary Stats */
.summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
  margin-bottom: 2.5rem;
}

.stat-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem;
  text-align: center;
  transition: transform 0.2s;
}

.stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow); }

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.stat-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-passed .stat-value { color: var(--accent-green); }
.stat-failed .stat-value { color: var(--accent-red); }
.stat-skipped .stat-value { color: var(--accent-yellow); }
.stat-rate .stat-value { color: var(--accent-blue); }
.stat-duration .stat-value { color: var(--accent-purple); }
.stat-total .stat-value { color: var(--text-primary); }

/* Section Titles */
.section-title {
  font-size: 1.3rem;
  font-weight: 600;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border);
}

/* Failures */
.failures { margin-bottom: 2.5rem; }

.failure-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-left: 4px solid var(--accent-red);
  border-radius: var(--radius);
  margin-bottom: 1rem;
  overflow: hidden;
}

.failure-header {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
}

.failure-icon { font-size: 1.2rem; margin-top: 0.1rem; }

.failure-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.failure-meta {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
  display: block;
}

.failure-body {
  padding: 0 1.25rem 1.25rem;
}

.error-message {
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.75rem 1rem;
  font-size: 0.8rem;
  font-family: 'SF Mono', 'Fira Code', monospace;
  color: var(--accent-red);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 0.75rem;
}

.toggle-btn {
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  padding: 0.4rem 0.75rem;
  font-size: 0.8rem;
  cursor: pointer;
  margin-bottom: 0.5rem;
  margin-right: 0.5rem;
  transition: background 0.2s;
}

.toggle-btn:hover { background: var(--border); color: var(--text-primary); }

.collapsible {
  display: none;
  margin-top: 0.5rem;
}

.collapsible.open { display: block; }

.screenshot {
  max-width: 100%;
  border-radius: 4px;
  border: 1px solid var(--border);
  margin-top: 0.5rem;
}

.console-stdout, .console-stderr {
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  font-family: 'SF Mono', 'Fira Code', monospace;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 0.5rem;
}

.console-stdout { color: var(--text-secondary); }
.console-stderr { color: var(--accent-yellow); }

/* Suite Breakdown */
.suite-breakdown { margin-bottom: 2.5rem; }

.suite-row {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem 1.25rem;
  margin-bottom: 0.5rem;
}

.suite-name {
  font-weight: 600;
  font-size: 0.95rem;
  margin-bottom: 0.5rem;
}

.suite-stats-inline {
  display: flex;
  gap: 1rem;
  font-size: 0.8rem;
  margin-bottom: 0.5rem;
}

.pass-count { color: var(--accent-green); }
.fail-count { color: var(--accent-red); }
.skip-count { color: var(--accent-yellow); }
.suite-duration { color: var(--text-muted); margin-left: auto; }

.progress-bar {
  display: flex;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  background: var(--bg-tertiary);
}

.progress-pass { background: var(--accent-green); }
.progress-fail { background: var(--accent-red); }
.progress-skip { background: var(--accent-yellow); }

/* Slowest Tests */
.slowest { margin-bottom: 2.5rem; }

.slowest-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.slowest-table th {
  text-align: left;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--border);
  color: var(--text-secondary);
  font-weight: 500;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.slowest-table td {
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--bg-tertiary);
}

.slowest-table tr:hover td { background: var(--bg-secondary); }

.rank { color: var(--text-muted); width: 40px; }
.test-name { color: var(--text-primary); }
.test-project { color: var(--text-secondary); }
.test-duration { color: var(--accent-purple); font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.8rem; }

/* Metadata */
.metadata { margin-bottom: 2rem; }

.metadata-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 0.5rem;
}

.meta-item {
  display: flex;
  justify-content: space-between;
  padding: 0.6rem 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
}

.meta-label {
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.meta-value {
  color: var(--text-primary);
  font-size: 0.8rem;
  font-family: 'SF Mono', 'Fira Code', monospace;
}

/* Responsive */
@media (max-width: 768px) {
  body { padding: 1rem; }
  .summary { grid-template-columns: repeat(2, 1fr); }
  .stat-value { font-size: 1.5rem; }
  .metadata-grid { grid-template-columns: 1fr; }
}
`;
  }

  private getScript(): string {
    return `
function toggleSection(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.toggle('open');
  }
}
`;
  }
}

export default CustomHtmlReporter;
