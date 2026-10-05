import { redirect } from "next/navigation";

/** Briefs open inline on the deal page; old links (and re-check redirects) land there, expanded. */
export default async function BriefPage(props: PageProps<"/deal/[id]/brief/[v]">) {
  const { id, v } = await props.params;
  redirect(`/deal/${id}?v=${v}&open=1#brief`);
}
