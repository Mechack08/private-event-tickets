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
  email:  string | null;
  name:   string | null;
}

export const api = {
  auth: {
    /** Exchange a Google ID token (credential) for a backend session. */
    google: (credential: string) =>
      request<BackendUser>("/auth/google", {
        method: "POST",
        body: JSON.stringify({ credential }),
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

  requests: {
    /** Submit a ticket request for an event. */
    create: (data: CreateRequestInput) =>
      request<RequestRecord>("/requests", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    /** Get the calling user's own request for an event (null if none). */
    mine: (contractAddress: string) =>
      request<RequestRecord | null>(
        `/requests/mine/${encodeURIComponent(contractAddress)}`,
      ).catch((err: ApiError) => {
        if (err.status === 404) return null;
        throw err;
      }),

    /** List all requests for an event (organizer only). */
    byEvent: (contractAddress: string) =>
      request<RequestRecord[]>(
        `/requests/event/${encodeURIComponent(contractAddress)}`,
      ),

    /** Approve or reject a request. Supply ticketNonce on approval. */
    update: (id: string, data: UpdateRequestInput) =>
      request<RequestRecord>(`/requests/${id}`, {
        method: "PATCH",
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

export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface RequestRecord {
  id: string;
  requesterName: string;
  note: string | null;
  status: RequestStatus;
  /** Only present (non-null) on your own APPROVED request. */
  ticketNonce: string | null;
  createdAt: string;
  processedAt: string | null;
  requesterId: string;
  eventId: string;
}

export interface CreateRequestInput {
  contractAddress: string;
  requesterName: string;
  note?: string;
}

export interface UpdateRequestInput {
  status: "APPROVED" | "REJECTED";
  ticketNonce?: string;
}
