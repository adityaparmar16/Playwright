import { test } from "@playwright/test";
import { queryDatabase } from "../../../utils/db.js";
import fs from "fs";
import path from "path";

const f = d =>
  d.toISOString().slice(0, 19).replace("T", " "),

save = (name, data) => {
  const filePath = path.join(process.cwd(), "test-results", name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, data);
  return filePath;
},

csv = rows => {
  if (!rows?.length) return "";

  return [
    Object.keys(rows[0]).join(","),
    ...rows.map(row =>
      Object.values(row)
        .map(value =>
          `"${String(value ?? "").replace(/"/g, '""')}"`
        )
        .join(",")
    )
  ].join("\n");
};


test("Check job schedule health", async ({}, testInfo) => {

  const db = testInfo.project.metadata?.dbproduction;

  if (!db) throw Error("DB config missing");

  const now = new Date();

  console.log(`\nChecking job schedules as of: ${f(now)}\n`);

  // ---------------------------------------------------------
  // 1. Get active job schedules
  // ---------------------------------------------------------

  const schedules = await queryDatabase(`
    SELECT
      id,
      name,
      first_start_date,
      next_run_date,
      last_email_sent_at,
      frequency,
      frequency_type,
      date_range,
      is_deleted,
      is_paused,
      is_bamco,
      job_data,
      created_by,
      updated_by,
      created_at,
      updated_at,
      expire_at
    FROM cafemanager.job_schedules
    WHERE is_deleted = 0
      AND is_paused = 0
    ORDER BY next_run_date ASC
  `, db);

  if (!schedules.length) {
    console.log("No active job schedules found.");
    return;
  }

  const issues = [];

  // ---------------------------------------------------------
  // 2. Find schedules where next_run_date is stale
  // ---------------------------------------------------------

  for (const schedule of schedules) {

    const nextRun = schedule.next_run_date
      ? new Date(schedule.next_run_date)
      : null;

    // Active schedule without next_run_date
    if (!nextRun) {

      issues.push({
        ...schedule,
        issue_type: "MISSING_NEXT_RUN_DATE",
        issue:
          "Active schedule has no next_run_date",
        expected_run_log: "NOT_CHECKED",
        log_finding: "No expected run date available"
      });

      continue;
    }

    // -------------------------------------------------------
    // next_run_date is in the past
    // -------------------------------------------------------

    if (nextRun < now) {

      issues.push({
        ...schedule,
        issue_type: "STALE_NEXT_RUN_DATE",
        issue:
          `next_run_date (${schedule.next_run_date}) is in the past`
      });
    }
  }

  // ---------------------------------------------------------
  // 3. If no issues, finish successfully
  // ---------------------------------------------------------

  if (!issues.length) {

    save(
      "job_schedule_health_all.csv",
      csv(schedules)
    );

    console.log("✅ Job schedule health check passed.");
    console.log(
      `Checked ${schedules.length} active job schedules.`
    );
    console.log("No issues found.");

    return;
  }

  // ---------------------------------------------------------
  // 4. Get job_schedule_logs ONLY for problematic IDs
  // ---------------------------------------------------------

  const issueIds = [
    ...new Set(issues.map(issue => issue.id))
  ];

  const idList = issueIds.join(",");

  console.log(
    `\nChecking job_schedule_logs for ${issueIds.length} problematic schedule ID(s)...\n`
  );

  const logs = await queryDatabase(`
    SELECT
      id,
      job_schedule_id,
      sqs_request_id,
      status,
      started_at,
      ended_at,
      message,
      created_at,
      updated_at
    FROM cafemanager.job_schedule_logs
    WHERE job_schedule_id IN (${idList})
    ORDER BY job_schedule_id, started_at DESC
  `, db);

  // ---------------------------------------------------------
  // 5. Check logs against the expected next_run_date
  // ---------------------------------------------------------

  for (const issue of issues) {

    if (issue.issue_type !== "STALE_NEXT_RUN_DATE") {
      continue;
    }

    const expectedDate = new Date(issue.next_run_date);

    const scheduleLogs = logs.filter(
      log =>
        Number(log.job_schedule_id) === Number(issue.id)
    );

    // Logs for the expected run date.
    //
    // We compare only the calendar date because the
    // next_run_date can be midnight while the cron actually
    // starts later in the morning.
    const expectedRunLogs = scheduleLogs.filter(log => {

      if (!log.started_at) return false;

      const logDate = new Date(log.started_at);

      return (
        logDate.getFullYear() === expectedDate.getFullYear() &&
        logDate.getMonth() === expectedDate.getMonth() &&
        logDate.getDate() === expectedDate.getDate()
      );
    });

    // -------------------------------------------------------
    // No log for expected run
    // -------------------------------------------------------

    if (!expectedRunLogs.length) {

      const latestLog = scheduleLogs[0];

      issue.expected_run_log = "NOT_FOUND";

      issue.log_finding =
        "CRON DID NOT RUN";

      issue.latest_log_id =
        latestLog?.id ?? "";

      issue.latest_log_status =
        latestLog?.status ?? "";

      issue.latest_log_started_at =
        latestLog?.started_at ?? "";

      issue.latest_log_ended_at =
        latestLog?.ended_at ?? "";

      issue.latest_log_message =
        latestLog?.message ?? "";

      continue;
    }

    // -------------------------------------------------------
    // Expected run log exists
    // -------------------------------------------------------

    const expectedLog = expectedRunLogs[0];

    issue.expected_run_log = "FOUND";

    issue.latest_log_id =
      expectedLog.id ?? "";

    issue.latest_log_status =
      expectedLog.status ?? "";

    issue.latest_log_started_at =
      expectedLog.started_at ?? "";

    issue.latest_log_ended_at =
      expectedLog.ended_at ?? "";

    issue.latest_log_message =
      expectedLog.message ?? "";

    // -------------------------------------------------------
    // Determine what happened
    // -------------------------------------------------------

    switch (expectedLog.status) {

      case "completed":

        issue.log_finding =
          "CRON RAN BUT NEXT_RUN_DATE WAS NOT UPDATED";

        break;

      case "failed":

        issue.log_finding =
          "CRON RAN BUT FAILED";

        break;

      case "processing":

        issue.log_finding =
          "CRON RUN IS STUCK IN PROCESSING";

        break;

      default:

        issue.log_finding =
          `CRON LOG FOUND WITH STATUS: ${expectedLog.status}`;
    }
  }

  // ---------------------------------------------------------
  // 6. Save ALL logs, but ONLY for problematic IDs
  // ---------------------------------------------------------

  if (logs.length) {

    save(
      "job_schedule_problem_logs.csv",
      csv(logs)
    );
  }

  // ---------------------------------------------------------
  // 7. Save all active schedules
  // ---------------------------------------------------------

  save(
    "job_schedule_health_all.csv",
    csv(schedules)
  );

  // ---------------------------------------------------------
  // 8. Save only problematic schedules
  // ---------------------------------------------------------

  save(
    "job_schedule_health_issues.csv",
    csv(issues)
  );

  // ---------------------------------------------------------
  // 9. Print findings
  // ---------------------------------------------------------

  console.log(
    `❌ Found ${issues.length} job schedule issue(s).\n`
  );

  for (const issue of issues) {

    console.log(
      `ID: ${issue.id} | ` +
      `Issue: ${issue.issue_type} | ` +
      `Last Email: ${issue.last_email_sent_at ?? "NULL"} | ` +
      `Next Run: ${issue.next_run_date ?? "NULL"} | ` +
      `Expected Log: ${issue.expected_run_log ?? "NOT_CHECKED"} | ` +
      `Status: ${issue.latest_log_status || "NONE"} | ` +
      `Finding: ${issue.log_finding}`
    );
  }

  // ---------------------------------------------------------
  // 10. Fail Playwright test if issues were found
  // ---------------------------------------------------------

  throw new Error(
    `Job schedule health check failed: ${issues.length} issue(s) found.`
  );
});