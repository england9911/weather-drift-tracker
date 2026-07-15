import type { BbcDayForecast } from "./types";

const BBC_FORECAST_URL = "https://weather-broker-cdn.api.bbci.co.uk/en/forecast/aggregated";

export async function fetchBbcForecast(locationId: string): Promise<BbcDayForecast[]> {
  const response = await fetch(`${BBC_FORECAST_URL}/${locationId}`, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`BBC forecast fetch failed: ${response.status} ${response.statusText}`);
  }

  const body: unknown = await response.json();
  const forecasts = (body as { forecasts?: unknown[] }).forecasts;
  if (!Array.isArray(forecasts)) {
    throw new Error("BBC forecast response missing 'forecasts' array");
  }

  return forecasts.map((day, index) => {
    const summary = (day as { summary?: { issueDate?: unknown; report?: Record<string, unknown> } }).summary;
    const report = summary?.report;
    if (!summary || !report) {
      throw new Error(`BBC forecast day ${index} missing summary/summary.report`);
    }
    const targetDate = report.localDate;
    const issueDate = summary.issueDate;
    const maxTempC = report.maxTempC;
    const minTempC = report.minTempC;
    if (typeof targetDate !== "string" || typeof issueDate !== "string") {
      throw new Error(`BBC forecast day ${index} missing localDate/issueDate`);
    }
    if (typeof maxTempC !== "number" || typeof minTempC !== "number") {
      throw new Error(`BBC forecast day ${index} missing maxTempC/minTempC`);
    }
    return {
      targetDate,
      issueDate,
      maxTempC,
      minTempC,
      mostLikelyHighC: typeof report.mostLikelyHighTemperatureC === "number" ? report.mostLikelyHighTemperatureC : null,
      mostLikelyLowC: typeof report.mostLikelyLowTemperatureC === "number" ? report.mostLikelyLowTemperatureC : null,
      weatherTypeText: typeof report.weatherTypeText === "string" ? report.weatherTypeText : null,
    };
  });
}
