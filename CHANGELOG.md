# Changelog

## 1.4.2 - 2026-09-27

### Security

- Run `jps` and `jcmd` via `execFileSync` with an argv array (no shell), so MCP tool arguments cannot inject shell commands.
- Refresh transitive dependencies (`npm audit fix`) and bump `tsx` to 4.23.15 so `esbuild` is no longer in the vulnerable 0.27.3–0.28.0 range.

## 1.4.1

- Patch bump after npm audit dependency fixes.
