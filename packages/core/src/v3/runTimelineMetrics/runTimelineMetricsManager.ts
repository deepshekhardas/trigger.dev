import { TaskRunExecutionMetrics } from "../schemas/schemas.js";
import { getEnvVar } from "../utils/getEnv.js";
import { RunTimelineMetric, RunTimelineMetricsManager } from "./types.js";

export class StandardRunTimelineMetricsManager implements RunTimelineMetricsManager {
  private _metrics: RunTimelineMetric[] = [];

  registerMetric(metric: RunTimelineMetric): void {
    this._metrics.push(metric);
  }

  getMetrics(): RunTimelineMetric[] {
    return this._metrics;
  }

  registerMetricsFromExecution(
    metrics?: TaskRunExecutionMetrics,
    isWarmStartOverride?: boolean
  ): void {
    this.#seedMetricsFromEnvironment(isWarmStartOverride);

    if (metrics) {
      metrics.forEach((metric) => {
        this.registerMetric({
          name: `trigger.dev/${metric.name}`,
          event: metric.event,
          timestamp: metric.timestamp,
          attributes: {
            duration: metric.duration,
          },
        });
      });
    }
  }

  reset(): void {
    this._metrics = [];
  }

  #seedMetricsFromEnvironment(isWarmStartOverride?: boolean) {
    const forkStartTime = getEnvVar("TRIGGER_PROCESS_FORK_START_TIME");
    const warmStart = getEnvVar("TRIGGER_WARM_START");
    const isWarmStart =
      typeof isWarmStartOverride === "boolean" ? isWarmStartOverride : warmStart === "true";

    if (typeof forkStartTime === "string" && !isWarmStart) {
      const forkStartTimeMs = parseInt(forkStartTime, 10);
      const forkDuration = Date.now() - forkStartTimeMs;

      // When processKeepAlive is enabled, the process is reused across multiple runs.
      // The TRIGGER_PROCESS_FORK_START_TIME env var from the original cold start persists
      // in the process environment and becomes stale. Skip registration if the fork time
      // is unreasonably old (> 60s), which indicates a kept-alive process.
      if (forkDuration > 60_000) {
        return;
      }

      this.registerMetric({
        name: "trigger.dev/start",
        event: "fork",
        attributes: {
          duration: forkDuration,
        },
        timestamp: forkStartTimeMs,
      });
    }
  }
}

export class NoopRunTimelineMetricsManager implements RunTimelineMetricsManager {
  registerMetric(metric: RunTimelineMetric): void {
    // Do nothing
  }

  getMetrics(): RunTimelineMetric[] {
    return [];
  }
}
