import type { ActualRow, Env, ForecastSnapshotRow } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysAhead(targetDate: string, fetchedAt: string): number {
  const target = Date.parse(`${targetDate}T00:00:00Z`);
  const fetchedDate = fetchedAt.slice(0, 10);
  const fetched = Date.parse(`${fetchedDate}T00:00:00Z`);
  return Math.floor((target - fetched) / MS_PER_DAY);
}

export async function handleApiData(env: Env): Promise<Response> {
  const [snapshots, actuals] = await Promise.all([
    env.DB.prepare(`SELECT * FROM forecast_snapshots ORDER BY target_date, fetched_at`).all<ForecastSnapshotRow>(),
    env.DB.prepare(`SELECT * FROM actuals ORDER BY target_date`).all<ActualRow>(),
  ]);

  const actualsByDate = new Map(actuals.results.map((row) => [row.target_date, row]));
  const snapshotsByDate = new Map<string, ForecastSnapshotRow[]>();
  for (const row of snapshots.results) {
    const list = snapshotsByDate.get(row.target_date) ?? [];
    list.push(row);
    snapshotsByDate.set(row.target_date, list);
  }

  const dates = [...snapshotsByDate.keys()].sort().map((targetDate) => {
    const rows = snapshotsByDate.get(targetDate)!;
    const actual = actualsByDate.get(targetDate) ?? null;

    return {
      targetDate,
      snapshots: rows.map((row) => ({
        fetchedAt: row.fetched_at,
        daysAhead: daysAhead(row.target_date, row.fetched_at),
        maxTempC: row.max_temp_c,
        minTempC: row.min_temp_c,
      })),
      actual: actual
        ? { observedMaxC: actual.observed_max_c, observedMinC: actual.observed_min_c, source: actual.source }
        : null,
    };
  });

  return Response.json({ generatedAt: new Date().toISOString(), dates });
}
