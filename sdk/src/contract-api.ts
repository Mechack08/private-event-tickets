/**
 * contract-api.ts — typed wrapper around the compiled event-tickets contract.
 *
 * ⚠️  SSR WARNING — Never statically import this file in a Next.js page.
 * Always use dynamic import() inside an async function.
 *
 * ─── Witness mechanism ────────────────────────────────────────────────────
 * The contract has one witness: `local_secret(): Field`.
 * issueTicket() auto-generates a random Field nonce via the witness.
 * verifyTicket(nonce) supplies the holder's stored nonce via the witness.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const midnightContracts = require("@midnight-ntwrk/midnight-js-contracts");
const { deployContract, findDeployedContract } = midnightContracts;

import type { MidnightProviders } from "@midnight-ntwrk/midnight-js-types";
import type {
  DeployResult,
  EventState,
  IssueTicketResult,
  TicketSecret,
  VerifyTicketResult,
} from "./types.js";

// ─── Compiled contract module (lazy-loaded) ───────────────────────────────

type LedgerView = {
  organizer: Uint8Array;
  event_name: Uint8Array;
  total_tickets: bigint;
  tickets_issued: bigint;
  ticket_commitments: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>;
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _module: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getContractModule(): Promise<any> {
  if (_module) return _module;
  try {
      _module = await import("../../generated/contract/index.js");
  } catch (err) {
    throw new Error(
      "Could not load compiled contract module. " +
        "Run `pnpm contract:build` then `pnpm contract:copy` first.\n" +
        String(err),
    );
  }
  return _module;
}

// ─── Field utilities ──────────────────────────────────────────────────────

const PALLAS_SCALAR_PRIME =
  0x40000000000000000000000000000000224698fc094cf91b992d30ed00000001n;

/** Generate a cryptographically random Field element (< Pallas scalar prime). */
function randomField(): bigint {
  const buf = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { randomBytes } = require("crypto") as typeof import("crypto");
    buf.set(randomBytes(32));
  }
  let value = 0n;
  for (let i = 0; i < buf.length; i++) value += BigInt(buf[i]) << BigInt(i * 8);
  return value % PALLAS_SCALAR_PRIME;
}

// ─── String / Bytes utilities ─────────────────────────────────────────────

/** Encode a string as UTF-8 padded/truncated to exactly 32 bytes (Bytes<32>). */
export function stringToBytes32(s: string): Uint8Array {
  const encoded = new TextEncoder().encode(s);
  const result = new Uint8Array(32);
  result.set(encoded.slice(0, 32));
  return result;
}

/** Decode a Bytes<32> Uint8Array to a UTF-8 string, trimming trailing zeros. */
export function bytes32ToString(bytes: Uint8Array): string {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  return new TextDecoder().decode(bytes.slice(0, end));
}

/** Encode a bigint as a 0x-prefixed hex string. */
export function bigintToHex(n: bigint): string {
  return "0x" + n.toString(16);
}

/** Decode a 0x-prefixed hex string to bigint. */
export function hexToBigint(hex: string): bigint {
  return BigInt(hex.startsWith("0x") ? hex : "0x" + hex);
}

// ─── CompiledContract builder ─────────────────────────────────────────────

async function buildCompiledContract(getLocalSecret: () => bigint) {
  const mod = await getContractModule();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let CompiledContract: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ({ CompiledContract } = require("@midnight-ntwrk/compact-js"));
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ({ CompiledContract } = require("@midnight-ntwrk/compact-runtime"));
  }

  const witnesses = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    local_secret: (context: any): [any, bigint] => [
      context.privateState,
      getLocalSecret(),
    ],
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipe = (...fns: any[]) => (x: any) => fns.reduce((v, f) => f(v), x);

  return pipe(
    CompiledContract.withCompiledFileAssets("/contracts/event-tickets"),
  )(CompiledContract.make("event-tickets", new mod.Contract(witnesses)));
}

// ─── EventTicketAPI ───────────────────────────────────────────────────────

export class EventTicketAPI {
  private _pendingNonce: bigint | null = null;

  private constructor(
    private readonly providers: MidnightProviders,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly _contract: any,
    readonly contractAddress: string,
  ) {}

  private _getLocalSecret(): bigint {
    if (this._pendingNonce === null) {
      this._pendingNonce = randomField();
    }
    return this._pendingNonce;
  }

  // ── Factory: deploy ──────────────────────────────────────────────────────

  static async deploy(providers: MidnightProviders): Promise<EventTicketAPI> {
    const api = new EventTicketAPI(providers, null, "");
    const compiled = await buildCompiledContract(() => api._getLocalSecret());
    const { contractAddress, txId } = (await deployContract(
      providers,
      compiled,
    )) as DeployResult;
    const contract = await findDeployedContract(
      providers,
      compiled,
      contractAddress,
    );
    console.log(`Contract deployed: ${contractAddress} (txId: ${txId})`);
    return new EventTicketAPI(providers, contract, contractAddress);
  }

  // ── Factory: join ────────────────────────────────────────────────────────

  static async join(
    providers: MidnightProviders,
    contractAddress: string,
  ): Promise<EventTicketAPI> {
    const api = new EventTicketAPI(providers, null, contractAddress);
    const compiled = await buildCompiledContract(() => api._getLocalSecret());
    const contract = await findDeployedContract(
      providers,
      compiled,
      contractAddress,
    );
    return new EventTicketAPI(providers, contract, contractAddress);
  }

  // ── Circuit: create_event ────────────────────────────────────────────────

  async createEvent(
    name: string,
    totalTickets: bigint,
  ): Promise<{ txId: string }> {
    const organizerKey = await this._getOwnPubkey();
    const { txId } = (await this._contract.callTx.create_event(
      organizerKey,
      stringToBytes32(name),
      totalTickets,
    )) as { txId: string };
    return { txId };
  }

  // ── Circuit: issue_ticket ────────────────────────────────────────────────

  /**
   * Issue one ticket. Returns the random nonce — share it with the attendee
   * as their ticket secret.
   */
  async issueTicket(): Promise<IssueTicketResult> {
    this._pendingNonce = null; // witness will auto-generate
    const { txId } = (await this._contract.callTx.issue_ticket()) as {
      txId: string;
    };
    const nonce = this._pendingNonce;
    this._pendingNonce = null;
    if (nonce === null) throw new Error("Witness did not generate a nonce");
    return { txId, nonce };
  }

  // ── Circuit: verify_ticket ───────────────────────────────────────────────

  /**
   * Prove ticket ownership. The holder supplies the nonce from their ticket
   * secret. Returns verified=true if the commitment is in the on-chain Set.
   */
  async verifyTicket(nonce: bigint): Promise<VerifyTicketResult> {
    this._pendingNonce = nonce;
    const { txId, result } = (await this._contract.callTx.verify_ticket()) as {
      txId: string;
      result: boolean;
    };
    this._pendingNonce = null;
    return { txId, verified: result };
  }

  // ── Read-only: get state ─────────────────────────────────────────────────

  async getState(): Promise<EventState> {
    const mod = await getContractModule();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (await (this.providers.publicDataProvider as any).getPublicStates(
      mod.ledger,
      this.contractAddress,
    )) as LedgerView;

    return {
      organizer: raw.organizer,
      eventName: bytes32ToString(raw.event_name),
      totalTickets: raw.total_tickets,
      ticketsIssued: raw.tickets_issued,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  ticketSecret(nonce: bigint): TicketSecret {
    return { contractAddress: this.contractAddress, nonce: bigintToHex(nonce) };
  }

  private async _getOwnPubkey(): Promise<Uint8Array> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const key = await (this.providers.walletProvider as any).shieldedAddress();
      if (key instanceof Uint8Array) return key.slice(0, 32);
      if (typeof key === "string") {
        const clean = key.startsWith("0x") ? key.slice(2) : key;
        const bytes = new Uint8Array(Math.min(32, clean.length / 2));
        for (let i = 0; i < bytes.length; i++)
          bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
        return bytes;
      }
    } catch {
      // wallet provider doesn't expose shielded address — use zero key
    }
    return new Uint8Array(32);
  }
}
