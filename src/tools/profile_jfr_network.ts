import { z } from "zod";
import {
  streamJfrEvents,
  emptyHintJfr,
  topNFromMap,
} from "../utils/jfr-parse.js";
import {
  getEventType,
  getEventValues,
  getValuesNumber,
  getStackTrace,
  getMethodKey,
} from "../utils/jfr-json.js";

export const profileJfrNetworkSchema = z.object({
  filepath: z.string().optional().default("new_profile"),
  topN: z.number().int().min(1).max(100).optional().default(10),
});

export type ProfileJfrNetworkInput = z.infer<typeof profileJfrNetworkSchema>;

const EVENTS = ["jdk.SocketRead", "jdk.SocketWrite"] as const;
const EVENT_LIST = EVENTS.join(",");

export async function profileJfrNetwork(input: ProfileJfrNetworkInput, context?: unknown): Promise<string> {
  const { topN } = input;
  let eventCount = 0;
  let bytesTotal = 0;
  const byEndpoint = new Map<string, number>();
  const stackCounts = new Map<string, number>();
  const eventSet = new Set(EVENTS);

  const loadError = await streamJfrEvents(
    input.filepath,
    EVENT_LIST,
    (ev) => {
      const typ = getEventType(ev);
      if (!typ || !eventSet.has(typ as (typeof EVENTS)[number])) return;
      eventCount++;
      const values = getEventValues(ev);
      const bytes =
        getValuesNumber(values, ["bytesRead", "bytesWritten", "byteCount"]) ??
        getValuesNumber(values, ["size"]);
      bytesTotal += bytes ?? 0;
      const host = typeof values.host === "string" ? values.host : undefined;
      const port = typeof values.port === "number" ? values.port : undefined;
      const addr = typeof values.address === "string" ? values.address : undefined;
      const endpoint =
        host !== undefined || port !== undefined
          ? `${host ?? "?"}:${port ?? "?"}`
          : addr && addr.length > 0
            ? addr
            : "(unknown)";
      byEndpoint.set(endpoint, (byEndpoint.get(endpoint) ?? 0) + 1);

      const frames = getStackTrace(ev)?.frames ?? [];
      for (const frame of frames) {
        const method = getMethodKey(frame);
        if (!method) continue;
        stackCounts.set(method, (stackCounts.get(method) ?? 0) + 1);
      }
    },
    context,
    "network"
  );
  if (typeof loadError === "string") return loadError;

  if (eventCount === 0) {
    return JSON.stringify(
      { error: "EMPTY_EVENTS", hint: emptyHintJfr("profile_jfr_network", [...EVENTS]), topEndpoints: [], topMethods: [] },
      null,
      2
    );
  }

  return JSON.stringify(
    {
      eventCount,
      bytesTotal,
      topEndpoints: topNFromMap(byEndpoint, topN),
      topMethods: topNFromMap(stackCounts, topN).map(({ key, count }) => ({
        method: key,
        samples: count,
        note: "cumulative across stack (SocketRead/Write)",
      })),
    },
    null,
    2
  );
}
