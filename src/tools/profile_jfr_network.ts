import { z } from "zod";
import {
  loadJfrEventList,
  emptyHintJfr,
  accumulateSocketLikeEvents,
  accumulateCumulativeForTypes,
  topNFromMap,
} from "../utils/jfr-parse.js";

export const profileJfrNetworkSchema = z.object({
  filepath: z.string().optional().default("new_profile"),
  topN: z.number().int().min(1).max(100).optional().default(10),
});

export type ProfileJfrNetworkInput = z.infer<typeof profileJfrNetworkSchema>;

const EVENTS = ["jdk.SocketRead", "jdk.SocketWrite"] as const;
const EVENT_LIST = EVENTS.join(",");

export async function profileJfrNetwork(input: ProfileJfrNetworkInput): Promise<string> {
  const { topN } = input;
  const loaded = await loadJfrEventList(input.filepath, EVENT_LIST);
  if (typeof loaded === "string") return loaded;

  const { eventsList } = loaded;
  const { eventCount, bytesTotal, byEndpoint } = accumulateSocketLikeEvents(eventsList);
  const stackCounts = accumulateCumulativeForTypes(eventsList, new Set(EVENTS));

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
