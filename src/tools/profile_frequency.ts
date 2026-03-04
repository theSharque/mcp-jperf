import { z } from "zod";
import { existsSync } from "node:fs";
import { runJfr } from "../utils/jdk.js";
import { resolveProfilePath } from "../utils/paths.js";
import { getEvents, getStackTrace, getMethodKey } from "../utils/jfr-json.js";
import { formatError } from "../utils/errors.js";

export const profileFrequencySchema = z.object({
  filepath: z.string(),
  topN: z.number().int().min(1).max(100).optional().default(10),
});

export type ProfileFrequencyInput = z.infer<typeof profileFrequencySchema>;

export async function profileFrequency(input: ProfileFrequencyInput): Promise<string> {
  const { topN } = input;
  const filepath = resolveProfilePath(input.filepath);

  if (!existsSync(filepath)) {
    return formatError(`File not found: ${filepath}`, "FILE_NOT_FOUND", "Create a recording with start_profiling and stop_profiling.");
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
    return formatError("Failed to parse JFR ExecutionSample output.", "PARSE_ERROR", "Ensure the .jfr file is valid and was created with settings=profile.");
  }

  const top = [...leafCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([method, samples]) => ({ method, samples, note: "exclusive (leaf frame)" }));

  return JSON.stringify({ profile: "frequency", topMethods: top }, null, 2);
}
