import { z } from "zod";
import { runJcmd } from "../utils/jdk.js";

export const heapInfoSchema = z.object({
  pid: z.number().int().positive(),
});

export type HeapInfoInput = z.infer<typeof heapInfoSchema>;

export async function heapInfo(input: HeapInfoInput): Promise<string> {
  const { pid } = input;
  const output = runJcmd(pid, "GC.heap_info");
  return output.trim();
}
