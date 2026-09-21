# BL-2B OA Parent-App Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify Zalo OA onboarding with the parent OA API app identity rather than the child restaurant Mini App identity.

**Architecture:** `store_app_configs.zalo_mini_app_id` remains the identity of a restaurant Mini App. `store_zalo_configs.zalo_oa_app_id` becomes the identity in Zalo OA webhook events; it may be shared by several restaurant OAs under the MEVO SOLUTION parent app. Each store still verifies its own OA ID and has isolated recipient/challenge records.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Supabase PostgreSQL migrations/RPC.

**Spec:** `docs/superpowers/specs/2026-09-10-bao-luong-reservation-pos-workflow-design.md` §8; `docs/testing/bao-luong/SPRINT-BL-2B.md`

## Global Constraints

- Never expose access tokens or app secrets to the browser, logs, tests, or documentation.
- Do not modify the MEVO SOLUTION Mini App Open APIs webhook.
- UI text is Vietnamese; behavior is not selected by restaurant slug.
- Preserve Pubu's existing Mini App and OA paths.

---

### Task 1: Persist and edit OA API App ID independently

**Files:**
- Create: `supabase/migrations/061_store_zalo_oa_app_identity.sql`
- Modify: `admin-web/lib/actions/mevo-stores.ts`
- Modify: `admin-web/app/mevo/stores/[storeId]/page.tsx`
- Modify: `admin-web/app/mevo/stores/new/wizard.tsx`
- Test: `admin-web/lib/actions/mevo-stores.test.ts`

**Produces:** nullable `store_zalo_configs.zalo_oa_app_id text`; `updateZaloConfig` reads it, requires it for a first OA save, and preserves it on blank later saves.

- [x] Write failing action tests for a missing initial OA API App ID, a supplied ID in the upsert, and preservation on a blank update.
- [x] Run `npm test -- --run lib/actions/mevo-stores.test.ts`; new cases must fail.
- [ ] Add column and nonblank CHECK:
  ```sql
  alter table public.store_zalo_configs add column if not exists zalo_oa_app_id text;
  alter table public.store_zalo_configs add constraint store_zalo_configs_zalo_oa_app_id_not_blank
    check (zalo_oa_app_id is null or length(btrim(zalo_oa_app_id)) > 0);
  ```
- [x] Add field **OA API App ID — app cha nhận webhook**, with help text that it differs from the child Mini App ID and can be shared by several OAs.
- [x] Rerun focused tests and commit:
  ```powershell
  git add -- supabase/migrations/061_store_zalo_oa_app_identity.sql admin-web/lib/actions/mevo-stores.ts admin-web/app/mevo/stores/[storeId]/page.tsx admin-web/app/mevo/stores/new/wizard.tsx admin-web/lib/actions/mevo-stores.test.ts
  git commit -m "feat: tach OA API app id khoi mini app"
  ```

### Task 2: Verify route and RPC using OA API App ID

**Files:**
- Create: `supabase/migrations/062_reservation_oa_app_identity.sql`
- Modify: `admin-web/app/api/zalo-oa-webhook/[storeId]/route.ts`
- Modify: `admin-web/lib/actions/zalo-owner-notifications.ts`
- Test: `admin-web/app/api/zalo-oa-webhook/[storeId]/route.test.ts`
- Test: `admin-web/lib/actions/zalo-owner-notifications.test.ts`
- Test: `supabase/tests/060_reservation_owner_oa_onboarding.test.mjs`

**Consumes:** `store_zalo_configs.zalo_oa_app_id`.

**Produces:** `claim_zalo_oa_onboarding_challenge` compares `p_app_id` with `store_zalo_configs.zalo_oa_app_id`, never with `store_app_configs.zalo_mini_app_id`.

- [ ] Write tests where a valid OA event uses `oa-parent-app-1` while the restaurant Mini App is `restaurant-mini-app-1`; expect HTTP 200 and one claim. Add mismatch case expecting 403.
- [ ] Run focused route/action/SQL tests; new valid case must fail.
- [ ] Update the route, OA state loader, and RPC definition to use OA API App ID. Preserve OA ID validation, signature verification, atomic claim, replay key, and generic response for invalid codes.
- [ ] Rerun the focused tests and commit:
  ```powershell
  git add -- supabase/migrations/062_reservation_oa_app_identity.sql supabase/tests/060_reservation_owner_oa_onboarding.test.mjs admin-web/app/api/zalo-oa-webhook/[storeId]/route.ts admin-web/app/api/zalo-oa-webhook/[storeId]/route.test.ts admin-web/lib/actions/zalo-owner-notifications.ts admin-web/lib/actions/zalo-owner-notifications.test.ts
  git commit -m "fix: xac minh webhook theo OA API app"
  ```

### Task 3: Production configuration and regression evidence

**Files:**
- Modify: `docs/testing/bao-luong/SPRINT-BL-2B.md`
- Modify: `TESTING.md` only if its one-line status changes.

- [ ] Document the three separate identities: OA ID, child Mini App ID, and parent OA API App ID.
- [ ] Run:
  ```powershell
  cd admin-web
  npm test
  npx tsc --noEmit
  npx eslint app/api/zalo-oa-webhook/[storeId]/route.ts lib/actions/zalo-owner-notifications.ts lib/actions/mevo-stores.ts
  npm run build
  cd ..
  node supabase/tests/060_reservation_owner_oa_onboarding.test.mjs
  git diff --check
  ```
- [ ] Apply migrations 061 then 062. Save Bảo Lương's parent OA API App ID `4311670425529575295` through the cockpit; do not replace its child Mini App ID `671794256689452743`.
- [ ] Push production, verify an unsigned URL handshake returns 200, then use the official OA `user_send_text` test. Confirm the parent Mini App Open APIs webhook remains unchanged.
- [ ] Commit test documentation:
  ```powershell
  git add -- docs/testing/bao-luong/SPRINT-BL-2B.md TESTING.md
  git commit -m "docs: cap nhat test OA app cha BL-2B"
  ```

## Self-review

- Tasks 1–2 keep child Mini App and parent OA API identities separate.
- Store + OA validation and replay protection stay intact.
- No credential values appear in source or tests.
- The Open APIs webhook is explicitly excluded.
