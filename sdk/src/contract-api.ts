/**
 * contract-api.ts — typed wrapper around the compiled event-tickets contract.
 *
 * ⚠️  SSR WARNING — Never statically import this file in a Next.js page.
 * Always use dynamic import() inside an async function.
 *
 * ─── Witness mechanism ────────────────────────────────────────────────────
 *
 * Two witnesses drive all private inputs:
 *
 *   caller_secret(): Field
 *     The identity scalar of whoever is calling an organizer-gated circuit.
 *     The contract stores persistentHash(caller_secret()) as the organizer
 *     commitment on create_event, and verifies it (or delegate membership)
 *     on all subsequent management circuits.
 *     Value: supplied via EventTicketAPI._callerSecret (set at construction).
 *
 *   ticket_nonce(): Field
 *     A one-time scalar tied to a single ticket.
 *     - In issueTicket()   the SDK auto-generates a fresh random value.
 *     - In verifyTicket()  the attendee supplies their stored nonce.
 *     - In grantDelegate() the organizer generates a random delegate secret;
 *       the circuit hashes it and stores only the hash on-chain.
 *     Value: supplied via EventTicketAPI._pendingTicketNonce.
 */

import type { MidnightProviders } from "@midnight-ntwrk/midnight-js-types";
import type {
  DeployResult,
  EventState,
  GrantDelegateResult,
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
  is_active: boolean;
  is_cancelled: boolean;
  ticket_price: bigint;
  ticket_commitments: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>;
  };
  delegates: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>;
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _module: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _compiledContractClass: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _midnightContracts: { deployContract: any; findDeployedContract: any } | null = null;

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

/**
 * Lazy-load CompiledContract from @midnight-ntwrk/compact-js.
 * The package ships ESM-only — require() does not work.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getCompiledContractClass(): Promise<any> {
  if (_compiledContractClass) return _compiledContractClass;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = await import("@midnight-ntwrk/compact-js") as any;
  _compiledContractClass = mod.CompiledContract;
  if (!_compiledContractClass) {
    throw new Error(
      "@midnight-ntwrk/compact-js did not export CompiledContract. " +
      "Check the installed package version.",
    );
  }
  return _compiledContractClass;
}

/**
 * Lazy-load deployContract / findDeployedContract from midnight-js-contracts
 * via ESM dynamic import (the CJS bundle has a broken compact-js peer path).
 */
async function getMidnightContracts(): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deployContract: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findDeployedContract: any;
}> {
  if (_midnightContracts) return _midnightContracts;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = await import("@midnight-ntwrk/midnight-js-contracts") as any;
  _midnightContracts = {
    deployContract:       mod.deployContract,
    findDeployedContract: mod.findDeployedContract,
  };
  return _midnightContracts!;
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

async function buildCompiledContract(
  getCallerSecret: () => bigint,
  getTicketNonce: () => bigint,
) {
  const [mod, CompiledContract] = await Promise.all([
    getContractModule(),
    getCompiledContractClass(),
  ]);

  const witnesses = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    caller_secret: (context: any): [any, bigint] => [
      context.privateState,
      getCallerSecret(),
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ticket_nonce: (context: any): [any, bigint] => [
      context.privateState,
      getTicketNonce(),
    ],
  };

  // Build: make(tag, ContractClass).pipe(withWitnesses, withCompiledFileAssets)
  // NOTE: make() second arg must be the class (ctor), not an instance.
  //       createContract() internally does `new context.ctor(context.witnesses)`.
  return CompiledContract.make("event-tickets", mod.Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets("/contracts/event-tickets"),
  );
}

// ─── EventTicketAPI ───────────────────────────────────────────────────────

export class EventTicketAPI {
  /**
   * The caller's identity secret.  For the organizer this is generated on
   * deploy() and must be persisted (e.g. localStorage).  For delegates it is
   * the scalar returned by grantDelegate().  For attendees it is unused (0n).
   */
  readonly callerSecret: bigint;

  private _pendingTicketNonce: bigint | null = null;

  private constructor(
    private readonly providers: MidnightProviders,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly _contract: any,
    readonly contractAddress: string,
    callerSecret: bigint,
  ) {
    this.callerSecret = callerSecret;
  }

  private _getTicketNonce(): bigint {
    if (this._pendingTicketNonce === null) {
      this._pendingTicketNonce = randomField();
    }
    return this._pendingTicketNonce;
  }

  // ── Factory: deploy ──────────────────────────────────────────────────────

  /**
   * Deploy a new contract instance.
   *
   * @param callerSecret  Optional organizer identity scalar.  If omitted a
   *                      random one is generated.  **Store the returned
   *                      api.callerSecret** — it is required to call any
   *                      organizer-gated circuit later (issue, pause, cancel…).
   */
  static async deploy(
    providers: MidnightProviders,
    callerSecret?: bigint,
  ): Promise<EventTicketAPI> {
    const secret = callerSecret ?? randomField();
    const api = new EventTicketAPI(providers, null, "", secret);
    const [compiled, { deployContract }] = await Promise.all([
      buildCompiledContract(
        () => api.callerSecret,
        () => api._getTicketNonce(),
      ),
      getMidnightContracts(),
    ]);
    // deployContract returns { deployTxData, callTx, … }; contractAddress lives
    // at deployed.deployTxData.public.contractAddress
    const deployed = await deployContract(providers, { compiledContract: compiled });
    const contractAddress: string = deployed.deployTxData.public.contractAddress;
    console.log(`Contract deployed: ${contractAddress}`);
    return new EventTicketAPI(providers, deployed, contractAddress, secret);
  }

  // ── Factory: join (organizer / delegate) ─────────────────────────────────

  /**
   * Connect to an already-deployed contract as an organizer or delegate.
   *
   * @param callerSecret  The scalar returned by deploy() or grantDelegate().
   */
  static async join(
    providers: MidnightProviders,
    contractAddress: string,
    callerSecret: bigint,
  ): Promise<EventTicketAPI> {
    const api = new EventTicketAPI(providers, null, contractAddress, callerSecret);
    const [compiled, { findDeployedContract }] = await Promise.all([
      buildCompiledContract(
        () => api.callerSecret,
        () => api._getTicketNonce(),
      ),
      getMidnightContracts(),
    ]);
    const found = await findDeployedContract(providers, { compiledContract: compiled, contractAddress });
    return new EventTicketAPI(providers, found, contractAddress, callerSecret);
  }

  // ── Factory: joinAsAttendee ───────────────────────────────────────────────

  /**
   * Connect to an already-deployed contract as a ticket holder.
   * Only verifyTicket() is usable from this instance — all organizer-gated
   * circuits will fail on-chain because callerSecret is 0n.
   */
  static async joinAsAttendee(
    providers: MidnightProviders,
    contractAddress: string,
  ): Promise<EventTicketAPI> {
    return EventTicketAPI.join(providers, contractAddress, 0n);
  }

  // ── Circuit: create_event ────────────────────────────────────────────────

  async createEvent(
    name: string,
    totalTickets: bigint,
  ): Promise<{ txId: string }> {
    const r = await this._contract.callTx.create_event(
      stringToBytes32(name),
      totalTickets,
    );
    return { txId: r.public.txId };
  }

  // ── Circuit: issue_ticket ────────────────────────────────────────────────

  /**
   * Issue one ticket.  Returns the random nonce — share it with the attendee
   * as their ticket secret.  Must be called by organizer or delegate.
   */
  async issueTicket(): Promise<IssueTicketResult> {
    this._pendingTicketNonce = null; // witness auto-generates
    const r = await this._contract.callTx.issue_ticket();
    const nonce = this._pendingTicketNonce;
    this._pendingTicketNonce = null;
    if (nonce === null) throw new Error("Witness did not generate a nonce");
    return { txId: r.public.txId, nonce };
  }

  // ── Circuit: verify_ticket ───────────────────────────────────────────────

  /**
   * Prove ticket ownership.  The holder supplies the nonce from their ticket
   * secret.  Returns verified=true if the commitment is in the on-chain Set.
   */
  async verifyTicket(nonce: bigint): Promise<VerifyTicketResult> {
    this._pendingTicketNonce = nonce;
    const r = await this._contract.callTx.verify_ticket();
    this._pendingTicketNonce = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { txId: r.public.txId, verified: (r as any).private?.result ?? false };
  }

  // ── Circuit: pause_event ─────────────────────────────────────────────────

  /** Temporarily halt ticket issuance.  Organizer or delegate only. */
  async pauseEvent(): Promise<{ txId: string }> {
    const r = await this._contract.callTx.pause_event();
    return { txId: r.public.txId };
  }

  // ── Circuit: resume_event ────────────────────────────────────────────────

  /** Lift a pause.  Organizer or delegate only. */
  async resumeEvent(): Promise<{ txId: string }> {
    const r = await this._contract.callTx.resume_event();
    return { txId: r.public.txId };
  }

  // ── Circuit: cancel_event ────────────────────────────────────────────────

  /** Permanently close the event.  Cannot be undone.  Organizer or delegate only. */
  async cancelEvent(): Promise<{ txId: string }> {
    const r = await this._contract.callTx.cancel_event();
    return { txId: r.public.txId };
  }

  // ── Circuit: grant_delegate ──────────────────────────────────────────────

  /**
   * Add a co-manager.  Organizer only.
   *
   * The SDK generates a random delegate secret, passes it via the ticket_nonce
   * witness so the contract can hash and store it without the raw scalar
   * appearing on-chain.
   *
   * **Share `result.delegateSecret` (hex-encoded) with the co-manager via a
   * secure channel.**  They pass it to EventTicketAPI.join() as callerSecret.
   */
  async grantDelegate(): Promise<GrantDelegateResult> {
    const delegateSecret = randomField();
    this._pendingTicketNonce = delegateSecret;
    const r = await this._contract.callTx.grant_delegate();
    this._pendingTicketNonce = null;
    return { txId: r.public.txId, delegateSecret };
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
      organizer:     raw.organizer,
      eventName:     bytes32ToString(raw.event_name),
      totalTickets:  raw.total_tickets,
      ticketsIssued: raw.tickets_issued,
      isActive:      raw.is_active,
      isCancelled:   raw.is_cancelled,
      ticketPrice:   raw.ticket_price,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  ticketSecret(nonce: bigint): TicketSecret {
    return { contractAddress: this.contractAddress, nonce: bigintToHex(nonce) };
  }

  /** Hex-encode the callerSecret for safe localStorage persistence. */
  callerSecretHex(): string {
    return bigintToHex(this.callerSecret);
  }
}

