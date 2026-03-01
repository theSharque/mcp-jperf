import { z } from "zod";
import { runJcmd } from "../utils/jdk.js";

export const vmInfoSchema = z.object({
  pid: z.number().int().positive(),
});

export type VmInfoInput = z.infer<typeof vmInfoSchema>;

export async function vmInfo(input: VmInfoInput): Promise<string> {
  const { pid } = input;

  const [uptimeOut, versionOut, flagsOut] = [
    runJcmd(pid, "VM.uptime"),
    runJcmd(pid, "VM.version"),
    runJcmd(pid, "VM.flags"),
  ];

  const result = {
    uptime: uptimeOut.trim(),
    version: versionOut.trim(),
    flags: flagsOut.trim(),
  };

  return JSON.stringify(result, null, 2);
}
