import { z } from "zod";
import { runJcmd } from "../utils/jdk.js";

export const checkDeadlockSchema = z.object({
  pid: z
    .number()
    .int()
    .positive()
    .describe("Process ID of the Java application. Get this from list_java_processes."),
});

export type CheckDeadlockInput = z.infer<typeof checkDeadlockSchema>;

interface DeadlockThread {
  threadName: string;
  waitingForLock?: { monitor: string; objectType: string };
  heldBy: string;
}

interface DeadlockCycle {
  threads: DeadlockThread[];
  cycle: string[];
}

function parseDeadlocks(output: string): { count: number; cycles: DeadlockCycle[] } {
  const countMatch = output.match(/Found (\d+) Java-level deadlock(s)?/);
  const totalCount = countMatch ? parseInt(countMatch[1], 10) : 0;

  const cycles: DeadlockCycle[] = [];
  const blocks = output.split(/Found one Java-level deadlock:\s*\n/).slice(1);

  for (const rawBlock of blocks) {
    const block = rawBlock.split(/Java stack information|Found one Java-level deadlock:|Found \d+ deadlock/)[0];
    const threads: DeadlockThread[] = [];

    const threadSectionRegex =
      /"([^"]+)"\s*:\s*\n\s*(?:waiting to lock monitor (0x[a-fA-F0-9]+) \((?:object 0x[a-fA-F0-9]+, a ([^)]+)|([^)]+))\)[^,\n]*(?:,\s*\n)?\s*)?(?:in JNI, )?which is held by "([^"]+)"/g;
    let m;
    while ((m = threadSectionRegex.exec(block)) !== null) {
      const threadName = m[1];
      const monitor = m[2];
      const objectType = m[3];
      const rawMonitorType = m[4];
      const heldBy = m[5];
      if (!threadName || !heldBy) continue;
      const lockType = objectType ?? rawMonitorType;
      threads.push({
        threadName,
        ...(monitor && lockType && { waitingForLock: { monitor, objectType: lockType } }),
        heldBy: heldBy as string,
      });
    }

    if (threads.length > 0) {
      const cycle = buildCycle(threads);
      cycles.push({ threads, cycle });
    }
  }

  return { count: totalCount, cycles };
}

function buildCycle(threads: DeadlockThread[]): string[] {
  const cycle: string[] = [];
  const byName = new Map(threads.map((t) => [t.threadName, t]));
  let current: string | undefined = threads[0]?.threadName;
  const visited = new Set<string>();

  while (current) {
    if (visited.has(current)) break;
    const name = current as string;
    cycle.push(name);
    visited.add(name);
    const t = byName.get(name);
    current = t?.heldBy;
  }
  return cycle;
}

export async function checkDeadlock(input: CheckDeadlockInput): Promise<string> {
  const { pid } = input;
  const output = runJcmd(pid, "Thread.print -l");

  const { count, cycles } = parseDeadlocks(output);

  const result = {
    deadlockCount: count,
    hasDeadlock: count > 0,
    deadlocks: cycles,
    summary:
      count === 0
        ? "No Java-level deadlocks detected."
        : `Found ${count} Java-level deadlock${count === 1 ? "" : "s"}. See deadlocks array for details.`,
  };

  return JSON.stringify(result, null, 2);
}
