---
name: replicate-mini-app
description: Use when onboarding a new restaurant/cafe onto MEVO — creating its own Zalo Mini App, ZaloPay merchant, Zalo OA, database rows, and admin access so it runs on the shared MEVO backend. Also use when asked to check whether MEVO is "ready" for a second store, or when touching any code path keyed by store_id/zalo_mini_app_id.
---

# Replicate MEVO Mini App to a New Restaurant

## Overview

MEVO is **one shared Supabase backend + one shared admin-web deployment**, but **each
restaurant gets its own Zalo Mini App + its own ZaloPay merchant** (Zalo Mini App payment is
bound 1:1 to a Mini App — see `docs/superpowers/specs/2026-06-22-mevo-core-theme-architecture-design.md`).
"Nhân bản" = provision one new restaurant's config across DB, Zalo platform, and a
`zmp deploy`. It is **not** a full second codebase.

**Before you start:** check whether the blockers in "Known blockers" below are still open.
If they are, tell the human up front — don't silently onboard restaurant #2 into a system
where its notifications will go to the wrong OA or its admin can accidentally edit restaurant
#1's menu.

## Known blockers (verify status before promising a clean onboarding)

These were found true as of 2026-07-01. Check current code before trusting this list — it may
be stale.

1. **Operator `store_id` fallback bug (several files in `admin-web/` — grep to get the
   current count, don't trust a hardcoded number here as the codebase changes).** Grep for
   `is_active.*limit(1)` / `LIMIT 1` in `admin-web/app/` and `admin-web/lib/actions/`. Many
   pages fall back to `SELECT * FROM stores WHERE is_active=true LIMIT 1` when the logged-in
   operator's `user_metadata.store_id` is missing. With only 1 active store this is harmless;
   **with 2+ active stores it silently picks whichever store sorts first** — an operator could
   edit the wrong restaurant's menu without any error. Before onboarding restaurant #2:
   confirm every operator account has an explicit `store_id` in both `auth.users.user_metadata`
   and `mevo_operators`, and ideally get this fallback pattern removed/hardened as its own
   small fix first (out of scope for a single onboarding — flag it, don't silently patch 12
   files as a side effect of onboarding one restaurant).
2. **ZNS (Zalo notification) is not per-store.** `supabase/functions/zns-notify/index.ts`
   reads one global secret `ZALO_OA_ACCESS_TOKEN`. A second restaurant's own Zalo OA needs its
   own access token — this function needs a code change (read the token per-store, e.g. a new
   column/table keyed by `store_id`, mirroring how `store_checkout_configs` solved this for
   ZaloPay) before ZNS will send from the correct OA for restaurant #2. Until fixed, either
   restaurant #2 gets no ZNS or gets it from restaurant #1's OA (wrong). Check current status:
   was this already fixed since 2026-07-01? Grep the function for `Deno.env.get`.
3. **`admin-web/app/api/zalo-webhook/route.ts`** (handles `user.revoke.consent`) reads one
   global `ZALO_APP_SECRET_KEY`. If restaurant #2 has its own Zalo Developer App (likely, since
   OA + webhook config live per Zalo App on developers.zalo.me), this route needs the same
   per-store secret treatment. Not yet done as of 2026-07-01 — verify before relying on it.

None of these block onboarding a restaurant that is **cash-only and doesn't need ZNS** — they
only block ZaloPay-with-ZNS restaurants, which per project decision (2026-07-01) is the default
target for all new restaurants going forward. So in practice: **fix or explicitly accept these
gaps before onboarding restaurant #2 for real.**

**What "explicitly accept" means operationally:** there is currently no `stores` column to mark
a restaurant as "ZNS intentionally disabled" — if the human wants to go live before blocker #2/#3
are fixed, that decision has no place to live in the schema yet. Don't invent a flag silently;
surface this gap to the human and let them decide whether to (a) fix the blocker first, (b) add
a real `zns_enabled`-style column as its own small task, or (c) accept degraded behavior
knowingly for now with no DB record of that choice.

## Checklist

### 1. Business prerequisites (human does these, not Claude)
- New Zalo Developer Mini App → own Mini App ID (distinct from any existing restaurant's).
- New Zalo OA (Official Account) → own OA ID + OA access token (for ZNS).
- New ZaloPay merchant tied to that Mini App → Checkout SDK secret ("Private Key" on
  developers.zalo.me → the app → **Checkout SDK → Cấu hình chung**).
- Decide `payment_methods` — default is `{zalopay}` only (cash off) per 2026-06-28 decision;
  only add `cash` if the restaurant explicitly wants it.
- Restaurant info: name, slug (URL-friendly, unique), phone, address, logo, menu
  (categories/items/prices/toppings), table count/names.

### 2. Database rows (Supabase, via MCP `execute_sql` — controller may run directly per
`feedback_apply_sql_via_mcp` memory, no need to ask first for non-secret rows; secrets follow
the same "controller runs it directly, never via subagent transcript" pattern used for
ZaloPay in 2026-07-01)

```sql
-- 0. Sanity check first — slug is free text, easy to collide
select 1 from stores where slug = '<slug>';  -- expect 0 rows before inserting

-- 1. Store row
insert into stores (name, slug, phone, address, logo_url, zalo_oa_id, payment_methods, is_active)
values ('<name>', '<slug>', '<phone>', '<address>', '<logo_url>', '<OA_ID>', array['zalopay']::text[], true)
returning id;

-- 2. ZaloPay checkout config (secret — get value directly from the human, never guess/reuse)
insert into store_checkout_configs (store_id, zalo_mini_app_id, zalo_checkout_secret_key)
values ('<store_id from step 1>', '<NEW_MINI_APP_ID>', '<CHECKOUT_SECRET_KEY>');

-- 3. Tables
insert into tables (store_id, table_number)
values ('<store_id>', 'Bàn 1'), ('<store_id>', 'Bàn 2'), ...;

-- 4. Menu categories + items — via admin-web UI (Quản lý menu) once operator access exists,
--    or SQL if bulk-importing from the restaurant's existing paper menu.
```

Note: `stores.zalopay_app_id/key1/key2` are dead legacy columns (pre-Checkout-SDK schema) —
do not use them, ignore them.

### 3. Admin-web operator access
- Create/reuse a Supabase Auth user, set `user_metadata.store_id = '<new store_id>'`.
- Insert into `mevo_operators (user_id, store_id)` with that same `store_id` (NOT NULL — see
  Known Blocker #1 for why a NULL/super account is currently risky with 2+ stores).
- Log in and verify: menu page, tables page, settings page all show the NEW restaurant, not
  the old one.

### 4. Mini-app build & deploy
Current pattern (as of 2026-07-01): the mini-app resolves its store via `?store=<slug>` QR
param, falling back to `VITE_DEFAULT_STORE_SLUG` env var if absent. There is **no automated
per-store build pipeline** — each restaurant's deploy is a manual, mirrored repeat of Pubu's:
1. Copy `mini-app/.env` → set `VITE_ZALO_APP_ID` / `APP_ID` to the NEW Mini App ID,
   `VITE_DEFAULT_STORE_SLUG` to the new slug. Get `ZMP_TOKEN` via `zmp login` under the
   account that owns the new Mini App.
2. Update `mini-app/app-config.json` → `app.title` to the new restaurant's name (currently
   hardcoded per-deploy, not DB-driven — this is a real per-instance step, not a bug).
3. `cd mini-app && zmp deploy` → select the NEW Mini App, note the version number.
4. Testing env first (`NEXT_PUBLIC_ZALO_ENV=TESTING` equivalents), then submit for Zalo
   review, then clear those flags for Production — same lifecycle as Pubu (see
   `project_pubu_miniapp_deploy` memory for the exact gotchas hit last time).

### 5. QR codes
Once DB rows (step 2) exist: admin-web → **Bàn & QR** → generate/download QR per table. This
now reads the correct Mini App ID per store from `store_checkout_configs` (fixed 2026-07-01,
see `admin-web/app/admin/tables/page.tsx`) — no manual env-var juggling needed. Print and
place at tables.

### 6. Test before calling it done
Follow `TESTING.md` convention — stop, get human PASS confirmation before considering this
onboarding complete. Minimum: place a real order, pay via the new ZaloPay merchant, confirm
kitchen sees it, confirm restaurant #1's kitchen does NOT see it (tenant isolation), confirm
the operator account only ever sees restaurant #2's data.

## Common Mistakes

| Mistake | Why it bites |
|---|---|
| Skipping the operator `store_id` check | Operator silently edits the wrong restaurant (Known Blocker #1) |
| Assuming ZNS "just works" for restaurant #2 | Global OA token means notifications go to the wrong OA or fail (Known Blocker #2) |
| Reusing an existing Mini App / merchant for a "quick" second restaurant | ZaloPay checkout is bound 1:1 to a Mini App — can't share |
| Writing the ZaloPay secret into a migration file or committing it | Insert secrets via direct SQL execution only, same as the 2026-07-01 pattern — never in git |
| Trusting `stores.zalopay_app_id/key1/key2` | Dead columns from the pre-Checkout-SDK schema; real secret lives in `store_checkout_configs` |
