# Private Event Tickets — Midnight Network dApp

A privacy-preserving event ticketing system built on the [Midnight Network](https://midnight.network).  
Attendees prove they hold a valid ticket using **zero-knowledge proofs** — no identity, no ticket number, no history is ever revealed.

---

## Table of contents

- [Why privacy matters in ticketing](#why-privacy-matters-in-ticketing)
- [How it works](#how-it-works)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [User walkthrough](#user-walkthrough)
- [Contract deep-dive](#contract-deep-dive)
- [Backend API reference](#backend-api-reference)
- [Security design](#security-design)
- [Known limitations](#known-limitations)
- [Environment variables](#environment-variables)
- [License](#license)

---

## Why privacy matters in ticketing

Traditional ticketing systems store names, email addresses, and purchase history on centralised servers — all linkable to individual identities. Even "blockchain" tickets often expose wallet addresses on a public ledger, enabling anyone to trace attendance history.

Midnight solves this with its ZK-native privacy model:

| What is **public** (on-chain) | What stays **private** |
|---|---|
| Poseidon hash commitments | Attendee identity |
| Event name & max ticket count | Ticket number / seat |
| Organizer's shielded key hash | Nonce / proof secret |
| Pass / fail verification result | Who attended which event |

Proofs are generated **client-side** by the wallet's built-in proving provider. Private state lives in the user's local LevelDB store. Nothing sensitive is ever sent to a server.

---

## How it works

```
Organizer                          Attendee
────────                           ────────
1. Deploy contract         ──→     (event appears on-chain)
2. Issue ticket            ──→     Organizer gets ticket secret JSON
3. Share secret off-chain  ──→     Attendee stores secret in browser
                                   4. Attendee connects wallet
                                   5. Attendee submits secret
                                   6. ZK proof generated (client-side)
                                   7. Chain verifies: VALID / INVALID
```

The ticket secret is a small JSON blob the organizer shares via email, QR code, or any out-of-band channel:

```json
{
  "contractAddress": "0x…",
  "nonce": "0x3f7a…"
}
```

The nonce is never published on-chain — only its `persistentHash` (Poseidon) is stored as the commitment.

---

## Architecture

```
private-event-tickets/
├── contract/
│   └── event-tickets.compact   Compact smart contract (3 ZK circuits)
│
├── sdk/src/
│   ├── types.ts                Network config, shared types
│   ├── providers.ts            Assembles MidnightProviders from wallet
│   ├── contract-api.ts         deploy / join / createEvent / issueTicket / verifyTicket
│   └── http-proof-provider.ts  Optional HTTP proxy for external proof server
│
├── frontend/                   Next.js 15 App Router + Tailwind v4
│   ├── app/
│   │   ├── page.tsx            Landing page with animated privacy explainer
│   │   ├── events/             Event listing + per-event organizer/attendee views
│   │   │   ├── page.tsx        List all your events; lookup by contract address
│   │   │   ├── new/page.tsx    Deploy a new ticketing contract
│   │   │   └── [address]/      Organizer dashboard (requests, issue, attendees)
│   │   ├── my-tickets/         Attendee ticket wallet (local + backend)
│   │   └── verify/             ZK proof submission
│   ├── contexts/WalletContext.tsx
│   ├── hooks/useWallet.ts      DApp Connector v4 hook (any Midnight wallet)
│   ├── lib/
│   │   ├── api.ts              Type-safe fetch client → Express backend
│   │   └── storage.ts          localStorage persistence for events & tickets
│   └── components/
│       ├── Nav.tsx
│       └── WalletConnect.tsx
│
├── backend/src/                Express 4 + Socket.io API server
│   ├── config.ts               Zod-validated env (fail-fast on startup)
│   ├── app.ts                  App factory — Helmet, CORS, sessions, routes
│   ├── index.ts                Entry point with graceful shutdown
│   ├── prisma/schema.prisma    User · Event · Ticket models
│   ├── routes/                 auth · events · tickets
│   ├── services/               userService · eventService · ticketService
│   ├── middleware/             requireAuth · rateLimiter · errorHandler
│   └── socket.ts               Socket.io with session auth; room per contract
│
└── generated/                  Compiled contract artefacts (gitignored)
```

---

## Prerequisites

| Requirement | Version / Notes |
|---|---|
| [Node.js](https://nodejs.org) | ≥ 20 |
| [pnpm](https://pnpm.io) | ≥ 9 — `npm i -g pnpm` |
| [Lace wallet](https://www.lace.io) | Browser extension with **Midnight network** enabled |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | For PostgreSQL and the ZK proof server |
| Midnight Compact compiler | `compact +0.30.0` — see below |
| PostgreSQL | Via Docker (`pnpm db:up`) **or** a local instance |

### Install the Compact compiler

```bash
# Install via the Midnight toolchain manager (similar to rustup)
curl --proto '=https' --tlsv1.2 -sSf https://get.midnight.network | sh
pnpm compact:install          # installs compact v0.30.0
```

### Get tDUST (preprod test tokens)

Gas fees on preprod are paid in tDUST. Get some from the [Midnight faucet](https://docs.midnight.network/develop/tutorial/using/faucet) by pasting your shielded address (visible in Lace → Midnight settings).

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/your-org/private-event-tickets.git
cd private-event-tickets
pnpm install
```

### 2. Compile the contract *(skip if using pre-compiled artefacts)*

The compiled artefacts are already committed to `frontend/public/contracts/`. Only re-run this if you change `event-tickets.compact`:

```bash
pnpm contract:build           # ~5–10 minutes (generates ZK proving keys)
pnpm contract:copy            # copies artefacts to frontend/public/contracts/
```

For a fast iteration loop without ZK key generation:

```bash
pnpm contract:build:skip-zk && pnpm contract:copy
```

### 3. Start the database

```bash
pnpm db:up                    # starts pet_postgres Docker container on port 5433
```

### 4. Configure and migrate the backend

```bash
cp backend/.env.example backend/.env
# Edit backend/.env — set DATABASE_URL to point at your Postgres instance
pnpm backend:db:migrate       # creates the sessions, users, events, tickets tables
```

### 5. Start the proof server

```bash
pnpm proof-server:start       # Docker: midnightntwrk/proof-server on :6300
```

### 6. Start everything

In separate terminals:

```bash
# Terminal 1 — backend API
pnpm backend:dev              # http://localhost:4000

# Terminal 2 — frontend
pnpm dev                      # http://localhost:3000
```

Health check:
```bash
curl http://localhost:4000/health
# {"status":"ok","ts":"…"}
```

---

## User walkthrough

### Organizer: Create an event

1. Open http://localhost:3000 and click **Get started → Events**
2. Click **Connect Wallet** in the nav — approve the Midnight connection in Lace
3. Navigate to **Events → New Event**
4. Enter an event name and max ticket count, then click **Create Event**
5. The dApp deploys a new Compact contract to preprod (~30–90 s)
6. You land on the event dashboard; copy the **contract address** for attendees

### Organizer: Issue tickets

On the event dashboard (organizer view):

- **Approve a request** — attendees who clicked "Request a ticket" appear in the Requests tab; click Approve to call `issue_ticket()` on-chain
- **Issue directly** — generates a ticket immediately; copy the secret JSON and share it with the attendee

The ticket secret looks like:
```json
{ "contractAddress": "0x…", "nonce": "0x…" }
```

Share this via email, QR code, or any out-of-band channel.

### Attendee: Save and verify a ticket

1. Go to **My Tickets** and click **Import ticket**
2. Paste the secret JSON and give the ticket an event name label
3. To verify at the door: go to **Verify Ticket**, paste the JSON, and click **Verify Ticket**
4. A ZK proof is generated locally by the wallet (30–120 s on preprod)
5. The result (**VALID** ✓ / **INVALID** ✗) is published on-chain — nothing else is revealed

---

## Contract deep-dive

### Ledger state (`event-tickets.compact`)

```compact
export ledger organizer:          Bytes<32>;       // shielded pubkey of event creator
export ledger event_name:         Bytes<32>;       // UTF-8 name padded to 32 bytes
export ledger total_tickets:      Uint<32>;        // max tickets for this event
export ledger tickets_issued:     Counter;         // running count
export ledger ticket_commitments: Set<Bytes<32>>;  // set of Poseidon(nonce) hashes
```

### Circuits

#### `create_event(organizer_key, name, total)`
Initialises the event. The guard `organizer == default<Bytes<32>>` ensures it runs only once per deployment. All three params are private circuit inputs but explicitly `disclose()`d — the event metadata is visible on-chain.

#### `issue_ticket()`
Calls the `local_secret()` witness which the TypeScript SDK satisfies with a fresh cryptographically random nonce. The nonce's Poseidon hash is stored in `ticket_commitments` and `disclose()`d so it appears in the public ledger. The raw nonce is returned to the SDK and must be shared with the attendee off-band.

#### `verify_ticket()`
The attendee's SDK supplies the stored nonce via `local_secret()`. The circuit computes `persistentHash(nonce)` and checks `ticket_commitments.member(commitment)`. Returns a Boolean. The nonce itself is never revealed.

### Privacy guarantees

| Property | Mechanism |
|---|---|
| Attendee identity hidden | No public key, address, or wallet identifier appears on-chain |
| Ticket number hidden | Only the commitment hash is public; which slot matched is not revealed |
| Proof is unlinkable | Each verification generates a fresh proof; no nullifier is published |
| Organizer-only issuance | Only the SDK holding the organizer's wallet can satisfy the `issue_ticket` witness |

---

## Backend API reference

Base URL: `http://localhost:4000`

All mutating requests require the `X-Requested-With: XMLHttpRequest` header (CSRF defence). Authenticated routes require a session cookie (`POST /auth/connect` first).

### Auth

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/auth/connect` | `{ shieldedAddress }` | Upsert user, set session cookie |
| `GET` | `/auth/me` | — | Return current session user |
| `POST` | `/auth/disconnect` | — | Destroy session |

### Events

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/events` | — | List all events |
| `GET` | `/events/by-address/:addr` | — | Lookup by contract address |
| `POST` | `/events` | ✓ | Create event record |
| `PATCH` | `/events/:id` | ✓ (owner) | Update event metadata |

### Tickets

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/tickets/mine` | ✓ | My tickets |
| `GET` | `/tickets/event/:eventId` | ✓ | Tickets for an event |
| `POST` | `/tickets` | ✓ | Record issued ticket commitment |
| `POST` | `/tickets/verify` | ✓ | Mark ticket as verified (emits `ticket:verified` via Socket.io) |

### Socket.io events

Connect at `ws://localhost:4000`. Session cookie must be set.

| Event (server → client) | Payload | Description |
|---|---|---|
| `ticket:issued` | `{ ticket, eventId }` | New ticket committed on-chain |
| `ticket:verified` | `{ ticketId, verifiedAt }` | Ticket successfully verified |

Join a room with `socket.emit('join:event', contractAddress)` to receive events for a specific event.

---

## Security design

| Layer | Mechanism |
|---|---|
| Session fixation | `req.session.regenerate()` on every login |
| CSRF | `X-Requested-With` header required on all mutating requests |
| Cookie | `httpOnly`, `sameSite: strict` in production, 7-day rolling TTL |
| Rate limiting | 30 req/15 min on auth routes; 120 req/min global |
| Input validation | Zod schemas on all request bodies |
| DB queries | Prisma parameterized — no raw SQL injection surface |
| Headers | Helmet with CSP enabled in production |
| Env validation | Zod schema at startup — server refuses to start if misconfigured |
| Private state | Never sent to any server — stays in user's browser LevelDB |

---

## Known limitations

| Limitation | Notes |
|---|---|
| Max tickets | Compact `Set` size is fixed at compile time. Increase and recompile for larger events |
| Single event per contract | Deploy a new contract per event |
| No ticket revocation | Commitments cannot be removed from the on-chain `Set` in v1 |
| Proof time | Client-side ZK proof generation takes 30–120 s on preprod hardware |
| Lace wallet only | Tested against Lace with Midnight network. Any CAIP-372-compatible wallet will work |

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Default | Required | Description |
|---|---|---|---|
| `DATABASE_URL` | — | ✓ | PostgreSQL connection string |
| `SESSION_SECRET` | — | ✓ | ≥32 char random string for cookie signing |
| `SESSION_NAME` | `pet.sid` | | Session cookie name |
| `SESSION_TTL_SECONDS` | `604800` | | Session TTL (7 days) |
| `CORS_ORIGINS` | `http://localhost:3000` | | Comma-separated allowed origins |
| `NODE_ENV` | `development` | | `development` / `production` |
| `PORT` | `4000` | | Backend HTTP port |

Generate a session secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Frontend (`frontend/.env.local`)

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | `http://localhost:4000` | Backend API base URL |

---

## License

MIT


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
