import { fetchBbcForecast } from "./bbc";
import type { Env, ForecastSnapshotRow } from "./types";

const CONSECUTIVE_FAILURES_ALERT_THRESHOLD = 3;

export async function runForecastPoll(env: Env): Promise<void> {
  try {
    const days = await fetchBbcForecast(env.VILLAGE_LOCATION_ID);
    const fetchedAt = new Date().toISOString();

    for (const day of days) {
      const last = await env.DB.prepare(
        `SELECT * FROM forecast_snapshots WHERE target_date = ? ORDER BY fetched_at DESC LIMIT 1`
      )
        .bind(day.targetDate)
        .first<ForecastSnapshotRow>();

      const changed =
        !last ||
        last.issue_date !== day.issueDate ||
        last.max_temp_c !== day.maxTempC ||
        last.min_temp_c !== day.minTempC;

      if (!changed) continue;

      await env.DB.prepare(
        `INSERT INTO forecast_snapshots
           (target_date, issue_date, fetched_at, max_temp_c, min_temp_c, most_likely_high_c, most_likely_low_c, weather_type_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          day.targetDate,
          day.issueDate,
          fetchedAt,
          day.maxTempC,
          day.minTempC,
          day.mostLikelyHighC,
          day.mostLikelyLowC,
          day.weatherTypeText
        )
        .run();
    }

    await env.DB.prepare(
      `UPDATE poller_health SET consecutive_failures = 0, last_error = NULL, last_error_at = NULL WHERE id = 1`
    ).run();
  } catch (error) {
    await recordFailure(env, error);
    throw error;
  }
}

async function recordFailure(env: Env, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const now = new Date().toISOString();

  const updated = await env.DB.prepare(
    `UPDATE poller_health
       SET consecutive_failures = consecutive_failures + 1, last_error = ?, last_error_at = ?
       WHERE id = 1
       RETURNING consecutive_failures`
  )
    .bind(message, now)
    .first<{ consecutive_failures: number }>();

  const failures = updated?.consecutive_failures ?? 0;
  console.error(`Forecast poll failed (${failures} consecutive): ${message}`);

  if (failures >= CONSECUTIVE_FAILURES_ALERT_THRESHOLD) {
    // No domain is onboarded to Cloudflare Email Sending yet, so this only logs.
    // Once one is (`wrangler email sending enable <domain>` + a `send_email` binding),
    // send an alert to env.ALERT_EMAIL_TO here instead of just logging.
    console.error(
      `ALERT: forecast poller has failed ${failures} times in a row. Latest error: ${message}`
    );
  }
}
