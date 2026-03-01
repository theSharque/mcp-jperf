import { z } from "zod";
import { existsSync } from "node:fs";
import { runJfr } from "../utils/jdk.js";
import { resolveProfilePath } from "../utils/paths.js";
import { getEvents, getEventType, getStackTrace, getMethodKey } from "../utils/jfr-json.js";

export const parseJfrSummarySchema = z.object({
  filepath: z.string(),
  events: z.array(z.string()).optional(),
  topN: z.number().int().min(1).max(100).optional().default(10),
});

export type ParseJfrSummaryInput = z.infer<typeof parseJfrSummarySchema>;

export async function parseJfrSummary(input: ParseJfrSummaryInput): Promise<string> {
  const { topN } = input;
  const filepath = resolveProfilePath(input.filepath);

  if (!existsSync(filepath)) {
    return JSON.stringify({ error: `File not found: ${filepath}` });
  }

  const events = input.events ?? [
    "jdk.ExecutionSample",
    "jdk.GarbageCollection",
    "jdk.JavaThreadStatistics",
    "jdk.ThreadAllocationStatistics",
  ];
  const eventsArg = events.join(",");

  const [summaryOut, jsonOut] = await Promise.all([
    runJfr(["summary", filepath]),
    runJfr(["print", "--json", "--events", eventsArg, filepath]),
  ]);

  const methodCount: Map<string, number> = new Map();
  let gcCount = 0;
  const anomalies: string[] = [];

  try {
    const parsed = JSON.parse(jsonOut);
    const eventsList = getEvents(parsed);

    for (const ev of eventsList) {
      const typ = getEventType(ev);
      if (typ === "jdk.GarbageCollection") gcCount++;

      if (typ === "jdk.ExecutionSample") {
        const frames = getStackTrace(ev)?.frames ?? [];
        for (const f of frames) {
          const key = getMethodKey(f);
          if (key) methodCount.set(key, (methodCount.get(key) ?? 0) + 1);
        }
      }
    }

    if (gcCount > 100) anomalies.push("High GC count - possible memory pressure");
  } catch {
    // continue with summary only
  }

  const topMethods = [...methodCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([m, c]) => ({ method: m, samples: c }));

  const result = {
    summary: summaryOut.trim(),
    topMethods,
    gcStats: { gcEvents: gcCount },
    anomalies: anomalies.length ? anomalies : undefined,
  };

  return JSON.stringify(result, null, 2);
}
