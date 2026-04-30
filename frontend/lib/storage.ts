/**
 * lib/storage.ts — client-side localStorage helpers.
 * All functions are SSR-safe (guarded with typeof window check).
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StoredEvent {
  contractAddress: string;
  eventName: string;
  totalTickets: number;
  txId: string;
  createdAt: string;
  /** Hex-encoded organizer caller_secret — required to manage the event. */
  callerSecretHex: string;
  // ── Off-chain metadata (also stored in backend) ──────────────────────────
  description: string;
  /** Full formatted address. */
  location: string;
  country?: string;
  city?: string;
  /** Decimal coordinates — optional, captured from the map picker. */
  latitude?: number;
  longitude?: number;
  /** ISO 8601 — event start datetime. */
  startDate: string;
  /** ISO 8601 — event end datetime. */
  endDate: string;
  /** Minimum attendee age for this event (0 = no restriction). */
  minAge?: number;
}

export interface SavedTicket {
  id: string;
  contractAddress: string;
  eventName: string;
  secret: { contractAddress: string; nonce: string };
  receivedAt: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full — ignore silently.
  }
}

const K = {
  MY_EVENTS: "mt_my_events",
  MY_TICKETS: "mt_my_tickets",
  callerSecret: (addr: string) => `mt_secret_${addr}`,
} as const;

// ─── Events ───────────────────────────────────────────────────────────────────

export function getMyEvents(): StoredEvent[] {
  return read<StoredEvent[]>(K.MY_EVENTS, []);
}

export function saveEvent(event: StoredEvent): void {
  const list = getMyEvents();
  const idx = list.findIndex((e) => e.contractAddress === event.contractAddress);
  if (idx >= 0) list[idx] = event;
  else list.unshift(event);
  write(K.MY_EVENTS, list);
}

export function getEvent(contractAddress: string): StoredEvent | undefined {
  return getMyEvents().find((e) => e.contractAddress === contractAddress);
}

/**
 * Store the organizer caller_secret separately under its own key so it is
 * never accidentally exposed through the shared event list.
 */
export function saveCallerSecret(contractAddress: string, secretHex: string): void {
  write(K.callerSecret(contractAddress), secretHex);
}

export function getCallerSecret(contractAddress: string): string | null {
  return read<string | null>(K.callerSecret(contractAddress), null);
}

// ─── My tickets ───────────────────────────────────────────────────────────────

export function getMyTickets(): SavedTicket[] {
  return read<SavedTicket[]>(K.MY_TICKETS, []);
}

export function saveTicket(ticket: SavedTicket): void {
  const list = getMyTickets();
  const idx = list.findIndex((t) => t.id === ticket.id);
  if (idx >= 0) list[idx] = ticket;
  else list.unshift(ticket);
  write(K.MY_TICKETS, list);
}

export function removeTicket(id: string): void {
  write(K.MY_TICKETS, getMyTickets().filter((t) => t.id !== id));
}
