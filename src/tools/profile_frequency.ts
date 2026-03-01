import { z } from "zod";
import { existsSync } from "node:fs";
import { runJfr } from "../utils/jdk.js";
import { resolveProfilePath } from "../utils/paths.js";
import { getEvents, getStackTrace, getMethodKey } from "../utils/jfr-json.js";

export const profileFrequencySchema = z.object({
  filepath: z.string(),
  topN: z.number().int().min(1).max(100).optional().default(10),
});

export type ProfileFrequencyInput = z.infer<typeof profileFrequencySchema>;

export async function profileFrequency(input: ProfileFrequencyInput): Promise<string> {
  const { topN } = input;
  const filepath = resolveProfilePath(input.filepath);

  if (!existsSync(filepath)) {
    return JSON.stringify({ error: `File not found: ${filepath}` });
  }

  const output = await runJfr(["print", "--json", "--events", "jdk.ExecutionSample", filepath]);

  const leafCount: Map<string, number> = new Map();

  try {
    const parsed = JSON.parse(output);
    const eventsList = getEvents(parsed);

    for (const ev of eventsList) {
      const frames = getStackTrace(ev)?.frames ?? [];
      const leaf = frames[0];
      if (leaf) {
        const key = getMethodKey(leaf);
        if (key) leafCount.set(key, (leafCount.get(key) ?? 0) + 1);
      }
    }
  } catch {
    return JSON.stringify({ error: "Failed to parse JFR ExecutionSample output." });
  }

  const top = [...leafCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([method, samples]) => ({ method, samples, note: "exclusive (leaf frame)" }));

  return JSON.stringify({ profile: "frequency", topMethods: top }, null, 2);
}
