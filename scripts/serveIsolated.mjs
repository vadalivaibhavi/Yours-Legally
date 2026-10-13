// The built app on port 3100 with a throwaway state file, for click-through tests that must not touch the
// real reviewer state (data/state/state.json). Run npx next build first.
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

process.env.STATE_FILE = path.join(os.tmpdir(), "yours-legally-test-state.json");
console.log(`state: ${process.env.STATE_FILE}`);
spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", "3100"], { stdio: "inherit", env: process.env });
