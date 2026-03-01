import { existsSync, mkdirSync } from "node:fs";
import { statSync } from "node:fs";
import { z } from "zod";
import { runJcmd } from "../utils/jdk.js";
import { NEW_PROFILE_PATH, RECORDINGS_DIR } from "../utils/paths.js";

export const stopProfilingSchema = z.object({
  pid: z.number().int().positive(),
  recordingId: z.string(),
});

export type StopProfilingInput = z.infer<typeof stopProfilingSchema>;

export async function stopProfiling(input: StopProfilingInput): Promise<string> {
  const { pid, recordingId } = input;

  if (!existsSync(RECORDINGS_DIR)) {
    mkdirSync(RECORDINGS_DIR, { recursive: true });
  }

  runJcmd(pid, "JFR.stop", [`name=${recordingId}`, `filename=${NEW_PROFILE_PATH}`]);

  if (!existsSync(NEW_PROFILE_PATH)) {
    return JSON.stringify({
      status: "error",
      message: "Recording stopped but file was not found. Check JFR output.",
    });
  }

  const stats = statSync(NEW_PROFILE_PATH);
  return JSON.stringify(
    {
      filepath: NEW_PROFILE_PATH,
      fileSize: stats.size,
      status: "saved",
      oldProfilePath: "recordings/old_profile.jfr (previous recording)",
      hint: "Use recordings/new_profile.jfr for current, recordings/old_profile.jfr for previous (before/after comparison)",
    },
    null,
    2
  );
}
