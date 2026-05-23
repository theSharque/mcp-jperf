import { z } from "zod";
import { fetchClassHistogram } from "../utils/heap-histogram.js";

export const heapHistogramSchema = z.object({
  pid: z.number().int().positive(),
  topN: z.number().int().min(1).max(200).optional().default(20),
  all: z.boolean().optional().default(false),
});

export type HeapHistogramInput = z.infer<typeof heapHistogramSchema>;

export async function heapHistogram(input: HeapHistogramInput): Promise<string> {
  const { pid, topN, all } = input;
  const entries = fetchClassHistogram(pid, all);
  const top = entries.slice(0, topN);
  return JSON.stringify({ entries: top, total: entries.length }, null, 2);
}
