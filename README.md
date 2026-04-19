# Private Event Tickets — Midnight Network dApp

A privacy-preserving event ticketing system built on [Midnight Network](https://midnight.network).  
Ticket ownership is proven with zero-knowledge proofs: attendees prove they hold a valid ticket **without revealing their identity or which ticket they own**.

---

## Why privacy matters in ticketing

Traditional ticketing systems store attendee names, email addresses, and purchase history on centralised servers — all linkable to individual identities.  Even "blockchain" tickets often publish wallet addresses on a public ledger, enabling anyone to trace an attendee's history.

Midnight solves this with its [ZK-native privacy model](https://docs.midnight.network):

| What is on-chain | What stays private |
|---|---|
| Poseidon hash commitments | Attendee identity |
| Event name & ticket count | Ticket number |
| Organizer's shielded key | Nonce / proof secret |
| Pass / fail verification result | Who attended |

Proofs are generated **client-side** by a local proof server.  Private state lives in the user's local LevelDB store.  Nothing sensitive is ever sent to a server.

---

## Architecture

```
contract/
  event-tickets.compact   Compact smart contract (ZK circuits)
  Makefile                build targets

sdk/src/
  types.ts                Network config, shared types
  providers.ts            Assembles MidnightProviders from Lace wallet
  http-proof-provider.ts  HTTP proxy to local Docker proof server
  contract-api.ts         deploy / join / createEvent / issueTicket / verifyTicket

frontend/
  app/
    page.tsx              Landing page
    create-event/         Organizer: deploy contract + initialise event
    issue-ticket/         Organizer: mint ticket commitment for attendee
    verify-ticket/        Attendee: ZK proof of ticket ownership
    api/proof/            Next.js API routes proxying the local proof server
  hooks/useLaceWallet.ts  DApp Connector wallet hook
  components/WalletConnect.tsx
  shims/                  Turbopack browser shims (isomorphic-ws, fs)
  next.config.ts          Turbopack alias config
```

---

## Prerequisites

| Requirement | Version / Notes |
|---|---|
| [Node.js](https://nodejs.org) | ≥ 20 |
| [Lace wallet](https://www.lace.io) | Browser extension with Midnight enabled |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | For the local ZK proof server |
| Midnight Compact compiler | `compact +0.30.0` — install via `rustup` toolchain manager |

### Install the Compact compiler

```bash
# Install via the midnight toolchain manager (similar to rustup)
curl --proto '=https' --tlsv1.2 -sSf https://get.midnight.network | sh
compact toolchain install 0.30.0
```

### Start the Docker proof server

ZK proof generation requires a running proof server.  Start it before using the dApp:

```bash
docker run -d --rm -p 6300:6300 midnightntwrk/proof-server
```

The Next.js frontend proxies requests to this server through `/api/proof/*` to avoid CORS issues.

---

## Quick start

### 1. Compile the contract

```bash
cd contract
make check        # fast syntax check (no ZK keys, ~seconds)
make build        # full compile with ZK key generation (~5–10 minutes)
make copy-to-frontend  # copies artefacts to frontend/public/contracts/
```

The generated artefacts are placed in `generated/managed/event-tickets/contract/`:

| File | Purpose |
|---|---|
| `index.cjs` / `index.d.ts` | JS/TS contract module |
| `contract.wasm` | WASM runtime |
| `circuit_keys/*.zkir` | ZK intermediate representation |
| `circuit_keys/*.pk.bin` | Proving keys (required for proof generation) |

### 2. Install dependencies

```bash
# SDK
cd sdk && npm install

# Frontend
cd ../frontend && npm install
```

### 3. Run the frontend

```bash
cd frontend
npm run dev        # starts Next.js with Turbopack on http://localhost:3000
```

---

## Usage walkthrough

### Organizer: Create an event

1. Open http://localhost:3000/create-event
2. Connect your Lace wallet
3. Enter an event name and max ticket count (≤ 100 for v1)
4. Click **Create Event** — a new contract is deployed to preprod
5. Copy the **contract address** — you'll need it to issue tickets

### Organizer: Issue a ticket

1. Open http://localhost:3000/issue-ticket
2. Connect your organizer wallet
3. Paste the contract address, the attendee's shielded public key (they can find it in Lace → Settings), and a ticket ID
4. Click **Issue Ticket**
5. A `TicketSecret` JSON is generated — **send this to the attendee off-chain** (e.g. email, QR code)

```json
{
  "contractAddress": "0x…",
  "ticketId": 0,
  "nonce": "0x3f7a…",
  "holderPubkeyField": "0x1c4b…"
}
```

### Attendee: Verify a ticket

1. Open http://localhost:3000/verify-ticket
2. Connect the wallet that received the ticket
3. Paste the `TicketSecret` JSON
4. Click **Verify Ticket** — a ZK proof is generated locally (2–4 min)
5. The result (**VALID** / **INVALID**) is published on-chain; no other information is revealed

---

## Circuit privacy breakdown

### `create_event`

`own_public_key()` is called inside the circuit, so the organizer's identity is captured from the wallet key pair — it cannot be spoofed by passing a different argument.  The event name and ticket count are made public via `disclose()`.

### `issue_ticket`

The `assert own_public_key() == organizer` constraint means that ZK proof generation fails for any caller who is not the organizer — cryptographically enforced, not by a permissioned server.  The holder's public key and nonce are **private witnesses**: only their Poseidon hash appears on-chain.

### `verify_ticket`

The holder proves knowledge of `(ticket_id, nonce)` such that:

```
persistent_hash(ticket_id ‖ holder_pubkey_field ‖ nonce) ∈ ticket_commitments
```

The verifier learns only the Boolean result.  All 100 commitment slots are checked **unconditionally** (no short-circuit) to prevent timing side-channels that could reveal which slot matched.

---

## Deploying to preprod

The frontend is pre-configured with preprod endpoints in `sdk/src/types.ts`:

```typescript
export const PREPROD_CONFIG = {
  networkId: "preprod",
  indexerUri: "https://indexer.preprod.midnight.network/api/v3/graphql",
  indexerWsUri: "wss://indexer.preprod.midnight.network/api/v3/graphql/ws",
  substrateNodeUri: "wss://rpc.preprod.midnight.network",
};
```

Lace wallet must be set to the Midnight preprod network.  tDUST (test tokens) for gas fees are available from the [Midnight faucet](https://docs.midnight.network/develop/tutorial/using/faucet).

---

## Known limitations (v1)

| Limitation | Notes |
|---|---|
| Max 100 tickets | Compact vectors are fixed-size at compile time; increase `MAX_TICKETS` and recompile for larger events |
| Single event per contract | A new contract must be deployed for each event |
| No re-issuance | Once a ticket is issued it cannot be revoked in v1 |
| `Bytes<32>→Field` conversion | Done in the SDK via a manual byte-interpretation.  When Compact adds a native `bytes_to_field()`, update `pubkeyToField()` in `sdk/src/contract-api.ts` and remove the corresponding TODOs in the contract |
| Proof server local only | The proof server runs on `localhost:6300`; Next.js proxies it.  A cloud proof server API is on Midnight's roadmap |

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PROOF_SERVER_URL` | `http://localhost:6300` | Override proof server address in the Next.js API routes |

---

## License

MIT
