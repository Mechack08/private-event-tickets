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
}

export interface TicketRequest {
  id: string;
  contractAddress: string;
  eventName: string;
  requesterName: string;
  note: string;
  status: "pending" | "approved" | "rejected";
  /** Set when organizer approves and issues a ticket. */
  secret?: { contractAddress: string; nonce: string };
  requestedAt: string;
  processedAt?: string;
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
  requests: (addr: string) => `mt_req_${addr}`,
  myReqId: (addr: string) => `mt_my_req_${addr}`,
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

// ─── Ticket requests ─────────────────────────────────────────────────────────

export function getEventRequests(contractAddress: string): TicketRequest[] {
  return read<TicketRequest[]>(K.requests(contractAddress), []);
}

export function addRequest(request: TicketRequest): void {
  const list = getEventRequests(request.contractAddress);
  list.unshift(request);
  write(K.requests(request.contractAddress), list);
}

export function updateRequest(
  contractAddress: string,
  id: string,
  updates: Partial<TicketRequest>,
): void {
  const list = getEventRequests(contractAddress);
  const idx = list.findIndex((r) => r.id === id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...updates };
    write(K.requests(contractAddress), list);
  }
}

/** Remember which request ID belongs to the current attendee on this browser. */
export function getMyRequestId(contractAddress: string): string | null {
  return read<string | null>(K.myReqId(contractAddress), null);
}

export function setMyRequestId(contractAddress: string, id: string): void {
  write(K.myReqId(contractAddress), id);
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
