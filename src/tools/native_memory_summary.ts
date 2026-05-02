import { z } from "zod";
import { runJcmd } from "../utils/jdk.js";

export const nativeMemorySummarySchema = z.object({
  pid: z.number().int().positive(),
});

export type NativeMemorySummaryInput = z.infer<typeof nativeMemorySummarySchema>;

export async function nativeMemorySummary(input: NativeMemorySummaryInput): Promise<string> {
  try {
    const raw = runJcmd(input.pid, "VM.native_memory", ["summary=true"]);
    return JSON.stringify({ output: raw.trim() }, null, 2);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    let hint: string | undefined;
    if (msg.includes("Native memory tracking is not enabled")) {
      hint = "Enable NMT at JVM startup: -XX:NativeMemoryTracking=summary or -XX:NativeMemoryTracking=detail.";
    }
    return JSON.stringify({ error: msg, hint }, null, 2);
  }
}
