// Bid statuses in pipeline order, with a fixed colour each so charts read the same everywhere.
export const STATUS_ORDER = ["lead", "qualifying", "site_visit", "design", "pricing", "offer_sent", "won", "lost", "no_go", "on_hold"] as const;
export const OPEN_STATUSES = ["lead", "qualifying", "site_visit", "design", "pricing", "offer_sent"] as const;

export const STATUS_COLOR: Record<string, string> = {
  lead: "var(--series-7)",
  qualifying: "var(--series-5)",
  site_visit: "var(--series-4)",
  design: "var(--series-8)",
  pricing: "var(--series-2)",
  offer_sent: "var(--series-1)",
  won: "var(--series-3)",
  on_hold: "var(--series-6)",
  lost: "var(--series-other)",
  no_go: "var(--series-other)",
};

export const PHASE_ORDER = ["bid", "design", "construction", "closed"] as const;
export const PHASE_COLOR: Record<string, string> = {
  bid: "var(--series-1)",
  design: "var(--series-5)",
  construction: "var(--series-2)",
  closed: "var(--series-other)",
};
