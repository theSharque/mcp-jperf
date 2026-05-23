# javaperf

[![npm version](https://img.shields.io/npm/v/javaperf.svg)](https://www.npmjs.com/package/javaperf)

> MCP (Model Context Protocol) server for profiling Java applications via JDK utilities (jcmd, jfr, jps)

Enables AI assistants to diagnose performance, analyze threads, and inspect JFR recordings without manual CLI usage.

📦 **Install**: `npm install -g javaperf` or use via npx
🌐 **npm**: https://www.npmjs.com/package/javaperf

## How to connect to Claude Desktop / IDE

Add the server to your MCP config. Example for **claude_desktop_config.json**:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "javaperf": {
      "command": "npx",
      "args": ["-y", "javaperf"]
    }
  }
}
```

For **Cursor IDE**: Settings → Features → Model Context Protocol → Edit Config, then add the same block inside `mcpServers`. See the [Integration](#integration) section for more options (local dev, custom `JAVA_HOME`, etc.).

## Requirements

- **Node.js** v18+
- **JDK** 8u262+ or 11+ with JFR support

JDK tools (`jps`, `jcmd`, `jfr`) are auto-detected via `JAVA_HOME` or `which java`. If not found, set `JAVA_HOME` to your JDK root.

## Quick Start

### For Users (using npm package)

```bash
# No installation needed - use directly in Cursor/Claude Desktop
# Just configure it as described in Integration section below
```

### For Developers

1. Clone the repository:
```bash
git clone https://github.com/theSharque/mcp-jperf.git
cd mcp-jperf
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Usage

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

### MCP Inspector

Debug and test with MCP Inspector:
```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Integration

### Cursor IDE

1. Open Cursor Settings → Features → Model Context Protocol
2. Click "Edit Config" button
3. Add one of the configurations below

#### Option 1: Via npm (Recommended)

Installs from npm registry automatically:

```json
{
  "mcpServers": {
    "javaperf": {
      "command": "npx",
      "args": ["-y", "javaperf"]
    }
  }
}
```

#### Option 2: Via npm link (Development)

For local development with live changes:

```json
{
  "mcpServers": {
    "javaperf": {
      "command": "javaperf"
    }
  }
}
```

Requires: `cd /path/to/mcp-jperf && npm link -g`

#### Option 3: Direct path

```json
{
  "mcpServers": {
    "javaperf": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "${workspaceFolder}",
      "env": {
        "JAVA_HOME": "/path/to/your/jdk"
      }
    }
  }
}
```

If `list_java_processes` fails with "jps not found", the MCP server may not inherit your shell's `JAVA_HOME`. Add the `env` block above with your JDK root path (e.g. `/usr/lib/jvm/java-17` or `~/.sdkman/candidates/java/current`).

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "javaperf": {
      "command": "npx",
      "args": ["-y", "javaperf"]
    }
  }
}
```

### Continue.dev

Edit `.continue/config.json`:

```json
{
  "mcpServers": {
    "javaperf": {
      "command": "npx",
      "args": ["-y", "javaperf"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `list_java_processes` | List running Java processes (pid, mainClass, args). Use `topN` (default 10) to limit. |
| `start_profiling` | Start JFR. Pass `pid`, `duration` (seconds). Optional: `preset` (default effective: `profile`), `settingsFile` (path to `.jfc`, mutually exclusive with `preset`), `memorysize`, `stackdepth` (default 128). |
| `profile_jfr_network` | Socket I/O summary from `.jfr` (`jdk.SocketRead`, `jdk.SocketWrite`). Optional `filepath` (default new_profile), `topN`. |
| `profile_jfr_file_io` | File read/write summary (`jdk.FileRead`, `jdk.FileWrite`). Optional `filepath`, `topN`. |
| `profile_jfr_locks` | Monitor contention (`JavaMonitorBlocked`) and j.u.c parking (`ThreadPark`). Optional `filepath`, `topN`. Live waits: `analyze_threads structured=true`. |
| `profile_jfr_native` | Native-method CPU hotspots (`jdk.NativeMethodSample`). Optional `filepath`, `topN`. |
| `native_memory_summary` | `jcmd VM.native_memory summary` — requires JVM with `-XX:NativeMemoryTracking=summary` or `detail`. Pass `pid`. |
| `gc_class_stats` | `jcmd GC.class_stats` when available (often JDK 21+). Pass `pid`. |
| `gc_finalizer_info` | `jcmd GC.finalizer_info`. Pass `pid`. |
| `compiler_codecache` | `jcmd Compiler.codecache`. Pass `pid`. |
| `compiler_queue` | `jcmd Compiler.queue`. Pass `pid`. |
| `list_jfr_recordings` | List active JFR recordings for a process. Use before `stop_profiling` to get `recordingId`. |
| `stop_profiling` | Stop recording and save to recordings/new_profile.jfr. Requires `pid` and `recordingId`. |
| `check_deadlock` | Check for Java-level deadlocks. Returns structured JSON with threads, locks, and cycle. |
| `analyze_threads` | Thread dump (jstack) with deadlock summary. Pass `pid`, optional `topN` (default 10), `structured` (JSON lock-wait chains). Live snapshot; historical locks: `profile_jfr_locks`. |
| `heap_histogram` | Class histogram (GC.class_histogram). Pass `pid`, optional `topN` (20), `all` (triggers full GC — may pause app). Static snapshot; use `heap_live_histogram_diff` for growth. |
| `heap_live_histogram_diff` | Two histograms spaced by `intervalSeconds` (default 5). Top classes by instance/byte growth. First step in memory-leak workflow. Pass `pid`, optional `topN`, `all`, `minInstanceDelta`. |
| `heap_dump` | Create .hprof for MAT/VisualVM. After `heap_live_histogram_diff`, use MAT Path to GC Roots. Pass `pid`. Saved to recordings/heap_dump.hprof. |
| `heap_info` | Brief heap summary. Pass `pid`. |
| `vm_info` | JVM info: uptime, version, flags. Pass `pid`. |
| `trace_method` | Build call tree for a method from .jfr. Pass `className`, `methodName`. Optional: `filepath` (default new_profile), `topN`. |
| `parse_jfr_summary` | Parse .jfr into summary: top methods, GC stats, anomalies. Optional: `filepath` (default new_profile), `events`, `topN`. |
| `profile_memory` | Memory profile: top allocators by bytes/count, allocation stacks, OldObjectSample by class. Optional: `filepath`, `topN`, `sortBy` (`bytes`/`count`). Pair with `gc_efficiency`, `heap_live_histogram_diff`. |
| `gc_efficiency` | GC efficiency from .jfr: pause vs freed bytes per collector. Optional: `filepath`, `topN`. After `stop_profiling`. |
| `profile_time` | CPU bottleneck profile (bottom-up). Optional: `filepath` (default new_profile), `topN`. |
| `profile_frequency` | Call frequency profile (leaf frames). Optional: `filepath` (default new_profile), `topN`. |

## Example Workflow

1. **List processes** → `list_java_processes`
2. **Start recording** → `start_profiling` with `pid` and `duration` (e.g. 60)
3. Wait for `duration` seconds (or let it run)
4. **Check recordings** (optional) → `list_jfr_recordings` to get `recordingId`
5. **Stop and save** → `stop_profiling` with `pid` and `recordingId`
6. **Analyze** → `parse_jfr_summary`, `profile_memory`, `gc_efficiency`, `profile_time`, `profile_frequency`, `trace_method`, `profile_jfr_network`, `profile_jfr_file_io`, `profile_jfr_locks`, or `profile_jfr_native` (events must exist in the recording — use `start_profiling` with a suitable preset or `.jfc` via `settingsFile`)

## Example Workflow: Memory leak hypothesis

1. **List processes** → `list_java_processes`
2. **Find growing classes** → `heap_live_histogram_diff` with `pid`, `intervalSeconds: 5`
3. **Record under load** → `start_profiling` → wait → `stop_profiling`
4. **Allocation profile** → `profile_memory` on `new_profile` (check `oldObjectSamplesByClass` for suspect class)
5. **GC pressure** → `gc_efficiency` on the same `.jfr`
6. **Confirm retention** → `heap_dump` → Eclipse MAT → Path to GC Roots (exclude weak/soft references)
7. AI builds a coherent leak hypothesis from the combined results (no dedicated tool)

## Remote JVM (stdio MCP)

javaperf uses stdio MCP and attaches to JVMs via local `jps`/`jcmd`. That only works **on the OS account and host where the MCP process runs**.

To diagnose a JVM on another machine:

- Run the MCP server (your IDE connector, Cursor, or Claude Desktop) **on that machine**, for example SSH remote workspace, Codespaces, CI runner checkout on the server, or a shell session on the same host as the process.
- **Do not** rely on piping `jcmd` over plain SSH from another host unless you deliberately run MCP there; attaching across hosts is outside this server’s scope.

Requirements (same user, local attach) listed under **Limitations** still apply.

## Limitations

- **Sampling**: JFR samples ~10ms; fast methods may not appear in ExecutionSample
- **Local only**: Runs on the machine where MCP is started
- **Permissions**: Must run as same user as target JVM for jcmd access
