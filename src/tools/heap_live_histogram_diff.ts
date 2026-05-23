import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import {
  diffHistograms,
  fetchClassHistogram,
} from "../utils/heap-histogram.js";

export const heapLiveHistogramDiffSchema = z.object({
  pid: z.number().int().positive(),
  intervalSeconds: z.number().int().min(1).max(60).optional().default(5),
  topN: z.number().int().min(1).max(200).optional().default(20),
  all: z.boolean().optional().default(false),
  minInstanceDelta: z.number().int().min(0).optional().default(0),
});

export type HeapLiveHistogramDiffInput = z.infer<typeof heapLiveHistogramDiffSchema>;

export async function heapLiveHistogramDiff(input: HeapLiveHistogramDiffInput): Promise<string> {
  const { pid, intervalSeconds, topN, all, minInstanceDelta } = input;

  const baseline = fetchClassHistogram(pid, all);
  await sleep(intervalSeconds * 1000);
  const snapshot = fetchClassHistogram(pid, all);

  const growth = diffHistograms(baseline, snapshot, minInstanceDelta);
  const topGrowthByInstances = [...growth]
    .sort((a, b) => b.deltaInstances - a.deltaInstances)
    .slice(0, topN);
  const topGrowthByBytes = [...growth]
    .sort((a, b) => b.deltaBytes - a.deltaBytes)
    .slice(0, topN);

  return JSON.stringify(
    {
      intervalSeconds,
      baselineTotalClasses: baseline.length,
      snapshotTotalClasses: snapshot.length,
      topGrowthByInstances,
      topGrowthByBytes,
      caveats: ["Each histogram walks the heap; may pause the application."],
      nextSteps: [
        "If a class keeps growing, run profile_memory on a JFR recording or heap_dump for MAT path-to-GC-roots.",
      ],
    },
    null,
    2
  );
}
