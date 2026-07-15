import type { ActualRow, Env } from "./types";

interface DailyTemps {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
}

function toTempMap(daily: DailyTemps): Map<string, { max: number; min: number }> {
  const map = new Map<string, { max: number; min: number }>();
  daily.time.forEach((date, index) => {
    map.set(date, { max: daily.temperature_2m_max[index], min: daily.temperature_2m_min[index] });
  });
  return map;
}

async function fetchOpenMeteoForecastPast(env: Env, pastDays: number): Promise<Map<string, { max: number; min: number }>> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", env.VILLAGE_LATITUDE);
  url.searchParams.set("longitude", env.VILLAGE_LONGITUDE);
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
  url.searchParams.set("timezone", "Europe/London");
  url.searchParams.set("past_days", String(pastDays));

  const response = await fetch(url);
  if (!response.ok) return new Map();
  const body = (await response.json()) as { daily?: DailyTemps };
  if (!body.daily) return new Map();
  return toTempMap(body.daily);
}

async function fetchOpenMeteoArchive(
  env: Env,
  startDate: string,
  endDate: string
): Promise<Map<string, { max: number; min: number }>> {
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", env.VILLAGE_LATITUDE);
  url.searchParams.set("longitude", env.VILLAGE_LONGITUDE);
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
  url.searchParams.set("timezone", "Europe/London");
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);

  const response = await fetch(url);
  if (!response.ok) return new Map();
  const body = (await response.json()) as { daily?: DailyTemps };
  if (!body.daily) return new Map();
  return toTempMap(body.daily);
}

export async function runActualsBackfill(env: Env): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  const missing = await env.DB.prepare(
    `SELECT DISTINCT target_date FROM forecast_snapshots
     WHERE target_date < ?
       AND target_date NOT IN (SELECT target_date FROM actuals)
     ORDER BY target_date`
  )
    .bind(today)
    .all<{ target_date: string }>();

  const missingDates = missing.results.map((row) => row.target_date);
  if (missingDates.length === 0) return;

  const fetchedAt = new Date().toISOString();
  const stillMissing: string[] = [];

  const forecastTemps = await fetchOpenMeteoForecastPast(env, 14);
  for (const date of missingDates) {
    const temps = forecastTemps.get(date);
    if (!temps) {
      stillMissing.push(date);
      continue;
    }
    await insertActual(env, date, temps, "open-meteo-forecast", fetchedAt);
  }

  if (stillMissing.length === 0) return;

  const archiveTemps = await fetchOpenMeteoArchive(
    env,
    stillMissing[0],
    stillMissing[stillMissing.length - 1]
  );
  for (const date of stillMissing) {
    const temps = archiveTemps.get(date);
    if (!temps) continue; // not available yet — retried by tomorrow's run
    await insertActual(env, date, temps, "open-meteo-archive", fetchedAt);
  }
}

async function insertActual(
  env: Env,
  targetDate: string,
  temps: { max: number; min: number },
  source: ActualRow["source"],
  fetchedAt: string
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO actuals (target_date, observed_max_c, observed_min_c, source, fetched_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(target_date) DO NOTHING`
  )
    .bind(targetDate, temps.max, temps.min, source, fetchedAt)
    .run();
}
