import { z } from "zod";
import { runJcmd } from "../utils/jdk.js";

export const compilerQueueSchema = z.object({
  pid: z.number().int().positive(),
});

export type CompilerQueueInput = z.infer<typeof compilerQueueSchema>;

export async function compilerQueue(input: CompilerQueueInput): Promise<string> {
  try {
    const raw = runJcmd(input.pid, "Compiler.queue");
    return JSON.stringify({ output: raw.trim() }, null, 2);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return JSON.stringify({ error: msg }, null, 2);
  }
}
