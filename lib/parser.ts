import type { VisaBucket } from "./types";

type Parsed = {
  url: string;
  company: string | null;
  title: string | null;
  source: string | null;
};

// One pasted entry. Either a bare URL on its own line, or a block like:
//
//   1. Raymond James
//   Role: Senior Front-End Developer (Angular)
//   Experience: 5+ Years
//   Visa: ⚠️ Limited (Case-by-case)
//   URL: https://...
//
// Everything except the URL is optional, and unrecognized "Key: value"
// lines are kept in meta rather than dropped.
export type PastedBlock = {
  url: string;
  company: string | null;
  title: string | null;
  notes: string | null;
  experienceText: string | null;
  minYears: number | null;
  maxYears: number | null;
  visa: VisaBucket;
  visaText: string | null;
  meta: Record<string, string> | null;
};

const FETCH_TIMEOUT_MS = 6000;

function cleanText(s: string | undefined | null): string | null {
  if (!s) return null;
  const t = s.replace(/\s+/g, " ").trim();
  return t.length ? t : null;
}

function stripSiteSuffix(title: string): string {
  return title.replace(/\s+[|\-–—]\s+.*$/, "").trim();
}

function getHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function sourceFromHost(host: string | null): string | null {
  if (!host) return null;
  if (host.includes("greenhouse.io")) return "Greenhouse";
  if (host.includes("lever.co")) return "Lever";
  if (host.includes("ashbyhq.com")) return "Ashby";
  if (host.includes("workday")) return "Workday";
  if (host.includes("smartrecruiters.com")) return "SmartRecruiters";
  if (host.includes("linkedin.com")) return "LinkedIn";
  if (host.includes("indeed.com")) return "Indeed";
  if (host.includes("glassdoor")) return "Glassdoor";
  if (host.includes("wellfound.com") || host.includes("angel.co")) return "Wellfound";
  if (host.includes("ycombinator.com")) return "Y Combinator";
  if (host.includes("notion.site")) return "Notion";
  return host;
}

function companyFromUrl(url: string, host: string | null): string | null {
  if (!host) return null;
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").filter(Boolean);
    if (host.includes("greenhouse.io")) {
      // boards.greenhouse.io/{company}/jobs/{id}
      if (segs[0]) return capitalize(segs[0]);
    }
    if (host.includes("lever.co")) {
      // jobs.lever.co/{company}/{id}
      if (segs[0]) return capitalize(segs[0]);
    }
    if (host.includes("ashbyhq.com")) {
      // jobs.ashbyhq.com/{company}/{id}
      if (segs[0]) return capitalize(segs[0]);
    }
    if (host.includes("workday") || host.includes("myworkdayjobs.com")) {
      // {company}.wd1.myworkdayjobs.com/...
      const sub = host.split(".")[0];
      return sub ? capitalize(sub) : null;
    }
    if (host.includes("smartrecruiters.com")) {
      // careers.smartrecruiters.com/{company}/{id}
      const idx = segs.findIndex((s) => s.toLowerCase() === "careers");
      if (idx >= 0 && segs[idx + 1]) return capitalize(segs[idx + 1]);
      if (segs[0]) return capitalize(segs[0]);
    }
    return null;
  } catch {
    return null;
  }
}

function capitalize(s: string): string {
  return s
    .replace(/[-_]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function extractMeta(html: string, key: string, attr: "property" | "name" = "property"): string | null {
  const re = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]*content=["']([^"']+)["']`, "i");
  const m = html.match(re);
  if (m) return cleanText(m[1]);
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*${attr}=["']${key}["']`, "i");
  const m2 = html.match(re2);
  return m2 ? cleanText(m2[1]) : null;
}

function extractTitleTag(html: string): string | null {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  return m ? cleanText(m[1]) : null;
}

async function fetchHtml(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; DailyLinksBot/1.0; +https://github.com/) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function parseLink(rawUrl: string): Promise<Parsed> {
  const url = rawUrl.trim();
  const host = getHost(url);
  const source = sourceFromHost(host);
  const fallbackCompany = companyFromUrl(url, host);

  const html = await fetchHtml(url);
  if (!html) {
    return { url, company: fallbackCompany, title: null, source };
  }

  const ogTitle = extractMeta(html, "og:title");
  const ogSite = extractMeta(html, "og:site_name");
  const twitterTitle = extractMeta(html, "twitter:title", "name");
  const pageTitle = extractTitleTag(html);

  let title = ogTitle || twitterTitle || pageTitle || null;
  if (title) title = stripSiteSuffix(title);

  // Some job boards put "Company - Job Title" or "Job Title at Company" patterns
  let company = ogSite || fallbackCompany;
  if (title && !company) {
    const atMatch = title.match(/^(.*?)\s+(?:at|@)\s+(.+)$/i);
    if (atMatch) {
      title = atMatch[1].trim();
      company = atMatch[2].trim();
    }
  }
  if (title && company) {
    // Strip "Company - " or "Company | " prefix from title
    const escaped = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^${escaped}\\s*[|\\-\\u2013\\u2014:]\\s*`, "i");
    title = title.replace(re, "");
  }

  return { url, company: cleanText(company), title: cleanText(title), source };
}

export async function parseMany(urls: string[]): Promise<Parsed[]> {
  return Promise.all(urls.map((u) => parseLink(u)));
}

export function splitUrls(text: string): string[] {
  return parseBlocks(text).map((b) => b.url);
}

// Derive the source label without fetching the page. Used when a pasted
// block already supplies the company and role, so there's nothing left to
// scrape and the HTTP round-trip can be skipped.
export function sourceForUrl(url: string): string | null {
  return sourceFromHost(getHost(url));
}

const URL_RE = /https?:\/\/[^\s<>"']+/i;
const HEADING_RE = /^\d{1,3}[.)]\s*(.+)$/;
const KEY_VALUE_RE = /^([A-Za-z][A-Za-z0-9 _/&+-]{0,39}):\s*(.*)$/;

function firstUrlIn(line: string): string | null {
  const m = line.match(URL_RE);
  if (!m) return null;
  // Trailing sentence punctuation is never part of the URL. Query strings
  // and fragments (?a=b, #/jobs/123) are left alone.
  return m[0].replace(/[.,;]+$/, "");
}

// Group pasted text into one chunk of lines per posting. A new chunk starts
// at a numbered heading ("1. Raymond James"), at a blank line once the
// current chunk already has its URL, or at a second URL, which is what makes
// a plain list of bare URLs still come out as one entry per line.
function splitBlocks(text: string): string[][] {
  const blocks: string[][] = [];
  let cur: string[] = [];

  const flush = () => {
    if (cur.length) blocks.push(cur);
    cur = [];
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const hasUrl = cur.some((l) => firstUrlIn(l) !== null);
    if (!line) {
      if (hasUrl) flush();
      continue;
    }
    if (HEADING_RE.test(line)) flush();
    else if (hasUrl && firstUrlIn(line)) flush();
    cur.push(line);
  }
  flush();
  return blocks;
}

// Normalize whatever the "Visa:" line said into a filterable bucket. The
// emoji is the strongest signal since that's what the list is annotated
// with; wording is the fallback for lines typed without one.
export function normalizeVisa(raw: string | null | undefined): VisaBucket {
  if (!raw) return "unknown";
  if (raw.includes("❌") || raw.includes("🚫")) return "no";
  if (raw.includes("✅")) return "yes";
  if (raw.includes("⚠")) return "maybe";
  const t = raw.toLowerCase();
  if (
    /\bno\s+(opt|sponsor|visa)|\bnot?\s+sponsor|without sponsorship|citizens?\s+only|clearance|work authorization required|must be authorized/.test(
      t
    )
  )
    return "no";
  if (
    /opt accepted|accepts opt|sponsorship (offered|available|provided)|will sponsor|h-?1b sponsor|sponsors\b/.test(
      t
    )
  )
    return "yes";
  if (/case.?by.?case|check with|depends|limited|varies|possible|maybe/.test(t))
    return "maybe";
  return "unknown";
}

// Read an experience line into numbers. "5+ Years" -> min 5. "3-5 Years" ->
// min 3, max 5 (en/em dashes included). "0-8+ Years" -> min 0, max 8, which
// is right: such a posting is open to juniors. "Varies" -> nothing, and the
// experience filter leaves those alone rather than guessing.
export function parseYears(raw: string | null | undefined): {
  min: number | null;
  max: number | null;
} {
  if (!raw) return { min: null, max: null };
  const t = raw.replace(/[‒-―−]/g, "-");
  const range = t.match(/(\d{1,2})\s*-\s*(\d{1,2})/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  const plus = t.match(/(\d{1,2})\s*\+/);
  if (plus) return { min: Number(plus[1]), max: null };
  const single = t.match(/(\d{1,2})/);
  if (single) return { min: Number(single[1]), max: null };
  return { min: null, max: null };
}

// Which pasted field a "Key:" maps to. Anything not listed here is kept
// verbatim in meta so an unplanned field still shows up on the link.
function fieldForKey(key: string): string | null {
  const k = key.trim().toLowerCase();
  if (/^(url|link|apply|application|posting)$/.test(k)) return "url";
  if (/^(role|title|position|job|job title)$/.test(k)) return "title";
  if (/^(company|employer|org|organization)$/.test(k)) return "company";
  if (/^(experience|exp|yoe|years|years of experience)$/.test(k)) return "experience";
  if (/^(visa|sponsorship|sponsor|work authorization|work auth)$/.test(k)) return "visa";
  if (/^(note|notes|comment|comments)$/.test(k)) return "notes";
  return null;
}

export function parseBlocks(text: string): PastedBlock[] {
  const out: PastedBlock[] = [];

  for (const lines of splitBlocks(text)) {
    let url: string | null = null;
    let company: string | null = null;
    let title: string | null = null;
    let experienceText: string | null = null;
    let visaText: string | null = null;
    const notesLines: string[] = [];
    const meta: Record<string, string> = {};

    for (const line of lines) {
      const heading = line.match(HEADING_RE);
      if (heading) {
        // "1. Raymond James" - the company, unless a Company: line overrides
        // it later. If the heading itself is just a URL, treat it as one.
        const headText = heading[1].trim();
        const headUrl = firstUrlIn(headText);
        if (headUrl) url = url ?? headUrl;
        else if (!company) company = headText;
        continue;
      }
      if (/^https?:\/\//i.test(line)) {
        url = url ?? firstUrlIn(line);
        continue;
      }
      const kv = line.match(KEY_VALUE_RE);
      if (kv) {
        const key = kv[1].trim();
        const value = kv[2].trim();
        if (!value) continue;
        switch (fieldForKey(key)) {
          case "url":
            url = url ?? firstUrlIn(value);
            break;
          case "title":
            title = title ?? value;
            break;
          case "company":
            company = value;
            break;
          case "experience":
            experienceText = experienceText ?? value;
            break;
          case "visa":
            visaText = visaText ?? value;
            break;
          case "notes":
            notesLines.push(value);
            break;
          default:
            meta[key] = value;
        }
        continue;
      }
      // A loose line that isn't a heading, a URL, or a Key: value pair.
      const loose = firstUrlIn(line);
      if (loose) url = url ?? loose;
      else notesLines.push(line);
    }

    if (!url) continue;
    const years = parseYears(experienceText);
    out.push({
      url,
      company,
      title,
      notes: notesLines.length ? notesLines.join("\n") : null,
      experienceText,
      minYears: years.min,
      maxYears: years.max,
      visa: normalizeVisa(visaText),
      visaText,
      meta: Object.keys(meta).length ? meta : null,
    });
  }

  // A URL pasted twice in one go would otherwise hit the DB's unique
  // constraint and report as a duplicate; drop the repeats here instead.
  const seen = new Set<string>();
  return out.filter((b) => {
    if (seen.has(b.url)) return false;
    seen.add(b.url);
    return true;
  });
}
