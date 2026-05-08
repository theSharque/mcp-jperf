import { z } from "zod";
import {
  streamJfrEvents,
  emptyHintJfr,
  topNFromMap,
} from "../utils/jfr-parse.js";
import {
  getEventType,
  getEventValues,
  getMonitorOrPathKey,
  getValuesNumber,
  getStackTrace,
  getMethodKey,
} from "../utils/jfr-json.js";

export const profileJfrLocksSchema = z.object({
  filepath: z.string().optional().default("new_profile"),
  topN: z.number().int().min(1).max(100).optional().default(10),
});

export type ProfileJfrLocksInput = z.infer<typeof profileJfrLocksSchema>;

const TYPE = "jdk.JavaMonitorBlocked";

export async function profileJfrLocks(input: ProfileJfrLocksInput, context?: unknown): Promise<string> {
  const { topN } = input;
  const byMonitor = new Map<string, number>();
  const stackCounts = new Map<string, number>();

  const loadError = await streamJfrEvents(
    input.filepath,
    TYPE,
    (ev) => {
      if (getEventType(ev) !== TYPE) return;
      const values = getEventValues(ev);
      const monitorKey =
        getMonitorOrPathKey(values, ["monitorClass"]) ??
        getMonitorOrPathKey(values, ["class"]) ??
        "unknownMonitor";
      const duration = getValuesNumber(values, ["duration"]);
      const weight = typeof duration === "number" && duration > 0 ? duration : 1;
      byMonitor.set(monitorKey, (byMonitor.get(monitorKey) ?? 0) + weight);

      const frames = getStackTrace(ev)?.frames ?? [];
      for (const frame of frames) {
        const method = getMethodKey(frame);
        if (!method) continue;
        stackCounts.set(method, (stackCounts.get(method) ?? 0) + 1);
      }
    },
    context,
    "locks"
  );
  if (typeof loadError === "string") return loadError;

  if (byMonitor.size === 0) {
    return JSON.stringify(
      {
        error: "EMPTY_EVENTS",
        hint: emptyHintJfr("profile_jfr_locks", [TYPE]),
        topMonitors: [],
        topMethods: [],
      },
      null,
      2
    );
  }

  return JSON.stringify(
    {
      topMonitors: topNFromMap(byMonitor, topN).map(({ key, count }) => ({
        monitorClassOrKey: key,
        weightTicksOrCount: count,
        note: "weight uses event duration when present, else 1 per event",
      })),
      topMethods: topNFromMap(stackCounts, topN).map(({ key, count }) => ({
        method: key,
        samples: count,
      })),
    },
    null,
    2
  );
}
