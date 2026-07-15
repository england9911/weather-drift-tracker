export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  VILLAGE_LOCATION_ID: string;
  VILLAGE_LATITUDE: string;
  VILLAGE_LONGITUDE: string;
  ALERT_EMAIL_TO: string;
}

export interface BbcDayForecast {
  targetDate: string;
  issueDate: string;
  maxTempC: number;
  minTempC: number;
  mostLikelyHighC: number | null;
  mostLikelyLowC: number | null;
  weatherTypeText: string | null;
}

export interface ForecastSnapshotRow {
  id: number;
  target_date: string;
  issue_date: string;
  fetched_at: string;
  max_temp_c: number;
  min_temp_c: number;
  most_likely_high_c: number | null;
  most_likely_low_c: number | null;
  weather_type_text: string | null;
}

export interface ActualRow {
  target_date: string;
  observed_max_c: number;
  observed_min_c: number;
  source: "open-meteo-forecast" | "open-meteo-archive";
  fetched_at: string;
}
