import { existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { runJcmd } from "../utils/jdk.js";
import { RECORDINGS_DIR } from "../utils/paths.js";
import { formatError } from "../utils/errors.js";

export const heapDumpSchema = z.object({
  pid: z.number().int().positive(),
});

export type HeapDumpInput = z.infer<typeof heapDumpSchema>;

const HEAP_DUMP_PATH = join(RECORDINGS_DIR, "heap_dump.hprof");

export async function heapDump(input: HeapDumpInput): Promise<string> {
  const { pid } = input;

  if (!existsSync(RECORDINGS_DIR)) {
    mkdirSync(RECORDINGS_DIR, { recursive: true });
  }

  runJcmd(pid, "GC.heap_dump", [HEAP_DUMP_PATH]);

  if (!existsSync(HEAP_DUMP_PATH)) {
    return formatError(
      "Heap dump command completed but file was not found.",
      "HEAP_DUMP_FAILED",
      "Check disk space and write permissions for recordings/."
    );
  }

  const stats = statSync(HEAP_DUMP_PATH);
  return JSON.stringify(
    {
      filepath: HEAP_DUMP_PATH,
      fileSize: stats.size,
      status: "saved",
      hint: "Open in Eclipse MAT, VisualVM, or JProfiler for analysis. File can be large (hundreds of MB - GB).",
    },
    null,
    2
  );
}
