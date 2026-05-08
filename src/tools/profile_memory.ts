import { z } from "zod";
import { existsSync } from "node:fs";
import { streamJfrJsonEvents } from "../utils/jdk.js";
import { resolveProfilePath } from "../utils/paths.js";
import { getEventType, getStackTrace, getMethodKey } from "../utils/jfr-json.js";
import { formatError } from "../utils/errors.js";

export const profileMemorySchema = z.object({
  filepath: z.string(),
  topN: z.number().int().min(1).max(100).optional().default(10),
});

export type ProfileMemoryInput = z.infer<typeof profileMemorySchema>;

const MEMORY_EVENTS = [
  "jdk.ObjectAllocationInNewTLAB",
  "jdk.ObjectAllocationOutsideTLAB",
  "jdk.ObjectAllocationSample",
  "jdk.OldObjectSample",
  "jdk.GarbageCollection",
  "jdk.HeapSummary",
].join(",");

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

export async function profileMemory(input: ProfileMemoryInput, context?: unknown): Promise<string> {
  const { topN } = input;
  const filepath = resolveProfilePath(input.filepath);

  if (!existsSync(filepath)) {
    return formatError(`File not found: ${filepath}`, "FILE_NOT_FOUND", "Create a recording with start_profiling and stop_profiling.");
  }

  const allocatorCount: Map<string, number> = new Map();
  let gcCount = 0;
  const potentialLeaks: string[] = [];
  try {
    await notifyProgress(context, 1, "Starting JFR memory parsing");
    await streamJfrJsonEvents(
      ["print", "--json", "--events", MEMORY_EVENTS, filepath],
      (ev) => {
        const typ = getEventType(ev);
        if (typ === "jdk.GarbageCollection") gcCount++;

        const stackTrace = getStackTrace(ev);
        const frames = stackTrace?.frames;

        if (
          (typ === "jdk.ObjectAllocationInNewTLAB" ||
            typ === "jdk.ObjectAllocationOutsideTLAB" ||
            typ === "jdk.ObjectAllocationSample") &&
          frames?.length
        ) {
          const top = frames[0];
          const key = getMethodKey(top);
          if (key && key !== "unknown") {
            allocatorCount.set(key, (allocatorCount.get(key) ?? 0) + 1);
          }
        }

        if (typ === "jdk.OldObjectSample" && frames?.length) {
          const top = frames[0];
          const key = getMethodKey(top);
          if (key) potentialLeaks.push(key);
        }
      },
      (processed) => {
        void notifyProgress(context, Math.max(processed, 1), `Parsed ${processed} memory events`);
      }
    );
  } catch {
    return formatError("Failed to parse JFR output.", "PARSE_ERROR", "Ensure recording used settings=profile.");
  }

  const topAllocators = [...allocatorCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([allocator, count]) => ({ allocator, count }));

  const result = {
    topAllocators,
    gcStats: { gcEvents: gcCount },
    potentialLeaks: potentialLeaks.length ? [...new Set(potentialLeaks)].slice(0, 5) : undefined,
  };

  await notifyProgress(context, Math.max(allocatorCount.size + gcCount, 1), "Memory profile aggregation completed");
  return JSON.stringify(result, null, 2);
}
