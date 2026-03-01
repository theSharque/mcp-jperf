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
git clone <repo-url>
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
| `start_profiling` | Start JFR recording with `settings=profile`. Pass `pid`, `duration` (seconds), optional `recordingName`. |
| `stop_profiling` | Stop recording and save to file. Requires `pid` and `recordingId` from start_profiling. |
| `analyze_threads` | Thread dump (jstack). Pass `pid`, optional `topN` (default 10) to limit threads. |
| `heap_histogram` | Class histogram (GC.class_histogram). Top classes by instances/bytes. Pass `pid`, optional `topN` (20), `all` (include unreachable). |
| `heap_dump` | Create .hprof heap dump for MAT/VisualVM. Pass `pid`. Saved to recordings/heap_dump.hprof. |
| `heap_info` | Brief heap summary. Pass `pid`. |
| `vm_info` | JVM info: uptime, version, flags. Pass `pid`. |
| `trace_method` | Build call tree for a method from a .jfr file. Pass `filepath`, `className`, `methodName`, optional `topN`. |
| `parse_jfr_summary` | Parse .jfr into summary: top methods, GC stats, anomalies. Pass `filepath`, optional `events`, `topN`. |
| `profile_memory` | Memory profile: top allocators, GC, potential leaks. Pass `filepath`, optional `topN`. |
| `profile_time` | CPU bottleneck profile (bottom-up). Pass `filepath`, optional `topN`. |
| `profile_frequency` | Call frequency profile (leaf frames). Pass `filepath`, optional `topN`. |

## Example Workflow

1. **List processes** → `list_java_processes`
2. **Start recording** → `start_profiling` with `pid` and `duration` (e.g. 60)
3. Wait for `duration` seconds (or let it run)
4. **Stop and save** → `stop_profiling` with `pid` and `recordingId`
5. **Analyze** → Use `parse_jfr_summary`, `profile_memory`, `profile_time`, `profile_frequency`, or `trace_method` with the saved .jfr path

## Limitations

- **Sampling**: JFR samples ~10ms; fast methods may not appear in ExecutionSample
- **Local only**: Runs on the machine where MCP is started
- **Permissions**: Must run as same user as target JVM for jcmd access
