---
name: replicate-mini-app
description: Use when onboarding a new restaurant/cafe onto MEVO — creating its own Zalo Mini App, bank-transfer payment (primary; ZaloPay wallet optional/deferred), Zalo OA, database rows, and admin access so it runs on the shared MEVO backend. Also use when asked to check whether MEVO is "ready" for a second store, or when touching any code path keyed by store_id/zalo_mini_app_id.
---

# Replicate MEVO Mini App to a New Restaurant

## Overview

MEVO is **one shared Supabase backend + one shared admin-web deployment**, but **each
restaurant gets its own Zalo Mini App + its own ZaloPay merchant** (Zalo Mini App payment is
bound 1:1 to a Mini App — see `docs/superpowers/specs/2026-06-22-mevo-core-theme-architecture-design.md`).
"Nhân bản" = provision one new restaurant's config across DB (mostly via the `/mevo` internal
cockpit, not raw SQL), Zalo platform, and a `zmp deploy` from its own git worktree.

**Before you start:** re-verify the status in "Formerly known blockers" below with a quick
grep/read — this list may drift out of date as the codebase changes.

## Formerly known blockers — fixed 2026-07-02, verify before trusting

These were real gaps found 2026-07-01 and fixed as part of the Onboarding Cockpit
(`docs/superpowers/plans/2026-07-01-mevo-internal-backend-onboarding-cockpit.md`). Don't take
"fixed" on faith — a quick check costs little and this file can go stale:

1. **Operator `store_id` fallback bug** — fixed. `admin-web/lib/auth/operator.ts`
   (`requireOperator()`/`requireOperatorOrRedirect()`) is now the only way pages/actions get
   `store_id`, reading `mevo_operators.role/store_id`, fail-closed if missing. Verify: grep
   `admin-web/` for `is_active.*limit(1)` — should be zero hits.
2. **RLS was store-blind** (bonus fix beyond the original 3) — `is_store_scoped_operator(store_id)`
   (migration 019) replaced the old `is_operator()` on all `authenticated` policies across
   `stores`/`tables`/`menu_items`/`orders`/etc. Verify: `select policyname, qual from pg_policies
   where qual like '%is_operator()%'` should return only policies for other roles (`anon`,
   `kitchen`), not `authenticated`.
3. **ZNS not per-store** — fixed. `supabase/functions/zns-notify/index.ts` reads
   `store_zalo_configs.zalo_oa_access_token` by `order.store_id`. Verify: grep the function for
   `Deno.env.get('ZALO_OA_ACCESS_TOKEN')` — should be zero hits.
4. **Webhook not per-store** — fixed. Route moved to
   `admin-web/app/api/zalo-webhook/[storeId]/route.ts`, reads `store_zalo_configs.zalo_app_secret_key`
   by the `storeId` in the URL path. **Each restaurant needs its own webhook URL registered on
   its own Zalo Developer Console**: `https://<domain>/api/zalo-webhook/<storeId>`.

If any of these checks fail when you read this, stop and tell the human — don't onboard a 2nd+
restaurant on top of a regression.

## Checklist

### 1. Business prerequisites (human does these, not Claude)
- New Zalo Developer Mini App → own Mini App ID (distinct from any existing restaurant's).
- New Zalo OA (Official Account) → own OA ID + OA access token (for ZNS).
- **Checkout SDK Private Key** (secret) of that Mini App — `developers.zalo.me` → the app →
  **Checkout SDK → Cấu hình chung** (Security Method HmacSHA256 → Private Key). This one secret
  signs/verifies MAC for BOTH bank transfer and the ZaloPay wallet. Also set the **Callback Url**
  there to the shared checkout-notify endpoint (same URL for every store — see below):
  `https://dlkgdpexjtyynbotkwka.supabase.co/functions/v1/checkout-notify`.
- **Chuyển khoản ngân hàng — the PRIMARY payment method (2026-07-08 decision; free, no ZaloPay
  merchant needed):** same app → **Checkout SDK → Phương thức thanh toán → Thêm thanh toán mới →
  Chuyển khoản ngân hàng**. Fill the restaurant's OWN hộ-kinh-doanh bank account (số TK / tên TK /
  ngân hàng) — money lands straight in the restaurant's account, MEVO never touches it.
  **CRITICAL: set this method's `Notify Url` to the SAME checkout-notify URL above.** If it's left
  blank, Zalo never calls back → paid orders stay `pending` forever and the kitchen never sees
  them (this exact bug cost a full debug session 2026-07-08). Then **Kích hoạt** it and drag it to
  the top of the method list so customers see it first.
- **ZaloPay wallet merchant is OPTIONAL / deferred** — merchant registration is more complex and
  charges per-transaction fees; skip it for pilot. The code path already supports the wallet, so
  it can be added later per-store (Momo likewise). See `project_bank_transfer_payment` memory.
- App Secret Key of the new Zalo Developer App (for the `user.revoke.consent` webhook signature).
- Decide `payment_methods` — keep the default `{zalopay}`. This value is an umbrella that covers
  BOTH bank transfer AND the wallet: both flow through `checkout-create-mac`/`checkout-notify` with
  `payment_method='zalopay'`; the bank-vs-wallet choice lives on the Zalo console, NOT in this
  column. Only add `cash` if the restaurant explicitly wants it.

> **How one shared Notify/Callback URL works for every store:** `checkout-notify` reads
> `data.appId` from the callback and maps it → `store_checkout_configs.zalo_mini_app_id` → the
> right store + its secret. So the URL is identical across all restaurants; the Mini App ID in
> the payload routes it. Nothing per-store to change in the URL itself — only the bank account and
> the `store_checkout_configs` row differ.
- Restaurant info: name, slug (URL-friendly, unique), phone, address, logo, menu
  (categories/items/prices/toppings), table count/names.

### 2. Create the store via `/mevo` (not raw SQL anymore)
`/mevo/stores/new` (superadmin only) creates the `stores` row + empty `store_app_configs` row.
Then on `/mevo/stores/<id>`:
- **Thông tin quán**: name/phone/address/`zalo_oa_id`.
- **Giao diện Mini App**: `primary_color` (optional — theme runtime, mini-app reads it live,
  no rebuild needed; see mini-app section below for why the *code* still needs a redeploy per
  store even though the *color* doesn't).
- **ZaloPay Checkout**: `zalo_mini_app_id` + `zalo_checkout_secret_key`.
- **Zalo OA / Webhook**: `zalo_oa_access_token` + `zalo_app_secret_key`.
- **Tài khoản chủ quán**: assign/create the Supabase Auth user → `mevo_operators` row with
  `role='store_owner'`. If a new user is created, the temp password is shown ONCE on screen —
  copy it immediately, it cannot be recovered later (only reset).

Tables and menu still go through the normal `/admin` UI (Bàn & QR, Quản lý menu) once the
operator account can log in — not through `/mevo`.

Sanity check first (slug collisions are still possible — it's free text):
```sql
select 1 from stores where slug = '<slug>';  -- expect 0 rows before creating
```

Note: `stores.zalopay_app_id/key1/key2` were dead legacy columns — **deleted** in migration
022 (2026-07-02). If you see references to them anywhere, that code is stale.

### 3. Mini-app: own worktree per restaurant (not a shared `.env` anymore)

Decision 2026-07-03: each restaurant's mini-app runs from its **own git worktree**
(`mini-app-instances/<slug>/`), not by hand-editing the single shared `mini-app/.env` in place.
Rationale: editing shared `.env`/`app-config.json` in place made local `npm run dev` and
`zmp deploy` error-prone (easy to deploy restaurant B under restaurant A's leftover config) and
made it impossible to run two restaurants' dev servers at once. A worktree gives each restaurant
its own directory (own `.env`, own `app-config.json`, own `node_modules`) while `mini-app/src`
(the actual core code) stays on one shared git history — core fixes merge in via `git merge
origin/main`, not copy-paste.

```bash
scripts/create-mini-app-instance.sh <slug> "<Tên hiển thị>"
# vd: scripts/create-mini-app-instance.sh cang-tin-pubu "Căng tin PUBU"
```

This creates `mini-app-instances/<slug>/` as a worktree on a new local branch `deploy/<slug>`
(branched from `main`), seeds `.env` from `.env.example` and `app-config.json` from
`app-config.example.json` with the display name filled in. The script prints the exact next
steps (fill in real Zalo App ID / Supabase keys in `.env`, `npm install`, `zmp login`).

From then on, for THIS restaurant:
```bash
cd mini-app-instances/<slug>/mini-app
npm run dev       # local test, isolated from other restaurants
npx zmp deploy    # deploys to THIS restaurant's Zalo Mini App only
```

To pull in core code updates made on `main` later:
```bash
cd mini-app-instances/<slug>
git fetch origin && git merge origin/main
```

**Existing restaurant "Phở Gà Pubu"** already has its instance at
`mini-app-instances/pho-ga-pubu/` (created 2026-07-03, migrated from the old shared
`mini-app/.env`) — use that path for any Pubu-specific mini-app work, not the bare `mini-app/`
directory at repo root (that's core source only now, not meant to be deployed directly).

Testing env first (`VITE_APP_ENV=TESTING`-equivalent), then submit for Zalo review, then clear
those flags for Production — same lifecycle as before (see `project_pubu_miniapp_deploy` memory
for the exact gotchas hit last time).

### 4. Zalo webhook registration (per restaurant, easy to forget)
On the NEW restaurant's own Zalo Developer Console → Webhook config, set the URL to:
```
https://<domain>/api/zalo-webhook/<store_id>
```
using the real `store_id` from step 2. This is per-restaurant now (route moved to
`[storeId]` in migration/fix 2026-07-02) — do not reuse another restaurant's webhook URL.

### 5. QR codes
Once the store + `store_checkout_configs` row exist: admin-web → **Bàn & QR** → generate/download
QR per table. Reads the correct Mini App ID per store automatically — no manual env-var
juggling needed. Print and place at tables.

### 6. Test before calling it done
Follow `TESTING.md` convention — stop, get human PASS confirmation before considering this
onboarding complete. Minimum: place a real order and **pay by bank transfer** (a real transfer to
the restaurant's own hộ-kinh-doanh account — money stays with them, ~free to test), then verify:
- the order flips to `status='confirmed'` with `zalopay_trans_id='BANK:…'` (query `orders`),
- the kitchen sees it, and the client UI shows success (not "thất bại" — the client waits for the
  server confirm via `waitForConfirmation`; bank notify lands ~5-7s after the transfer),
- restaurant #1's kitchen does NOT see it (tenant isolation),
- the operator account only ever sees restaurant #2's data (this exact cross-tenant check is
  scripted in `TESTING.md` → "SPRINT — Onboarding Cockpit" → Test 3, reuse that recipe).

If the order stays `pending`/`cancelled` after a real transfer, the bank method's **Notify Url is
almost certainly blank or wrong** on the Zalo console (step 1) — that's the first thing to check.

## Common Mistakes

| Mistake | Why it bites |
|---|---|
| Editing `mini-app/.env` in place for a new restaurant | That's the shared core checkout now — use `scripts/create-mini-app-instance.sh` instead |
| Running `npm run dev`/`zmp deploy` from `mini-app/` directly for a specific restaurant | Use `mini-app-instances/<slug>/mini-app/` — the root `mini-app/` isn't tied to any one restaurant's `.env` anymore |
| Reusing an existing Mini App / merchant for a "quick" second restaurant | ZaloPay checkout is bound 1:1 to a Mini App — can't share |
| Leaving the **bank method's Notify Url blank** on the Zalo console | Zalo never calls `checkout-notify` → paid orders stuck `pending`, kitchen never sees them. The single most likely cause if a real transfer "does nothing" |
| Using a personal bank account instead of the restaurant's hộ-kinh-doanh account | Money must land in the restaurant's own account (MEVO is not a money intermediary — 2026-06-22 decision) |
| Registering a ZaloPay wallet merchant just to "complete" onboarding | Not needed — bank transfer is the primary free method; wallet is deferred/optional (2026-07-08) |
| Reusing another restaurant's Zalo webhook URL | Webhook is per-`storeId` now — each restaurant registers its own URL on its own Zalo Developer Console |
| Writing secrets into a migration file or committing them | Enter secrets through `/mevo` (writes via service_role, never echoed back) — never in git |
| Trusting `stores.zalopay_app_id/key1/key2` | Deleted in migration 022 — don't reference, don't recreate |
| Forgetting to `git merge origin/main` into a restaurant's worktree after a core fix ships | That restaurant's mini-app silently stays on old code until someone remembers |
