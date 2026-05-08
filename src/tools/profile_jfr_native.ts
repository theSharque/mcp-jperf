import { z } from "zod";
import {
  streamJfrEvents,
  emptyHintJfr,
  topNFromMap,
} from "../utils/jfr-parse.js";
import { getEventType, getStackTrace, getMethodKey } from "../utils/jfr-json.js";

export const profileJfrNativeSchema = z.object({
  filepath: z.string().optional().default("new_profile"),
  topN: z.number().int().min(1).max(100).optional().default(10),
});

export type ProfileJfrNativeInput = z.infer<typeof profileJfrNativeSchema>;

const TYPE = "jdk.NativeMethodSample";

export async function profileJfrNative(input: ProfileJfrNativeInput, context?: unknown): Promise<string> {
  const { topN } = input;
  const stackCounts = new Map<string, number>();

  const loadError = await streamJfrEvents(
    input.filepath,
    TYPE,
    (ev) => {
      if (getEventType(ev) !== TYPE) return;
      const frames = getStackTrace(ev)?.frames ?? [];
      for (const frame of frames) {
        const method = getMethodKey(frame);
        if (!method) continue;
        stackCounts.set(method, (stackCounts.get(method) ?? 0) + 1);
      }
    },
    context,
    "native"
  );
  if (typeof loadError === "string") return loadError;

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
