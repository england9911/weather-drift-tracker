import { handleApiData } from "./api";
import { runActualsBackfill } from "./actuals";
import { runForecastPoll } from "./poller";
import type { Env } from "./types";

const FORECAST_POLL_CRON = "0 */3 * * *";
const ACTUALS_BACKFILL_CRON = "0 6 * * *";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/data") {
      return handleApiData(env);
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    if (event.cron === FORECAST_POLL_CRON) {
      await runForecastPoll(env);
    } else if (event.cron === ACTUALS_BACKFILL_CRON) {
      await runActualsBackfill(env);
    }
  },
} satisfies ExportedHandler<Env>;
