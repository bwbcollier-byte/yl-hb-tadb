# CLAUDE.md — `yl-hb-tadb` (TheAudioDB enrichment)

Conventions shared across the `yl-hb-*` fleet live in
[`SCRAPER-CLAUDE-TEMPLATE.md`](../SCRAPER-CLAUDE-TEMPLATE.md) — read both.

## ⚠️ READ FIRST: SCHEMA MISMATCH WITH LIVE DB

The `db.js` helpers and `enrich-tadb.js` reference
`talent_profiles` and `social_profiles`. **Those tables don't exist on
the live Supabase project (`oerfmtjpwrefxuitsphl`)** — live uses
`hb_talent` and `hb_socials`. The script likely fails (or no-ops on
cold-cache lookups) the moment it tries to write.

This repo is in the same broken state as `yl-hb-dtp`. Until the schema
mismatch is resolved, treat the workflow as broken:

1. **Rewrite to target `hb_talent` / `hb_socials`** (recommended), or
2. **Retire** if the AudioDB enrichment is now done elsewhere (e.g.
   `yl-hb-bit/hb-media-musicprofiles/src/audiodb-media-enrichment.ts`,
   which writes to current tables).

Confirm which path before editing any code here.

## What this repo does (intent)

Pulls MusicBrainz IDs out of Supabase (legacy `talent_profiles`),
queries TheAudioDB API, and upserts the resulting Facebook / Twitter /
Instagram / website social rows back via `db.upsertSocial()`.

## Stack

**Standard enrichment** variant: plain JS (CommonJS), `axios`,
`@supabase/supabase-js`, `dotenv`. No browser. No `src/` dir — single
script at the root using a `db.js` helper.

## Repo layout

```
enrich-tadb.js                       # entry point
db.js                                # legacy supabase client + upsertSocial helper
package.json
package-lock.json
.github/workflows/
  enrich-tadb.yml
```

## Supabase auth

Standard fleet convention — `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`,
client constructed in `db.js`. The `db.upsertSocial` helper writes to
the legacy `social_profiles` table — see the schema-mismatch notice
above.

## Workflow lifecycle convention

Check `.github/workflows/enrich-tadb.yml` for whether it calls
`log_workflow_run`. If not, retrofit it per the fleet template before
the schema rewrite.

## Tables this repo intends to touch

| Legacy table | Operation | Live equivalent |
|---|---|---|
| `talent_profiles` | SELECT (by `musicbrainz_id`) | `public.hb_talent` |
| `social_profiles` | UPSERT via `db.upsertSocial()` | `public.hb_socials` |

## Running locally

```bash
npm install
cp .env.example .env.local            # if present
# Set: SUPABASE_URL, SUPABASE_SERVICE_KEY, TADB_API_KEY
node enrich-tadb.js
```

## Per-repo gotchas

- **Schema mismatch (see top of file).**
- **Hardcoded fallback `TADB_API_KEY = '925704'`** at the top of
  `enrich-tadb.js`. `925704` is TheAudioDB's free public key —
  intentionally shared, not a secret leak. Still, prefer the env var
  in production.
- **TADB → HB social-type mapping** is in the `TADB_SOCIAL_MAP`
  dictionary near the top of `enrich-tadb.js`. Add new platforms
  there when AudioDB exposes new fields.
- **The `audiodb-media-enrichment.ts` in `yl-hb-bit/hb-media-musicprofiles`**
  is a separate, possibly-canonical AudioDB integration that already
  uses the current `hb_*` schema. Audit which one is the live source
  of truth before either is edited.

## Conventions Claude should follow when editing this repo

- **Don't run this against `oerfmtjpwrefxuitsphl` until the rewrite.**
- **Don't paper over the schema mismatch with column-name alias views**
  — fix the code to write to `hb_*` directly.

## Related repos

- `yl-hb-bit/hb-media-musicprofiles` — newer AudioDB integration
  targeting the current schema.
- `yl-hb-dtp` — same legacy-schema problem, also broken.
- All `hb_*` enrichment siblings (`yl-hb-am`, `yl-hb-imdb`, etc.) are
  the model for what the rewrite should look like.
