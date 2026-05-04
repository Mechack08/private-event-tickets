/**
 * Date formatting utilities used across the event UI.
 * All functions are pure and have no side-effects.
 */

export interface BigDate {
  day: string;
  month: string;
  year: number;
  dow: string;
  time: string;
}

/** Returns a compact "3 Jan 2025, 20:00" string. */
export function formatEventDate(d: Date): string {
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

/** Returns the parts needed to render the large date-card cells in the event hero. */
export function formatDateBig(d: Date): BigDate {
  return {
    day:   d.toLocaleDateString("en-GB", { day: "2-digit" }),
    month: d.toLocaleDateString("en-GB", { month: "short" }).toUpperCase(),
    year:  d.getFullYear(),
    dow:   d.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase(),
    time:  d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  };
}
