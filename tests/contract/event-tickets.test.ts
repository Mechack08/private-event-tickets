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

/**
 * "Today" (current year) used throughout tests.
 * Used as the `current_year: Uint<16>` public parameter for claim_ticket.
 */
const TODAY = 2025n;

/**
 * Birth year for an "adult" attendee: 1995 (~30 years old in 2025).
 */
const DOB_ADULT = 1995n;

/**
 * Birth year for a "minor" attendee: 2015 (~10 years old in 2025).
 */
const DOB_MINOR = 2015n;

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
 * caller.  All witnesses return `[privateState, value]` — the contract uses
 * no private state so we just echo the unchanged empty object back.
 */
function makeContract(
  callerSecret: bigint,
  ticketNonce: bigint = 0n,
  birthYear: bigint = DOB_ADULT,
): Contract<unknown> {
  return new Contract<unknown>({
    caller_secret: (ctx) => [ctx.privateState, callerSecret],
    ticket_nonce:  (ctx) => [ctx.privateState, ticketNonce],
    birth_year:    (ctx) => [ctx.privateState, birthYear],
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
    it("stores event name, total tickets, min_age, and sets is_active=true", () => {
      const contract = makeContract(ORGANIZER_SECRET);
      const state = runCircuit(
        contract.circuits.create_event,
        emptyState,
        toBytes32("Midnight Gala"),
        50n,
        18n,
      );

      const view = ledger(state);
      expect(fromBytes32(view.event_name)).toBe("Midnight Gala");
      expect(view.total_tickets).toBe(50n);
      expect(view.min_age).toBe(18n);
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
        0n,
      );

      const view = ledger(state);
      const expectedCommitment = hashScalar(ORGANIZER_SECRET);
      expect(view.organizer).toEqual(expectedCommitment);
    });

    it("min_age=0 means no restriction (free for all)", () => {
      const contract = makeContract(ORGANIZER_SECRET);
      const state = runCircuit(
        contract.circuits.create_event,
        emptyState,
        toBytes32("Open Event"),
        5n,
        0n,
      );
      expect(ledger(state).min_age).toBe(0n);
    });

    it("rejects a second call — 'Event already initialized'", () => {
      const contract = makeContract(ORGANIZER_SECRET);
      const state = runCircuit(
        contract.circuits.create_event,
        emptyState,
        toBytes32("Already Exists"),
        10n,
        0n,
      );

      const ctx = makeCtx(state);
      expect(() =>
        contract.circuits.create_event(ctx, toBytes32("Another"), 5n, 0n),
      ).toThrow("Event already initialized");
    });
  });

  // ── claim_ticket ──────────────────────────────────────────────────────────

  describe("claim_ticket", () => {
    /** Active no-restriction event state used by most claim_ticket tests. */
    let activeState: ChargedState;

    beforeEach(() => {
      const contract = makeContract(ORGANIZER_SECRET);
      activeState = runCircuit(
        contract.circuits.create_event,
        emptyState,
        toBytes32("Claim Test Event"),
        100n,
        0n, // no age restriction
      );
    });

    it("increments tickets_issued and stores the nonce commitment on-chain", () => {
      const NONCE = 111111111111111111n;
      const contract = makeContract(ORGANIZER_SECRET, NONCE, DOB_ADULT);
      const state = runCircuit(contract.circuits.claim_ticket, activeState, TODAY);

      const view = ledger(state);
      expect(view.tickets_issued).toBe(1n);
      const expectedCommitment = hashScalar(NONCE);
      expect(view.ticket_commitments.member(expectedCommitment)).toBe(true);
    });

    it("allows multiple tickets to be claimed sequentially", () => {
      let state = activeState;
      for (let i = 1n; i <= 3n; i++) {
        const contract = makeContract(ORGANIZER_SECRET, i * 1000n, DOB_ADULT);
        state = runCircuit(contract.circuits.claim_ticket, state, TODAY);
      }
      expect(ledger(state).tickets_issued).toBe(3n);
    });

    it("passes age check when attendee meets minimum age (18+)", () => {
      // Create an 18+ event
      const createC = makeContract(ORGANIZER_SECRET);
      const ageRestrictedState = runCircuit(
        createC.circuits.create_event,
        emptyState,
        toBytes32("18+ Event"),
        50n,
        18n,
      );

      // 30-year-old attendee should pass
      const NONCE = 222222222222n;
      const claimC = makeContract(ORGANIZER_SECRET, NONCE, DOB_ADULT);
      const state = runCircuit(claimC.circuits.claim_ticket, ageRestrictedState, TODAY);
      expect(ledger(state).tickets_issued).toBe(1n);
    });

    it("rejects underage attendee — 'Age requirement not met'", () => {
      // Create an 18+ event
      const createC = makeContract(ORGANIZER_SECRET);
      const ageRestrictedState = runCircuit(
        createC.circuits.create_event,
        emptyState,
        toBytes32("18+ Event"),
        50n,
        18n,
      );

      // 10-year-old attendee should fail
      const claimC = makeContract(ORGANIZER_SECRET, 333333333333n, DOB_MINOR);
      const ctx = makeCtx(ageRestrictedState);
      expect(() =>
        claimC.circuits.claim_ticket(ctx, TODAY),
      ).toThrow("Age requirement not met");
    });

    it("rejects a future birth year — 'Invalid birth year'", () => {
      const FUTURE_YEAR = TODAY + 1n; // next year
      const claimC = makeContract(ORGANIZER_SECRET, 444444444444n, FUTURE_YEAR);
      const ctx = makeCtx(activeState);
      expect(() =>
        claimC.circuits.claim_ticket(ctx, TODAY),
      ).toThrow("Invalid birth year");
    });

    it("rejects when the event is paused — 'Event is not active'", () => {
      const pauseContract = makeContract(ORGANIZER_SECRET);
      const pausedState = runCircuit(pauseContract.circuits.pause_event, activeState);

      const claimContract = makeContract(ORGANIZER_SECRET, 42n, DOB_ADULT);
      const ctx = makeCtx(pausedState);
      expect(() => claimContract.circuits.claim_ticket(ctx, TODAY)).toThrow("Event is not active");
    });

    it("rejects when the event is cancelled — 'Event is cancelled'", () => {
      const cancelContract = makeContract(ORGANIZER_SECRET);
      const cancelledState = runCircuit(cancelContract.circuits.cancel_event, activeState);

      const claimContract = makeContract(ORGANIZER_SECRET, 42n, DOB_ADULT);
      const ctx = makeCtx(cancelledState);
      expect(() => claimContract.circuits.claim_ticket(ctx, TODAY)).toThrow("Event is cancelled");
    });

    it("rejects when the event is sold out — 'Event is sold out'", () => {
      // Create a 1-ticket event and claim that ticket
      const createC = makeContract(ORGANIZER_SECRET);
      let state = runCircuit(
        createC.circuits.create_event,
        emptyState,
        toBytes32("Tiny Event"),
        1n,
        0n,
      );

      const claimC = makeContract(ORGANIZER_SECRET, 9999n, DOB_ADULT);
      state = runCircuit(claimC.circuits.claim_ticket, state, TODAY);

      // Second claim should fail
      const claimC2 = makeContract(ORGANIZER_SECRET, 8888n, DOB_ADULT);
      const ctx = makeCtx(state);
      expect(() => claimC2.circuits.claim_ticket(ctx, TODAY)).toThrow("Event is sold out");
    });
  });

  // ── admit_ticket ──────────────────────────────────────────────────────────

  describe("admit_ticket", () => {
    const TICKET_NONCE = 555555555555n;
    let stateWithTicket: ChargedState;

    beforeEach(() => {
      const createC = makeContract(ORGANIZER_SECRET);
      let state = runCircuit(
        createC.circuits.create_event,
        emptyState,
        toBytes32("Admit Test"),
        10n,
        0n,
      );
      const claimC = makeContract(ORGANIZER_SECRET, TICKET_NONCE, DOB_ADULT);
      stateWithTicket = runCircuit(claimC.circuits.claim_ticket, state, TODAY);
    });

    it("organizer can admit a valid ticket — inserts into used_tickets", () => {
      const admitC = makeContract(ORGANIZER_SECRET, TICKET_NONCE);
      const state = runCircuit(admitC.circuits.admit_ticket, stateWithTicket);

      const commitment = hashScalar(TICKET_NONCE);
      expect(ledger(state).used_tickets.member(commitment)).toBe(true);
    });

    it("rejects an already-used ticket — 'Ticket already used'", () => {
      const admitC = makeContract(ORGANIZER_SECRET, TICKET_NONCE);
      const usedState = runCircuit(admitC.circuits.admit_ticket, stateWithTicket);

      const admitC2 = makeContract(ORGANIZER_SECRET, TICKET_NONCE);
      const ctx = makeCtx(usedState);
      expect(() => admitC2.circuits.admit_ticket(ctx)).toThrow("Ticket already used");
    });

    it("rejects a non-existent ticket — 'Ticket not found'", () => {
      const FAKE_NONCE = 99999999n; // was never claimed
      const admitC = makeContract(ORGANIZER_SECRET, FAKE_NONCE);
      const ctx = makeCtx(stateWithTicket);
      expect(() => admitC.circuits.admit_ticket(ctx)).toThrow("Ticket not found");
    });

    it("rejects an unauthorized caller — 'Not authorized'", () => {
      const admitC = makeContract(STRANGER_SECRET, TICKET_NONCE);
      const ctx = makeCtx(stateWithTicket);
      expect(() => admitC.circuits.admit_ticket(ctx)).toThrow("Not authorized");
    });

    it("delegate can admit a ticket after being granted access", () => {
      // Grant delegate access
      const grantC = makeContract(ORGANIZER_SECRET, DELEGATE_SECRET);
      const stateWithDelegate = runCircuit(
        grantC.circuits.grant_delegate,
        stateWithTicket,
      );

      // Delegate admits the ticket
      const admitC = makeContract(DELEGATE_SECRET, TICKET_NONCE);
      const state = runCircuit(admitC.circuits.admit_ticket, stateWithDelegate);

      const commitment = hashScalar(TICKET_NONCE);
      expect(ledger(state).used_tickets.member(commitment)).toBe(true);
    });
  });

  // ── verify_ticket ─────────────────────────────────────────────────────────

  describe("verify_ticket", () => {
    const TICKET_NONCE = 777777777777n;
    let stateWithTicket: ChargedState;

    beforeEach(() => {
      // Create event + claim exactly one ticket
      const createC = makeContract(ORGANIZER_SECRET);
      const claimC = makeContract(ORGANIZER_SECRET, TICKET_NONCE, DOB_ADULT);

      let state = runCircuit(
        createC.circuits.create_event,
        emptyState,
        toBytes32("Verify Test"),
        10n,
        0n,
      );
      stateWithTicket = runCircuit(claimC.circuits.claim_ticket, state, TODAY);
    });

    it("returns true for a valid unclaimed ticket nonce", () => {
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

    it("returns false for a ticket that has already been admitted", () => {
      // Admit the ticket first
      const admitC = makeContract(ORGANIZER_SECRET, TICKET_NONCE);
      const admittedState = runCircuit(admitC.circuits.admit_ticket, stateWithTicket);

      // verify_ticket should now return false
      const verifyC = makeContract(0n, TICKET_NONCE);
      const ctx = makeCtx(admittedState);
      const result = verifyC.circuits.verify_ticket(ctx);
      expect(result.result).toBe(false);
    });

    it("confirms each claimed ticket independently", () => {
      // Claim a second ticket with a different nonce
      const NONCE_2 = 888888888888n;
      const claimC2 = makeContract(ORGANIZER_SECRET, NONCE_2, DOB_ADULT);
      const stateWithTwo = runCircuit(claimC2.circuits.claim_ticket, stateWithTicket, TODAY);

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
        0n,
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
        0n,
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
        0n,
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

    it("blocks claim / pause / resume / grant_delegate after cancellation", () => {
      const cancelC = makeContract(ORGANIZER_SECRET);
      const cancelledState = runCircuit(cancelC.circuits.cancel_event, activeState);

      // claim_ticket (any caller)
      const claimC = makeContract(ORGANIZER_SECRET, 1n, DOB_ADULT);
      expect(() => claimC.circuits.claim_ticket(makeCtx(cancelledState), TODAY)).toThrow("Event is cancelled");

      // pause_event / resume_event / grant_delegate (organizer)
      for (const circuitName of ["pause_event", "resume_event", "grant_delegate"] as const) {
        const c = makeContract(ORGANIZER_SECRET, 1n);
        const ctx = makeCtx(cancelledState);
        expect(() => c.circuits[circuitName](ctx)).toThrow("Event is cancelled");
      }
    });

    it("cancel_event is idempotent — calling it twice does not throw", () => {
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
        0n,
      );
    });

    it("adds the delegate hash to the on-chain delegates Set", () => {
      const c = makeContract(ORGANIZER_SECRET, DELEGATE_SECRET);
      const state = runCircuit(c.circuits.grant_delegate, activeState);

      const view = ledger(state);
      const delegateHash = hashScalar(DELEGATE_SECRET);
      expect(view.delegates.member(delegateHash)).toBe(true);
    });

    it("allows the delegate to claim tickets on behalf (admit_ticket)", () => {
      // Grant delegate
      const grantC = makeContract(ORGANIZER_SECRET, DELEGATE_SECRET);
      let state = runCircuit(grantC.circuits.grant_delegate, activeState);

      // Claim a ticket first (as organizer)
      const NONCE = 424242424242n;
      const claimC = makeContract(ORGANIZER_SECRET, NONCE, DOB_ADULT);
      state = runCircuit(claimC.circuits.claim_ticket, state, TODAY);

      // Delegate admits the ticket
      const admitC = makeContract(DELEGATE_SECRET, NONCE);
      const finalState = runCircuit(admitC.circuits.admit_ticket, state);

      expect(ledger(finalState).used_tickets.member(hashScalar(NONCE))).toBe(true);
    });

    it("rejects a non-organizer trying to grant delegate access", () => {
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
    it("ticket_commitments set grows with each claimed ticket", () => {
      const createC = makeContract(ORGANIZER_SECRET);
      let state = runCircuit(
        createC.circuits.create_event,
        emptyState,
        toBytes32("Invariant Test"),
        10n,
        0n,
      );

      for (let i = 1n; i <= 5n; i++) {
        state = runCircuit(
          makeContract(ORGANIZER_SECRET, i, DOB_ADULT).circuits.claim_ticket,
          state,
          TODAY,
        );
        expect(ledger(state).ticket_commitments.size()).toBe(i);
      }
    });

    it("used_tickets grows with each admitted ticket and ticket_commitments is unchanged", () => {
      const createC = makeContract(ORGANIZER_SECRET);
      let state = runCircuit(
        createC.circuits.create_event,
        emptyState,
        toBytes32("Used Tickets Test"),
        10n,
        0n,
      );

      const nonces = [111n, 222n, 333n];
      for (const n of nonces) {
        state = runCircuit(
          makeContract(ORGANIZER_SECRET, n, DOB_ADULT).circuits.claim_ticket,
          state,
          TODAY,
        );
      }
      // Admit the first two only
      state = runCircuit(makeContract(ORGANIZER_SECRET, 111n).circuits.admit_ticket, state);
      state = runCircuit(makeContract(ORGANIZER_SECRET, 222n).circuits.admit_ticket, state);

      const view = ledger(state);
      expect(view.ticket_commitments.size()).toBe(3n); // all claimed
      expect(view.used_tickets.size()).toBe(2n);       // only 2 admitted
    });

    it("claimed nonce commitments are unique in the set", () => {
      const createC = makeContract(ORGANIZER_SECRET);
      let state = runCircuit(
        createC.circuits.create_event,
        emptyState,
        toBytes32("Unique Nonces"),
        10n,
        0n,
      );

      const nonces = [111n, 222n, 333n];
      for (const n of nonces) {
        state = runCircuit(
          makeContract(ORGANIZER_SECRET, n, DOB_ADULT).circuits.claim_ticket,
          state,
          TODAY,
        );
      }

      const view = ledger(state);
      for (const n of nonces) {
        expect(view.ticket_commitments.member(hashScalar(n))).toBe(true);
      }
      // Unknown nonce is not in the set
      expect(view.ticket_commitments.member(hashScalar(999n))).toBe(false);
    });

    it("pause → resume cycle restores full claiming capability", () => {
      const createC = makeContract(ORGANIZER_SECRET);
      let state = runCircuit(
        createC.circuits.create_event,
        emptyState,
        toBytes32("Cycle Test"),
        5n,
        0n,
      );

      // Claim, pause, resume, claim again — all should work
      state = runCircuit(makeContract(ORGANIZER_SECRET, 1n, DOB_ADULT).circuits.claim_ticket, state, TODAY);
      state = runCircuit(makeContract(ORGANIZER_SECRET).circuits.pause_event, state);
      state = runCircuit(makeContract(ORGANIZER_SECRET).circuits.resume_event, state);
      state = runCircuit(makeContract(ORGANIZER_SECRET, 2n, DOB_ADULT).circuits.claim_ticket, state, TODAY);

      expect(ledger(state).tickets_issued).toBe(2n);
      expect(ledger(state).is_active).toBe(true);
    });
  });
});

