export default async function DealPage(props: PageProps<"/deal/[id]">) {
  const { id } = await props.params;
  return <div className="card p-6">Deal <b>{id}</b>: documents, notes and brief versions (Phase 1e).</div>;
}
