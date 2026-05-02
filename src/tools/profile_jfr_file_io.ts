import { z } from "zod";
import {
  loadJfrEventList,
  emptyHintJfr,
  accumulateFileIoEvents,
  accumulateCumulativeForTypes,
  topNFromMap,
} from "../utils/jfr-parse.js";

export const profileJfrFileIoSchema = z.object({
  filepath: z.string().optional().default("new_profile"),
  topN: z.number().int().min(1).max(100).optional().default(10),
});

export type ProfileJfrFileIoInput = z.infer<typeof profileJfrFileIoSchema>;

const EVENTS = ["jdk.FileRead", "jdk.FileWrite"] as const;
const EVENT_LIST = EVENTS.join(",");

export async function profileJfrFileIo(input: ProfileJfrFileIoInput): Promise<string> {
  const { topN } = input;
  const loaded = await loadJfrEventList(input.filepath, EVENT_LIST);
  if (typeof loaded === "string") return loaded;

  const { eventsList } = loaded;
  const { eventCount, bytesTotal, byPath } = accumulateFileIoEvents(eventsList);
  const stackCounts = accumulateCumulativeForTypes(eventsList, new Set(EVENTS));

  if (eventCount === 0) {
    return JSON.stringify(
      {
        error: "EMPTY_EVENTS",
        hint: emptyHintJfr("profile_jfr_file_io", [...EVENTS]),
        topPaths: [],
        topMethods: [],
      },
      null,
      2
    );
  }

  return JSON.stringify(
    {
      eventCount,
      bytesTotal,
      topPaths: topNFromMap(byPath, topN).map(({ key, count }) => ({
        pathOrKey: key,
        events: count,
      })),
      topMethods: topNFromMap(stackCounts, topN).map(({ key, count }) => ({
        method: key,
        samples: count,
        note: "cumulative across stack (FileRead/Write)",
      })),
    },
    null,
    2
  );
}
