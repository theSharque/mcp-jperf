import { z } from "zod";
import { runJcmd } from "../utils/jdk.js";

export const gcClassStatsSchema = z.object({
  pid: z.number().int().positive(),
});

export type GcClassStatsInput = z.infer<typeof gcClassStatsSchema>;

export async function gcClassStats(input: GcClassStatsInput): Promise<string> {
  try {
    const raw = runJcmd(input.pid, "GC.class_stats");
    return JSON.stringify({ output: raw.trim() }, null, 2);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const hint = msg.includes("Unknown diagnostic command")
      ? "GC.class_stats is not available on this JDK (often JDK 21+ only). Use heap_info, heap_histogram, or vm_info."
      : undefined;
    return JSON.stringify({ error: msg, hint }, null, 2);
  }
}
