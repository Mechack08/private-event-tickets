/**
 * api.ts — thin fetch client for the Express backend.
 *
 * All requests include:
 *   credentials: "include"          — sends the session cookie
 *   X-Requested-With: XMLHttpRequest — satisfies the CSRF header check
 */

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

const DEFAULT_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "X-Requested-With": "XMLHttpRequest",
};

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { ...DEFAULT_HEADERS, ...(init.headers as Record<string, string>) },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, (body as { message?: string }).message ?? res.statusText);
  }

  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface BackendUser {
  userId: string;
  shieldedAddress: string;
}

export const api = {
  auth: {
    connect: (shieldedAddress: string) =>
      request<BackendUser>("/auth/connect", {
        method: "POST",
        body: JSON.stringify({ shieldedAddress }),
      }),

    me: () => request<BackendUser>("/auth/me"),

    disconnect: () => request<void>("/auth/disconnect", { method: "POST" }),
  },

  events: {
    list: () =>
      request<EventRecord[]>("/events"),

    byAddress: (contractAddress: string) =>
      request<EventRecord>(`/events/by-address/${encodeURIComponent(contractAddress)}`),

    create: (data: CreateEventInput) =>
      request<EventRecord>("/events", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    update: (id: string, data: Partial<CreateEventInput>) =>
      request<EventRecord>(`/events/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },

  tickets: {
    mine: () => request<TicketRecord[]>("/tickets/mine"),

    byEvent: (eventId: string) =>
      request<TicketRecord[]>(`/tickets/event/${eventId}`),

    issue: (data: IssueTicketInput) =>
      request<TicketRecord>("/tickets", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    verify: (data: VerifyTicketInput) =>
      request<TicketRecord>("/tickets/verify", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
} as const;

// ── API types (mirror backend Prisma models) ──────────────────────────────────

export interface EventRecord {
  id: string;
  contractAddress: string;
  name: string;
  description: string | null;
  location: string | null;
  country: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  startDate: string | null;   // ISO string
  endDate: string | null;     // ISO string
  maxCapacity: number | null;
  ticketPrice: string;        // BigInt serialised as string
  isActive: boolean;
  hostId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEventInput {
  contractAddress: string;
  name: string;
  description: string;
  /** Full formatted address (e.g. from Nominatim). */
  location: string;
  country?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  /** ISO 8601 datetime string. */
  startDate: string;
  /** ISO 8601 datetime string. */
  endDate: string;
  maxCapacity: number;
  ticketPrice?: string;
}

export interface TicketRecord {
  id: string;
  commitment: string;
  isVerified: boolean;
  verifiedAt: string | null;
  eventId: string;
  attendeeId: string;
  createdAt: string;
}

export interface IssueTicketInput {
  commitment: string;
  eventId: string;
}

export interface VerifyTicketInput {
  commitment: string;
  eventId: string;
}
