import { z } from "zod";
import { existsSync, mkdirSync } from "node:fs";
import { statSync } from "node:fs";
import { join } from "node:path";
import { runJcmd } from "../utils/jdk.js";

export const stopProfilingSchema = z.object({
  pid: z.number().int().positive(),
  recordingId: z.string(),
});

export type StopProfilingInput = z.infer<typeof stopProfilingSchema>;

export async function stopProfiling(input: StopProfilingInput): Promise<string> {
  const { pid, recordingId } = input;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(process.cwd(), "recordings");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const filepath = join(dir, `${pid}_${timestamp}.jfr`);

  runJcmd(pid, `JFR.stop`, [`name=${recordingId}`, `filename=${filepath}`]);

  if (!existsSync(filepath)) {
    return JSON.stringify({
      status: "error",
      message: "Recording stopped but file was not found. Check JFR output.",
    }, null, 2);
  }

  const stats = statSync(filepath);
  return JSON.stringify({
    filepath,
    fileSize: stats.size,
    status: "saved",
  }, null, 2);
}
