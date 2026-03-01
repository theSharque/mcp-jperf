import { z } from "zod";
import { existsSync } from "node:fs";
import { runJfr } from "../utils/jdk.js";
import { resolveProfilePath } from "../utils/paths.js";
import { getEvents, getStackTrace, getMethodKey } from "../utils/jfr-json.js";

export const profileTimeSchema = z.object({
  filepath: z.string(),
  topN: z.number().int().min(1).max(100).optional().default(10),
});

export type ProfileTimeInput = z.infer<typeof profileTimeSchema>;

export async function profileTime(input: ProfileTimeInput): Promise<string> {
  const { topN } = input;
  const filepath = resolveProfilePath(input.filepath);

  if (!existsSync(filepath)) {
    return JSON.stringify({ error: `File not found: ${filepath}` });
  }

  const output = await runJfr(["print", "--json", "--events", "jdk.ExecutionSample", filepath]);

  const methodSamples: Map<string, number> = new Map();

  try {
    const parsed = JSON.parse(output);
    const eventsList = getEvents(parsed);

    for (const ev of eventsList) {
      const frames = getStackTrace(ev)?.frames ?? [];
      for (const f of frames) {
        const key = getMethodKey(f);
        if (key) methodSamples.set(key, (methodSamples.get(key) ?? 0) + 1);
      }
    }
  } catch {
    return JSON.stringify({ error: "Failed to parse JFR ExecutionSample output." });
  }

  const top = [...methodSamples.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([method, samples]) => ({ method, samples, note: "cumulative CPU time (incl. callees)" }));

  return JSON.stringify({ profile: "time", topMethods: top }, null, 2);
}
