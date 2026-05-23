import { z } from "zod";
import { runJcmd } from "../utils/jdk.js";

export const analyzeThreadsSchema = z.object({
  pid: z.number().int().positive(),
  topN: z.number().int().min(1).max(500).optional().default(10),
  structured: z.boolean().optional().default(false),
});

export type AnalyzeThreadsInput = z.infer<typeof analyzeThreadsSchema>;

interface LockWaitChain {
  thread: string;
  state: string;
  waitingOn?: { monitor: string; type: string };
  lockHolderThread?: string;
  stackTop?: string;
}

function parseThreadSections(output: string): string[] {
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
  return threadSections;
}

function parseThreadHeader(section: string): { thread: string; state: string } | undefined {
  const headerMatch = section.match(/^"([^"]+)"\s+#\d+\s+(\w+)/);
  if (!headerMatch) return undefined;
  return { thread: headerMatch[1], state: headerMatch[2] };
}

function parseLockWaitChain(section: string): LockWaitChain | undefined {
  const header = parseThreadHeader(section);
  if (!header) return undefined;
  if (header.state !== "BLOCKED" && header.state !== "WAITING" && header.state !== "TIMED_WAITING") {
    return undefined;
  }

  const waitingMatch = section.match(
    /waiting to lock (?:monitor )?(0x[a-fA-F0-9]+) \((?:object 0x[a-fA-F0-9]+, a )?([^)]+)\)/
  );
  const parkingMatch = section.match(/parking to wait for\s+(0x[a-fA-F0-9]+)\s+\(([^)]+)\)/);
  const holderMatch = section.match(/which is held by "([^"]+)"/);
  const ownedMatch = section.match(/locked (?:monitor )?(0x[a-fA-F0-9]+) \((?:object 0x[a-fA-F0-9]+, a )?([^)]+)\)/);

  const stackLines = section.split("\n").filter((l) => l.trimStart().startsWith("at "));
  const stackTop = stackLines[0]?.trim().replace(/^at\s+/, "");

  const monitor = waitingMatch?.[1] ?? parkingMatch?.[1] ?? ownedMatch?.[1];
  const type = waitingMatch?.[2] ?? parkingMatch?.[2] ?? ownedMatch?.[2];

  if (!monitor && !type && !holderMatch) return undefined;

  return {
    thread: header.thread,
    state: header.state,
    ...(monitor && type && { waitingOn: { monitor, type } }),
    ...(holderMatch && { lockHolderThread: holderMatch[1] }),
    ...(stackTop && { stackTop }),
  };
}

export async function analyzeThreads(input: AnalyzeThreadsInput): Promise<string> {
  const { pid, topN, structured } = input;
  const output = runJcmd(pid, "Thread.print -l");

  const deadlockMatch = output.match(/Found (\d+) Java-level deadlock(s)?/);
  const deadlockCount = deadlockMatch ? parseInt(deadlockMatch[1], 10) : 0;
  const blockedCount = (output.match(/\bBLOCKED\b/g) ?? []).length;
  const waitingCount = (output.match(/\bWAITING\b/g) ?? []).length;

  const threadSections = parseThreadSections(output);

  if (structured) {
    const lockWaitChains = threadSections
      .map(parseLockWaitChain)
      .filter((c): c is LockWaitChain => c !== undefined)
      .slice(0, topN);

    return JSON.stringify(
      {
        summary: {
          deadlockCount,
          hasDeadlock: deadlockCount > 0,
          blockedCount,
          waitingCount,
          totalThreadsParsed: threadSections.length,
        },
        lockWaitChains,
        nextSteps: [
          "Deadlock cycle details: check_deadlock.",
          "Historical contention over time: profile_jfr_locks on a JFR recording.",
        ],
      },
      null,
      2
    );
  }

  const summaryLines: string[] = [];
  if (deadlockCount > 0) {
    summaryLines.push(
      `⚠ Deadlock detected: ${deadlockCount} Java-level deadlock${deadlockCount === 1 ? "" : "s"}.`
    );
  }
  summaryLines.push(`Threads: ${blockedCount} BLOCKED, ${waitingCount} WAITING (of shown).`);
  const summary = "=== " + summaryLines.join(" ") + " ===\n";

  const limited = threadSections.slice(0, topN);
  return summary + limited.join("\n\n");
}
