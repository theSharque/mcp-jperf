import { z } from "zod";
import { runJfr } from "../utils/jdk.js";
import { resolveProfilePath } from "../utils/paths.js";
import { streamJfrEvents, emptyHintJfr } from "../utils/jfr-parse.js";
import {
  getEventType,
  getEventValues,
  getValuesNumber,
  parseIsoDurationMs,
} from "../utils/jfr-json.js";

export const gcEfficiencySchema = z.object({
  filepath: z.string().optional().default("new_profile"),
  topN: z.number().int().min(1).max(100).optional().default(10),
});

export type GcEfficiencyInput = z.infer<typeof gcEfficiencySchema>;

const GC_EVENTS = "jdk.GarbageCollection,jdk.GCHeapSummary";

interface CollectorStats {
  name: string;
  cause: string;
  count: number;
  totalPauseMs: number;
  longestPauseMs: number;
  totalFreedBytes: number;
  avgPauseMs: number;
  freedBytesPerMs: number | null;
}

function parseRecordingDurationSeconds(summaryOut: string): number | undefined {
  const match = summaryOut.match(/^\s*Duration:\s*(.+)$/m);
  if (!match) return undefined;
  const raw = match[1].trim();
  if (raw.endsWith("s")) {
    const n = Number(raw.slice(0, -1).trim());
    return Number.isFinite(n) ? n : undefined;
  }
  const hm = raw.match(/^(\d+)\s*h\s*(\d+)\s*m\s*(\d+)\s*s$/i);
  if (hm) return Number(hm[1]) * 3600 + Number(hm[2]) * 60 + Number(hm[3]);
  const ms = raw.match(/^(\d+)\s*m\s*(\d+)\s*s$/i);
  if (ms) return Number(ms[1]) * 60 + Number(ms[2]);
  return undefined;
}

function collectorKey(name: string, cause: string): string {
  return `${name}::${cause}`;
}

export async function gcEfficiency(input: GcEfficiencyInput, context?: unknown): Promise<string> {
  const { topN } = input;
  const heapBeforeByGcId = new Map<number, number>();
  const heapAfterByGcId = new Map<number, number>();
  const gcMetaById = new Map<number, { name: string; cause: string; pauseMs: number; longestPauseMs: number }>();
  let gcEventCount = 0;

  const loadError = await streamJfrEvents(
    input.filepath,
    GC_EVENTS,
    (ev) => {
      const typ = getEventType(ev);
      const values = getEventValues(ev);

      if (typ === "jdk.GCHeapSummary") {
        const gcId = getValuesNumber(values, ["gcId"]);
        const heapUsed = getValuesNumber(values, ["heapUsed"]);
        const when = values.when;
        if (gcId === undefined || heapUsed === undefined) return;
        if (when === "Before GC") heapBeforeByGcId.set(gcId, heapUsed);
        if (when === "After GC") heapAfterByGcId.set(gcId, heapUsed);
        return;
      }

      if (typ !== "jdk.GarbageCollection") return;

      gcEventCount++;
      const gcId = getValuesNumber(values, ["gcId"]);
      const name = typeof values.name === "string" ? values.name : "unknown";
      const cause = typeof values.cause === "string" ? values.cause : "unknown";
      const pauseMs =
        parseIsoDurationMs(values.sumOfPauses) ??
        parseIsoDurationMs(values.duration) ??
        0;
      const longestPauseMs =
        parseIsoDurationMs(values.longestPause) ??
        pauseMs;

      if (gcId !== undefined) {
        gcMetaById.set(gcId, { name, cause, pauseMs, longestPauseMs });
      }
    },
    context,
    "gc efficiency"
  );
  if (typeof loadError === "string") return loadError;

  if (gcEventCount === 0) {
    return JSON.stringify(
      {
        error: "EMPTY_EVENTS",
        emptyEventsHint: emptyHintJfr("gc_efficiency", ["jdk.GarbageCollection"]),
        totals: { gcEvents: 0, totalPauseMs: 0, totalFreedBytes: 0 },
        byCollector: [],
      },
      null,
      2
    );
  }

  let recordingDurationSeconds: number | undefined;
  try {
    const summaryOut = await runJfr(["summary", resolveProfilePath(input.filepath)]);
    recordingDurationSeconds = parseRecordingDurationSeconds(summaryOut);
  } catch {
    recordingDurationSeconds = undefined;
  }

  const byCollectorMap = new Map<string, CollectorStats>();

  for (const [gcId, meta] of gcMetaById) {
    const key = collectorKey(meta.name, meta.cause);
    const before = heapBeforeByGcId.get(gcId);
    const after = heapAfterByGcId.get(gcId);
    const freedBytes =
      before !== undefined && after !== undefined && before > after ? before - after : 0;

    const existing = byCollectorMap.get(key) ?? {
      name: meta.name,
      cause: meta.cause,
      count: 0,
      totalPauseMs: 0,
      longestPauseMs: 0,
      totalFreedBytes: 0,
      avgPauseMs: 0,
      freedBytesPerMs: null,
    };

    existing.count++;
    existing.totalPauseMs += meta.pauseMs;
    existing.longestPauseMs = Math.max(existing.longestPauseMs, meta.longestPauseMs);
    existing.totalFreedBytes += freedBytes;
    byCollectorMap.set(key, existing);
  }

  const byCollector = [...byCollectorMap.values()].map((entry) => {
    const avgPauseMs = entry.count > 0 ? entry.totalPauseMs / entry.count : 0;
    const freedBytesPerMs =
      entry.totalPauseMs > 0 ? entry.totalFreedBytes / entry.totalPauseMs : null;
    return { ...entry, avgPauseMs, freedBytesPerMs };
  });

  const totals = byCollector.reduce(
    (acc, c) => ({
      gcEvents: acc.gcEvents + c.count,
      totalPauseMs: acc.totalPauseMs + c.totalPauseMs,
      totalFreedBytes: acc.totalFreedBytes + c.totalFreedBytes,
    }),
    { gcEvents: 0, totalPauseMs: 0, totalFreedBytes: 0 }
  );

  const insights: string[] = [];
  const fullCollectors = byCollector.filter((c) => /full|old/i.test(c.name));
  for (const fc of fullCollectors) {
    if (fc.totalPauseMs > 100 && fc.totalFreedBytes < 1024 * 1024) {
      insights.push(
        `${fc.name} (${fc.cause}) paused ${fc.totalPauseMs.toFixed(1)} ms but freed only ${fc.totalFreedBytes} bytes — likely old-gen pressure or retention.`
      );
    }
  }
  if (recordingDurationSeconds && totals.gcEvents > 0) {
    const perMinute = (totals.gcEvents / recordingDurationSeconds) * 60;
    if (perMinute > 30) {
      insights.push(`High GC frequency: ${perMinute.toFixed(1)} collections/minute.`);
    }
  }

  const byInefficiency = [...byCollector]
    .filter((c) => c.totalPauseMs > 0)
    .sort((a, b) => {
      const aRatio = a.freedBytesPerMs ?? 0;
      const bRatio = b.freedBytesPerMs ?? 0;
      return aRatio - bRatio;
    })
    .slice(0, topN);

  return JSON.stringify(
    {
      recordingDurationSeconds,
      totals,
      gcFrequencyPerMinute:
        recordingDurationSeconds && recordingDurationSeconds > 0
          ? (totals.gcEvents / recordingDurationSeconds) * 60
          : undefined,
      byCollector: byCollector.sort((a, b) => b.totalPauseMs - a.totalPauseMs),
      leastEfficientCollectors: byInefficiency,
      insights: insights.length ? insights : undefined,
      nextSteps: ["Combine with profile_memory and heap_info for allocation vs retention context."],
    },
    null,
    2
  );
}
