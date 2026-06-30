# Admin Menu Drag Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drag-and-drop sorting for Admin menu categories and menu items.

**Architecture:** Keep drag UI in `menu-client.tsx`, persistence in `lib/actions/menu.ts`, and deterministic reorder logic in a small tested helper. Use optimistic local state, then refresh from Supabase after successful save.

**Tech Stack:** Next.js 16, React 19, Supabase server actions, `@dnd-kit`, Vitest.

---

### Task 1: Reorder Helper And Tests

**Files:**
- Create: `admin-web/lib/menu/reorder.ts`
- Create: `admin-web/lib/menu/reorder.test.ts`
- Modify: `admin-web/package.json`

- [ ] Write failing tests for ID normalization and sort payload generation.
- [ ] Add Vitest test script.
- [ ] Implement `uniqueOrderedIds` and `buildSortUpdates`.
- [ ] Run `npm run test`.

### Task 2: Server Actions

**Files:**
- Modify: `admin-web/lib/actions/menu.ts`

- [ ] Add ownership assertions for category and item reorder.
- [ ] Implement `reorderCategories(categoryIds: string[])`.
- [ ] Implement `reorderMenuItems(categoryId: string, itemIds: string[])`.
- [ ] Revalidate `/admin/menu` after save.

### Task 3: Drag UI

**Files:**
- Modify: `admin-web/app/admin/menu/menu-client.tsx`
- Modify: `admin-web/package.json`
- Modify: `admin-web/package-lock.json`

- [ ] Install `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities`.
- [ ] Keep categories in local state synced from props.
- [ ] Add sortable category rows with grab handles.
- [ ] Add sortable item rows for the selected category.
- [ ] On drag end, optimistic reorder and call the matching server action.

### Task 4: Verification

**Files:**
- Read: `TESTING.md`

- [ ] Run `npm run test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Report the relevant `TESTING.md` checklist and stop for anh Tú's PASS.
