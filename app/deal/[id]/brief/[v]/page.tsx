import { redirect } from "next/navigation";
import { syncState } from "@/lib/store";

/** Briefs open inline on the deal page; old links (and re-check redirects) land there, expanded. */
export default async function BriefPage(props: PageProps<"/deal/[id]/brief/[v]">) {
  await syncState(); // the shared store on Vercel (no-op locally)
  const { id, v } = await props.params;
  redirect(`/deal/${id}?v=${v}&open=1#brief`);
}
