#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { listJavaProcesses } from "./tools/list_procs.js";
import { startProfiling, startProfilingSchema } from "./tools/start_profiling.js";
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
import { profileJfrNetwork } from "./tools/profile_jfr_network.js";
import { profileJfrFileIo } from "./tools/profile_jfr_file_io.js";
import { profileJfrLocks } from "./tools/profile_jfr_locks.js";
import { profileJfrNative } from "./tools/profile_jfr_native.js";
import { nativeMemorySummary } from "./tools/native_memory_summary.js";
import { gcClassStats } from "./tools/gc_class_stats.js";
import { gcFinalizerInfo } from "./tools/gc_finalizer_info.js";
import { compilerCodecache } from "./tools/compiler_codecache.js";
import { compilerQueue } from "./tools/compiler_queue.js";
import { VERSION } from "./version.js";

const server = new McpServer({
  name: "javaperf",
  version: VERSION,
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
    description:
      "Starts JFR on the target PID. Rotates recordings (old_profile.jfr ← new_profile.jfr). Default preset is profile. Optional preset or settingsFile (.jfc, cwd-relative or absolute)—mutually exclusive. Builtin presets may omit socket/I/O/native/locks; use a custom .jfc for jdk.SocketRead/Write, FileRead/Write, JavaMonitorBlocked, NativeMethodSample. Then list_jfr_recordings and stop_profiling.",
    inputSchema: startProfilingSchema,
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

server.registerTool(
  "profile_jfr_network",
  {
    description:
      "Summarize JDK socket I/O from a .jfr (jdk.SocketRead, jdk.SocketWrite): event counts, total bytes read/written where available, top endpoints (host:port / address), and cumulative stack hotspots. Recording must include those events (custom .jfc or preset that enables them). If emptyEvents, use start_profiling settingsFile.",
    inputSchema: z.object({
      filepath: z
        .string()
        .optional()
        .default("new_profile")
        .describe("Path to .jfr. Shortcuts: new_profile, old_profile, or absolute path."),
      topN: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(10)
        .describe("Top N endpoints and methods."),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await profileJfrNetwork(args) }],
  })
);

server.registerTool(
  "profile_jfr_file_io",
  {
    description:
      "Summarize file read/write events (jdk.FileRead, jdk.FileWrite): counts, bytes, top paths, stack hotspots. Events must exist in recording; configure via start_profiling preset or settingsFile (.jfc).",
    inputSchema: z.object({
      filepath: z
        .string()
        .optional()
        .default("new_profile")
        .describe("Path to .jfr. Shortcuts: new_profile, old_profile."),
      topN: z.number().int().min(1).max(100).optional().default(10).describe("Top N paths/methods."),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await profileJfrFileIo(args) }],
  })
);

server.registerTool(
  "profile_jfr_locks",
  {
    description:
      "Contention snapshot from jdk.JavaMonitorBlocked: weight by blocked duration vs count, tops by monitor class, stack hotspots. Enable event in recording via custom .jfc if missing.",
    inputSchema: z.object({
      filepath: z.string().optional().default("new_profile"),
      topN: z.number().int().min(1).max(100).optional().default(10),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await profileJfrLocks(args) }],
  })
);

server.registerTool(
  "profile_jfr_native",
  {
    description:
      "CPU-style cumulative hotspots from jdk.NativeMethodSample stacks. Recording must enable NativeMethodSample (often requires custom .jfc).",
    inputSchema: z.object({
      filepath: z.string().optional().default("new_profile"),
      topN: z.number().int().min(1).max(100).optional().default(10),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await profileJfrNative(args) }],
  })
);

server.registerTool(
  "native_memory_summary",
  {
    description:
      "jcmd VM.native_memory summary=true. Requires JVM started with -XX:NativeMemoryTracking=summary or detail; otherwise explains how to enable.",
    inputSchema: z.object({
      pid: z.number().int().positive(),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await nativeMemorySummary(args) }],
  })
);

server.registerTool(
  "gc_class_stats",
  {
    description:
      "jcmd GC.class_stats (class loader / metaspace style stats where supported—often JDK 21+). On older JDK returns error hint; use heap_info or heap_histogram instead.",
    inputSchema: z.object({
      pid: z.number().int().positive(),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await gcClassStats(args) }],
  })
);

server.registerTool(
  "gc_finalizer_info",
  {
    description: "jcmd GC.finalizer_info — finalizer queue diagnostics for the live process.",
    inputSchema: z.object({
      pid: z.number().int().positive(),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await gcFinalizerInfo(args) }],
  })
);

server.registerTool(
  "compiler_codecache",
  {
    description: "jcmd Compiler.codecache — code heap usage and related JVM output.",
    inputSchema: z.object({
      pid: z.number().int().positive(),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await compilerCodecache(args) }],
  })
);

server.registerTool(
  "compiler_queue",
  {
    description: "jcmd Compiler.queue — methods queued for JIT compilation.",
    inputSchema: z.object({
      pid: z.number().int().positive(),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await compilerQueue(args) }],
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
