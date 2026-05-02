import { z } from "zod";
import { runJcmd } from "../utils/jdk.js";

export const gcFinalizerInfoSchema = z.object({
  pid: z.number().int().positive(),
});

export type GcFinalizerInfoInput = z.infer<typeof gcFinalizerInfoSchema>;

export async function gcFinalizerInfo(input: GcFinalizerInfoInput): Promise<string> {
  try {
    const raw = runJcmd(input.pid, "GC.finalizer_info");
    return JSON.stringify({ output: raw.trim() }, null, 2);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return JSON.stringify({ error: msg }, null, 2);
  }
}
