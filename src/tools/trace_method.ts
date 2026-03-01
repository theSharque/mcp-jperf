import { z } from "zod";
import { existsSync } from "node:fs";
import { runJfr } from "../utils/jdk.js";
import { resolveProfilePath } from "../utils/paths.js";
import { getEvents, getStackTrace, getMethodKey } from "../utils/jfr-json.js";

export const traceMethodSchema = z.object({
  filepath: z.string(),
  className: z.string(),
  methodName: z.string(),
  events: z.array(z.string()).optional(),
  topN: z.number().int().min(1).max(100).optional().default(10),
});

export type TraceMethodInput = z.infer<typeof traceMethodSchema>;

export async function traceMethod(input: TraceMethodInput): Promise<string> {
  const { className, methodName, topN } = input;
  const filepath = resolveProfilePath(input.filepath);

  if (!existsSync(filepath)) {
    return JSON.stringify({ error: `File not found: ${filepath}` });
  }

  const events = input.events ?? ["jdk.ExecutionSample"];
  const eventsArg = events.join(",");

  const output = await runJfr(["print", "--json", "--events", eventsArg, filepath]);

  let eventsList: unknown[];
  try {
    const parsed = JSON.parse(output);
    eventsList = getEvents(parsed);
  } catch {
    return JSON.stringify({ error: "Failed to parse JFR JSON output" });
  }

  const targetMethod = `${className}.${methodName}`;
  const matchingPaths: Map<string, number> = new Map();
  const classNorm = className.replace(/\//g, ".");

  for (const ev of eventsList) {
    const frames = getStackTrace(ev)?.frames ?? [];
    const pathParts: string[] = [];
    let found = false;

    for (const f of frames) {
      const fullMethod = getMethodKey(f);
      if (fullMethod) pathParts.push(fullMethod);

      if (fullMethod.includes(classNorm) && fullMethod.includes(methodName)) {
        found = true;
      }
    }

    if (found && pathParts.length > 0) {
      const path = pathParts.join(" <- ");
      matchingPaths.set(path, (matchingPaths.get(path) ?? 0) + 1);
    }
  }

  if (matchingPaths.size === 0) {
    return `Method ${targetMethod} not found in ExecutionSample. Try a longer recording or ensure the method is invoked during profiling.`;
  }

  const sorted = [...matchingPaths.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);

  const lines = sorted.map(([path, count], i) => `${i + 1}. [${count}x] ${path}`);
  return "Call tree (top paths where method appears):\n\n" + lines.join("\n");
}
