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

  const deadlockMatch = output.match(/Found (\d+) Java-level deadlock(s)?/);
  const deadlockCount = deadlockMatch ? parseInt(deadlockMatch[1], 10) : 0;
  const blockedCount = (output.match(/\bBLOCKED\b/g) ?? []).length;
  const waitingCount = (output.match(/\bWAITING\b/g) ?? []).length;
  const summaryLines: string[] = [];
  if (deadlockCount > 0) {
    summaryLines.push(
      `⚠ Deadlock detected: ${deadlockCount} Java-level deadlock${deadlockCount === 1 ? "" : "s"}.`
    );
  }
  summaryLines.push(`Threads: ${blockedCount} BLOCKED, ${waitingCount} WAITING (of shown).`);
  const summary = "=== " + summaryLines.join(" ") + " ===\n";

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
  return summary + limited.join("\n\n");
}
