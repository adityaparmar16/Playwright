import { test } from "@playwright/test";
import { queryDatabase } from "../../../utils/db.js";
import fs from "fs";
import path from "path";

const save = (n, d) => {
        const p = path.join(process.cwd(), "test-results", n);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, d);
        return p;
      },
      csv = r => !r?.length ? "" :
        [Object.keys(r[0]).join(","),
         ...r.map(x => Object.values(x).map(v =>
           `"${String(v ?? "").replace(/"/g,'""')}"`
         ).join(","))].join("\n");

test("Check global job schedule health", async ({}, testInfo) => {

  test.setTimeout(240000);

  const db = {
    ...testInfo.config.metadata?.globalprod,
    database: "wastenotglobal"
  };

  if (!db.host) throw Error("DB config missing");

  const now = new Date();

  console.log(`Checking global job schedules...`);

  // ---------------------------------------------------------
  // Active schedules only
  // ---------------------------------------------------------

  const schedules = await queryDatabase(`
    SELECT
      id,
      name,
      first_start_date,
      next_run_date,
      last_email_sent_at,
      timezone,
      frequency,
      date_range,
      is_deleted,
      is_paused,
      created_at,
      updated_at,
      expire_at
    FROM job_schedules
    WHERE is_deleted = 0
      AND is_paused = 0
    ORDER BY next_run_date
  `, db);

  const issues = [];

  // ---------------------------------------------------------
  // Find stale schedules
  // ---------------------------------------------------------

  for (const schedule of schedules) {

    const nextRun = schedule.next_run_date
      ? new Date(schedule.next_run_date)
      : null;

    if (!nextRun) {

      issues.push({
        ...schedule,
        issue_type: "MISSING_NEXT_RUN_DATE",
        log_finding: "No next_run_date"
      });

      continue;
    }

    if (nextRun < now) {

      issues.push({
        ...schedule,
        issue_type: "STALE_NEXT_RUN_DATE"
      });
    }
  }

  save("global_job_schedule_health_all.csv", csv(schedules));

  if (!issues.length) {

    console.log(`Checked ${schedules.length} active schedules.`);
    console.log("No issues found.");

    return;
  }

  // ---------------------------------------------------------
  // Fetch logs ONLY for problematic schedules
  // ---------------------------------------------------------

  const idList = [...new Set(issues.map(i => i.id))].join(",");

  const logs = await queryDatabase(`
    SELECT
      id,
      job_schedule_id,
      status,
      started_at,
      ended_at,
      message,
      created_at,
      updated_at
    FROM job_history_logs
    WHERE job_schedule_id IN (${idList})
    ORDER BY job_schedule_id, created_at DESC
  `, db);

  // ---------------------------------------------------------
  // Attach log findings
  // ---------------------------------------------------------

  for (const issue of issues) {

    if (issue.issue_type !== "STALE_NEXT_RUN_DATE") continue;

    const expected = new Date(issue.next_run_date);

    const scheduleLogs = logs.filter(
      l => Number(l.job_schedule_id) === Number(issue.id)
    );

    const expectedLogs = scheduleLogs.filter(l => {

      if (!l.created_at) return false;

      const d = new Date(l.created_at);

      return (
        d.getFullYear() === expected.getFullYear() &&
        d.getMonth() === expected.getMonth() &&
        d.getDate() === expected.getDate()
      );
    });

    if (!expectedLogs.length) {

      const latest = scheduleLogs[0];

      issue.expected_run_log = "NOT_FOUND";
      issue.latest_log_status = latest?.status ?? "";
      issue.latest_log_created_at = latest?.created_at ?? "";
      issue.latest_log_message = latest?.message ?? "";
      issue.log_finding = "CRON DID NOT RUN";

      continue;
    }

    const log = expectedLogs[0];

    issue.expected_run_log = "FOUND";
    issue.latest_log_status = log.status;
    issue.latest_log_created_at = log.created_at;
    issue.latest_log_message = log.message;

    switch (log.status) {

      case "completed":
        issue.log_finding = "CRON RAN BUT NEXT_RUN_DATE WAS NOT UPDATED";
        break;

      case "failed":
        issue.log_finding = "CRON RAN BUT FAILED";
        break;

      case "processing":
        issue.log_finding = "CRON RUN STUCK";
        break;

      default:
        issue.log_finding = `STATUS: ${log.status}`;
    }
  }

  // Save logs only for problematic schedules
  if (logs.length) {
    save("global_job_schedule_problem_logs.csv", csv(logs));
  }

  save("global_job_schedule_health_issues.csv", csv(issues));

  console.log(`
    Active schedules checked: ${schedules.length}
    Issues found: ${issues.length}
    Related logs saved: ${logs.length}
  `);

  for (const issue of issues) {

    console.log(
      `ID: ${issue.id} | ` +
      `Issue: ${issue.issue_type} | ` +
      `Next Run: ${issue.next_run_date} | ` +
      `Expected Log: ${issue.expected_run_log ?? "N/A"} | ` +
      `Status: ${issue.latest_log_status || "NONE"} | ` +
      `Finding: ${issue.log_finding}`
    );
  }

  throw new Error(
    `Global job schedule health check failed: ${issues.length} issue(s) found.`
  );
});