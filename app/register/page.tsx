import { notFound } from "next/navigation";
import { currentUser } from "@/lib/session";

export default async function RegisterPage() {
  const user = await currentUser();
  if (user.role !== "karandeep") notFound();
  return <div className="card p-6">Obligations register (Phase 1e).</div>;
}
