import { existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { runJcmd } from "../utils/jdk.js";
import {
  NEW_PROFILE_PATH,
  OLD_PROFILE_PATH,
  RECORDINGS_DIR,
} from "../utils/paths.js";

export const startProfilingSchema = z
  .object({
    pid: z
      .number()
      .int()
      .positive()
      .describe("Process ID of the Java application. Use list_java_processes."),
    duration: z
      .number()
      .int()
      .positive()
      .describe("Recording duration in seconds. Typical: 10–60 quick, 300+ under load."),
    memorysize: z
      .string()
      .optional()
      .describe("JFR buffer size, e.g. 20M. Default JVM buffer applies if omitted."),
    stackdepth: z
      .number()
      .int()
      .min(32)
      .max(2048)
      .optional()
      .default(128)
      .describe("Stack depth for JFR events. Default 128."),
    preset: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Builtin settings name (e.g. profile, default). Effective default when omitted is profile. Mutually exclusive with settingsFile."
      ),
    settingsFile: z
      .string()
      .optional()
      .describe("Path to .jfc file (cwd-relative or absolute). Mutually exclusive with preset."),
  })
  .superRefine((data, ctx) => {
    const file = data.settingsFile?.trim();
    if (data.preset !== undefined && file) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use either preset or settingsFile, not both.",
      });
    }
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
  const { pid, duration, memorysize, stackdepth } = input;

  rotateProfiles();

  let settingsOpts: string;
  const trimmedFile = input.settingsFile?.trim();
  if (trimmedFile) {
    const resolved = resolve(process.cwd(), trimmedFile);
    if (!existsSync(resolved)) {
      throw new Error(`settingsFile not found: ${resolved}`);
    }
    settingsOpts = `settings=${resolved}`;
  } else {
    const preset = input.preset ?? "profile";
    settingsOpts = `settings=${preset}`;
  }

  const opts: string[] = [`duration=${duration}s`, settingsOpts, `stackdepth=${stackdepth}`];
  if (memorysize) opts.push(`memorysize=${memorysize}`);
  const output = runJcmd(pid, "JFR.start", opts);

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
