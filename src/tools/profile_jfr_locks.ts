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

const MONITOR_BLOCKED = "jdk.JavaMonitorBlocked";
const THREAD_PARK = "jdk.ThreadPark";
const LOCK_EVENTS = `${MONITOR_BLOCKED},${THREAD_PARK}`;

function accumulateBlocked(
  ev: unknown,
  byMonitor: Map<string, number>,
  stackCounts: Map<string, number>
): void {
  if (getEventType(ev) !== MONITOR_BLOCKED) return;
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
}

function accumulateParked(
  ev: unknown,
  byParkTarget: Map<string, number>,
  stackCounts: Map<string, number>
): void {
  if (getEventType(ev) !== THREAD_PARK) return;
  const values = getEventValues(ev);
  const parkKey =
    getMonitorOrPathKey(values, ["parkedClass", "class"]) ??
    getMonitorOrPathKey(values, ["toPark"]) ??
    "unknownParkTarget";
  const duration = getValuesNumber(values, ["duration"]);
  const weight = typeof duration === "number" && duration > 0 ? duration : 1;
  byParkTarget.set(parkKey, (byParkTarget.get(parkKey) ?? 0) + weight);

  const frames = getStackTrace(ev)?.frames ?? [];
  for (const frame of frames) {
    const method = getMethodKey(frame);
    if (!method) continue;
    stackCounts.set(method, (stackCounts.get(method) ?? 0) + 1);
  }
}

function mapToTopEntries(map: Map<string, number>, topN: number, note: string) {
  return topNFromMap(map, topN).map(({ key, count }) => ({
    key,
    weightTicksOrCount: count,
    note,
  }));
}

export async function profileJfrLocks(input: ProfileJfrLocksInput, context?: unknown): Promise<string> {
  const { topN } = input;
  const syncMonitors = new Map<string, number>();
  const syncStacks = new Map<string, number>();
  const jucParking = new Map<string, number>();
  const parkStacks = new Map<string, number>();
  const combinedStacks = new Map<string, number>();

  const loadError = await streamJfrEvents(
    input.filepath,
    LOCK_EVENTS,
    (ev) => {
      const typ = getEventType(ev);
      if (typ === MONITOR_BLOCKED) {
        accumulateBlocked(ev, syncMonitors, syncStacks);
      } else if (typ === THREAD_PARK) {
        accumulateParked(ev, jucParking, parkStacks);
      }
    },
    context,
    "locks"
  );
  if (typeof loadError === "string") return loadError;

  for (const [k, v] of syncStacks) combinedStacks.set(k, (combinedStacks.get(k) ?? 0) + v);
  for (const [k, v] of parkStacks) combinedStacks.set(k, (combinedStacks.get(k) ?? 0) + v);

  const hasSync = syncMonitors.size > 0;
  const hasPark = jucParking.size > 0;

  if (!hasSync && !hasPark) {
    return JSON.stringify(
      {
        error: "EMPTY_EVENTS",
        hint: emptyHintJfr("profile_jfr_locks", [MONITOR_BLOCKED, THREAD_PARK]),
        synchronizedMonitors: { topMonitors: [], topMethods: [] },
        jucParking: { topParkTargets: [], topMethods: [] },
        combinedTopMethods: [],
      },
      null,
      2
    );
  }

  return JSON.stringify(
    {
      synchronizedMonitors: {
        topMonitors: mapToTopEntries(
          syncMonitors,
          topN,
          "weight uses event duration when present, else 1 per event"
        ),
        topMethods: topNFromMap(syncStacks, topN).map(({ key, count }) => ({
          method: key,
          samples: count,
        })),
      },
      jucParking: {
        topParkTargets: mapToTopEntries(
          jucParking,
          topN,
          "jdk.ThreadPark — ReentrantLock, Condition, ForkJoin, etc."
        ),
        topMethods: topNFromMap(parkStacks, topN).map(({ key, count }) => ({
          method: key,
          samples: count,
        })),
      },
      combinedTopMethods: topNFromMap(combinedStacks, topN).map(({ key, count }) => ({
        method: key,
        samples: count,
      })),
      nextSteps: [
        "Historical contention from this recording; for live wait chains use analyze_threads with structured=true.",
        "Deadlock cycles: check_deadlock.",
      ],
    },
    null,
    2
  );
}
