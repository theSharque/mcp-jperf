import { z } from "zod";
import { runJcmd } from "../utils/jdk.js";

export const heapHistogramSchema = z.object({
  pid: z.number().int().positive(),
  topN: z.number().int().min(1).max(200).optional().default(20),
  all: z.boolean().optional().default(false),
});

export type HeapHistogramInput = z.infer<typeof heapHistogramSchema>;

interface HistogramEntry {
  className: string;
  instances: number;
  bytes: number;
}

function parseHistogramOutput(output: string): HistogramEntry[] {
  const lines = output.trim().split("\n");
  const result: HistogramEntry[] = [];

  for (const line of lines) {
    const match = line.match(/^\s*\d+:\s+(\d+)\s+(\d+)\s+(.+)$/);
    if (!match) continue;

    const instances = parseInt(match[1], 10);
    const bytes = parseInt(match[2], 10);
    const className = match[3].trim();
    result.push({ className, instances, bytes });
  }

  result.sort((a, b) => b.bytes - a.bytes);
  return result;
}

export async function heapHistogram(input: HeapHistogramInput): Promise<string> {
  const { pid, topN, all } = input;
  const opts = all ? ["-all"] : [];
  const output = runJcmd(pid, "GC.class_histogram", opts);
  const entries = parseHistogramOutput(output);
  const top = entries.slice(0, topN);
  return JSON.stringify({ entries: top, total: entries.length }, null, 2);
}
