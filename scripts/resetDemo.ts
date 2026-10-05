/** npm run demo:reset: clears reviewers' runtime state (decisions, reactions, uploads) after backing it up. */
import "./_env";
import { resetState } from "../lib/store";
resetState();
console.log("Demo state cleared. A backup of the previous state is in data/state-backups/.");
