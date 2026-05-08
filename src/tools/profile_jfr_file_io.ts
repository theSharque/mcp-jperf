import { z } from "zod";
import {
  emptyHintJfr,
  topNFromMap,
} from "../utils/jfr-parse.js";
import { streamJfrJsonEvents } from "../utils/jdk.js";
import { resolveProfilePath } from "../utils/paths.js";
import { existsSync } from "node:fs";
import { formatError } from "../utils/errors.js";
import {
  getEventType,
  getEventValues,
  getValuesNumber,
  getMonitorOrPathKey,
  getStackTrace,
  getMethodKey,
} from "../utils/jfr-json.js";

export const profileJfrFileIoSchema = z.object({
  filepath: z.string().optional().default("new_profile"),
  topN: z.number().int().min(1).max(100).optional().default(10),
});

export type ProfileJfrFileIoInput = z.infer<typeof profileJfrFileIoSchema>;

const EVENTS = ["jdk.FileRead", "jdk.FileWrite"] as const;
const EVENT_LIST = EVENTS.join(",");

type ProgressAwareRequest = {
  _meta?: { progressToken?: string | number };
  notify?: (notification: {
    method: "notifications/progress";
    params: { progressToken: string | number; progress: number; message?: string };
  }) => Promise<void>;
};

async function notifyProgress(
  context: unknown,
  progress: number,
  message: string
): Promise<void> {
  const mcpReq = (context as { mcpReq?: ProgressAwareRequest } | undefined)?.mcpReq;
  const progressToken = mcpReq?._meta?.progressToken;
  if (progressToken === undefined || mcpReq?.notify === undefined) return;
  await mcpReq.notify({
    method: "notifications/progress",
    params: { progressToken, progress, message },
  });
}

export async function profileJfrFileIo(input: ProfileJfrFileIoInput, context?: unknown): Promise<string> {
  const { topN } = input;
  const filepath = resolveProfilePath(input.filepath);
  if (!existsSync(filepath)) {
    return formatError(
      `File not found: ${filepath}`,
      "FILE_NOT_FOUND",
      "Create a recording with start_profiling and stop_profiling."
    );
  }

  let eventCount = 0;
  let bytesTotal = 0;
  const byPath = new Map<string, number>();
  const stackCounts = new Map<string, number>();

  try {
    await notifyProgress(context, 1, "Starting JFR file I/O parsing");
    await streamJfrJsonEvents(
      ["print", "--json", "--events", EVENT_LIST, filepath],
      (ev) => {
        const typ = getEventType(ev);
        if (!typ || !EVENTS.includes(typ as (typeof EVENTS)[number])) return;

        eventCount++;
        const values = getEventValues(ev);
        const bytes =
          getValuesNumber(values, ["bytesRead", "bytesWritten", "size", "length"]) ??
          getValuesNumber(values, ["byteCount"]);
        bytesTotal += bytes ?? 0;

        const pathKey =
          getMonitorOrPathKey(values, ["path"]) ??
          (typeof values.file === "string" ? values.file : "(unknown)");
        byPath.set(pathKey, (byPath.get(pathKey) ?? 0) + 1);

        const frames = getStackTrace(ev)?.frames ?? [];
        for (const frame of frames) {
          const method = getMethodKey(frame);
          if (!method) continue;
          stackCounts.set(method, (stackCounts.get(method) ?? 0) + 1);
        }
      },
      (processed) => {
        void notifyProgress(context, Math.max(processed, 1), `Parsed ${processed} file I/O events`);
      }
    );
  } catch {
    return formatError("Failed to parse JFR JSON.", "PARSE_ERROR", "Ensure the .jfr file is valid.");
  }

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
