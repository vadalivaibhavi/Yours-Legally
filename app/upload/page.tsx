import Link from "next/link";
import { chooseDeal, uploadDocument } from "./actions";
import { TextArea } from "@/components/Fields";
import { SaveButton } from "@/components/BriefControls";
import { LIMITS, QUOTA_MESSAGE } from "@/lib/limits";
import { visibleDeals } from "@/lib/access";
import { allDeals, allDocuments, dealDocuments, getDeal } from "@/lib/deals";
import { proposeLink } from "@/lib/linking";
import { currentUser } from "@/lib/session";
import { readState } from "@/lib/store";


/** Re-checks run the review pipeline inside server actions on this page (Vercel: up to 300s). */
export const maxDuration = 300;

export default async function UploadPage(props: PageProps<"/upload">) {
  const user = await currentUser();
  const sp = await props.searchParams;
  const pendingId = typeof sp.pending === "string" ? sp.pending : null;
  const preselect = typeof sp.deal === "string" ? sp.deal : "";
  const deals = visibleDeals(user, allDeals());
  const preselectDeal = preselect ? getDeal(preselect) : undefined;
  const preDocs = preselectDeal ? dealDocuments(preselectDeal) : [];

  if (pendingId) {
    const doc = readState().uploadedDocuments.find((d) => d.id === pendingId);
    if (!doc) return <div className="card p-6">Upload not found.</div>;
    const p = proposeLink({ counterparty: doc.counterparty, docType: doc.docType, text: doc.text, docId: doc.id }, allDeals(), allDocuments());
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="font-serif text-2xl font-semibold">Which deal is this part of?</h1>
        <div className="card space-y-3 p-5 text-sm">
          <p>
            <b>{doc.title}</b>
          </p>
          <p className="text-muted">Asking once because {p.reason}. Your choice is final: matching is never re-run on re-checks.</p>
          <form action={chooseDeal} className="space-y-2">
            <input type="hidden" name="docId" value={doc.id} />
            {p.options.map((o) => (
              <button key={o.dealId} name="dealId" value={o.dealId} className="btn w-full justify-start text-left">
                {o.label} <span className="font-normal text-muted">· {o.reason}</span>
              </button>
            ))}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/" className="text-sm text-muted hover:underline">
        ← Queue
      </Link>
      <h1 className="font-serif text-2xl font-semibold">{preselectDeal ? `Upload into ${preselectDeal.name}` : "Upload a contract"}</h1>
      {sp.quota === "1" && <div className="rounded-lg bg-change-soft p-4 text-sm text-change">{QUOTA_MESSAGE}</div>}
      <form action={uploadDocument} className="card space-y-4 p-5 text-sm">
        <label className="block space-y-1">
          <span className="label">File (.md / .txt, up to 1 MB)</span>
          <input type="file" name="file" accept=".md,.txt,.markdown" className="w-full" />
        </label>
        <label className="block space-y-1">
          <span className="label">…or paste the text</span>
          <TextArea name="text" rows={6} className="font-serif" placeholder="Paste the text" max={LIMITS.contract} />
        </label>
        {preselectDeal ? (
          <>
            <input type="hidden" name="deal" value={preselectDeal.id} />
            <label className="block space-y-1">
              <span className="label">What is it? (optional)</span>
              <select name="what" defaultValue="auto" className="w-full">
                <option value="auto">Detect it automatically</option>
                {preDocs.map((d) => (
                  <option key={d.id} value={`replace:${d.id}`}>
                    A new version of: {d.title}
                  </option>
                ))}
                <option value="contract">An additional contract document (SOW, annex, amendment, side letter…)</option>
                <option value="note">Meeting notes, an email or an update about the deal</option>
              </select>
            </label>
          </>
        ) : (
          <label className="block space-y-1">
            <span className="label">Deal</span>
            <select name="deal" defaultValue="" className="w-full">
              <option value="">Let Yours Legally, propose (auto when certain, asks when ambiguous)</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  Put it in: {d.name}
                </option>
              ))}
              <option value="new">Start a new deal</option>
            </select>
          </label>
        )}
        <SaveButton className="btn btn-primary" pendingLabel="Uploading and reviewing… (about 1–2 min, keep this page open)" savedLabel="Done ✓">
          Upload &amp; review
        </SaveButton>
        <p className="text-xs text-muted">A contract is read and reviewed; notes are added to the deal's notes and scanned. Either way the deal is re-checked and a new brief version is issued (up to a few minutes on the free model tier).</p>
      </form>
    </div>
  );
}
