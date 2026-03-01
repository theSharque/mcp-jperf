import { z } from "zod";
import { runJcmd } from "../utils/jdk.js";

export const analyzeThreadsSchema = z.object({
  pid: z.number().int().positive(),
  topN: z.number().int().min(1).max(500).optional().default(10),
});

export type AnalyzeThreadsInput = z.infer<typeof analyzeThreadsSchema>;

export async function analyzeThreads(input: AnalyzeThreadsInput): Promise<string> {
  const { pid, topN } = input;
  const output = runJcmd(pid, "Thread.print -l");

  const threadSections: string[] = [];
  let current = "";

  for (const line of output.split("\n")) {
    if (line.match(/^"\S/)) {
      if (current.trim()) threadSections.push(current.trim());
      current = line + "\n";
    } else {
      current += line + "\n";
    }
  }
  if (current.trim()) threadSections.push(current.trim());

  const limited = threadSections.slice(0, topN);
  return limited.join("\n\n");
}
