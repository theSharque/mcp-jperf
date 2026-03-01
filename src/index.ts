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

const server = new McpServer({
  name: "jperf",
  version: "1.0.0",
});

server.registerTool(
  "list_java_processes",
  {
    description: "List running Java processes on the machine. Returns pid, mainClass, and args. Use before start_profiling to get target PID.",
    inputSchema: z.object({
      topN: z.number().int().min(1).max(100).optional().default(10),
    }),
  },
  async ({ topN }) => ({
    content: [{ type: "text", text: await listJavaProcesses({ topN }) }],
  })
);

server.registerTool(
  "start_profiling",
  {
    description: "Start JFR recording on a Java process. Uses settings=profile for full dump (memory, CPU, allocations). Call stop_profiling after duration to save .jfr file.",
    inputSchema: z.object({
      pid: z.number().int().positive(),
      duration: z.number().int().positive(),
      recordingName: z.string().optional(),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await startProfiling(args) }],
  })
);

server.registerTool(
  "stop_profiling",
  {
    description: "Stop JFR recording and save to file. Requires recordingId from start_profiling. Returns filepath to .jfr for use with parse_jfr_summary, trace_method, profile_*.",
    inputSchema: z.object({
      pid: z.number().int().positive(),
      recordingId: z.string(),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await stopProfiling(args) }],
  })
);

server.registerTool(
  "analyze_threads",
  {
    description: "Thread dump of a Java process (like jstack). Shows thread states and stack traces. Use for deadlocks or thread analysis.",
    inputSchema: z.object({
      pid: z.number().int().positive(),
      topN: z.number().int().min(1).max(500).optional().default(10),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await analyzeThreads(args) }],
  })
);

server.registerTool(
  "trace_method",
  {
    description: "Build call tree for a specific method from a .jfr file. Filters ExecutionSample by className.methodName. Use after stop_profiling.",
    inputSchema: z.object({
      filepath: z.string(),
      className: z.string(),
      methodName: z.string(),
      events: z.array(z.string()).optional(),
      topN: z.number().int().min(1).max(100).optional().default(10),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await traceMethod(args) }],
  })
);

server.registerTool(
  "parse_jfr_summary",
  {
    description: "Parse a .jfr file into a summary: top methods, GC stats, thread stats, anomalies. Use for quick overview of recording.",
    inputSchema: z.object({
      filepath: z.string(),
      events: z.array(z.string()).optional(),
      topN: z.number().int().min(1).max(100).optional().default(10),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await parseJfrSummary(args) }],
  })
);

server.registerTool(
  "profile_memory",
  {
    description: "Memory profile from .jfr: top allocators, GC stats, potential leaks (OldObjectSample). Use when memory is the concern.",
    inputSchema: z.object({
      filepath: z.string(),
      topN: z.number().int().min(1).max(100).optional().default(10),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await profileMemory(args) }],
  })
);

server.registerTool(
  "profile_time",
  {
    description: "CPU time profile from .jfr (bottleneck): bottom-up aggregation, methods consuming most CPU. Use when speed is the concern.",
    inputSchema: z.object({
      filepath: z.string(),
      topN: z.number().int().min(1).max(100).optional().default(10),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await profileTime(args) }],
  })
);

server.registerTool(
  "profile_frequency",
  {
    description: "Call frequency profile from .jfr: methods most often at leaf of stack. Use when looking for most frequently invoked methods.",
    inputSchema: z.object({
      filepath: z.string(),
      topN: z.number().int().min(1).max(100).optional().default(10),
    }),
  },
  async (args) => ({
    content: [{ type: "text", text: await profileFrequency(args) }],
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
