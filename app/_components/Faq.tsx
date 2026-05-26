"use client";

import { useEffect, useState } from "react";
import type { FaqRow } from "@/lib/types";
import { PROMPT_TEXT } from "./promptText";

// Always-visible quick-copy chips. Each one copies its text to the clipboard
// when clicked, showing a check icon briefly to confirm.
const QUICK_ACTIONS: { key: QuickKey; label: string; text: string }[] = [
  { key: "github", label: "GitHub", text: "https://github.com/roovvii" },
  { key: "portfolio", label: "Portfolio", text: "https://ravipalavai.vercel.app/" },
  { key: "linkedin", label: "LinkedIn", text: "https://www.linkedin.com/in/ravi-palavai/" },
  { key: "email", label: "Email", text: "ravipalavai07@gmail.com" },
  { key: "prompt", label: "Prompt", text: PROMPT_TEXT },
];

type QuickKey = "github" | "portfolio" | "linkedin" | "email" | "prompt";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function FaqCard() {
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/faqs", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!cancelled) setFaqs((data.faqs as FaqRow[]) ?? []);
      } catch {
        /* leave list empty on failure */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function flashCopy(key: string, text: string) {
    const ok = await copyText(text);
    if (!ok) return;
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200);
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    const a = answer.trim();
    if (!q || !a || adding) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/faqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, answer: a }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to add");
        return;
      }
      setFaqs((prev) => [...prev, data.faq as FaqRow]);
      setQuestion("");
      setAnswer("");
      setShowAdd(false);
    } finally {
      setAdding(false);
    }
  }

  async function removeFaq(id: number) {
    if (!confirm("Delete this saved answer?")) return;
    const res = await fetch(`/api/faqs/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setFaqs((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <section className="rounded-md border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium">FAQ &mdash; quick answers</h2>
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((a) => {
          const isCopied = copied === `quick:${a.key}`;
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => flashCopy(`quick:${a.key}`, a.text)}
              title={`Copy ${a.label}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950 dark:hover:bg-neutral-800"
            >
              <QuickIcon name={isCopied ? "check" : a.key} />
              <span>{a.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 border-t border-neutral-100 pt-2 dark:border-neutral-800">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"
            aria-expanded={open}
          >
            <span aria-hidden="true" className="inline-block w-2 text-neutral-400">
              {open ? "▾" : "▸"}
            </span>
            Saved answers
            <span className="text-neutral-400">({faqs.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAdd((v) => !v);
              setOpen(true);
              setError(null);
            }}
            className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            {showAdd ? "Cancel" : "+ Add"}
          </button>
        </div>

        {open && (
          <div className="mt-2 space-y-2">
            {showAdd && (
              <form onSubmit={submitAdd} className="space-y-1.5">
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Question (e.g. Work authorization?)"
                  className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950"
                />
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Answer to copy when filling forms"
                  rows={2}
                  className="w-full resize-y rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-rose-600">{error}</span>
                  <button
                    type="submit"
                    disabled={adding || !question.trim() || !answer.trim()}
                    className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                  >
                    {adding ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>
            )}

            {loading ? (
              <p className="text-xs text-neutral-500">Loading...</p>
            ) : faqs.length === 0 ? (
              <p className="text-xs text-neutral-500">
                No saved answers yet. Use + Add to store copy-pastable answers for application forms.
              </p>
            ) : (
              <ul className="max-h-56 divide-y divide-neutral-100 overflow-y-auto dark:divide-neutral-800">
                {faqs.map((f) => (
                  <FaqItem
                    key={f.id}
                    faq={f}
                    copied={copied === `faq:${f.id}`}
                    onCopy={() => flashCopy(`faq:${f.id}`, f.answer)}
                    onDelete={() => removeFaq(f.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function FaqItem({
  faq,
  copied,
  onCopy,
  onDelete,
}: {
  faq: FaqRow;
  copied: boolean;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <li className="py-2">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          title="Show / hide answer"
          className="min-w-0 flex-1 text-left text-xs font-medium hover:underline"
        >
          {faq.question}
        </button>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 rounded border border-neutral-300 px-2 py-0.5 text-[11px] font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="Delete"
          className="shrink-0 text-sm leading-none text-neutral-400 hover:text-rose-600"
        >
          &times;
        </button>
      </div>
      {show && (
        <p className="mt-1 whitespace-pre-wrap rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-neutral-300">
          {faq.answer}
        </p>
      )}
    </li>
  );
}

// Inline SVG icons so the FAQ chips show a recognizable mark next to each
// label without adding an icon library. Kept tiny (14px) to match the chip
// type size.
function QuickIcon({ name }: { name: QuickKey | "check" }) {
  const cls = "h-3.5 w-3.5 shrink-0";
  switch (name) {
    case "github":
      return (
        <svg viewBox="0 0 16 16" fill="currentColor" className={cls} aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
      );
    case "portfolio":
      return (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className={cls} aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" />
          <path d="M1.5 8h13" />
          <path d="M8 1.5c2 2 2 11 0 13" />
          <path d="M8 1.5c-2 2-2 11 0 13" />
        </svg>
      );
    case "linkedin":
      return (
        <svg viewBox="0 0 16 16" fill="currentColor" className={cls} aria-hidden="true">
          <path d="M13.632 13.635h-2.37V9.922c0-.886-.018-2.025-1.234-2.025-1.235 0-1.424.964-1.424 1.96v3.778h-2.37V6h2.275v1.04h.032c.317-.6 1.09-1.233 2.244-1.233 2.4 0 2.846 1.58 2.846 3.635v4.193zM3.558 4.96a1.375 1.375 0 11.001-2.75 1.375 1.375 0 010 2.75zm1.184 8.675h-2.37V6h2.37v7.635zM14.816 0H1.18C.528 0 0 .516 0 1.153v13.694C0 15.484.528 16 1.18 16h13.635c.652 0 1.185-.516 1.185-1.153V1.153C16 .516 15.467 0 14.815 0z" />
        </svg>
      );
    case "email":
      return (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className={cls} aria-hidden="true">
          <rect x="1.5" y="3" width="13" height="10" rx="1" />
          <path d="M1.5 4l6.5 5 6.5-5" />
        </svg>
      );
    case "prompt":
      return (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className={cls} aria-hidden="true">
          <path d="M4 1.5h5l3 3v9a.5.5 0 01-.5.5h-7.5a.5.5 0 01-.5-.5v-12a.5.5 0 01.5-.5z" />
          <path d="M9 1.5v3h3" />
          <path d="M5.5 8h5M5.5 10h5M5.5 12h3" />
        </svg>
      );
    case "check":
      return (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} className={cls} aria-hidden="true">
          <path d="M3 8l3.5 3.5L13 5" />
        </svg>
      );
    default:
      return null;
  }
}
