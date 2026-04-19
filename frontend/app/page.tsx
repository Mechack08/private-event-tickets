import Link from "next/link";

export default function Home() {
  return (
    <>
      <nav className="nav">
        <Link href="/">Home</Link>
        <Link href="/create-event">Create Event</Link>
        <Link href="/issue-ticket">Issue Ticket</Link>
        <Link href="/verify-ticket">Verify Ticket</Link>
      </nav>

      <main className="container">
        <h1>Private Event Tickets</h1>
        <p style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>
          Privacy-preserving event ticketing on{" "}
          <a
            href="https://midnight.network"
            target="_blank"
            rel="noopener noreferrer"
          >
            Midnight Network
          </a>
        </p>

        <div className="card" style={{ marginTop: "2rem" }}>
          <h2>How it works</h2>
          <ol style={{ paddingLeft: "1.25rem", lineHeight: 1.8 }}>
            <li>
              <strong>Organizer creates an event</strong> — sets the event name
              and max ticket count. Their shielded public key is recorded
              on-chain as the organizer.
            </li>
            <li>
              <strong>Organizer issues tickets</strong> — for each attendee,
              a Poseidon hash commitment is stored on-chain. A secret (ticket
              ID + nonce) is generated and shared with the attendee off-chain.
            </li>
            <li>
              <strong>Attendee proves ownership</strong> — presents a
              zero-knowledge proof that they know inputs matching an on-chain
              commitment. The verifier learns only <em>pass / fail</em> — no
              identity, no ticket number is revealed.
            </li>
          </ol>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1rem",
          }}
        >
          <Link href="/create-event" style={{ textDecoration: "none" }}>
            <div className="card" style={{ cursor: "pointer", textAlign: "center" }}>
              <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🎪</div>
              <strong>Create Event</strong>
              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.85rem",
                  margin: "0.5rem 0 0",
                }}
              >
                Organizer — deploy a new ticket contract
              </p>
            </div>
          </Link>

          <Link href="/issue-ticket" style={{ textDecoration: "none" }}>
            <div className="card" style={{ cursor: "pointer", textAlign: "center" }}>
              <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🎟️</div>
              <strong>Issue Ticket</strong>
              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.85rem",
                  margin: "0.5rem 0 0",
                }}
              >
                Organizer — mint a ticket for an attendee
              </p>
            </div>
          </Link>

          <Link href="/verify-ticket" style={{ textDecoration: "none" }}>
            <div className="card" style={{ cursor: "pointer", textAlign: "center" }}>
              <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🔐</div>
              <strong>Verify Ticket</strong>
              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.85rem",
                  margin: "0.5rem 0 0",
                }}
              >
                Attendee — prove ownership with ZK
              </p>
            </div>
          </Link>
        </div>

        <div className="card" style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
          <strong>Privacy guarantee</strong>
          <p style={{ color: "var(--text-muted)", margin: "0.5rem 0 0" }}>
            Ticket secrets never leave your browser. Zero-knowledge proofs are
            generated locally by a Docker proof server. The on-chain ledger
            stores only cryptographic commitments — an observer cannot determine
            who holds which ticket.
          </p>
        </div>
      </main>
    </>
  );
}
