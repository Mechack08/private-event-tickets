import Link from "next/link";
import { Nav } from "@/components/Nav";

export default function HomePage() {
  return (
    <>
      <Nav />
      <main className="min-h-dvh bg-[#0a0a0a] pt-14">
        {/* Hero */}
        <section className="mx-auto max-w-3xl px-5 pt-24 pb-20 text-center">
          <div className="inline-flex items-center gap-2 border border-white/10 rounded-full px-3 py-1 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-xs text-zinc-400">Midnight Network · Preprod</span>
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold text-white tracking-tight leading-[1.08] mb-6">
            Private event
            <br />
            ticketing
          </h1>
          <p className="text-base text-zinc-400 max-w-md mx-auto mb-10 leading-relaxed">
            Issue and verify event tickets using zero-knowledge proofs. Attendees
            prove ownership without revealing their identity.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/events/new"
              className="bg-white text-black text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-zinc-100 transition-colors"
            >
              Create an Event
            </Link>
            <Link
              href="/events"
              className="border border-white/15 text-white text-sm px-5 py-2.5 rounded-xl hover:bg-white/6 transition-colors"
            >
              Browse Events
            </Link>
          </div>
        </section>

        {/* Flow */}
        <section className="mx-auto max-w-4xl px-5 pb-24">
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/8 border border-white/8 rounded-2xl overflow-hidden">
            {[
              {
                n: "01",
                who: "Organizer",
                title: "Create event",
                body: "Deploy a ZK ticketing contract. Set a name and ticket cap. Your shielded key becomes the on-chain organizer.",
                href: "/events/new",
                cta: "Create",
              },
              {
                n: "02",
                who: "Organizer",
                title: "Manage requests",
                body: "Attendees request tickets. You approve or reject. Each approval commits a private nonce hash to the ledger.",
                href: "/events",
                cta: "Manage",
              },
              {
                n: "03",
                who: "Attendee",
                title: "Prove ownership",
                body: "Generate a ZK proof from your secret nonce. The verifier learns only pass or fail — nothing about you.",
                href: "/verify",
                cta: "Verify",
              },
            ].map(({ n, who, title, body, href, cta }) => (
              <div key={n} className="p-6 bg-[#0a0a0a] flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-zinc-600">{n}</span>
                  <span className="text-xs text-zinc-600 border border-white/8 px-2 py-0.5 rounded-full">
                    {who}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-white">{title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed flex-1">{body}</p>
                <Link
                  href={href}
                  className="text-xs text-zinc-500 hover:text-white transition-colors mt-1 inline-flex items-center gap-1"
                >
                  {cta} →
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* Privacy */}
        <section className="mx-auto max-w-3xl px-5 pb-24">
          <div className="rounded-2xl border border-white/8 bg-white/3 px-6 py-5 grid sm:grid-cols-3 gap-5">
            {[
              {
                label: "No identity disclosed",
                body: "The ZK proof reveals nothing about who you are or which commitment matched.",
              },
              {
                label: "Commitments only on-chain",
                body: "Only Poseidon hashes of nonces hit the ledger. No names, emails, or pubkeys.",
              },
              {
                label: "Secret stays off-chain",
                body: "Your ticket nonce is shared privately between organizer and attendee.",
              },
            ].map(({ label, body }) => (
              <div key={label}>
                <p className="text-sm font-medium text-white mb-1">{label}</p>
                <p className="text-xs text-zinc-500 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
