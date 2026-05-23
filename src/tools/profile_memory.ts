import { z } from "zod";
import { existsSync } from "node:fs";
import { streamJfrJsonEvents } from "../utils/jdk.js";
import { resolveProfilePath } from "../utils/paths.js";
import {
  getEventType,
  getStackTrace,
  getMethodKey,
  getEventValues,
  getValuesNumber,
  getObjectClassName,
  stackSignature,
} from "../utils/jfr-json.js";
import { formatError } from "../utils/errors.js";

export const profileMemorySchema = z.object({
  filepath: z.string(),
  topN: z.number().int().min(1).max(100).optional().default(10),
  sortBy: z.enum(["bytes", "count"]).optional().default("bytes"),
});

export type ProfileMemoryInput = z.infer<typeof profileMemorySchema>;

const MEMORY_EVENTS = [
  "jdk.ObjectAllocationInNewTLAB",
  "jdk.ObjectAllocationOutsideTLAB",
  "jdk.ObjectAllocationSample",
  "jdk.OldObjectSample",
  "jdk.GarbageCollection",
  "jdk.GCHeapSummary",
].join(",");

const LEAK_INVESTIGATION_HINTS = [
  "OldObjectSample shows allocation site, not GC-root retention path.",
  "For path-to-GC-roots: heap_dump → Eclipse MAT → right-click class → Path to GC Roots (exclude weak/soft references).",
  "Use heap_live_histogram_diff first to find classes growing in live heap.",
];

type ProgressAwareRequest = {
  _meta?: { progressToken?: string | number };
  notify?: (notification: {
    method: "notifications/progress";
    params: { progressToken: string | number; progress: number; message?: string };
  }) => Promise<void>;
};

interface AllocatorAgg {
  count: number;
  bytes: number;
}

interface OldObjectClassAgg {
  sampleCount: number;
  stackCounts: Map<string, number>;
}

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

function allocationBytes(values: Record<string, unknown>): number {
  return (
    getValuesNumber(values, ["allocationSize", "weight", "objectSize", "size"]) ?? 1
  );
}

function topAllocatorsFromMap(map: Map<string, AllocatorAgg>, topN: number) {
  return [...map.entries()]
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .slice(0, topN)
    .map(([allocator, agg]) => ({
      allocator,
      count: agg.count,
      bytes: agg.bytes,
    }));
}

function topAllocatorsByCountFromMap(map: Map<string, AllocatorAgg>, topN: number) {
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, topN)
    .map(([allocator, agg]) => ({
      allocator,
      count: agg.count,
      bytes: agg.bytes,
    }));
}

function topStacksFromMap(
  map: Map<string, AllocatorAgg>,
  topN: number,
  sortBy: "bytes" | "count"
) {
  return [...map.entries()]
    .sort((a, b) => (sortBy === "bytes" ? b[1].bytes - a[1].bytes : b[1].count - a[1].count))
    .slice(0, topN)
    .map(([stack, agg]) => ({
      stack,
      count: agg.count,
      bytes: agg.bytes,
    }));
}

export async function profileMemory(input: ProfileMemoryInput, context?: unknown): Promise<string> {
  const { topN, sortBy } = input;
  const filepath = resolveProfilePath(input.filepath);

  if (!existsSync(filepath)) {
    return formatError(`File not found: ${filepath}`, "FILE_NOT_FOUND", "Create a recording with start_profiling and stop_profiling.");
  }

  const allocatorByMethod = new Map<string, AllocatorAgg>();
  const stackAgg = new Map<string, AllocatorAgg>();
  const oldObjectByClass = new Map<string, OldObjectClassAgg>();
  const potentialLeaks: Array<{ className: string; allocationStack: string; objectAge?: number }> = [];
  let gcCount = 0;

  try {
    await notifyProgress(context, 1, "Starting JFR memory parsing");
    await streamJfrJsonEvents(
      ["print", "--json", "--events", MEMORY_EVENTS, filepath],
      (ev) => {
        const typ = getEventType(ev);
        if (typ === "jdk.GarbageCollection") gcCount++;

        const values = getEventValues(ev);
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
          const bytes = allocationBytes(values);
          if (key && key !== "unknown") {
            const prev = allocatorByMethod.get(key) ?? { count: 0, bytes: 0 };
            prev.count++;
            prev.bytes += bytes;
            allocatorByMethod.set(key, prev);
          }

          const sig = stackSignature(frames);
          if (sig) {
            const prevStack = stackAgg.get(sig) ?? { count: 0, bytes: 0 };
            prevStack.count++;
            prevStack.bytes += bytes;
            stackAgg.set(sig, prevStack);
          }
        }

        if (typ === "jdk.OldObjectSample") {
          const className = getObjectClassName(values) ?? "unknown";
          const sig = stackSignature(frames);
          const objectAge = getValuesNumber(values, ["objectAge"]);

          if (sig) {
            potentialLeaks.push({ className, allocationStack: sig, ...(objectAge !== undefined && { objectAge }) });
          }

          const prevClass = oldObjectByClass.get(className) ?? { sampleCount: 0, stackCounts: new Map() };
          prevClass.sampleCount++;
          if (sig) {
            prevClass.stackCounts.set(sig, (prevClass.stackCounts.get(sig) ?? 0) + 1);
          }
          oldObjectByClass.set(className, prevClass);
        }
      },
      (processed) => {
        void notifyProgress(context, Math.max(processed, 1), `Parsed ${processed} memory events`);
      }
    );
  } catch {
    return formatError("Failed to parse JFR output.", "PARSE_ERROR", "Ensure recording used settings=profile.");
  }

  const topAllocatorsByBytes = topAllocatorsFromMap(allocatorByMethod, topN);
  const topAllocatorsByCount = topAllocatorsByCountFromMap(allocatorByMethod, topN);
  const topAllocators = sortBy === "bytes" ? topAllocatorsByBytes : topAllocatorsByCount;

  const oldObjectSamplesByClass = [...oldObjectByClass.entries()]
    .sort((a, b) => b[1].sampleCount - a[1].sampleCount)
    .slice(0, topN)
    .map(([className, agg]) => ({
      className,
      sampleCount: agg.sampleCount,
      topAllocationStacks: [...agg.stackCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([stack, count]) => ({ stack, count })),
    }));

  const result = {
    topAllocators,
    topAllocatorsByBytes,
    topAllocatorsByCount,
    topAllocationStacks: topStacksFromMap(stackAgg, topN, sortBy),
    gcStats: { gcEvents: gcCount },
    oldObjectSamplesByClass: oldObjectSamplesByClass.length ? oldObjectSamplesByClass : undefined,
    potentialLeaks: potentialLeaks.length ? potentialLeaks.slice(0, topN) : undefined,
    leakInvestigationHints: LEAK_INVESTIGATION_HINTS,
    nextSteps: ["Run gc_efficiency on the same recording; use heap_dump + MAT for retention paths."],
  };

  await notifyProgress(context, Math.max(allocatorByMethod.size + gcCount, 1), "Memory profile aggregation completed");
  return JSON.stringify(result, null, 2);
}
