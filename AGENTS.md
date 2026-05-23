# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is `javaperf` — a stdio-based MCP (Model Context Protocol) server for profiling Java applications via JDK utilities (`jcmd`, `jfr`, `jps`). It is a single-package TypeScript project (not a monorepo).

### Development commands

See `package.json` scripts. Key commands:

- **Lint:** `npm run lint` (ESLint on `src/`)
- **Build:** `npm run build` (TypeScript compiler → `dist/`)
- **Dev mode:** `npm run dev` (runs via `tsx`)
- **Production:** `npm start` (runs built `dist/index.js`)
- **MCP Inspector:** `npm run inspector` (interactive debugging UI)

### Testing the MCP server

The server uses stdio transport (no HTTP port). To test it, pipe JSON-RPC messages via stdin:

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' | node dist/index.js
```

There are no automated tests in this codebase. The CI pipeline only runs `lint` and `build`.

### Runtime dependency

JDK 8u262+ or 11+ must be installed for the profiling tools (`jps`, `jcmd`, `jfr`) to work at runtime. JDK is auto-detected via `JAVA_HOME` or `PATH`. The Cloud VM has OpenJDK 21 pre-installed at `/usr/bin/java`.

### Gotchas

- `npm run dev` blocks on stdin (it's a stdio server) — use piped input or `timeout` for non-interactive testing.
- The `recordings/` directory is created at runtime by the server when profiling; it does not exist in the repo.

### Memory leak investigation workflow

This is a documented AI workflow — not a separate tool. Steps:

1. `list_java_processes` → target `pid`
2. `heap_live_histogram_diff` (e.g. `intervalSeconds: 5`) → classes growing in live heap
3. `start_profiling` → reproduce load → `stop_profiling`
4. `profile_memory` → allocators, allocation stacks, OldObjectSample by class (allocation site, not retention path)
5. `gc_efficiency` → GC pause vs bytes freed
6. `heap_dump` → Eclipse MAT → Path to GC Roots on suspect class (exclude weak/soft references)
7. AI synthesizes a leak hypothesis from the combined evidence

Related tools: `heap_histogram` (static snapshot), `heap_info`, `check_deadlock` / `analyze_threads structured=true` for lock issues, `profile_jfr_locks` for historical contention.
