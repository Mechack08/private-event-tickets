/**
 * event-tickets.test.ts
 *
 * Simulation-level tests for the event-tickets Compact smart contract.
 *
 * These tests run entirely in Node.js using the compact-runtime WASM simulator.
 * No Midnight node, no proof server, and no wallet are required.
 *
 * The approach:
 *   1. Instantiate a `Contract` with controlled witnesses (in-memory scalars).
 *   2. Call circuits directly via `contract.circuits.<name>(ctx, ...args)`.
 *   3. Read ledger state via the generated `ledger()` helper after each call.
 *   4. Assert guard conditions by expecting `CompactError` throws.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createCircuitContext,
  createConstructorContext,
  ChargedState,
} from "@midnight-ntwrk/compact-runtime";
import {
  dummyContractAddress,
  persistentHash,
  CompactTypeField,
} from "@midnight-ntwrk/compact-runtime";

// Generated contract artefacts (pure JS — no ZK keys needed for simulation)
import { Contract, ledger } from "../../generated/contract/index.js";

// ─── Test constants ──────────────────────────────────────────────────────────

/**
 * Dummy CoinPublicKey used for all circuit contexts.
 * The shielded-burn address (all-zeros) is the canonical dummy value.
 */
const DUMMY_CPK = "0".repeat(64);

/**
 * Organizer's private scalar (caller_secret witness value).
 * Arbitrary value — just needs to be a valid Pallas field element.
 */
const ORGANIZER_SECRET = 12345678901234567890n;

/** A different scalar — used as an imposter/unauthorised caller. */
const STRANGER_SECRET = 99999999999999999999n;

/** A delegate secret for grant_delegate tests. */
const DELEGATE_SECRET = 55555555555555555555n;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Encode a plain ASCII string as a 32-byte Uint8Array (zero-padded). */
function toBytes32(s: string): Uint8Array {
  const buf = new Uint8Array(32);
  for (let i = 0; i < Math.min(s.length, 32); i++) buf[i] = s.charCodeAt(i);
  return buf;
}

/** Decode a 32-byte Uint8Array to string (strip trailing zeros). */
function fromBytes32(b: Uint8Array): string {
  let end = b.length;
  while (end > 0 && b[end - 1] === 0) end--;
  return new TextDecoder().decode(b.slice(0, end));
}

/**
 * Build a Contract instance whose witnesses are fixed scalars supplied by the
 * caller.  Both witnesses return `[privateState, value]` — the contract uses
 * no private state so we just echo the unchanged empty object back.
 */
function makeContract(
  callerSecret: bigint,
  ticketNonce: bigint = 0n,
): Contract<unknown> {
  return new Contract<unknown>({
    caller_secret: (ctx) => [ctx.privateState, callerSecret],
    ticket_nonce: (ctx) => [ctx.privateState, ticketNonce],
  });
}

/**
 * Compute `persistentHash(scalar)` — the same one-way function the contract
 * uses to commit to caller_secret and ticket_nonce values.
 */
function hashScalar(scalar: bigint): Uint8Array {
  return persistentHash(CompactTypeField, scalar);
}

/**
 * Create the zero-th (initial) ChargedState for a fresh contract deployment.
 * Uses `createConstructorContext` which bundles privateState + empty Zswap.
 */
function freshState(): ChargedState {
  // Any contract instance works for initialState() — witnesses aren't called
  const c = makeContract(0n, 0n);
  const ctx = createConstructorContext({}, DUMMY_CPK);
  const { currentContractState } = c.initialState(ctx);
  return currentContractState.data;
}

/**
 * Create a CircuitContext from a ChargedState.
 * privateState is always an empty object since this contract stores nothing
 * privately outside the ledger.
 */
function makeCtx(state: ChargedState): ReturnType<typeof createCircuitContext> {
  return createCircuitContext(dummyContractAddress(), DUMMY_CPK, state, {});
}

/**
 * Run a circuit and return the updated ChargedState.
 * The circuit returns the shallow-copy context; we extract the new state from
 * there (not from the original `ctx` which is not mutated).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runCircuit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  circuitFn: (ctx: any, ...args: any[]) => { context: any },
  state: ChargedState,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
): ChargedState {
  const ctx = makeCtx(state);
  const result = circuitFn(ctx, ...args);
  // Wrap in a fresh ChargedState (same pattern as generated initialState())
  return new ChargedState(result.context.currentQueryContext.state.state);
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe("event-tickets contract simulation", () => {
  // Shared initial (un-initialised) state — re-created before each suite
  let emptyState: ChargedState;

  beforeEach(() => {
    emptyState = freshState();
  });

  // ── create_event ──────────────────────────────────────────────────────────

  describe("create_event", () => {
    it("stores the event name, total tickets, and sets is_active=true", () => {
      const contract = makeContract(ORGANIZER_SECRET);
      const state = runCircuit(
        contract.circuits.create_event,
        emptyState,
        toBytes32("Midnight Gala"),
        50n,
      );

      const view = ledger(state);
      expect(fromBytes32(view.event_name)).toBe("Midnight Gala");
      expect(view.total_tickets).toBe(50n);
      expect(view.tickets_issued).toBe(0n);
      expect(view.is_active).toBe(true);
      expect(view.is_cancelled).toBe(false);
    });

    it("commits the organizer identity as persistentHash(caller_secret)", () => {
      const contract = makeContract(ORGANIZER_SECRET);
      const state = runCircuit(
        contract.circuits.create_event,
        emptyState,
        toBytes32("Hash Test"),
        10n,
      );

      const view = ledger(state);
      const expectedCommitment = hashScalar(ORGANIZER_SECRET);
      expect(view.organizer).toEqual(expectedCommitment);
    });

    it("sets ticket_price to 0 (free events only in V1)", () => {
      const contract = makeContract(ORGANIZER_SECRET);
      const state = runCircuit(
        contract.circuits.create_event,
        emptyState,
        toBytes32("Free Event"),
        5n,
      );
      expect(ledger(state).ticket_price).toBe(0n);
    });

    it("rejects a second call — 'Event already initialized'", () => {
      const contract = makeContract(ORGANIZER_SECRET);
      const state = runCircuit(
        contract.circuits.create_event,
        emptyState,
        toBytes32("Already Exists"),
        10n,
      );

      const ctx = makeCtx(state);
      expect(() =>
        contract.circuits.create_event(ctx, toBytes32("Another"), 5n),
      ).toThrow("Event already initialized");
    });
  });

  // ── issue_ticket ──────────────────────────────────────────────────────────

  describe("issue_ticket", () => {
    /** Active event state used by most issue_ticket tests. */
    let activeState: ChargedState;

    beforeEach(() => {
      const contract = makeContract(ORGANIZER_SECRET);
      activeState = runCircuit(
        contract.circuits.create_event,
        emptyState,
        toBytes32("Issue Test Event"),
        100n,
      );
    });

    it("increments tickets_issued and stores the nonce commitment on-chain", () => {
      const NONCE = 111111111111111111n;
      const contract = makeContract(ORGANIZER_SECRET, NONCE);
      const state = runCircuit(contract.circuits.issue_ticket, activeState);

      const view = ledger(state);
      expect(view.tickets_issued).toBe(1n);
      const expectedCommitment = hashScalar(NONCE);
      expect(view.ticket_commitments.member(expectedCommitment)).toBe(true);
    });

    it("allows multiple tickets to be issued sequentially", () => {
      let state = activeState;
      for (let i = 1n; i <= 3n; i++) {
        const contract = makeContract(ORGANIZER_SECRET, i * 1000n);
        state = runCircuit(contract.circuits.issue_ticket, state);
      }
      expect(ledger(state).tickets_issued).toBe(3n);
    });

    it("rejects an unauthorised caller — 'Not authorized'", () => {
      // Stranger was NOT the organizer during create_event
      const contract = makeContract(STRANGER_SECRET);
      const ctx = makeCtx(activeState);
      expect(() => contract.circuits.issue_ticket(ctx)).toThrow("Not authorized");
    });

    it("rejects when the event is paused — 'Event is paused'", () => {
      // Pause the event first
      const pauseContract = makeContract(ORGANIZER_SECRET);
      const pausedState = runCircuit(
        pauseContract.circuits.pause_event,
        activeState,
      );

      const issueContract = makeContract(ORGANIZER_SECRET, 42n);
      const ctx = makeCtx(pausedState);
      expect(() => issueContract.circuits.issue_ticket(ctx)).toThrow("Event is paused");
    });

    it("rejects when the event is cancelled — 'Event is cancelled'", () => {
      const cancelContract = makeContract(ORGANIZER_SECRET);
      const cancelledState = runCircuit(
        cancelContract.circuits.cancel_event,
        activeState,
      );

      const issueContract = makeContract(ORGANIZER_SECRET, 42n);
      const ctx = makeCtx(cancelledState);
      expect(() => issueContract.circuits.issue_ticket(ctx)).toThrow("Event is cancelled");
    });

    it("rejects when the event is sold out — 'Event is sold out'", () => {
      // Create a 1-ticket event and issue that ticket
      const c = makeContract(ORGANIZER_SECRET);
      let state = runCircuit(
        c.circuits.create_event,
        emptyState,
        toBytes32("Tiny Event"),
        1n,
      );

      const issueC = makeContract(ORGANIZER_SECRET, 9999n);
      state = runCircuit(issueC.circuits.issue_ticket, state);

      // Second issue should fail
      const issueC2 = makeContract(ORGANIZER_SECRET, 8888n);
      const ctx = makeCtx(state);
      expect(() => issueC2.circuits.issue_ticket(ctx)).toThrow("Event is sold out");
    });
  });

  // ── verify_ticket ─────────────────────────────────────────────────────────

  describe("verify_ticket", () => {
    const TICKET_NONCE = 777777777777n;
    let stateWithTicket: ChargedState;

    beforeEach(() => {
      // Create event + issue exactly one ticket
      const createC = makeContract(ORGANIZER_SECRET);
      const issueC = makeContract(ORGANIZER_SECRET, TICKET_NONCE);

      let state = runCircuit(
        createC.circuits.create_event,
        emptyState,
        toBytes32("Verify Test"),
        10n,
      );
      stateWithTicket = runCircuit(issueC.circuits.issue_ticket, state);
    });

    it("returns true for the valid ticket nonce", () => {
      const verifyC = makeContract(0n, TICKET_NONCE);
      const ctx = makeCtx(stateWithTicket);
      const result = verifyC.circuits.verify_ticket(ctx);
      expect(result.result).toBe(true);
    });

    it("returns false for an unknown nonce", () => {
      const WRONG_NONCE = 999n; // was never issued
      const verifyC = makeContract(0n, WRONG_NONCE);
      const ctx = makeCtx(stateWithTicket);
      const result = verifyC.circuits.verify_ticket(ctx);
      expect(result.result).toBe(false);
    });

    it("confirms each issued ticket independently", () => {
      // Issue a second ticket with a different nonce
      const NONCE_2 = 888888888888n;
      const issueC2 = makeContract(ORGANIZER_SECRET, NONCE_2);
      const stateWithTwo = runCircuit(
        issueC2.circuits.issue_ticket,
        stateWithTicket,
      );

      for (const [nonce, shouldBeValid] of [
        [TICKET_NONCE, true],
        [NONCE_2, true],
        [123n, false],
      ] as [bigint, boolean][]) {
        const c = makeContract(0n, nonce);
        const ctx = makeCtx(stateWithTwo);
        expect(c.circuits.verify_ticket(ctx).result).toBe(shouldBeValid);
      }
    });
  });

  // ── pause_event ───────────────────────────────────────────────────────────

  describe("pause_event", () => {
    let activeState: ChargedState;

    beforeEach(() => {
      const c = makeContract(ORGANIZER_SECRET);
      activeState = runCircuit(
        c.circuits.create_event,
        emptyState,
        toBytes32("Pause Test"),
        10n,
      );
    });

    it("sets is_active=false", () => {
      const c = makeContract(ORGANIZER_SECRET);
      const state = runCircuit(c.circuits.pause_event, activeState);
      expect(ledger(state).is_active).toBe(false);
    });

    it("rejects an unauthorised caller — 'Not authorized'", () => {
      const c = makeContract(STRANGER_SECRET);
      const ctx = makeCtx(activeState);
      expect(() => c.circuits.pause_event(ctx)).toThrow("Not authorized");
    });

    it("rejects on a cancelled event — 'Event is cancelled'", () => {
      const cancelC = makeContract(ORGANIZER_SECRET);
      const cancelledState = runCircuit(cancelC.circuits.cancel_event, activeState);

      const c = makeContract(ORGANIZER_SECRET);
      const ctx = makeCtx(cancelledState);
      expect(() => c.circuits.pause_event(ctx)).toThrow("Event is cancelled");
    });
  });

  // ── resume_event ──────────────────────────────────────────────────────────

  describe("resume_event", () => {
    let pausedState: ChargedState;

    beforeEach(() => {
      const createC = makeContract(ORGANIZER_SECRET);
      const pauseC = makeContract(ORGANIZER_SECRET);
      let state = runCircuit(
        createC.circuits.create_event,
        emptyState,
        toBytes32("Resume Test"),
        10n,
      );
      pausedState = runCircuit(pauseC.circuits.pause_event, state);
      expect(ledger(pausedState).is_active).toBe(false); // sanity
    });

    it("restores is_active=true", () => {
      const c = makeContract(ORGANIZER_SECRET);
      const state = runCircuit(c.circuits.resume_event, pausedState);
      expect(ledger(state).is_active).toBe(true);
    });

    it("rejects an unauthorised caller — 'Not authorized'", () => {
      const c = makeContract(STRANGER_SECRET);
      const ctx = makeCtx(pausedState);
      expect(() => c.circuits.resume_event(ctx)).toThrow("Not authorized");
    });

    it("rejects on a cancelled event — 'Event is cancelled'", () => {
      // Cancel the paused event
      const cancelC = makeContract(ORGANIZER_SECRET);
      const cancelledState = runCircuit(cancelC.circuits.cancel_event, pausedState);

      const c = makeContract(ORGANIZER_SECRET);
      const ctx = makeCtx(cancelledState);
      expect(() => c.circuits.resume_event(ctx)).toThrow("Event is cancelled");
    });
  });

  // ── cancel_event ──────────────────────────────────────────────────────────

  describe("cancel_event", () => {
    let activeState: ChargedState;

    beforeEach(() => {
      const c = makeContract(ORGANIZER_SECRET);
      activeState = runCircuit(
        c.circuits.create_event,
        emptyState,
        toBytes32("Cancel Test"),
        10n,
      );
    });

    it("sets is_cancelled=true and is_active=false", () => {
      const c = makeContract(ORGANIZER_SECRET);
      const state = runCircuit(c.circuits.cancel_event, activeState);
      const view = ledger(state);
      expect(view.is_cancelled).toBe(true);
      expect(view.is_active).toBe(false);
    });

    it("also works from a paused state", () => {
      const pauseC = makeContract(ORGANIZER_SECRET);
      const pausedState = runCircuit(pauseC.circuits.pause_event, activeState);

      const cancelC = makeContract(ORGANIZER_SECRET);
      const state = runCircuit(cancelC.circuits.cancel_event, pausedState);
      expect(ledger(state).is_cancelled).toBe(true);
    });

    it("rejects an unauthorised caller — 'Not authorized'", () => {
      const c = makeContract(STRANGER_SECRET);
      const ctx = makeCtx(activeState);
      expect(() => c.circuits.cancel_event(ctx)).toThrow("Not authorized");
    });

    it("blocks issue / pause / resume / grant_delegate after cancellation", () => {
      const cancelC = makeContract(ORGANIZER_SECRET);
      const cancelledState = runCircuit(cancelC.circuits.cancel_event, activeState);

      // These circuits all assert !is_cancelled and should throw
      for (const circuitName of [
        "issue_ticket",
        "pause_event",
        "resume_event",
        "grant_delegate",
      ] as const) {
        const c = makeContract(ORGANIZER_SECRET, 1n);
        const ctx = makeCtx(cancelledState);
        expect(() => c.circuits[circuitName](ctx)).toThrow("Event is cancelled");
      }
    });

    it("cancel_event is idempotent — calling it twice does not throw", () => {
      // The contract has no !is_cancelled guard in cancel_event itself —
      // cancelling an already-cancelled event is a no-op.
      const cancelC = makeContract(ORGANIZER_SECRET);
      const cancelledState = runCircuit(cancelC.circuits.cancel_event, activeState);

      const cancelC2 = makeContract(ORGANIZER_SECRET);
      const ctx = makeCtx(cancelledState);
      expect(() => cancelC2.circuits.cancel_event(ctx)).not.toThrow();
      expect(ledger(cancelledState).is_cancelled).toBe(true);
    });
  });

  // ── grant_delegate ────────────────────────────────────────────────────────

  describe("grant_delegate", () => {
    let activeState: ChargedState;

    beforeEach(() => {
      const c = makeContract(ORGANIZER_SECRET);
      activeState = runCircuit(
        c.circuits.create_event,
        emptyState,
        toBytes32("Delegate Test"),
        20n,
      );
    });

    it("adds the delegate hash to the on-chain delegates Set", () => {
      const c = makeContract(ORGANIZER_SECRET, DELEGATE_SECRET);
      const state = runCircuit(c.circuits.grant_delegate, activeState);

      const view = ledger(state);
      const delegateHash = hashScalar(DELEGATE_SECRET);
      expect(view.delegates.member(delegateHash)).toBe(true);
    });

    it("allows the delegate to issue tickets", () => {
      // Grant delegate
      const grantC = makeContract(ORGANIZER_SECRET, DELEGATE_SECRET);
      const stateWithDelegate = runCircuit(
        grantC.circuits.grant_delegate,
        activeState,
      );

      // Delegate issues a ticket
      const NONCE = 424242424242n;
      const issueC = makeContract(DELEGATE_SECRET, NONCE);
      const finalState = runCircuit(issueC.circuits.issue_ticket, stateWithDelegate);

      const view = ledger(finalState);
      expect(view.tickets_issued).toBe(1n);
      expect(view.ticket_commitments.member(hashScalar(NONCE))).toBe(true);
    });

    it("rejects a non-organizer trying to grant delegate access", () => {
      // Stranger is NOT the organizer — should fail
      const c = makeContract(STRANGER_SECRET, DELEGATE_SECRET);
      const ctx = makeCtx(activeState);
      expect(() => c.circuits.grant_delegate(ctx)).toThrow(
        "Only the organizer can grant delegate access",
      );
    });

    it("rejects on a cancelled event — 'Event is cancelled'", () => {
      const cancelC = makeContract(ORGANIZER_SECRET);
      const cancelledState = runCircuit(cancelC.circuits.cancel_event, activeState);

      const c = makeContract(ORGANIZER_SECRET, DELEGATE_SECRET);
      const ctx = makeCtx(cancelledState);
      expect(() => c.circuits.grant_delegate(ctx)).toThrow("Event is cancelled");
    });

    it("multiple delegates can be granted independently", () => {
      const DELEGATE_2 = 66666666666666666666n;
      let state = activeState;

      // Grant delegate 1
      state = runCircuit(
        makeContract(ORGANIZER_SECRET, DELEGATE_SECRET).circuits.grant_delegate,
        state,
      );
      // Grant delegate 2
      state = runCircuit(
        makeContract(ORGANIZER_SECRET, DELEGATE_2).circuits.grant_delegate,
        state,
      );

      const view = ledger(state);
      expect(view.delegates.member(hashScalar(DELEGATE_SECRET))).toBe(true);
      expect(view.delegates.member(hashScalar(DELEGATE_2))).toBe(true);
    });
  });

  // ── cross-circuit invariants ───────────────────────────────────────────────

  describe("invariants", () => {
    it("ticket_commitments set grows with each issued ticket", () => {
      const createC = makeContract(ORGANIZER_SECRET);
      let state = runCircuit(
        createC.circuits.create_event,
        emptyState,
        toBytes32("Invariant Test"),
        10n,
      );

      for (let i = 1n; i <= 5n; i++) {
        state = runCircuit(
          makeContract(ORGANIZER_SECRET, i).circuits.issue_ticket,
          state,
        );
        expect(ledger(state).ticket_commitments.size()).toBe(i);
      }
    });

    it("issued nonce commitments are unique in the set", () => {
      const createC = makeContract(ORGANIZER_SECRET);
      let state = runCircuit(
        createC.circuits.create_event,
        emptyState,
        toBytes32("Unique Nonces"),
        10n,
      );

      const nonces = [111n, 222n, 333n];
      for (const n of nonces) {
        state = runCircuit(
          makeContract(ORGANIZER_SECRET, n).circuits.issue_ticket,
          state,
        );
      }

      const view = ledger(state);
      for (const n of nonces) {
        expect(view.ticket_commitments.member(hashScalar(n))).toBe(true);
      }
      // Unknown nonce is not in the set
      expect(view.ticket_commitments.member(hashScalar(999n))).toBe(false);
    });

    it("pause → resume cycle restores full issuance capability", () => {
      const createC = makeContract(ORGANIZER_SECRET);
      let state = runCircuit(
        createC.circuits.create_event,
        emptyState,
        toBytes32("Cycle Test"),
        5n,
      );

      // Issue, pause, resume, issue again — all should work
      state = runCircuit(makeContract(ORGANIZER_SECRET, 1n).circuits.issue_ticket, state);
      state = runCircuit(makeContract(ORGANIZER_SECRET).circuits.pause_event, state);
      state = runCircuit(makeContract(ORGANIZER_SECRET).circuits.resume_event, state);
      state = runCircuit(makeContract(ORGANIZER_SECRET, 2n).circuits.issue_ticket, state);

      expect(ledger(state).tickets_issued).toBe(2n);
      expect(ledger(state).is_active).toBe(true);
    });
  });
});
