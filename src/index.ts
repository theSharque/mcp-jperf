#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { listJavaProcesses } from "./tools/list_procs.js";
import { startProfiling } from "./tools/start_profiling.js";
import { stopProfiling } from "./tools/stop_profiling.js";
import { analyzeThreads } from "./tools/analyze_threads.js";
import { traceMethod } from "./tools/trace_method.js";
import { parseJfrSummary } from "./tools/parse_jfr.js";
import { profileMemory } from "./tools/profile_memory.js";
import { profileTime } from "./tools/profile_time.js";
import { profileFrequency } from "./tools/profile_frequency.js";
import { heapHistogram } from "./tools/heap_histogram.js";
import { heapDump } from "./tools/heap_dump.js";
import { heapInfo } from "./tools/heap_info.js";
import { vmInfo } from "./tools/vm_info.js";
import { listJfrRecordings } from "./tools/list_jfr_recordings.js";
import { checkDeadlock } from "./tools/check_deadlock.js";

const server = new McpServer({
  name: "javaperf",
  version: "1.2.0",
});

server.registerTool(
  "list_java_processes",
  {
    description: "Lists all running Java processes on the machine. Returns an array of objects with pid, mainClass, and args. Use this tool first to discover the target process PID before calling start_profiling or analyze_threads. Data is obtained via jps -l -m.",
    inputSchema: z.object({
      topN: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(10)
        .describe("Maximum number of processes to return in the list. Default: 10. Use higher values if many Java processes are running."),
    }),
  },
  async ({ topN }) => ({
    content: [{ type: "text", text: await listJavaProcesses({ topN }) }],
  })
);

server.registerTool(
  "start_profiling",
  {
    description: "Starts a Java Flight Recorder (JFR) recording on the specified Java process. Uses settings=profile for a full dump. Before starting, rotates files: deletes old_profile.jfr, renames new_profile.jfr → old_profile.jfr. Call list_jfr_recordings to see active recordings; call stop_profiling after duration to save to recordings/new_profile.jfr.",
    inputSchema: z.object({
      pid: z
        .number()
        .int()
        .positive()
        .describe("Process ID of the Java application to profile. Get this from list_java_processes."),
      duration: z
        .number()
        .int()
        .positive()
        .describe("Recording duration in seconds. Typical values: 10–60 for quick checks, 300+ for load testing."),
      memorysize: z
        .string()
        .optional()
        .describe("JFR buffer size, e.g. '20M'. Default is 10M. Increase for long or busy recordings."),
      stackdepth: z
        .number()
        .int()
        .min(32)
        .max(2048)
        .optional()
        .default(128)
        .describe("Stack trace depth for JFR events. Default 128. Increase if you see truncated stacks."),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await startProfiling(args) }],
  })
);

server.registerTool(
  "stop_profiling",
  {
    description: "Stops an active JFR recording and saves it to recordings/new_profile.jfr. Use recordings/new_profile.jfr for current data, recordings/old_profile.jfr for previous (before/after comparison).",
    inputSchema: z.object({
      pid: z
        .number()
        .int()
        .positive()
        .describe("Process ID of the Java process that has the active recording. Must match the pid used in start_profiling."),
      recordingId: z
        .string()
        .describe("ID of the recording to stop. This is the recordingId returned by start_profiling (e.g. '1' or '2')."),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await stopProfiling(args) }],
  })
);

server.registerTool(
  "check_deadlock",
  {
    description: "Checks for Java-level deadlocks in the specified process. Parses jcmd Thread.print output and returns structured JSON: which threads are involved, what locks they hold/wait for, and the deadlock cycle. Use for automated analysis and reports.",
    inputSchema: z.object({
      pid: z
        .number()
        .int()
        .positive()
        .describe("Process ID of the Java application. Get this from list_java_processes."),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await checkDeadlock(args) }],
  })
);

server.registerTool(
  "list_jfr_recordings",
  {
    description: "Lists active and recent JFR recordings for a Java process (jcmd JFR.check). Returns recording id, duration, state (running/stopped), and filename. Use before stop_profiling to get the correct recordingId.",
    inputSchema: z.object({
      pid: z
        .number()
        .int()
        .positive()
        .describe("Process ID of the Java application. Get this from list_java_processes."),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await listJfrRecordings(args) }],
  })
);

server.registerTool(
  "analyze_threads",
  {
    description: "Produces a thread dump of the specified Java process (equivalent to jstack -l). Shows each thread's name, state, and full stack trace with lock information. Use for diagnosing deadlocks, blocked threads, or high thread counts.",
    inputSchema: z.object({
      pid: z
        .number()
        .int()
        .positive()
        .describe("Process ID of the Java application. Get this from list_java_processes."),
      topN: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .default(10)
        .describe("Maximum number of threads to include in the output. Default: 10. Increase for applications with many threads."),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await analyzeThreads(args) }],
  })
);

server.registerTool(
  "heap_histogram",
  {
    description: "Class histogram of live objects in the heap (jcmd GC.class_histogram). Returns top classes by memory usage — useful for memory leak investigation. Classes with unusually high instance count or bytes may indicate a leak.",
    inputSchema: z.object({
      pid: z
        .number()
        .int()
        .positive()
        .describe("Process ID of the Java application. Get this from list_java_processes."),
      topN: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .default(20)
        .describe("Maximum number of top classes to return. Default: 20."),
      all: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include unreachable objects. Triggers full GC and may cause application pause."),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await heapHistogram(args) }],
  })
);

server.registerTool(
  "heap_dump",
  {
    description: "Creates a heap dump (.hprof file) for offline analysis in Eclipse MAT, VisualVM, or JProfiler. Saved to recordings/heap_dump.hprof (overwritten each call). Warning: file can be large (hundreds of MB to GB).",
    inputSchema: z.object({
      pid: z
        .number()
        .int()
        .positive()
        .describe("Process ID of the Java application. Get this from list_java_processes."),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await heapDump(args) }],
  })
);

server.registerTool(
  "heap_info",
  {
    description: "Brief heap usage summary: capacities, used, committed regions. Quick snapshot without full dump.",
    inputSchema: z.object({
      pid: z
        .number()
        .int()
        .positive()
        .describe("Process ID of the Java application. Get this from list_java_processes."),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await heapInfo(args) }],
  })
);

server.registerTool(
  "vm_info",
  {
    description: "JVM information: uptime, version, and flags. Useful for environment verification.",
    inputSchema: z.object({
      pid: z
        .number()
        .int()
        .positive()
        .describe("Process ID of the Java application. Get this from list_java_processes."),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await vmInfo(args) }],
  })
);

server.registerTool(
  "trace_method",
  {
    description: "Builds a call tree for a specific method from a .jfr file. Filters ExecutionSample events to find stack traces containing the given class and method, then aggregates call paths. Use when you want to see who calls a particular method and from where. Limitation: JFR sampling (~10 ms) may miss very fast methods.",
    inputSchema: z.object({
      filepath: z
        .string()
        .optional()
        .default("new_profile")
        .describe("Path to .jfr file. Shortcuts: 'new_profile' (current, default) or 'old_profile' (previous). Or full path e.g. recordings/new_profile.jfr."),
      className: z
        .string()
        .describe("Fully qualified class name (e.g. com.example.MyService) or a substring to match. Used to filter stack frames."),
      methodName: z
        .string()
        .describe("Method name to search for (e.g. processRequest). Matches the method in the stack trace."),
      events: z
        .array(z.string())
        .optional()
        .describe("Optional list of JFR event types to parse. Default: jdk.ExecutionSample. Advanced users can specify other event types."),
      topN: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(10)
        .describe("Maximum number of call paths (branches) to return in the call tree. Default: 10."),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await traceMethod(args) }],
  })
);

server.registerTool(
  "parse_jfr_summary",
  {
    description: "Parses a .jfr file and returns a structured summary: top methods by CPU samples, GC statistics, thread allocation stats, and anomaly hints (e.g. high GC count). Use for a quick high-level overview of the recording before diving into specific profiles.",
    inputSchema: z.object({
      filepath: z
        .string()
        .optional()
        .default("new_profile")
        .describe("Path to .jfr file. Shortcuts: 'new_profile' (current, default) or 'old_profile' (previous). Or full path e.g. recordings/new_profile.jfr."),
      events: z
        .array(z.string())
        .optional()
        .describe("Optional list of JFR event types to include. Default: jdk.ExecutionSample, jdk.GarbageCollection, jdk.JavaThreadStatistics, jdk.ThreadAllocationStatistics."),
      topN: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(10)
        .describe("Maximum number of top methods to include in the summary. Default: 10."),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await parseJfrSummary(args) }],
  })
);

server.registerTool(
  "profile_memory",
  {
    description: "Memory-focused profile from a .jfr file. Returns top memory allocators (class+method), GC statistics, and potential leak candidates from OldObjectSample events. Use when the goal is to find who allocates the most memory or identify memory leaks. Requires a recording made with settings=profile (which start_profiling uses by default).",
    inputSchema: z.object({
      filepath: z
        .string()
        .optional()
        .default("new_profile")
        .describe("Path to .jfr file. Shortcuts: 'new_profile' (current, default) or 'old_profile' (previous). Or full path e.g. recordings/new_profile.jfr."),
      topN: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(10)
        .describe("Maximum number of top allocators to return. Default: 10."),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await profileMemory(args) }],
  })
);

server.registerTool(
  "profile_time",
  {
    description: "CPU time (bottleneck) profile from a .jfr file. Uses bottom-up aggregation: each method is counted in every sample where it appears in the stack, including time spent in callees. Returns methods consuming the most CPU time. Use when the goal is to find performance bottlenecks and slow code paths.",
    inputSchema: z.object({
      filepath: z
        .string()
        .optional()
        .default("new_profile")
        .describe("Path to .jfr file. Shortcuts: 'new_profile' (current, default) or 'old_profile' (previous). Or full path e.g. recordings/new_profile.jfr."),
      topN: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(10)
        .describe("Maximum number of top methods by CPU time to return. Default: 10."),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await profileTime(args) }],
  })
);

server.registerTool(
  "profile_frequency",
  {
    description: "Call frequency profile from a .jfr file. Counts methods that appear at the leaf (top) of the stack in ExecutionSample events — i.e. methods that were actively executing when sampled. Returns the most frequently sampled methods (exclusive, not cumulative). Use when looking for hot spots or the most often executed code paths.",
    inputSchema: z.object({
      filepath: z
        .string()
        .optional()
        .default("new_profile")
        .describe("Path to .jfr file. Shortcuts: 'new_profile' (current, default) or 'old_profile' (previous). Or full path e.g. recordings/new_profile.jfr."),
      topN: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(10)
        .describe("Maximum number of top methods by call frequency to return. Default: 10."),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await profileFrequency(args) }],
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
