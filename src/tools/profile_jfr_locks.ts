import { z } from "zod";
import {
  loadJfrEventList,
  emptyHintJfr,
  accumulateBlockedEvents,
  accumulateCumulativeForTypes,
  topNFromMap,
} from "../utils/jfr-parse.js";

export const profileJfrLocksSchema = z.object({
  filepath: z.string().optional().default("new_profile"),
  topN: z.number().int().min(1).max(100).optional().default(10),
});

export type ProfileJfrLocksInput = z.infer<typeof profileJfrLocksSchema>;

const TYPE = "jdk.JavaMonitorBlocked";

export async function profileJfrLocks(input: ProfileJfrLocksInput): Promise<string> {
  const { topN } = input;
  const loaded = await loadJfrEventList(input.filepath, TYPE);
  if (typeof loaded === "string") return loaded;

  const { eventsList } = loaded;
  const byMonitor = accumulateBlockedEvents(eventsList);
  const stackCounts = accumulateCumulativeForTypes(eventsList, new Set([TYPE]));

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
