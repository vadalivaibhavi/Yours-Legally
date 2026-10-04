import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { currentUser } from "@/lib/session";
import { RoleSwitch } from "@/components/RoleSwitch";
import { appToday } from "@/lib/config";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Yours Legally",
  description: "Contract review assistant for AtliQ: register-first, verdict-first, cited.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen">
        <header className="bg-brand text-white">
          <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="font-serif text-xl font-semibold tracking-tight">Yours Legally</span>
              <span className="text-xs text-white/60 hidden sm:inline">AtliQ contract review</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/" className="hover:underline">Queue</Link>
              {user.role === "karandeep" && <Link href="/register" className="hover:underline">Register</Link>}
            </nav>
            <div className="ml-auto flex items-center gap-4">
              <span className="text-xs text-white/70" title="APP_TODAY: fixed so the demo and evals are reproducible">
                Today · {fmtDate(appToday())}
              </span>
              <RoleSwitch current={user.id} />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-muted">
          Decision support, not legal advice. Yours Legally records decisions; it never sends, signs or contacts anyone.
        </footer>
      </body>
    </html>
  );
}
