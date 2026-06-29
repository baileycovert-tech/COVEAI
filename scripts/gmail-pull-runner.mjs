#!/usr/bin/env node
/**
 * gmail-pull-runner.mjs — launchd shim so the Gmail pull inherits Full Disk Access.
 *
 * The project lives under ~/Documents, which macOS TCC protects. A launchd job that runs
 * /usr/bin/python3 directly gets "Operation not permitted" reading the script — Apple's python
 * has no FDA grant. But /usr/local/bin/node DOES (the working refresh/imessage jobs use it), so
 * we launch node here and let it spawn python3: the child's responsible process is node, so it
 * inherits node's FDA and can read ~/Documents + write data/.
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const r = spawnSync("/usr/bin/python3", [path.join(ROOT, "scripts", "gmail-pull.py")], {
  cwd: ROOT,
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status ?? 0);
