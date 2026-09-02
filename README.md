# RedGalaxy Studio / NebulaForge Studio — wiki

A game-database site for the studio's Roblox titles, rebuilt on Cloudflare
Workers: a single Worker serves the static frontend and a small JSON API,
backed by D1 (SQLite on the edge). No build step, no framework — plain
HTML/CSS/JS on the frontend, one script on the backend.

## Stack

- **Cloudflare Workers** — hosting for both the static site and the API
- **D1** — accounts, sessions, games, units, shop items, staff, site config
- **Web Crypto (PBKDF2-SHA256)** — password hashing, no external deps
- **Lucide** — icons, loaded from a pinned CDN version (no emoji anywhere)

```
studio-wiki/
├── wrangler.toml          # Worker + D1 + static assets config
├── schema.sql              # table definitions — run once
├── seed.sql                 # games / units / shop items / staff — run once
├── src/index.js            # the whole backend: auth, sessions, JSON API
├── public/
│   ├── index.html           # app shell
│   ├── css/style.css        # all styling
│   └── js/app.js            # router + rendering + API calls
└── scripts/create-account.mjs  # generates an INSERT for a new staff login
```

## First-time setup

```bash
npm install
npx wrangler login

# 1. Create the database and wire it up
npx wrangler d1 create studio_wiki_db
#    → paste the database_id it prints into wrangler.toml

# 2. Load the schema and starter data
npm run db:schema
npm run db:seed

# 3. Deploy
npm run deploy
```

Open the deployed URL. Since the `users` table is empty, you'll land on
**Create the owner account** automatically — that becomes the `owner` login.
That endpoint (`POST /api/auth/setup`) locks itself the moment one account
exists, so it can't be used again later.

To try it locally first: `npm run dev` runs `wrangler dev`, which needs a
local D1 instance — run `npm run db:schema:local` and `npm run db:seed:local`
once before your first `npm run dev`.

## Adding the rest of the staff (Head Admin, Admins, …)

The setup screen only ever creates one account. For everyone else, generate
a password hash locally and insert it yourself — this keeps plaintext
passwords out of shell history on the server side and out of any file in
this repo:

```bash
node scripts/create-account.mjs \
  --username VincentM \
  --email vincent@example.com \
  --name "Vincent Magtolis" \
  --role head_admin \
  --password "choose a strong one"
```

It prints a ready-to-run `wrangler d1 execute ... --command "..."` line —
copy and run it. Valid `--role` values: `owner`, `head_admin`, `admin`,
`member`.

The **Staff / Team** panel in the sidebar is a separate, read-only list
(it's just names + role labels, not logins) — edit it directly:

```bash
npx wrangler d1 execute studio_wiki_db --remote --command \
  "INSERT INTO staff (role_label, name, sort_order) VALUES ('Admin', 'New Person', 5);"
```

## Editing game data

`seed.sql` is written to be safe to re-run — it deletes and re-inserts each
game's units/shop items by slug, so it doubles as a template. To add a new
unit, either add an `INSERT` there and re-run `npm run db:seed`, or run a
one-off `wrangler d1 execute ... --command`. New games just need a row in
`games` — the frontend picks up any game automatically and falls back to a
generic controller icon (edit `GAME_ICONS` in `public/js/app.js` to give a
new slug its own icon).

**Crystal Collecting Simulator** currently has no units seeded — the page
shows an empty state until you add some, the same way as above.

## Mutation multiplier tiers

The original site's "Apply Mutation Multiplier" control only ever showed
"Normal (x1)" in what was provided, so the other tiers in `MUTATION_TIERS`
(`public/js/app.js`) are placeholders — edit that array to match this
game's real mutation system. Changing the selected tier animates every
cost/income figure on the page from its old value to the new one.

## Socials + download link

Both live in `site_config` and are blank until you fill them in:

```bash
npx wrangler d1 execute studio_wiki_db --remote --command \
  "UPDATE site_config SET value = 'https://facebook.com/yourpage' WHERE key = 'social_facebook';"

npx wrangler d1 execute studio_wiki_db --remote --command \
  "UPDATE site_config SET value = 'https://your-download-link' WHERE key = 'download_url';"
```

A social row only renders on the Settings page once its URL is non-empty.

## Security notes

- Passwords are hashed with **PBKDF2-SHA256, 120,000 iterations**, random
  16-byte salt per user (`src/index.js` and `scripts/create-account.mjs`
  share the same parameters — if you change one, change both).
- Sessions are opaque random tokens stored in D1, `HttpOnly` + `SameSite=Lax`
  cookies, 14-day expiry with sliding renewal. `Secure` is only added when
  the request is HTTPS, so `wrangler dev` over plain HTTP still works.
- Login is rate-limited: 8 failed attempts per identifier+IP in a 15-minute
  window returns `429` before touching the password hash.
- **CPU time**: PBKDF2 at 120,000 iterations typically takes longer than the
  Workers **Free** plan's 10ms CPU-time budget per request. Auth routes
  (`/api/auth/login`, `/api/auth/setup`) will likely need the **Workers
  Paid** plan ($5/mo) to run reliably in production. Everything else in
  this app (reading games/staff/config) is cheap and fine on Free.

## What changed from the original

- Login simplified to one identifier field (username **or** email) +
  password, instead of requiring username, email, and password together.
- Passwords are now properly salted + hashed (PBKDF2) instead of whatever
  the previous backend did; sessions are `HttpOnly` cookies rather than
  anything readable by page JS.
- The gear emoji and any other emoji are gone — every icon is Lucide SVG.
- Per-row "Mutation Status" columns (always "Normal (x1)" in the original)
  were dropped in favor of one multiplier control that recalculates every
  cost/income figure live, with a short tween animation.
- Main Page now shows real game cards instead of a single line of text.
- Added: rate-limited login, first-run owner setup flow, a mobile nav
  drawer, a "Desktop layout" account preference, empty states for games
  with no data yet, and toasts for save/copy/sign-out feedback.
