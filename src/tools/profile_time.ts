import { z } from "zod";
import { existsSync } from "node:fs";
import { runJfr } from "../utils/jdk.js";
import { resolveProfilePath } from "../utils/paths.js";
import { getEvents, getStackTrace, getMethodKey } from "../utils/jfr-json.js";
import { formatError } from "../utils/errors.js";

export const profileTimeSchema = z.object({
  filepath: z.string(),
  topN: z.number().int().min(1).max(100).optional().default(10),
});

export type ProfileTimeInput = z.infer<typeof profileTimeSchema>;

export async function profileTime(input: ProfileTimeInput): Promise<string> {
  const { topN } = input;
  const filepath = resolveProfilePath(input.filepath);

  if (!existsSync(filepath)) {
    return formatError(`File not found: ${filepath}`, "FILE_NOT_FOUND", "Create a recording with start_profiling and stop_profiling.");
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
    return formatError("Failed to parse JFR ExecutionSample output.", "PARSE_ERROR", "Ensure the .jfr file is valid and was created with settings=profile.");
  }

  const top = [...methodSamples.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([method, samples]) => ({ method, samples, note: "cumulative CPU time (incl. callees)" }));

  return JSON.stringify({ profile: "time", topMethods: top }, null, 2);
}
