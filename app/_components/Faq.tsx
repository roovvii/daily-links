"use client";

import { useEffect, useState } from "react";
import type { FaqRow } from "@/lib/types";

// Pinned links that almost every application form asks for. These are fixed
// (not editable) and always copy the raw URL.
const QUICK_LINKS: { label: string; url: string }[] = [
  { label: "GitHub", url: "https://github.com/roovvii" },
  { label: "Portfolio", url: "https://ravipalavai.vercel.app/" },
  { label: "LinkedIn", url: "https://www.linkedin.com/in/ravi-palavai/" },
];

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function FaqCard({ isAdmin }: { isAdmin: boolean }) {
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
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
    <section className="flex flex-col rounded-md border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium">FAQ &mdash; quick answers</h2>
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              setShowAdd((v) => !v);
              setError(null);
            }}
            className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            {showAdd ? "Cancel" : "+ Add"}
          </button>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {QUICK_LINKS.map((l) => {
          const key = `link:${l.url}`;
          return (
            <button
              key={l.url}
              type="button"
              onClick={() => flashCopy(key, l.url)}
              title={`Copy ${l.url}`}
              className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950 dark:hover:bg-neutral-800"
            >
              {copied === key ? "Copied" : `Copy ${l.label}`}
            </button>
          );
        })}
      </div>

      {isAdmin && showAdd && (
        <form onSubmit={submitAdd} className="mb-3 space-y-1.5">
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
          {isAdmin
            ? "No saved answers yet. Use + Add to store copy-pastable answers for application forms."
            : "No saved answers yet."}
        </p>
      ) : (
        <ul className="max-h-56 divide-y divide-neutral-100 overflow-y-auto dark:divide-neutral-800">
          {faqs.map((f) => (
            <FaqItem
              key={f.id}
              faq={f}
              isAdmin={isAdmin}
              copied={copied === `faq:${f.id}`}
              onCopy={() => flashCopy(`faq:${f.id}`, f.answer)}
              onDelete={() => removeFaq(f.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function FaqItem({
  faq,
  isAdmin,
  copied,
  onCopy,
  onDelete,
}: {
  faq: FaqRow;
  isAdmin: boolean;
  copied: boolean;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-2">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
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
        {isAdmin && (
          <button
            type="button"
            onClick={onDelete}
            title="Delete"
            className="shrink-0 text-sm leading-none text-neutral-400 hover:text-rose-600"
          >
            &times;
          </button>
        )}
      </div>
      {open && (
        <p className="mt-1 whitespace-pre-wrap rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-neutral-300">
          {faq.answer}
        </p>
      )}
    </li>
  );
}
