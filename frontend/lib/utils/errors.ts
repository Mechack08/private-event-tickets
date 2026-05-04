/**
 * Maps raw Compact contract assertion messages to user-friendly strings.
 * Keeps the UI decoupled from internal contract error formats.
 */
export function parseContractError(err: unknown, minAge: number): string {
  const raw = err instanceof Error ? err.message : String(err);
  const assertMatch = raw.match(/failed assert:\s*(.+?)(?:\n|$)/i);
  const assertion = assertMatch?.[1]?.trim() ?? null;

  if (assertion) {
    switch (assertion) {
      case "Age requirement not met":
        return `You must be at least ${minAge} years old to attend this event.`;
      case "Invalid birth year":
        return "The date of birth you entered is invalid. Please check and try again.";
      case "Event is sold out":
        return "Sorry, this event is sold out — no tickets remain.";
      case "Event is not active":
        return "Ticket claims are currently paused for this event.";
      case "Event is cancelled":
        return "This event has been cancelled. Tickets can no longer be claimed.";
      default:
        return assertion;
    }
  }

  if (raw.includes("scoped transaction") || raw.includes("failed assert")) {
    return "The transaction was rejected by the contract. Please check your details and try again.";
  }

  return raw;
}
