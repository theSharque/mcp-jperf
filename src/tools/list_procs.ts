import { z } from "zod";
import { runJps } from "../utils/jdk.js";

export const listJavaProcessesSchema = z.object({
  topN: z.number().int().min(1).max(100).optional().default(10),
});

export type ListJavaProcessesInput = z.infer<typeof listJavaProcessesSchema>;

export async function listJavaProcesses(input: ListJavaProcessesInput): Promise<string> {
  const { topN } = input;
  const processes = runJps();
  const limited = processes.slice(0, topN);
  return JSON.stringify(limited, null, 2);
}
