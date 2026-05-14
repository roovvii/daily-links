export type LinkStatus = "todo" | "applied" | "interview" | "rejected" | "offer";

export const STATUS_OPTIONS: LinkStatus[] = ["todo", "applied", "interview", "rejected", "offer"];

export const STATUS_LABEL: Record<LinkStatus, string> = {
  todo: "To do",
  applied: "Applied",
  interview: "Interview",
  rejected: "Rejected",
  offer: "Offer",
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
};
