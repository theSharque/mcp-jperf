import { z } from "zod";
import { runJcmd } from "../utils/jdk.js";

export const compilerCodecacheSchema = z.object({
  pid: z.number().int().positive(),
});

export type CompilerCodecacheInput = z.infer<typeof compilerCodecacheSchema>;

export async function compilerCodecache(input: CompilerCodecacheInput): Promise<string> {
  try {
    const raw = runJcmd(input.pid, "Compiler.codecache");
    return JSON.stringify({ output: raw.trim() }, null, 2);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return JSON.stringify({ error: msg }, null, 2);
  }
}
