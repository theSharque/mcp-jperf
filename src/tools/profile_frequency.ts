import { z } from "zod";
import { existsSync } from "node:fs";
import { runJfr } from "../utils/jdk.js";

export const profileFrequencySchema = z.object({
  filepath: z.string(),
  topN: z.number().int().min(1).max(100).optional().default(10),
});

export type ProfileFrequencyInput = z.infer<typeof profileFrequencySchema>;

export async function profileFrequency(input: ProfileFrequencyInput): Promise<string> {
  const { filepath, topN } = input;

  if (!existsSync(filepath)) {
    return JSON.stringify({ error: `File not found: ${filepath}` });
  }

  const output = await runJfr(["print", "--json", "--events", "jdk.ExecutionSample", filepath]);

  const leafCount: Map<string, number> = new Map();

  try {
    const parsed = JSON.parse(output);
    const eventsList = Array.isArray(parsed) ? parsed : parsed.events ?? [];

    for (const ev of eventsList) {
      const frames = ev.stackTrace?.frames ?? [];
      const leaf = frames[0];
      if (leaf?.method) {
        const t = leaf.method.type ?? "";
        const n = leaf.method.name ?? "";
        const key = t ? `${t}.${n}` : n;
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
