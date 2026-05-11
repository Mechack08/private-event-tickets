# Private Event Tickets — Midnight Network dApp

A full-stack, privacy-preserving event ticketing platform built on [Midnight Network](https://midnight.network).

Attendees self-claim tickets by ZK-proving their age — no birth date is ever disclosed.  
At the venue the organiser scans a QR code, and the contract admits the ticket on-chain.  
The attendee's app shows an **ADMITTED** stamp automatically. No identity is ever revealed.

---

## Table of contents

- [How it works](#how-it-works)
- [Architecture](#architecture)
- [Local setup (step by step)](#local-setup-step-by-step)
- [Running the project](#running-the-project)
- [User walkthrough](#user-walkthrough)
- [Contract reference](#contract-reference)
- [Backend API reference](#backend-api-reference)
- [Environment variables](#environment-variables)
- [Security design](#security-design)
- [Wallet notes](#wallet-notes)
- [Known limitations](#known-limitations)

---

## How it works

```
Organiser                                Attendee
─────────                                ────────
1. Deploy contract on Midnight
   (sets name, capacity, min age)

2. Event appears in the app
                                         3. Connect 1AM wallet (recommended)
                                            or Lace wallet (see notes below)
                                         4. Claim ticket — ZK-proves birth year
                                            (age ≥ min_age, no DOB disclosed)
                                         5. Private nonce saved in localStorage
                                         6. QR code generated from nonce

7. At venue: scan attendee's QR
8. admit_ticket() called on-chain
   (marks ticket as used in contract)
                                         9. App auto-syncs → ADMITTED stamp
```

### What is on-chain vs. what stays private

| On-chain (public) | Private (never leaves device) |
|---|---|
| `persistentHash(ticket_nonce)` | The ticket nonce itself |
| Event name, capacity, min age | Attendee birth year |
| `persistentHash(organiser_secret)` | Organiser / delegate secrets |
| Which tickets are admitted | Who attended |

---

## Architecture

```
private-event-tickets/
├── contract/
│   └── event-tickets.compact     ZK circuits (Compact language)
│
├── sdk/src/
│   ├── types.ts                  Network config, shared types
│   ├── providers.ts              Builds MidnightProviders from Lace wallet
│   ├── contract-api.ts           deploy / join / createEvent / claimTicket /
│   │                             admitTicket / grantDelegate / …
│   └── http-proof-provider.ts    Proxies ZK proof generation to Docker server
│
├── frontend/                     Next.js 15 App Router + Tailwind v4
│   ├── app/
│   │   ├── page.tsx              Landing page
│   │   ├── events/               Event list + per-event organiser/attendee view
│   │   │   ├── new/page.tsx      Deploy a new event contract
│   │   │   └── [address]/page.tsx  Organiser dashboard + attendee QR view
│   │   ├── my-tickets/page.tsx   Attendee ticket wallet (with ADMITTED state)
│   │   └── verify/page.tsx       Manual ZK proof submission
│   ├── contexts/
│   │   ├── AuthContext.tsx       Google OAuth session
│   │   └── WalletContext.tsx     Lace DApp Connector v4
│   ├── lib/
│   │   ├── api.ts                Type-safe fetch client → Express backend
│   │   └── storage.ts            localStorage persistence (SavedTicket, etc.)
│   └── components/
│       ├── Nav.tsx
│       └── WalletConnect.tsx
│
├── backend/src/                  Express 4 + Prisma + PostgreSQL + Socket.io
│   ├── config.ts                 Zod-validated env (fails fast if misconfigured)
│   ├── routes/                   auth · events · tickets
│   ├── services/                 userService · eventService · ticketService
│   └── socket.ts                 Real-time admission events per contract room
│
└── generated/                    Compiled contract artefacts (pre-committed)
```

---

## Local setup (step by step)

> **Time estimate:** 15–20 minutes on a fresh machine.  
> Steps 1–5 are one-time setup. After that, only [Running the project](#running-the-project) is needed.

---

### Step 1 — Install system prerequisites

You need the following tools before you start. Install anything that is missing.

#### Node.js ≥ 20

Check: `node --version`  
Install from https://nodejs.org (choose the LTS release).

#### pnpm ≥ 9

Check: `pnpm --version`  
Install:
```bash
npm install -g pnpm
```

#### Docker Desktop

Check: `docker --version`  
Install from https://www.docker.com/products/docker-desktop/  
Make sure Docker Desktop is **running** before continuing.

#### Midnight wallet — 1AM (recommended) or Lace

> **Recommended: 1AM wallet.** 1AM is the reference implementation of the Midnight DApp Connector API and works out-of-the-box — no Docker proof server required.  
> Lace works too but has known limitations described in the [Wallet notes](#wallet-notes) section below.

**Option A — 1AM wallet (recommended)**

1. Install **1AM** from https://1am.xyz/ (https://1am.xyz/) in Chrome or Brave.
2. Create a wallet (or restore an existing one) and choose **Midnight preprod**.
3. Copy your **unshielded address** from 1AM — you need it for the faucet.

**Option B — Lace wallet**

1. Install **Lace** from https://www.lace.io in Chrome or Brave.
2. Create a wallet (or restore an existing one).
3. Open Lace → Settings → Network → enable **Midnight** (preprod).
4. Copy your **unshielded address** from Lace — you need it for the faucet.
5. You also need a running **Docker proof server** (Step 6) because Lace does not yet implement in-wallet proof generation.

#### tDUST (Transaction fees)

Gas fees on preprod are paid in DUST. DUST cannot be transferred — it is generated locally inside the wallet from **tNight** tokens.

To get tNight:
1. Go to the faucet: https://faucet.preprod.midnight.network/
2. Paste your **unshielded** wallet address and submit.
3. Wait ~30 seconds — you will receive **tNight** in your wallet.
4. Inside Lace, use the tNight balance to generate DUST (used for transaction payment).

---

### Step 2 — Clone the repository

```bash
git clone https://github.com/Mechack08/private-event-tickets.git
cd private-event-tickets
```

---

### Step 3 — Install all dependencies

Run this **once** from the root of the repo. It installs packages for every workspace (contract, sdk, frontend, backend) in one command.

```bash
pnpm install
```

This will take 1–3 minutes the first time.

---

### Step 4 — Set up Google OAuth

The app uses **Google Sign-In** so users can create and manage events. You need a Google OAuth client ID.

#### 4a. Create a Google OAuth client

1. Go to https://console.cloud.google.com/
2. Create a new project (or select an existing one).
3. In the left menu go to **APIs & Services → Credentials**.
4. Click **+ Create Credentials → OAuth client ID**.
5. Application type: **Web application**.
6. Under **Authorised JavaScript origins**, click **Add URI** and enter:
   ```
   http://localhost:3000
   ```
7. Click **Create**.
8. Copy the **Client ID** shown in the dialog (it looks like `123456789-abc.apps.googleusercontent.com`).

#### 4b. Configure the backend

Copy the example env file:
```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` in any text editor. You need to make two changes:

**Change 1:** Replace `SESSION_SECRET` with a real random string.  
Run this command to generate one:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Copy the output and paste it as the value:
```dotenv
SESSION_SECRET=a1b2c3d4e5f6...   ← paste your generated string here
```

**Change 2:** Replace `GOOGLE_CLIENT_ID` with your Client ID from step 4a:
```dotenv
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
```

The final `backend/.env` should look like this (all other values are already correct for local Docker):
```dotenv
NODE_ENV=development
PORT=4000
DATABASE_URL="postgresql://pet_user:pet_pass@localhost:5433/pet_db?schema=public"
SESSION_SECRET=<your generated string>
SESSION_NAME=pet.sid
SESSION_TTL_SECONDS=604800
CORS_ORIGINS=http://localhost:3000
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
```

#### 4c. Configure the frontend

Copy the example env file:
```bash
cp frontend/.env.local.example frontend/.env.local
```

Open `frontend/.env.local` and replace `<your-client-id>` with the **same** Client ID from step 4a:
```dotenv
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
```

---

### Step 5 — Start the database and run migrations

**Start the PostgreSQL container and wait until it is healthy:**
```bash
pnpm db:up
```

This command returns once Docker reports the container as healthy (the `healthcheck` in `docker-compose.yml` polls `pg_isready` every 10 s). Then run the migrations to create all tables:
```bash
pnpm backend:db:migrate
```

You should see output ending with `All migrations have been applied`.

> The database data is stored in a Docker volume (`postgres_data`) and persists across restarts. You only need to run `db:up` once per machine boot — not every time you start the app.

---

### Step 6 — Start the ZK proof server

ZK proof generation requires a local proof server running in Docker. Start it with:
```bash
pnpm proof-server:start
```

The first run pulls the `midnightntwrk/proof-server` Docker image (~200 MB). Subsequent starts are instant.

Verify it is running:
```bash
pnpm proof-server:status
```

You should see `midnight-proof-server` listed with status `Up`.

> The proof server runs on port `6300`. The Next.js frontend automatically proxies proof requests to it — no manual configuration needed.

---

### Step 7 — Start the app

```bash
pnpm dev
```

This starts two processes in parallel:

| Service | URL | Description |
|---|---|---|
| Frontend (Next.js) | http://localhost:3000 | The web UI |
| Backend (Express) | http://localhost:4000 | REST API + WebSocket |

Wait about 10–15 seconds for both to finish compiling.

**Verify both services are up before opening the browser:**
```bash
curl http://localhost:4000/health
# expected: {"status":"ok","ts":"…"}
```

> If the backend exits immediately, check its output for env var errors (`GOOGLE_CLIENT_ID is required`, `SESSION_SECRET must be at least 32 characters`). Fix `backend/.env` and re-run `pnpm dev`.

Once the health check passes, open http://localhost:3000 in the browser that has Lace installed.

You're now running the full stack locally.

---

### Step 8 — (Optional) Rebuild the ZK contract

Pre-compiled contract artefacts are already committed to the repo under `frontend/public/contracts/`. **You do not need to recompile unless you edit `event-tickets.compact`.**

If you do change the contract, first install the Midnight Compact compiler:

```bash
# Install the Midnight toolchain manager (similar to rustup)
curl --proto '=https' --tlsv1.2 -sSf https://get.midnight.network | sh

# Install Compact v0.30.0
pnpm compact:install
```

Then rebuild:
```bash
pnpm contract:build        # ~5–10 minutes (generates ZK proving keys)
pnpm contract:copy         # copies artefacts to frontend/public/contracts/
```

For a fast syntax-only check (no key generation, takes seconds):
```bash
pnpm contract:build:skip-zk && pnpm contract:copy
```

---

## Running the project

After the one-time setup above, this is all you need each session:

```bash
# 1. Start the database (once per machine boot)
pnpm db:up

# 2. Start the ZK proof server (once per machine boot)
pnpm proof-server:start

# 3. Start frontend + backend together
pnpm dev
```

Open http://localhost:3000.

### Stopping everything

```bash
pnpm proof-server:stop   # stop the proof server Docker container
pnpm db:down             # stop the database Docker container
# Kill the pnpm dev process with Ctrl+C in its terminal
```

### Other useful commands

```bash
pnpm backend:db:studio   # open Prisma Studio (visual DB browser) on :5555
pnpm typecheck           # type-check all workspaces
pnpm test                # run the ZK contract simulation tests (~1.5 s, no Docker needed)
pnpm proof-server:logs   # tail the proof server logs
```

---

## User walkthrough

### Organiser: Create an event

1. Open http://localhost:3000.
2. Click **Sign in with Google** in the top-right corner and complete the sign-in.
3. Click **Connect Wallet** and approve the Midnight DApp connection in your wallet (1AM or Lace).
4. Go to **Events → New Event**.
5. Fill in event name, maximum capacity, and minimum age (0 = open to all).
6. Click **Create Event**. The dApp deploys a Compact contract to Midnight preprod. This takes 30–90 seconds.
7. You land on the event dashboard. Copy the **contract address** shown at the top — share it with attendees so they can find the event.

### Organiser: Grant delegate access (optional)

On the event dashboard click **Add delegate**. This calls `grant_delegate()` on-chain and creates a secret for a co-manager who can scan tickets at the venue without having your organiser key.

### Organiser: Admit attendees at the venue

1. Go to the event dashboard.
2. Open the **Scanner** tab.
3. Click **Start camera** and point it at an attendee's QR code.  
   Alternatively, use the **Manual** tab to paste a QR payload.
4. The app calls `admit_ticket()` on-chain. The attendee's ticket is now permanently marked as used in the contract.

---

### Attendee: Claim a ticket

1. Open http://localhost:3000.
2. Sign in with Google and connect your wallet (1AM recommended, or Lace).
3. Go to **Events** and find the event you want to attend.
4. Click **Claim ticket**.
5. Enter your birth year when prompted. This value stays in your browser — it is used as a private ZK witness and is never sent to any server.
6. The wallet generates a ZK proof and submits it to the contract (~30–120 s on preprod). With 1AM this happens entirely inside the wallet. With Lace it is handled by the local Docker proof server.
7. Your private ticket nonce is saved in `localStorage`. Open **My Tickets** to see your ticket and QR code.

### Attendee: Show your QR at the door

1. Open **My Tickets**.
2. Tap your ticket to expand it. A QR code appears.
3. Show the QR to the venue staff to be scanned in.

### Attendee: Check your ADMITTED status

After the organiser scans your QR:

1. Open **My Tickets**.
2. The ticket automatically syncs with the backend — no manual action needed.
3. An amber **ADMITTED** stamp appears on your ticket, showing the date and time of admission.

---

## Contract reference

The smart contract is in `contract/event-tickets.compact`.

### On-chain ledger state

| Field | Type | Description |
|---|---|---|
| `organizer` | `Bytes<32>` | `persistentHash(organiser_secret)` — raw secret never on-chain |
| `event_name` | `Bytes<32>` | UTF-8 name padded to 32 bytes |
| `total_tickets` | `Uint<32>` | Maximum claimable tickets |
| `tickets_issued` | `Counter` | Running count of claimed tickets |
| `is_active` | `Boolean` | `false` while paused or cancelled |
| `is_cancelled` | `Boolean` | Permanently cancelled — cannot be reversed |
| `min_age` | `Uint<8>` | Minimum attendee age (0 = open to all) |
| `ticket_commitments` | `Set<Bytes<32>>` | `persistentHash(nonce)` per ticket |
| `used_tickets` | `Set<Bytes<32>>` | Commitments admitted at venue |
| `delegates` | `Set<Bytes<32>>` | `persistentHash(delegate_secret)` per co-manager |

### Circuits

| Circuit | Who calls it | What it does |
|---|---|---|
| `create_event(name, total, age_req)` | Organiser | One-shot initialisation. Guard prevents double-init. |
| `claim_ticket(current_year)` | Attendee | Self-service. ZK-proves `current_year − birth_year ≥ min_age`. Inserts nonce commitment. |
| `verify_ticket()` | Anyone | Read-only. Returns `true` if ticket is valid and not yet admitted. |
| `admit_ticket()` | Organiser / delegate | Marks ticket as used. Throws on double-admission. |
| `pause_event()` | Organiser / delegate | Temporarily halts ticket claiming. |
| `resume_event()` | Organiser / delegate | Restores ticket claiming. |
| `cancel_event()` | Organiser / delegate | Permanently closes the event. |
| `grant_delegate()` | Organiser only | Adds a co-manager by storing `persistentHash(new_secret)`. |

---

## Backend API reference

Base URL: `http://localhost:4000`

All write requests require the `X-Requested-With: XMLHttpRequest` header (CSRF defence).  
Authenticated routes require a session cookie — sign in via `POST /auth/google` first.

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/google` | — | Verify Google ID token, create session |
| `GET` | `/auth/me` | ✓ | Return current session user |
| `POST` | `/auth/logout` | ✓ | Destroy session |

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
| `GET` | `/tickets/mine` | ✓ | My tickets — used for ADMITTED auto-sync |
| `GET` | `/tickets/event/:eventId` | ✓ | All tickets for an event |
| `POST` | `/tickets` | ✓ | Record a newly claimed ticket |
| `POST` | `/tickets/admit` | ✓ | Mark a ticket as admitted |

### Socket.io

Connect at `ws://localhost:4000`. A valid session cookie must be present.

```js
// Subscribe to live updates for a specific event
socket.emit('join:event', contractAddress)
```

| Event (server → client) | Payload | When it fires |
|---|---|---|
| `ticket:admitted` | `{ claimTxId, verifiedAt }` | Organiser scans a QR code |

---

## Environment variables

### `backend/.env`

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✓ | — | PostgreSQL connection string |
| `SESSION_SECRET` | ✓ | — | ≥ 32 random characters for cookie signing |
| `GOOGLE_CLIENT_ID` | ✓ | — | From Google Cloud Console → Credentials |
| `SESSION_NAME` | | `pet.sid` | Session cookie name |
| `SESSION_TTL_SECONDS` | | `604800` | Session TTL (default: 7 days) |
| `CORS_ORIGINS` | | `http://localhost:3000` | Comma-separated allowed origins |
| `NODE_ENV` | | `development` | `development` or `production` |
| `PORT` | | `4000` | Backend HTTP port |

Generate a session secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### `frontend/.env.local`

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | | `http://localhost:4000` | Backend API base URL |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | ✓ | — | Same value as `GOOGLE_CLIENT_ID` in backend |

---

## Security design

| Layer | Mechanism |
|---|---|
| Session fixation | `req.session.regenerate()` on every login |
| CSRF | `X-Requested-With` header required on all write requests |
| Cookie | `httpOnly`, `sameSite: strict` in production, rolling 7-day TTL |
| Rate limiting | 30 req/15 min on auth routes; 120 req/min global |
| Input validation | Zod schemas on all request bodies |
| SQL injection | Prisma parameterised queries — no raw SQL |
| Headers | Helmet with CSP in production |
| Env validation | Zod schema at startup — process exits if misconfigured |
| Private state | Ticket nonce never sent to any server — stored in browser localStorage only |

---

## Wallet notes

### 1AM (recommended)

1AM is the reference implementation of the [Midnight DApp Connector API v4](https://docs.midnight.network/develop/tutorial/building-a-dapp/dapp-connector/).  
It implements `getProvingProvider()`, which means ZK proofs are generated **inside the wallet** — no Docker proof server is required for end users.

### Lace

Lace supports the Midnight DApp Connector API but has two known gaps as of May 2026:

| Issue | Effect | Workaround |
|---|---|---|
| `getProvingProvider()` not implemented | ZK proofs cannot be generated inside the wallet | A self-hosted Docker proof server is required (`pnpm proof-server:start`) |
| Hosted `proverServerUri` is auth-gated | Lace's proof server URI (returned by `getConfiguration()`) returns 403 to third-party dApps on `/prove` | Same workaround — use the local Docker server |

In practice this means **Lace users must have Docker running** and the proof server started before deploying a contract or claiming a ticket. The app proxies proof requests transparently via `/api/proof` — no manual configuration is needed beyond `pnpm proof-server:start`.

The Midnight team has confirmed these limitations and is working on a Lace update. Once `getProvingProvider()` is available in Lace, the Docker server will become optional for Lace users too.

---

## Known limitations

| Limitation | Notes |
|---|---|
| One event per contract | Deploy a new contract for each event |
| No ticket revocation | Commitments cannot be removed from the on-chain `Set` in v1 |
| Delegate removal | The `delegates` Set is append-only; cancel and redeploy to rotate co-managers |
| Proof time | Client-side ZK proofs take 30–120 s on Midnight preprod |
| Wallet support | 1AM (recommended, full support) and Lace (requires Docker proof server — see [Wallet notes](#wallet-notes)) |
| Max capacity | `Set` size is fixed at compile time — recompile to increase the limit |

---

## License

MIT
