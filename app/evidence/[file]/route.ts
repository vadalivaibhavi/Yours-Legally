import fs from "node:fs";
import path from "node:path";
import { canViewBrief } from "@/lib/access";
import { writableDir } from "@/lib/config";
import { currentUser } from "@/lib/session";

/** Evidence attached when closing a compliance alert (FR-21). Karandeep only. */
export async function GET(_req: Request, ctx: RouteContext<"/evidence/[file]">) {
  const user = await currentUser();
  if (!canViewBrief(user)) return new Response("Not allowed", { status: 403 });
  const { file } = await ctx.params;
  const safe = path.basename(file);
  const p = path.join(/*turbopackIgnore: true*/ writableDir("evidence"), safe);
  if (!fs.existsSync(p)) return new Response("Not found", { status: 404 });
  return new Response(fs.readFileSync(p), { headers: { "content-disposition": `inline; filename="${safe}"` } });
}
