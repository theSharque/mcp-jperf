import { z } from "zod";
import { existsSync } from "node:fs";
import { runJfr } from "../utils/jdk.js";

export const traceMethodSchema = z.object({
  filepath: z.string(),
  className: z.string(),
  methodName: z.string(),
  events: z.array(z.string()).optional(),
  topN: z.number().int().min(1).max(100).optional().default(10),
});

export type TraceMethodInput = z.infer<typeof traceMethodSchema>;

interface JfrEvent {
  type?: string;
  stackTrace?: { frames?: Array<{ type?: string; method?: { type?: string; name?: string }; lineNumber?: number }> };
}

export async function traceMethod(input: TraceMethodInput): Promise<string> {
  const { filepath, className, methodName, topN } = input;

  if (!existsSync(filepath)) {
    return JSON.stringify({ error: `File not found: ${filepath}` });
  }

  const events = input.events ?? ["jdk.ExecutionSample"];
  const eventsArg = events.join(",");

  const output = await runJfr(["print", "--json", "--events", eventsArg, filepath]);

  let eventsList: JfrEvent[];
  try {
    const parsed = JSON.parse(output);
    eventsList = Array.isArray(parsed) ? parsed : parsed.events ?? [];
  } catch {
    return JSON.stringify({ error: "Failed to parse JFR JSON output" });
  }

  const targetMethod = `${className}.${methodName}`;
  const matchingPaths: Map<string, number> = new Map();

  for (const ev of eventsList) {
    const frames = ev.stackTrace?.frames ?? [];
    const pathParts: string[] = [];
    let found = false;

    for (const f of frames) {
      const mName = f.method?.name ?? "";
      const typeName = f.method?.type ?? f.type ?? "";
      const fullMethod = typeName ? `${typeName}.${mName}` : mName;
      pathParts.push(fullMethod);

      if (fullMethod.includes(className) && fullMethod.includes(methodName)) {
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
