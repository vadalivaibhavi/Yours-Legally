import Link from "next/link";
import { chooseDeal, confirmUpload, moveStaged, uploadDocument } from "./actions";
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

  // Step 2 of an upload into a deal: what it was detected as, and every other thing it could be.
  const staged = typeof sp.staged === "string" ? readState().stagedUploads.find((x) => x.id === sp.staged) : undefined;
  if (staged && preselectDeal) {
    const options: [string, string][] = [
      ...preDocs.map((d): [string, string] => [`replace:${d.id}`, `A new version of: ${d.title}`]),
      ["contract", "An additional contract document (SOW, annex, amendment, side letter…)"],
      ["note", "Meeting notes, an email or an update about the deal"],
    ];
    const label = (w: string) => options.find(([v]) => v === w)?.[1] ?? w;
    const ordered = [...options.filter(([v]) => v === staged.guess.what), ...options.filter(([v]) => v !== staged.guess.what)];
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Link href={`/deal/${preselectDeal.id}`} className="text-sm text-muted hover:underline">
          ← {preselectDeal.name}
        </Link>
        <h1 className="font-serif text-2xl font-semibold">Upload into {preselectDeal.name}</h1>
        {staged.guess.elsewhere && (
          <form action={moveStaged} className="card flex flex-wrap items-center gap-3 border-change bg-change-soft p-4 text-sm text-change">
            <input type="hidden" name="staged" value={staged.id} />
            <input type="hidden" name="to" value={staged.guess.elsewhere.dealId} />
            <span>
              ⚠ This may belong to <b>{staged.guess.elsewhere.name}</b>: {staged.guess.elsewhere.why}.
            </span>
            <SaveButton className="btn ml-auto !py-1 !text-xs" pendingLabel="Moving…" savedLabel="Moved ✓">
              Move it to {staged.guess.elsewhere.name}
            </SaveButton>
          </form>
        )}
        <form action={confirmUpload} className="card space-y-4 p-5 text-sm">
          <input type="hidden" name="staged" value={staged.id} />
          <p className="text-muted">
            📄 {staged.name} · {staged.text.split(/\s+/).length.toLocaleString()} words
          </p>
          <div className="rounded-lg bg-brand-soft p-3">
            This looks like <b>{label(staged.guess.what)}</b>
            <div className="text-xs text-muted">Why: {staged.guess.why}</div>
          </div>
          <fieldset className="space-y-2">
            <legend className="label mb-1">Not right? Choose what it is</legend>
            {ordered.map(([v, l]) => (
              <label key={v} className="flex items-start gap-2">
                <input type="radio" name="what" value={v} defaultChecked={v === staged.guess.what} className="mt-1" />
                <span>
                  {l}
                  {v === staged.guess.what && <span className="ml-1 text-xs text-muted">(detected)</span>}
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex items-center gap-3">
            <SaveButton className="btn btn-primary" pendingLabel="Reviewing… (about 1–2 min, keep this page open)" savedLabel="Done ✓">
              {staged.guess.elsewhere ? `Keep it in ${preselectDeal.name} & review` : "Confirm & review"}
            </SaveButton>
            <Link href={`/upload?deal=${preselectDeal.id}`} className="text-xs text-muted underline">
              Choose a different file
            </Link>
          </div>
        </form>
      </div>
    );
  }

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
            <input type="hidden" name="inDeal" value="1" />
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
        {preselectDeal ? (
          <>
            <SaveButton className="btn btn-primary" pendingLabel="Reading the file…" savedLabel="Read ✓">
              Upload
            </SaveButton>
            <p className="text-xs text-muted">Next you&apos;ll see what the file looks like (notes, a new version, or an additional document) and can change it before anything is reviewed.</p>
          </>
        ) : (
          <>
            <SaveButton className="btn btn-primary" pendingLabel="Uploading and reviewing… (about 1–2 min, keep this page open)" savedLabel="Done ✓">
              Upload &amp; review
            </SaveButton>
            <p className="text-xs text-muted">The contract is read, linked to a deal and reviewed; a new brief version is issued (up to a few minutes on the free model tier).</p>
          </>
        )}
      </form>
    </div>
  );
}
