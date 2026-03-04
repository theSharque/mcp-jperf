import { z } from "zod";
import { runJcmd } from "../utils/jdk.js";

export const listJfrRecordingsSchema = z.object({
  pid: z
    .number()
    .int()
    .positive()
    .describe("Process ID of the Java application. Get this from list_java_processes."),
});

export type ListJfrRecordingsInput = z.infer<typeof listJfrRecordingsSchema>;

interface RecordingEntry {
  id: string;
  name?: string;
  duration?: string;
  filename?: string;
  maxSize?: string;
  maxAge?: string;
  startTime?: string;
  state?: string;
}

function parseJfrCheckOutput(output: string): RecordingEntry[] {
  const result: RecordingEntry[] = [];
  const lines = output.trim().split("\n").filter(Boolean);

  for (const line of lines) {
    const recordingMatch = line.match(/Recording\s+(\d+)\s*:\s*(.+)/);
    if (!recordingMatch) continue;

    const id = recordingMatch[1];
    const rest = recordingMatch[2];
    const entry: RecordingEntry = { id };

    const nameMatch = rest.match(/name=(\S+)/);
    if (nameMatch) entry.name = nameMatch[1];

    const durationMatch = rest.match(/duration=(\S+)/);
    if (durationMatch) entry.duration = durationMatch[1];

    const filenameMatch = rest.match(/filename=(\S+)/);
    if (filenameMatch) entry.filename = filenameMatch[1];

    const maxSizeMatch = rest.match(/maxsize=(\S+)/);
    if (maxSizeMatch) entry.maxSize = maxSizeMatch[1];

    const maxAgeMatch = rest.match(/maxage=(\S+)/);
    if (maxAgeMatch) entry.maxAge = maxAgeMatch[1];

    const startTimeMatch = rest.match(/start time=([^(]+)/);
    if (startTimeMatch) entry.startTime = startTimeMatch[1].trim();

    if (rest.includes("(running)")) {
      entry.state = "running";
    } else if (rest.includes("(stopped)")) {
      entry.state = "stopped";
    }

    result.push(entry);
  }

  return result;
}

export async function listJfrRecordings(input: ListJfrRecordingsInput): Promise<string> {
  const { pid } = input;
  const output = runJcmd(pid, "JFR.check");

  const recordings = parseJfrCheckOutput(output);
  const summary =
    recordings.length === 0
      ? "No active or recent recordings."
      : `${recordings.length} recording(s). Use recordingId from 'id' when calling stop_profiling.`;

  return JSON.stringify(
    {
      summary,
      recordings,
      rawOutput: output.trim(),
    },
    null,
    2
  );
}
