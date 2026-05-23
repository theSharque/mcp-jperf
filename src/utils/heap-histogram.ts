import { runJcmd } from "./jdk.js";

export interface HistogramEntry {
  className: string;
  instances: number;
  bytes: number;
}

export interface GrowthEntry {
  className: string;
  baselineInstances: number;
  snapshotInstances: number;
  baselineBytes: number;
  snapshotBytes: number;
  deltaInstances: number;
  deltaBytes: number;
}

export function parseHistogramOutput(output: string): HistogramEntry[] {
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

export function fetchClassHistogram(pid: number, all = false): HistogramEntry[] {
  const opts = all ? ["-all"] : [];
  const output = runJcmd(pid, "GC.class_histogram", opts);
  return parseHistogramOutput(output);
}

export function diffHistograms(
  before: HistogramEntry[],
  after: HistogramEntry[],
  minInstanceDelta = 0
): GrowthEntry[] {
  const beforeByClass = new Map(before.map((e) => [e.className, e]));
  const growth: GrowthEntry[] = [];

  for (const snapshot of after) {
    const baseline = beforeByClass.get(snapshot.className);
    const baselineInstances = baseline?.instances ?? 0;
    const baselineBytes = baseline?.bytes ?? 0;
    const deltaInstances = snapshot.instances - baselineInstances;
    const deltaBytes = snapshot.bytes - baselineBytes;

    if (deltaInstances <= minInstanceDelta) continue;

    growth.push({
      className: snapshot.className,
      baselineInstances,
      snapshotInstances: snapshot.instances,
      baselineBytes,
      snapshotBytes: snapshot.bytes,
      deltaInstances,
      deltaBytes,
    });
  }

  return growth;
}
