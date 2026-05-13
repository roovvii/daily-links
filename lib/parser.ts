type Parsed = {
  url: string;
  company: string | null;
  title: string | null;
  source: string | null;
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
  return text
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter((l) => /^https?:\/\//i.test(l));
}
