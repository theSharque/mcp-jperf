import { z } from "zod";
import { existsSync } from "node:fs";
import { streamJfrJsonEvents } from "../utils/jdk.js";
import { resolveProfilePath } from "../utils/paths.js";
import { getStackTrace, getMethodKey } from "../utils/jfr-json.js";
import { formatError } from "../utils/errors.js";

export const profileFrequencySchema = z.object({
  filepath: z.string(),
  topN: z.number().int().min(1).max(100).optional().default(10),
});

export type ProfileFrequencyInput = z.infer<typeof profileFrequencySchema>;

export async function profileFrequency(input: ProfileFrequencyInput, context?: unknown): Promise<string> {
  const { topN } = input;
  const filepath = resolveProfilePath(input.filepath);

  if (!existsSync(filepath)) {
    return formatError(`File not found: ${filepath}`, "FILE_NOT_FOUND", "Create a recording with start_profiling and stop_profiling.");
  }

  const leafCount: Map<string, number> = new Map();
  const mcpReq = (context as { mcpReq?: { _meta?: { progressToken?: string | number }; notify?: (notification: { method: "notifications/progress"; params: { progressToken: string | number; progress: number; message?: string } }) => Promise<void> } } | undefined)?.mcpReq;

  try {
    await streamJfrJsonEvents(
      ["print", "--json", "--events", "jdk.ExecutionSample", filepath],
      (ev) => {
        const frames = getStackTrace(ev)?.frames ?? [];
        const leaf = frames[0];
        if (!leaf) return;
        const key = getMethodKey(leaf);
        if (key) leafCount.set(key, (leafCount.get(key) ?? 0) + 1);
      },
      (processed) => {
        const progressToken = mcpReq?._meta?.progressToken;
        if (progressToken === undefined || mcpReq?.notify === undefined) return;
        void mcpReq.notify({
          method: "notifications/progress",
          params: { progressToken, progress: Math.max(processed, 1), message: `Parsed ${processed} execution samples` },
        });
      }
    );
  } catch {
    return formatError("Failed to parse JFR ExecutionSample output.", "PARSE_ERROR", "Ensure the .jfr file is valid and was created with settings=profile.");
  }

  const top = [...leafCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([method, samples]) => ({ method, samples, note: "exclusive (leaf frame)" }));

  return JSON.stringify({ profile: "frequency", topMethods: top }, null, 2);
}
