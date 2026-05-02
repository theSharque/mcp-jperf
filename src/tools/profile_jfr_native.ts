import { z } from "zod";
import {
  loadJfrEventList,
  emptyHintJfr,
  accumulateCumulativeForTypes,
  topNFromMap,
} from "../utils/jfr-parse.js";

export const profileJfrNativeSchema = z.object({
  filepath: z.string().optional().default("new_profile"),
  topN: z.number().int().min(1).max(100).optional().default(10),
});

export type ProfileJfrNativeInput = z.infer<typeof profileJfrNativeSchema>;

const TYPE = "jdk.NativeMethodSample";

export async function profileJfrNative(input: ProfileJfrNativeInput): Promise<string> {
  const { topN } = input;
  const loaded = await loadJfrEventList(input.filepath, TYPE);
  if (typeof loaded === "string") return loaded;

  const { eventsList } = loaded;
  const stackCounts = accumulateCumulativeForTypes(eventsList, new Set([TYPE]));

  if (stackCounts.size === 0) {
    return JSON.stringify(
      {
        error: "EMPTY_EVENTS",
        hint: emptyHintJfr("profile_jfr_native", [TYPE]),
        topMethods: [],
      },
      null,
      2
    );
  }

  return JSON.stringify(
    {
      profile: "native_cpu",
      topMethods: topNFromMap(stackCounts, topN).map(({ key, count }) => ({
        method: key,
        samples: count,
        note: "cumulative from NativeMethodSample stacks",
      })),
    },
    null,
    2
  );
}
