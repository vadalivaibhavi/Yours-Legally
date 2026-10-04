/** Scripts run with tsx, which doesn't load .env.local the way Next.js does. Import first. */
import fs from "node:fs";
for (const f of [".env.local", ".env"]) {
  if (fs.existsSync(f)) {
    try {
      process.loadEnvFile(f);
    } catch {
      /* ignore */
    }
  }
}
