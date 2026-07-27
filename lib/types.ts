export type LinkStatus = "todo" | "applied" | "dropped";

export const STATUS_OPTIONS: LinkStatus[] = ["todo", "applied", "dropped"];

export const STATUS_LABEL: Record<LinkStatus, string> = {
  todo: "To do",
  applied: "Applied",
  dropped: "Dropped",
};

export type EventType =
  | "added"
  | "applied"
  | "flagged"
  | "reviewed"
  | "snoozed"
  | "unsnoozed"
  | "commented"
  | "dropped"
  | "restored"
  | "deleted";

export type EventSession = {
  role: string;
  type: EventType;
  count: number;
  start_at: string;
  end_at: string;
};

// Sponsorship signal for a posting, normalized from whatever the pasted
// "Visa:" line said (emoji, free text, or nothing at all) so it can be
// filtered on. The original wording is kept in visa_text for display.
export type VisaBucket = "yes" | "maybe" | "no" | "unknown";

export const VISA_LABEL: Record<VisaBucket, string> = {
  yes: "Sponsors",
  maybe: "Maybe",
  no: "No sponsorship",
  unknown: "Unknown",
};

export type FaqRow = {
  id: number;
  question: string;
  answer: string;
  created_at: string;
};

export type LinkRow = {
  id: number;
  url: string;
  company: string | null;
  title: string | null;
  source: string | null;
  status: LinkStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  needs_review: boolean;
  review_note: string | null;
  review_images: string[] | null;
  review_flagged_at: string | null;
  snoozed_until: string | null;
  // Posting details captured from a pasted block (see lib/parser.ts).
  // min_years / max_years are the numeric read of experience_text and are
  // what the experience filter compares against; either can be null when
  // the posting says something unparseable like "Varies".
  experience_text: string | null;
  min_years: number | null;
  max_years: number | null;
  visa: VisaBucket;
  visa_text: string | null;
  // Any other "Key: value" lines in the pasted block, kept verbatim so
  // extra fields survive without a schema change.
  meta: Record<string, string> | null;
};
