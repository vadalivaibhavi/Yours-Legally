import { notFound } from "next/navigation";
import { currentUser } from "@/lib/session";

export default async function BriefPage(props: PageProps<"/deal/[id]/brief/[v]">) {
  const user = await currentUser();
  if (user.role !== "karandeep") notFound();
  const { id, v } = await props.params;
  return <div className="card p-6">Decision brief v{v} for {id} (Phase 2/3).</div>;
}
