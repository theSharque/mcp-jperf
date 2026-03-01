import { existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { z } from "zod";
import { runJcmd } from "../utils/jdk.js";
import {
  NEW_PROFILE_PATH,
  OLD_PROFILE_PATH,
  RECORDINGS_DIR,
} from "../utils/paths.js";

export const startProfilingSchema = z.object({
  pid: z.number().int().positive(),
  duration: z.number().int().positive(),
});

export type StartProfilingInput = z.infer<typeof startProfilingSchema>;

function rotateProfiles(): void {
  if (!existsSync(RECORDINGS_DIR)) {
    mkdirSync(RECORDINGS_DIR, { recursive: true });
    return;
  }

  if (existsSync(OLD_PROFILE_PATH)) {
    unlinkSync(OLD_PROFILE_PATH);
  }
  if (existsSync(NEW_PROFILE_PATH)) {
    renameSync(NEW_PROFILE_PATH, OLD_PROFILE_PATH);
  }
}

export async function startProfiling(input: StartProfilingInput): Promise<string> {
  const { pid, duration } = input;

  rotateProfiles();

  const cmd = `JFR.start duration=${duration}s settings=profile`;
  const output = runJcmd(pid, cmd);

  const match = output.match(/Started recording (\d+)\./);
  const recordingId = match ? match[1] : "1";

  return JSON.stringify(
    {
      recordingId,
      status: "started",
      message: output.trim(),
      expiryTime: `in ${duration} seconds`,
      newProfilePath: NEW_PROFILE_PATH,
      oldProfilePath: OLD_PROFILE_PATH,
    },
    null,
    2
  );
}
