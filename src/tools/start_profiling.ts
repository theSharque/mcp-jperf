import { z } from "zod";
import { runJcmd } from "../utils/jdk.js";

export const startProfilingSchema = z.object({
  pid: z.number().int().positive(),
  duration: z.number().int().positive(),
  recordingName: z.string().optional(),
});

export type StartProfilingInput = z.infer<typeof startProfilingSchema>;

export async function startProfiling(input: StartProfilingInput): Promise<string> {
  const { pid, duration, recordingName } = input;
  const namePart = recordingName ? ` name=${recordingName}` : "";
  const cmd = `JFR.start duration=${duration}s${namePart} settings=profile`;
  const output = runJcmd(pid, cmd);

  const match = output.match(/Started recording (\d+)\./);
  const recordingId = match ? match[1] : "1";

  return JSON.stringify({
    recordingId,
    status: "started",
    message: output.trim(),
    expiryTime: `in ${duration} seconds`,
  }, null, 2);
}
