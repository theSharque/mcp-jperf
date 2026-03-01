import { z } from "zod";
import { existsSync } from "node:fs";
import { runJfr } from "../utils/jdk.js";

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

export async function profileMemory(input: ProfileMemoryInput): Promise<string> {
  const { filepath, topN } = input;

  if (!existsSync(filepath)) {
    return JSON.stringify({ error: `File not found: ${filepath}` });
  }

  const output = await runJfr(["print", "--json", "--events", MEMORY_EVENTS, filepath]);

  const allocatorCount: Map<string, number> = new Map();
  let gcCount = 0;
  const potentialLeaks: string[] = [];

  try {
    const parsed = JSON.parse(output);
    const eventsList = Array.isArray(parsed) ? parsed : parsed.events ?? [];

    for (const ev of eventsList) {
      if (ev.type === "jdk.GarbageCollection") gcCount++;

      if (
        (ev.type === "jdk.ObjectAllocationInNewTLAB" ||
          ev.type === "jdk.ObjectAllocationOutsideTLAB" ||
          ev.type === "jdk.ObjectAllocationSample") &&
        ev.stackTrace?.frames
      ) {
        const top = ev.stackTrace.frames[0];
        const key = top?.method ? `${top.method.type ?? ""}.${top.method.name ?? ""}` : "unknown";
        if (key && key !== "unknown")
          allocatorCount.set(key, (allocatorCount.get(key) ?? 0) + 1);
      }

      if (ev.type === "jdk.OldObjectSample" && ev.stackTrace?.frames) {
        const top = ev.stackTrace.frames[0];
        if (top?.method)
          potentialLeaks.push(`${top.method.type ?? ""}.${top.method.name ?? ""}`);
      }
    }
  } catch {
    return JSON.stringify({ error: "Failed to parse JFR output. Ensure recording used settings=profile." });
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

  return JSON.stringify(result, null, 2);
}
