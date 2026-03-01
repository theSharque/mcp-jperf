import { z } from "zod";
import { existsSync } from "node:fs";
import { runJfr } from "../utils/jdk.js";

export const parseJfrSummarySchema = z.object({
  filepath: z.string(),
  events: z.array(z.string()).optional(),
  topN: z.number().int().min(1).max(100).optional().default(10),
});

export type ParseJfrSummaryInput = z.infer<typeof parseJfrSummarySchema>;

interface JfrEvent {
  type?: string;
  stackTrace?: { frames?: Array<{ method?: { type?: string; name?: string } }> };
}

export async function parseJfrSummary(input: ParseJfrSummaryInput): Promise<string> {
  const { filepath, topN } = input;

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
    const eventsList: JfrEvent[] = Array.isArray(parsed) ? parsed : parsed.events ?? [];

    for (const ev of eventsList) {
      if (ev.type === "jdk.GarbageCollection") gcCount++;

      if (ev.type === "jdk.ExecutionSample" && ev.stackTrace?.frames) {
        for (const f of ev.stackTrace.frames) {
          const t = f.method?.type ?? "";
          const n = f.method?.name ?? "";
          const key = t ? `${t}.${n}` : n;
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
