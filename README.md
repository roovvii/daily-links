# Daily Links

Tiny shared web app for tracking job application links. Paste URLs in bulk, the app
fetches each page and pulls out company/title/source, then displays them as a clean
checklist with a status chip per item. Protected by a single shared password.

## Stack

- Next.js 14 (App Router, TypeScript)
- Tailwind CSS
- Neon Postgres (via Vercel's native Neon integration)
- Deployed on Vercel

## How it works

- One shared password gated by middleware. On login, an HMAC-signed cookie is set.
- Bulk-paste URLs in a textarea. The server fetches each URL, parses OG/twitter
  meta tags plus hostname-specific patterns (Greenhouse, Lever, Ashby, Workday,
  SmartRecruiters, LinkedIn, Indeed, etc.) to extract company and title.
- Postings can be pasted as annotated blocks instead of bare URLs:

  ```
  1. Raymond James
  Role: Senior Front-End Developer (Angular)
  Experience: 5+ Years
  Visa: warning Limited (Case-by-case)
  URL: https://raymondjames.wd1.myworkdayjobs.com/...
  ```

  The numbered heading is the company; `Role`, `Experience`, `Visa`, `Company`
  and `Notes` map to columns; any other `Key: value` line is kept verbatim in
  the `meta` JSONB column and shown in the row's Details panel. Experience is
  read into `min_years` / `max_years` (`5+ Years`, `3-5 Years`, en dashes
  included) and the visa line is normalized to `yes` / `maybe` / `no` /
  `unknown`, keyed off the check / warning / cross emoji first and the wording
  second. Blocks that supply both company and role skip the page fetch.
- The sidebar filter card narrows the list by sponsorship bucket and by whether
  a posting asks for more years than you have (threshold stored per browser),
  and can sort sponsors to the top. In the Active tab, a one-click bulk action
  drops everything above the threshold.
- Each row has a single checkbox: unchecked = active (to do), checked =
  applied (done). Inline edit lets you fix the parsed company/title.
- Duplicate URLs are skipped on add.
- Two roles: `ravi` (admin) and `sreeya` (applier). Each role has its own
  password. The right-sidebar 'Applied today' tile counts applies in each
  role's own timezone (Ravi = America/Chicago, Sreeya = Asia/Kolkata),
  independent of who is viewing. The daily trend chart is bucketed the
  same way.

## Local development

```bash
npm install
cp .env.example .env.local
# Fill in APP_PASSWORD, AUTH_SECRET, and DATABASE_URL
npm run db:init
npm run dev
```

`AUTH_SECRET` should be a long random string. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Deploying to Vercel

1. Push this repo to GitHub.
2. Create a new project on Vercel pointing at the repo.
3. In the project's **Storage** tab, create a new **Neon Postgres** database and
   connect it to the project. Vercel will inject `DATABASE_URL` automatically.
4. In **Settings -> Environment Variables**, add:
   - `APP_PASSWORD` (the shared password)
   - `AUTH_SECRET` (a long random hex string)
5. Trigger a deploy. After the first deploy, run the DB init script once:
   ```bash
   vercel link            # link this directory to the Vercel project
   vercel env pull .env.local
   npm run db:init        # uses the pulled env vars to create the table
   ```
   Or run the SQL from `scripts/init-db.ts` directly in the Neon SQL console.

## Routes

- `GET /` main list (auth-gated)
- `GET /login` password entry
- `POST /api/auth` create session (body: `{ password }`)
- `DELETE /api/auth` sign out
- `GET /api/links` list all links
- `POST /api/links` bulk add (body: `{ text: "url1\nurl2\n..." }`)
- `PATCH /api/links/[id]` update status / notes / company / title / visa
- `DELETE /api/links/[id]` remove a link
- `DELETE /api/links?days=4|7` (ravi only) clear stale active backlog: unapplied
  links posted more than 4 or 7 days ago
- `GET /api/faqs` list saved quick-answers
- `POST /api/faqs` add a quick-answer (body: `{ question, answer }`) — any role
- `DELETE /api/faqs/[id]` remove a quick-answer — any role

## Notes

- Server-side URL fetch has a 6 second timeout. If a site blocks the bot, the
  link still gets added with just a hostname fallback. You can fix the
  company/title with the inline edit.
- The auth cookie lasts 30 days.
- `robots` is set to `noindex, nofollow`.
