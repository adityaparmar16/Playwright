// utils/emailReporter.js
// Playwright reporter that emails a pass/fail summary after every run.
//
// Turn it on with SEND_REPORT_EMAIL=true (in .env or on the command line).
// SMTP settings come from .env – see the README section at the bottom of this file.

import fs from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

dotenv.config();

const STATUS = {
  passed:      { label: 'Passed',      color: '#15803d', bg: '#dcfce7' },
  failed:      { label: 'Failed',      color: '#b91c1c', bg: '#fee2e2' },
  timedOut:    { label: 'Timed out',   color: '#b91c1c', bg: '#fee2e2' },
  interrupted: { label: 'Interrupted', color: '#b91c1c', bg: '#fee2e2' },
  skipped:     { label: 'Skipped',     color: '#475569', bg: '#e2e8f0' },
  flaky:       { label: 'Flaky',       color: '#b45309', bg: '#fef3c7' },
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

const pill = (status) => {
  const st = STATUS[status] ?? STATUS.failed;
  return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${st.bg};color:${st.color};font-size:11px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;white-space:nowrap;">${st.label}</span>`;
};

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Strips terminal colour codes from Playwright error messages
const stripAnsi = (s) => String(s ?? '').replace(/\u001b\[[0-9;]*m/g, '');

const fmtDuration = (ms) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};


const ENV_NAMES = { Dev: 'Development', Stag: 'Staging', Prod: 'Production' };

// Best-effort environment name from a spec path, e.g. WNG/Dev/x.spec.js → Development, CompassProdPOM → Production
const envOf = (file) => {
  const m = file.match(/(?:^|[\/_-])(Dev|Stag|Prod)(?=[\/A-Z._-]|$)/) || file.match(/(Dev|Stag|Prod)/);
  return m ? ENV_NAMES[m[1]] : null;
};

// Groups an error message into a category an engineer would triage by
const categorize = (msg) => {
  const m = String(msg);
  if (/App crashed|blank page|pageerror|Uncaught/i.test(m)) return 'Application error';
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ER_[A-Z_]+|HTTP [45]\d\d|Missing required environment|timed out after/i.test(m)) return 'Environment / Network';
  if (/strict mode violation|element\(s\) not found|waiting for (locator|getBy)|not visible|not attached/i.test(m)) return 'Locator / UI element';
  if (/Timeout \d+ms exceeded|Test timeout/i.test(m)) return 'Timeout';
  if (/expect\(|toBe|toEqual|toHave|toContain|Expected/i.test(m)) return 'Assertion mismatch';
  return 'Other';
};

const git = (cmd) => { try { return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };

export default class EmailReporter {
  constructor(options = {}) {
    this.options = options;
    this.results = new Map(); // test.id -> { test, result } (last attempt wins)
    this.startTime = new Date();
  }

  onBegin(config, suite) {
    this.config = config;
    this.rootSuite = suite;
    this.startTime = new Date();
  }

  onTestEnd(test, result) {
    this.results.set(test.id, { test, result });
  }

  async onEnd(fullResult) {
    if (process.env.SEND_REPORT_EMAIL !== 'true') return;
    if (this.results.size === 0) return; // nothing ran (e.g. --list, or every file failed to load) – no email

    const rows = this.collectRows();
    const summary = this.summarize(rows, fullResult);
    const html = this.buildHtml(rows, summary);
    const subject = this.buildSubject(summary);

    // Always keep a copy of the email on disk – handy for checking the layout or if sending fails
    const previewPath = path.join(process.cwd(), 'test-results', 'email-report.html');
    try {
      fs.mkdirSync(path.dirname(previewPath), { recursive: true });
      fs.writeFileSync(previewPath, html);
    } catch { /* not critical */ }

    try {
      await this.send(subject, html);
      console.log(`📧 Test report emailed to ${this.recipients().join(', ')}`);
    } catch (err) {
      console.warn(`📧 Could not send report email: ${err.message}`);
      console.warn(`   The email content was saved to ${previewPath}`);
    }
  }

  // ── data ──────────────────────────────────────────────────────────

  collectRows() {
    const rows = [];
    for (const { test, result } of this.results.values()) {
      const outcome = test.outcome(); // expected | unexpected | flaky | skipped
      let status = result.status;     // passed | failed | timedOut | skipped | interrupted
      if (outcome === 'flaky') status = 'flaky';

      const project = test.parent?.project()?.name ?? '';
      const file = path.relative(this.config.rootDir, test.location.file);
      const title = test.titlePath().slice(3).join(' › ') || test.title; // drop root/project/file

      let error = '';
      if (['failed', 'timedOut', 'interrupted'].includes(status)) {
        const e = result.errors?.[0] ?? result.error;
        error = stripAnsi(e?.message ?? '').split('\n').filter(Boolean).slice(0, 6).join('\n');
      }

      // Last lines of console output – useful context for failures (DB values, toasts, etc.)
      const stdout = result.stdout.map((c) => (typeof c === 'string' ? c : c.toString())).join('');
      const logTail = error ? stripAnsi(stdout).trim().split('\n').slice(-12).join('\n') : '';

      rows.push({ project, file, title, status, duration: result.duration, retries: result.retry, error, logTail });
    }
    const order = { failed: 0, timedOut: 0, interrupted: 0, flaky: 1, passed: 2, skipped: 3 };
    return rows.sort((a, b) => (order[a.status] - order[b.status]) || a.file.localeCompare(b.file));
  }

  summarize(rows, fullResult) {
    const count = (...st) => rows.filter((r) => st.includes(r.status)).length;
    return {
      total: rows.length,
      passed: count('passed'),
      failed: count('failed', 'timedOut', 'interrupted'),
      flaky: count('flaky'),
      skipped: count('skipped'),
      overall: fullResult.status, // passed | failed | timedout | interrupted
      duration: fullResult.duration ?? (Date.now() - this.startTime.getTime()),
      projects: [...new Set(rows.map((r) => r.project).filter(Boolean))],
      environments: [...new Set(rows.map((r) => envOf(r.file)).filter(Boolean))],
      endTime: new Date(),
      folders: [...new Set(rows.map((r) => r.file.split(path.sep).slice(0, 2).join('/')))],
    };
  }

  // Turns test folders into readable names, e.g. "WNG/Dev" → "Waste Not Global – Dev"
  suiteName(s) {
    const apps = { WNG: 'Waste Not Global', WNT: 'Waste Not' };
    const groups = new Map(); // app name -> Set of areas (Dev, Stag, API, ...)
    for (const f of s.folders) {
      const [app, area] = f.split('/');
      const name = apps[app] || app;
      if (!groups.has(name)) groups.set(name, new Set());
      if (area && !area.endsWith('.js')) groups.get(name).add(area);
    }
    return [...groups].map(([name, areas]) => (areas.size ? `${name} – ${[...areas].join(', ')}` : name)).join(' | ');
  }

  buildSubject(s) {
    const ok = s.failed === 0 && s.overall === 'passed';
    const prefix = process.env.REPORT_EMAIL_SUBJECT_PREFIX || 'Automation Test Report';
    const suite = process.env.REPORT_EMAIL_LABEL || this.suiteName(s) || 'Playwright';
    const when = this.startTime.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
    const counts = `${s.passed}/${s.total} passed` +
      (s.failed ? `, ${s.failed} failed` : '') + (s.flaky ? `, ${s.flaky} flaky` : '');
    return `${prefix} | ${suite} | ${ok ? '✅ PASSED' : '❌ FAILED'} (${counts}) | ${when} IST`;
  }

  // ── email body ────────────────────────────────────────────────────

  buildHtml(rows, s) {
    const ok = s.failed === 0 && s.overall === 'passed';
    const BRAND = process.env.REPORT_BRAND_COLOR || '#0b2545';
    const accent = ok ? '#15803d' : '#b91c1c';
    const passRate = s.total ? ((s.passed + s.flaky) / s.total) * 100 : 0;
    const rate = `${passRate % 1 ? passRate.toFixed(1) : passRate}%`;
    const fmt = (d, opts) => d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', ...opts });
    const dateLong = fmt(this.startTime, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const time = (d) => fmt(d, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    const runId = `RUN-${fmt(this.startTime, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(/[^0-9]/g, '').replace(/^(\d{2})(\d{2})(\d{4})(\d{4})$/, '$3$2$1-$4')}`;
    const suiteLabel = process.env.REPORT_EMAIL_LABEL || this.suiteName(s) || 'Playwright';
    const company = process.env.REPORT_COMPANY || '';
    const team = process.env.REPORT_TEAM || 'QA Automation';
    const branch = git('rev-parse --abbrev-ref HEAD');
    const commit = git('rev-parse --short HEAD');
    const executedBy = process.env.REPORT_EXECUTED_BY || (() => { try { return os.userInfo().username; } catch { return ''; } })();
    const contact = process.env.REPORT_CONTACT || '';
    const failures = rows.filter((r) => r.error);
    const hasReport = fs.existsSync(this.htmlReportPath());

    // ── building blocks
    const th = (t, align = 'left', w = '') => `<th align="${align}"${w ? ` width="${w}"` : ''} style="padding:9px 12px;font-size:11px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #cbd5e1;background:#f1f5f9;">${t}</th>`;
    const td = (v, align = 'left', extra = '') => `<td align="${align}" style="padding:9px 12px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;${extra}">${v}</td>`;
    const heading = (num, title, note = '') => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:30px 0 12px;"><tr>
        <td style="font-size:15px;font-weight:700;color:${BRAND};border-bottom:2px solid ${BRAND};padding-bottom:6px;">${num}. ${title}</td>
        ${note ? `<td align="right" style="font-size:12px;color:#64748b;border-bottom:2px solid ${BRAND};padding-bottom:6px;white-space:nowrap;">${note}</td>` : ''}
      </tr></table>`;
    const kpi = (n, label, color) => `
      <td width="20%" align="center" style="padding:14px 4px;border-right:1px solid #e2e8f0;">
        <div style="font-size:26px;line-height:30px;font-weight:700;color:${color};">${n}</div>
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.6px;margin-top:2px;">${label}</div>
      </td>`;
    const seg = (n, color) => (n > 0 ? `<td width="${(n / s.total) * 100}%" style="background:${color};height:6px;font-size:0;line-height:0;">&nbsp;</td>` : '');

    // ── executive summary sentence
    const summaryText = !s.total
      ? 'No tests were executed in this run.'
      : `${s.total} test${s.total === 1 ? '' : 's'} executed across ${new Set(rows.map((r) => r.file)).size} suite${new Set(rows.map((r) => r.file)).size === 1 ? '' : 's'} in ${fmtDuration(s.duration)}. ` +
        (ok
          ? `All tests passed${s.flaky ? ` (${s.flaky} passed on retry)` : ''}${s.skipped ? `; ${s.skipped} skipped` : ''}. No action required.`
          : `${s.failed} test${s.failed === 1 ? '' : 's'} failed and require${s.failed === 1 ? 's' : ''} attention — see Failure Analysis below.`);

    // ── execution details
    const detail = (label, value) => value ? `
      <tr>
        <td width="34%" style="padding:7px 12px;font-size:12px;color:#64748b;border-bottom:1px solid #e2e8f0;">${label}</td>
        <td style="padding:7px 12px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${value}</td>
      </tr>` : '';
    const details = [
      detail('Application / Suite', esc(suiteLabel)),
      detail('Environment', esc(s.environments.join(', '))),
      detail('Browser', esc(s.projects.join(', '))),
      detail('Branch / Commit', branch ? `${esc(branch)}${commit ? ` <span style="color:#64748b;">@ ${esc(commit)}</span>` : ''}` : ''),
      detail('Started', `${esc(time(this.startTime))} IST`),
      detail('Finished', `${esc(time(s.endTime))} IST`),
      detail('Duration', fmtDuration(s.duration)),
      detail('Executed by', esc([executedBy, os.hostname()].filter(Boolean).join(' on '))),
      detail('Run ID', `<span style="font-family:${MONO};font-size:12px;">${esc(runId)}</span>`),
    ].join('');

    // ── suite-wise breakdown
    const bySuite = new Map();
    for (const r of rows) {
      if (!bySuite.has(r.file)) bySuite.set(r.file, []);
      bySuite.get(r.file).push(r);
    }
    const suiteRows = [...bySuite].map(([file, list]) => {
      const p = list.filter((r) => r.status === 'passed').length;
      const fl = list.filter((r) => r.status === 'flaky').length;
      const f = list.filter((r) => r.error).length;
      const sk = list.filter((r) => r.status === 'skipped').length;
      const pct = Math.round(((p + fl) / list.length) * 100);
      const dur = list.reduce((a, r) => a + r.duration, 0);
      return `<tr>
        ${td(`<span style="font-family:${MONO};font-size:12px;">${esc(file)}</span>`)}
        ${td(list.length, 'center')}
        ${td(p + fl, 'center', `color:#15803d;font-weight:600;`)}
        ${td(f, 'center', f ? 'color:#b91c1c;font-weight:700;' : 'color:#94a3b8;')}
        ${td(sk, 'center', sk ? '' : 'color:#94a3b8;')}
        ${td(`${pct}%`, 'center', `font-weight:600;color:${f ? '#b91c1c' : '#15803d'};`)}
        ${td(fmtDuration(dur), 'right', 'color:#475569;white-space:nowrap;')}
      </tr>`;
    }).join('');

    // ── failure analysis
    const categories = failures.reduce((acc, r) => { const c = categorize(r.error); acc[c] = (acc[c] || 0) + 1; return acc; }, {});
    const categoryLine = Object.entries(categories).map(([c, n]) =>
      `<span style="display:inline-block;margin:0 6px 6px 0;padding:4px 10px;border:1px solid #fecaca;border-radius:4px;background:#fef2f2;font-size:12px;color:#991b1b;">${esc(c)} &nbsp;<b>${n}</b></span>`).join('');
    const failureBlocks = failures.map((r, i) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;border:1px solid #e2e8f0;border-left:3px solid #b91c1c;">
        <tr><td style="padding:12px 16px;background:#fafafa;border-bottom:1px solid #e2e8f0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font-size:13px;font-weight:700;color:#0f172a;"><span style="color:#b91c1c;">F${String(i + 1).padStart(2, '0')}</span> &nbsp;${esc(r.title)}</td>
            <td align="right" style="white-space:nowrap;padding-left:10px;">${pill(r.status)}</td>
          </tr></table>
          <div style="font-size:12px;color:#64748b;margin-top:4px;">
            ${esc(r.file)}${r.project ? ` &nbsp;|&nbsp; ${esc(r.project)}` : ''} &nbsp;|&nbsp; ${fmtDuration(r.duration)}${r.retries ? ` &nbsp;|&nbsp; retry ${r.retries}` : ''} &nbsp;|&nbsp; <b style="color:#991b1b;">${esc(categorize(r.error))}</b>
          </div>
        </td></tr>
        <tr><td style="padding:12px 16px;">
          <div style="font-size:11px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Error</div>
          <div style="font-family:${MONO};font-size:12px;line-height:18px;color:#7f1d1d;background:#fef2f2;border:1px solid #fee2e2;padding:10px 12px;white-space:pre-wrap;word-break:break-word;">${esc(r.error)}</div>
          ${r.logTail ? `
          <div style="font-size:11px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:.5px;margin:12px 0 6px;">Execution log (last lines)</div>
          <div style="font-family:${MONO};font-size:11px;line-height:17px;color:#e2e8f0;background:#0f172a;padding:10px 12px;white-space:pre-wrap;word-break:break-word;">${esc(r.logTail)}</div>` : ''}
        </td></tr>
      </table>`).join('');

    // ── detailed results
    let n = 0;
    const detailRows = [...bySuite].map(([file, list]) => `
      <tr><td colspan="4" style="padding:8px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-family:${MONO};font-size:12px;font-weight:600;color:#334155;">${esc(file)}</td></tr>
      ${list.map((r) => `<tr>
        ${td(`TC-${String(++n).padStart(3, '0')}`, 'left', 'font-family:' + MONO + ';font-size:11px;color:#64748b;white-space:nowrap;')}
        ${td(esc(r.title) + (r.project ? ` <span style="color:#94a3b8;font-size:11px;">(${esc(r.project)})</span>` : ''))}
        ${td(fmtDuration(r.duration), 'right', 'color:#475569;white-space:nowrap;')}
        ${td(pill(r.status), 'right', 'white-space:nowrap;')}
      </tr>`).join('')}`).join('');

    // ── slowest tests
    const slowest = [...rows].filter((r) => r.status !== 'skipped').sort((a, b) => b.duration - a.duration).slice(0, 5);
    const slowRows = slowest.map((r) => `<tr>
      ${td(esc(r.title))}
      ${td(`<span style="font-family:${MONO};font-size:11px;color:#64748b;">${esc(r.file)}</span>`)}
      ${td(fmtDuration(r.duration), 'right', 'font-weight:600;white-space:nowrap;')}
    </tr>`).join('');

    let sec = 0;
    return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test Execution Report</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:${FONT};color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:800px;background:#ffffff;border:1px solid #e2e8f0;">

    <!-- brand bar -->
    <tr><td style="background:${BRAND};padding:14px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:12px;font-weight:700;color:#ffffff;letter-spacing:1.5px;text-transform:uppercase;">${esc([company, team].filter(Boolean).join('  ·  '))}</td>
        <td align="right" style="font-size:12px;color:#cbd5e1;white-space:nowrap;">${esc(runId)}</td>
      </tr></table>
    </td></tr>

    <!-- title -->
    <tr><td style="padding:28px 32px 22px;border-bottom:1px solid #e2e8f0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td valign="top">
          <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Test Execution Report</div>
          <div style="font-size:24px;line-height:30px;font-weight:700;color:#0f172a;margin-top:6px;">${esc(suiteLabel)}</div>
          <div style="font-size:13px;color:#475569;margin-top:6px;">${esc(dateLong)}${s.environments.length ? ` &nbsp;|&nbsp; ${esc(s.environments.join(', '))}` : ''}</div>
        </td>
        <td align="right" valign="top" style="padding-left:16px;white-space:nowrap;">
          <div style="display:inline-block;border:2px solid ${accent};color:${accent};padding:8px 18px;font-size:14px;font-weight:800;letter-spacing:1.5px;">${ok ? 'PASSED' : 'FAILED'}</div>
          <div style="font-size:12px;color:#64748b;margin-top:8px;">Pass rate <b style="color:${accent};">${rate}</b></div>
        </td>
      </tr></table>
    </td></tr>

    <tr><td style="padding:22px 32px 30px;">

      <!-- executive summary -->
      <div style="font-size:14px;line-height:22px;color:#1e293b;padding:14px 16px;background:${ok ? '#f0fdf4' : '#fef2f2'};border-left:4px solid ${accent};">
        <b>Summary:</b> ${esc(summaryText)}
      </div>

      <!-- KPIs -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border:1px solid #e2e8f0;border-collapse:collapse;"><tr>
        ${kpi(s.total, 'Executed', '#0f172a')}
        ${kpi(s.passed, 'Passed', '#15803d')}
        ${kpi(s.failed, 'Failed', '#b91c1c')}
        ${kpi(s.flaky, 'Flaky', '#b45309')}
        ${kpi(s.skipped, 'Skipped', '#64748b')}
      </tr></table>
      ${s.total ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;"><tr>${seg(s.passed, '#16a34a')}${seg(s.flaky, '#f59e0b')}${seg(s.failed, '#dc2626')}${seg(s.skipped, '#cbd5e1')}</tr></table>` : ''}

      ${heading(++sec, 'Execution Details')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-collapse:collapse;">${details}</table>

      ${heading(++sec, 'Suite Summary', `${bySuite.size} suite${bySuite.size === 1 ? '' : 's'}`)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-collapse:collapse;">
        <tr>${th('Suite')}${th('Total', 'center', '56')}${th('Pass', 'center', '56')}${th('Fail', 'center', '56')}${th('Skip', 'center', '56')}${th('Pass %', 'center', '64')}${th('Time', 'right', '70')}</tr>
        ${suiteRows || `<tr>${td('No tests ran.')}</tr>`}
      </table>

      ${failures.length ? `
      ${heading(++sec, 'Failure Analysis', `${failures.length} failure${failures.length === 1 ? '' : 's'}`)}
      <div style="margin-bottom:12px;">${categoryLine}</div>
      ${failureBlocks}` : ''}

      ${heading(++sec, 'Detailed Results', `${s.total} test case${s.total === 1 ? '' : 's'}`)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-collapse:collapse;">
        <tr>${th('ID', 'left', '70')}${th('Test case')}${th('Time', 'right', '64')}${th('Status', 'right', '100')}</tr>
        ${detailRows}
      </table>

      ${slowest.length > 1 ? `
      ${heading(++sec, 'Slowest Tests', 'top ' + slowest.length)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-collapse:collapse;">
        <tr>${th('Test case')}${th('Suite')}${th('Time', 'right', '70')}</tr>
        ${slowRows}
      </table>` : ''}

    </td></tr>

    <!-- footer -->
    <tr><td style="padding:18px 32px 22px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;line-height:18px;color:#64748b;">
      ${hasReport ? '<b style="color:#334155;">Attachment:</b> full Playwright HTML report (playwright-report.html) — open in a browser for step-by-step traces and screenshots.<br>' : ''}
      ${contact ? `For questions about this report, contact ${esc(contact)}.<br>` : ''}
      This report was generated automatically by the ${esc(team)} framework (Playwright). Internal use only.
    </td></tr>

  </table>
</td></tr>
</table>
</body></html>`;
  }

  // ── sending ───────────────────────────────────────────────────────

  recipients() {
    return (process.env.REPORT_EMAIL_TO || process.env.REPORT_EMAIL || '')
      .split(/[;,]/).map((e) => e.trim()).filter(Boolean);
  }

  htmlReportPath() {
    return path.join(process.cwd(), 'playwright-report', 'index.html');
  }

  async send(subject, html) {
    const to = this.recipients();
    if (!to.length) throw new Error('No recipients – set REPORT_EMAIL_TO (or REPORT_EMAIL) in .env');

    const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length) throw new Error(`Missing ${missing.join(', ')} in .env`);

    let nodemailer;
    try {
      nodemailer = (await import('nodemailer')).default;
    } catch {
      throw new Error('nodemailer is not installed – run: npm install nodemailer');
    }

    const port = Number(process.env.SMTP_PORT || 587);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // 465 = SSL, 587 = STARTTLS
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    // Attach the Playwright HTML report if it was written during this run and isn't too big
    const attachments = [];
    const reportFile = this.htmlReportPath();
    if (process.env.REPORT_EMAIL_ATTACH_HTML !== 'false' && fs.existsSync(reportFile)) {
      const stat = fs.statSync(reportFile);
      if (stat.mtime >= this.startTime && stat.size < 15 * 1024 * 1024) {
        attachments.push({ filename: 'playwright-report.html', path: reportFile });
      }
    }

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: to.join(', '),
      cc: process.env.REPORT_EMAIL_CC || undefined,
      subject,
      html,
      attachments,
    });
  }
}

/*
 ── .env settings ─────────────────────────────────────────────────
 SEND_REPORT_EMAIL=true               # turn emailing on (leave unset/false to skip)
 REPORT_EMAIL_TO=a@x.com;b@y.com      # recipients (falls back to REPORT_EMAIL)
 REPORT_EMAIL_CC=                     # optional
 REPORT_EMAIL_SUBJECT_PREFIX=Automation Test Report   # optional, start of the subject
 REPORT_EMAIL_LABEL=WNG Dev           # optional, replaces the auto suite name in the subject
 REPORT_EMAIL_ATTACH_HTML=true        # attach playwright-report/index.html (default true)
 REPORT_COMPANY=Your Company          # optional, shown in the top bar
 REPORT_TEAM=QA Automation            # optional, top bar + footer (default "QA Automation")
 REPORT_CONTACT=Aditya Parmar (aditya.parmar@ccube.com)   # optional, footer contact line
 REPORT_EXECUTED_BY=Aditya Parmar     # optional, defaults to the computer's user name
 REPORT_BRAND_COLOR=#0b2545           # optional, top bar / heading colour

 SMTP_HOST=smtp.gmail.com             # Gmail;  Outlook/Office 365: smtp.office365.com
 SMTP_PORT=587
 SMTP_USER=you@gmail.com
 SMTP_PASS=xxxx xxxx xxxx xxxx        # Gmail: an App Password, not your normal password
 SMTP_FROM="Playwright Automation <you@gmail.com>"
*/
