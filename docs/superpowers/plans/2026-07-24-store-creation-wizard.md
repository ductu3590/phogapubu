# Wizard tạo quán mới + Claude sinh mini-app — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Biến `/mevo/stores/new` thành wizard 5 bước onboarding quán (ghi dần từng bước, bỏ qua được), kết thúc bằng lệnh `onboard quán <slug>` để Claude Code sinh thư mục mini-app local.

**Architecture:** Wizard là client component tại `admin-web/app/mevo/stores/new/wizard.tsx`, bước 1 gọi `createStore` có sẵn để tạo quán thật rồi gắn `?store=<id>&slug=<slug>&step=N` vào URL (F5 không mất chỗ đứng); các bước sau gọi lại các server action đang có. Chỉ thêm đúng 1 server action mới (`updateStoreOaId`) + 1 helper thuần (`suggestSlug`). Khâu sinh mini-app là mục mới trong skill `replicate-mini-app` (chạy local bằng Claude Code, không đụng Vercel).

**Tech Stack:** Next.js 16 App Router (admin-web), server actions có sẵn trong `admin-web/lib/actions/mevo-stores.ts`, vitest (test đặt cạnh file lib, mock pattern như `admin-web/lib/actions/staff.test.ts`), Tailwind theo style hiện có.

**Spec:** `docs/superpowers/specs/2026-07-24-store-creation-wizard-design.md`

**⚠️ Trước khi viết code Next.js:** đọc `admin-web/AGENTS.md` — Next 16.2.6 có breaking changes so với kiến thức nền; tra `admin-web/node_modules/next/dist/docs/01-app/` cho `useSearchParams`/`useRouter`/Suspense nếu không chắc. Code hiện có trong `admin-web/app/mevo/` là mẫu đã chạy đúng — bám theo nó.

**Quy ước chung mọi task:** chạy lệnh trong `admin-web/` bằng PowerShell/bash tại `D:\Code\mevo\admin-web`. Commit message tiếng Việt không dấu theo format `feat:`/`fix:`/`chore:`/`docs:` như log hiện có.

---

## File Structure

| File | Vai trò |
|---|---|
| Create `admin-web/lib/slugify.ts` | Helper thuần: gợi ý slug từ tên quán (bỏ dấu tiếng Việt → kebab-case) + regex validate |
| Create `admin-web/lib/slugify.test.ts` | Test helper |
| Modify `admin-web/lib/actions/mevo-stores.ts` | Thêm action `updateStoreOaId` (ghi riêng `stores.zalo_oa_id`) |
| Create `admin-web/lib/actions/mevo-stores.test.ts` | Test action mới |
| Create `admin-web/app/mevo/stores/new/wizard.tsx` | Client component wizard 5 bước + màn hoàn tất |
| Rewrite `admin-web/app/mevo/stores/new/page.tsx` | Thin wrapper: Suspense + render `<StoreWizard/>` |
| Modify `.claude/skills/replicate-mini-app/SKILL.md` | Thêm mục lệnh nhanh `onboard quán <slug>` |
| Modify `TESTING.md` | Thêm "SPRINT — Wizard tạo quán" |

---

### Task 1: Helper `suggestSlug` (TDD)

**Files:**
- Create: `admin-web/lib/slugify.ts`
- Test: `admin-web/lib/slugify.test.ts`

- [ ] **Step 1: Viết test fail trước**

```ts
// admin-web/lib/slugify.test.ts
import { describe, expect, it } from 'vitest'
import { suggestSlug, SLUG_RE } from './slugify'

describe('suggestSlug', () => {
  it('bỏ dấu tiếng Việt và kebab-case', () => {
    expect(suggestSlug('Phở Gà Pubu')).toBe('pho-ga-pubu')
    expect(suggestSlug('Căng tin PUBU')).toBe('cang-tin-pubu')
    expect(suggestSlug('Quán Đường Đôi 68')).toBe('quan-duong-doi-68')
  })
  it('gọn ký tự lạ, không gạch đầu/cuối', () => {
    expect(suggestSlug('  Bún!! Chả---Hà Nội  ')).toBe('bun-cha-ha-noi')
    expect(suggestSlug('***')).toBe('')
  })
})

describe('SLUG_RE', () => {
  it('chấp nhận kebab-case, từ chối còn lại', () => {
    expect(SLUG_RE.test('pho-ga-pubu')).toBe(true)
    expect(SLUG_RE.test('Pho-Ga')).toBe(false)
    expect(SLUG_RE.test('pho_ga')).toBe(false)
    expect(SLUG_RE.test('-pho')).toBe(false)
    expect(SLUG_RE.test('')).toBe(false)
  })
})
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run lib/slugify.test.ts`
Expected: FAIL — `Cannot find module './slugify'`

- [ ] **Step 3: Viết implementation tối thiểu**

```ts
// admin-web/lib/slugify.ts
// Gợi ý slug URL-friendly từ tên quán tiếng Việt (bỏ dấu → kebab-case).
// Chỉ là GỢI Ý phía client — server không dùng, stores.slug UNIQUE mới là chốt chặn.
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function suggestSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // bo dau thanh/dau mu (combining marks sau NFD)
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
```

- [ ] **Step 4: Chạy lại test**

Run: `npx vitest run lib/slugify.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add admin-web/lib/slugify.ts admin-web/lib/slugify.test.ts
git commit -m "feat(mevo): helper goi y slug tu ten quan cho wizard"
```

---

### Task 2: Server action `updateStoreOaId` (TDD)

**Files:**
- Modify: `admin-web/lib/actions/mevo-stores.ts` (thêm cuối file, sau `updateZaloConfig`)
- Test: `admin-web/lib/actions/mevo-stores.test.ts` (file mới)

Bối cảnh: wizard bước 4 chỉ có field `zalo_oa_id`, nhưng `updateStoreBasicInfo` bắt gửi kèm
name/phone/address (sẽ ghi đè null nếu thiếu) → cần action ghi riêng 1 cột.

- [ ] **Step 1: Viết test fail trước** (mock pattern chép từ `admin-web/lib/actions/staff.test.ts` — mock `requireOperator` thay vì `requireStoreOwnerStoreId` vì `mevo-stores.ts` dùng `requireSuperadmin()` nội bộ gọi `requireOperator()`)

```ts
// admin-web/lib/actions/mevo-stores.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const requireOperator = vi.fn()
  const revalidatePath = vi.fn()
  const updateArgs = { value: null as unknown }
  const eqCalls = { value: [] as Array<[string, unknown]> }

  const admin = {
    from: vi.fn(() => {
      const builder: Record<string, unknown> = {}
      builder.update = vi.fn((arg: unknown) => {
        updateArgs.value = arg
        return builder
      })
      builder.eq = vi.fn((col: string, val: unknown) => {
        eqCalls.value.push([col, val])
        return builder
      })
      builder.then = (resolve: (v: { error: null }) => void) => resolve({ error: null })
      return builder
    }),
    _updateArgs: updateArgs,
    _eqCalls: eqCalls,
  }
  return { requireOperator, revalidatePath, admin }
})

vi.mock('@/lib/auth/operator', () => ({ requireOperator: mocks.requireOperator }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn(() => mocks.admin) }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { updateStoreOaId } = await import('./mevo-stores')

function oaForm(oaId: string) {
  const fd = new FormData()
  fd.set('zalo_oa_id', oaId)
  return fd
}

describe('updateStoreOaId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.admin._updateArgs.value = null
    mocks.admin._eqCalls.value = []
    mocks.requireOperator.mockResolvedValue({ role: 'mevo_superadmin', store_id: null })
  })

  it('ghi zalo_oa_id đúng store', async () => {
    await updateStoreOaId('store-1', oaForm('  123456  '))
    expect(mocks.admin.from).toHaveBeenCalledWith('stores')
    expect(mocks.admin._updateArgs.value).toEqual({ zalo_oa_id: '123456' })
    expect(mocks.admin._eqCalls.value).toContainEqual(['id', 'store-1'])
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/mevo/stores/store-1')
  })

  it('chuỗi rỗng → ghi null', async () => {
    await updateStoreOaId('store-1', oaForm('   '))
    expect(mocks.admin._updateArgs.value).toEqual({ zalo_oa_id: null })
  })

  it('chặn người không phải superadmin', async () => {
    mocks.requireOperator.mockResolvedValue({ role: 'store_owner', store_id: 'store-1' })
    await expect(updateStoreOaId('store-1', oaForm('123'))).rejects.toThrow('superadmin')
    expect(mocks.admin.from).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run lib/actions/mevo-stores.test.ts`
Expected: FAIL — `updateStoreOaId` không tồn tại trong `./mevo-stores`

- [ ] **Step 3: Thêm action vào cuối `mevo-stores.ts`**

```ts
// Ghi riêng Zalo OA ID — wizard bước 4 (OA/Webhook) chỉ có field này;
// updateStoreBasicInfo bắt gửi kèm name/phone/address nên không dùng lẻ được.
export async function updateStoreOaId(storeId: string, formData: FormData) {
  await requireSuperadmin()
  const admin = createAdminClient()
  const oaId = (formData.get('zalo_oa_id') as string | null)?.trim() || null
  const { error } = await admin.from('stores').update({ zalo_oa_id: oaId }).eq('id', storeId)
  if (error) throw new Error(`updateStoreOaId: ${error.message}`)
  revalidatePath(`/mevo/stores/${storeId}`)
}
```

- [ ] **Step 4: Chạy lại test**

Run: `npx vitest run lib/actions/mevo-stores.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add admin-web/lib/actions/mevo-stores.ts admin-web/lib/actions/mevo-stores.test.ts
git commit -m "feat(mevo): action updateStoreOaId ghi rieng zalo_oa_id cho wizard"
```

---

### Task 3: Wizard component

**Files:**
- Create: `admin-web/app/mevo/stores/new/wizard.tsx`
- Rewrite: `admin-web/app/mevo/stores/new/page.tsx`

UI component thuần — không unit test (dự án không có test infra cho component; kiểm bằng
build + TESTING.md thủ công). Logic tách được đã test ở Task 1–2.

- [ ] **Step 1: Viết `wizard.tsx`**

```tsx
// admin-web/app/mevo/stores/new/wizard.tsx
'use client'

import {
  assignStoreOwner, createStore, updateAppConfig, updateCheckoutConfig,
  updateStoreColor, updateStoreOaId, updateZaloConfig,
} from '@/lib/actions/mevo-stores'
import { SLUG_RE, suggestSlug } from '@/lib/slugify'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

// Wizard onboarding quán: bước 1 tạo quán THẬT ngay (ghi dần từng bước — đóng giữa chừng
// không mất gì, điền tiếp ở /mevo/stores/<id>). storeId/slug/step nằm trên URL để F5 vẫn
// đứng đúng bước; riêng checklist ✅/⏳ là state trong phiên, F5 thì xem lại ở trang chi tiết.
const STEP_LABELS = ['Thông tin quán', 'Giao diện', 'Zalo Mini App', 'OA / Webhook', 'Chủ quán', 'Hoàn tất']

export default function StoreWizard() {
  const router = useRouter()
  const params = useSearchParams()
  const [step, setStep] = useState(() => {
    const n = Number(params.get('step') ?? 1)
    return n >= 1 && n <= 6 ? n : 1
  })
  const [storeId, setStoreId] = useState(params.get('store') ?? '')
  const [slug, setSlug] = useState(params.get('slug') ?? '')
  const [done, setDone] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  function goTo(next: number, id = storeId, s = slug) {
    setError('')
    setStep(next)
    router.replace(`/mevo/stores/new?store=${id}&slug=${encodeURIComponent(s)}&step=${next}`)
  }

  // Bọc chung 1 handler submit: khoá nút khi đang gọi, lỗi hiện tại chỗ, thành công thì sang bước.
  function wrap(fn: (formData: FormData) => Promise<void>) {
    return async (formData: FormData) => {
      setError('')
      setPending(true)
      try {
        await fn(formData)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Có lỗi xảy ra')
      } finally {
        setPending(false)
      }
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Tạo quán mới</h1>
      <StepBar current={step} />
      <div className="max-w-xl rounded-xl border border-gray-200 bg-white p-6">
        {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        {step === 1 && <Step1 pending={pending} onSubmit={wrap(async (fd) => {
          const s = (fd.get('slug') as string).trim()
          if (!SLUG_RE.test(s)) throw new Error('Slug chỉ gồm chữ thường/số, nối bằng dấu gạch (vd: pho-ga-pubu)')
          const id = await createStore(fd)
          setStoreId(id)
          setSlug(s)
          goTo(2, id, s)
        })} />}
        {step === 2 && <Step2 pending={pending} onSkip={() => goTo(3)} onSubmit={wrap(async (fd) => {
          await updateStoreColor(storeId, fd)
          setDone((d) => ({ ...d, color: true }))
          goTo(3)
        })} />}
        {step === 3 && <Step3 pending={pending} onSkip={() => goTo(4)} onSubmit={wrap(async (fd) => {
          const appName = (fd.get('zalo_mini_app_name') as string).trim()
          const appId = (fd.get('zalo_mini_app_id') as string).trim()
          if (!appName && !appId) { goTo(4); return } // để trống hết = bỏ qua
          if (appName) await updateAppConfig(storeId, fd)
          if (appId) await updateCheckoutConfig(storeId, fd)
          setDone((d) => ({ ...d, miniapp: !!appId }))
          goTo(4)
        })} />}
        {step === 4 && <Step4 pending={pending} storeId={storeId} onSkip={() => goTo(5)} onSubmit={wrap(async (fd) => {
          const oaId = (fd.get('zalo_oa_id') as string).trim()
          const token = (fd.get('zalo_oa_access_token') as string).trim()
          const secret = (fd.get('zalo_app_secret_key') as string).trim()
          if (oaId) await updateStoreOaId(storeId, fd)
          if (token || secret) await updateZaloConfig(storeId, fd)
          setDone((d) => ({ ...d, oa: !!(oaId || token || secret) }))
          goTo(5)
        })} />}
        {step === 5 && <Step5 pending={pending} storeId={storeId} onSkip={() => goTo(6)}
          onAssigned={() => setDone((d) => ({ ...d, owner: true }))} onNext={() => goTo(6)} />}
        {step === 6 && <StepDone storeId={storeId} slug={slug} done={done} />}
      </div>
    </div>
  )
}

function StepBar({ current }: { current: number }) {
  return (
    <ol className="mb-6 flex flex-wrap gap-2">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1
        const state = n < current ? 'bg-green-100 text-green-700' : n === current ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-400'
        return (
          <li key={label} className={`rounded-full px-3 py-1 text-xs font-medium ${state}`}>
            {n}. {label}
          </li>
        )
      })}
    </ol>
  )
}

function Buttons({ pending, onSkip }: { pending: boolean; onSkip?: () => void }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <button type="submit" disabled={pending}
        className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60">
        {pending ? 'Đang lưu...' : 'Lưu & tiếp tục'}
      </button>
      {onSkip && (
        <button type="button" onClick={onSkip} disabled={pending}
          className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60">
          Bỏ qua, điền sau
        </button>
      )}
    </div>
  )
}

function Field({ label, name, defaultValue, required, type, placeholder, onChange, value }: {
  label: string; name: string; defaultValue?: string; required?: boolean; type?: string
  placeholder?: string; onChange?: (v: string) => void; value?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <input name={name} type={type ?? 'text'} required={required} placeholder={placeholder}
        {...(onChange ? { value: value ?? '', onChange: (e) => onChange(e.target.value) } : { defaultValue })}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
    </label>
  )
}

function Step1({ pending, onSubmit }: { pending: boolean; onSubmit: (fd: FormData) => void }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  return (
    <form action={onSubmit} className="space-y-4">
      <Field label="Tên quán" name="name" required value={name} onChange={(v) => {
        setName(v)
        if (!slugTouched) setSlug(suggestSlug(v)) // gợi ý slug theo tên tới khi user tự sửa slug
      }} />
      <Field label="Slug (định danh URL, không đổi được sau này)" name="slug" required
        value={slug} onChange={(v) => { setSlugTouched(true); setSlug(v) }} placeholder="pho-ga-pubu" />
      <Field label="Số điện thoại" name="phone" />
      <Field label="Địa chỉ" name="address" />
      <Buttons pending={pending} />
    </form>
  )
}

function Step2({ pending, onSubmit, onSkip }: { pending: boolean; onSubmit: (fd: FormData) => void; onSkip: () => void }) {
  return (
    <form action={onSubmit} className="space-y-4">
      <p className="text-sm text-gray-500">Màu chủ đạo áp cho thanh menu/nút bấm trên Mini App của quán này.</p>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Màu chủ đạo</span>
        <input type="color" name="primary_color" defaultValue="#A0673D" className="h-10 w-16 rounded-lg border border-gray-300" />
      </label>
      <Buttons pending={pending} onSkip={onSkip} />
    </form>
  )
}

function Step3({ pending, onSubmit, onSkip }: { pending: boolean; onSubmit: (fd: FormData) => void; onSkip: () => void }) {
  return (
    <form action={onSubmit} className="space-y-4">
      <p className="text-sm text-gray-500">
        Chưa có app Zalo (đang chờ duyệt)? Bấm &quot;Bỏ qua, điền sau&quot; — điền tiếp ở trang chi tiết quán.
      </p>
      {/* updateAppConfig đọc 2 select này ở trang chi tiết; wizard ghim giá trị khởi điểm qua hidden */}
      <input type="hidden" name="onboarding_status" value="in_progress" />
      <input type="hidden" name="deployment_status" value="not_deployed" />
      <Field label="Tên Mini App (trên Zalo Dev)" name="zalo_mini_app_name" />
      <Field label="Zalo Mini App ID" name="zalo_mini_app_id" />
      <Field label="Checkout Secret Key (bắt buộc nếu điền Mini App ID lần đầu)" name="zalo_checkout_secret_key" type="password" />
      <Buttons pending={pending} onSkip={onSkip} />
    </form>
  )
}

function Step4({ pending, storeId, onSubmit, onSkip }: {
  pending: boolean; storeId: string; onSubmit: (fd: FormData) => void; onSkip: () => void
}) {
  const webhookUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/zalo-webhook/${storeId}`
  return (
    <form action={onSubmit} className="space-y-4">
      <Field label="Zalo OA ID (không phải secret)" name="zalo_oa_id" />
      <Field label="OA Access Token" name="zalo_oa_access_token" type="password" />
      <Field label="App Secret Key — webhook" name="zalo_app_secret_key" type="password" />
      <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
        <p className="mb-1 font-medium text-gray-700">Đăng ký trên Zalo Developer Console của quán:</p>
        <p className="mb-2">Webhook URL: <CopyInline text={webhookUrl} /></p>
        <p>Nhớ set cả <strong>Notify Url</strong> của phương thức Chuyển khoản ngân hàng (Checkout SDK) — bỏ trống là đơn kẹt pending.</p>
      </div>
      <Buttons pending={pending} onSkip={onSkip} />
    </form>
  )
}

function Step5({ pending, storeId, onSkip, onAssigned, onNext }: {
  pending: boolean; storeId: string; onSkip: () => void; onAssigned: () => void; onNext: () => void
}) {
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ email: string; tempPassword: string | null } | null>(null)
  const [busy, setBusy] = useState(false)

  async function action(formData: FormData) {
    setError('')
    setBusy(true)
    try {
      const res = await assignStoreOwner(storeId, formData)
      setResult(res)
      onAssigned()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra')
    } finally {
      setBusy(false)
    }
  }

  // Không tự nhảy bước sau khi gán — chờ user copy mật khẩu tạm (chỉ hiện 1 LẦN) rồi mới bấm tiếp.
  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {result && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          Đã gán <strong>{result.email}</strong> làm chủ quán.
          {result.tempPassword ? (
            <> Mật khẩu tạm (chỉ hiện 1 lần, copy ngay): <CopyInline text={result.tempPassword} /></>
          ) : ' Tài khoản đã có sẵn, mật khẩu giữ nguyên.'}
        </div>
      )}
      <form action={action} className="space-y-4">
        <Field label="Email chủ quán" name="email" type="email" required />
        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={busy || pending}
            className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60">
            {busy ? 'Đang xử lý...' : 'Gán / tạo tài khoản'}
          </button>
          {result ? (
            <button type="button" onClick={onNext} className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
              Tiếp tục
            </button>
          ) : (
            <button type="button" onClick={onSkip} className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
              Bỏ qua, điền sau
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

function StepDone({ storeId, slug, done }: { storeId: string; slug: string; done: Record<string, boolean> }) {
  const items: Array<[string, boolean]> = [
    ['Thông tin quán', true],
    ['Màu giao diện', !!done.color],
    ['Zalo Mini App + Checkout', !!done.miniapp],
    ['OA / Webhook', !!done.oa],
    ['Tài khoản chủ quán', !!done.owner],
  ]
  const command = `onboard quán ${slug}`
  return (
    <div className="space-y-5">
      <div>
        <h2 className="mb-2 text-lg font-semibold text-gray-800">Đã tạo quán 🎉</h2>
        <ul className="space-y-1 text-sm">
          {items.map(([label, ok]) => (
            <li key={label}>{ok ? '✅' : '⏳'} {label}{!ok && ' — điền sau ở trang chi tiết'}</li>
          ))}
        </ul>
        <a href={`/mevo/stores/${storeId}`} className="mt-2 inline-block text-sm font-medium text-orange-600 hover:underline">
          Mở trang chi tiết quán →
        </a>
      </div>
      <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
        <p className="mb-2 font-medium text-gray-700">Sinh mini-app cho quán (chạy trên máy dev, không phải trên web):</p>
        <p className="mb-2">Mở Claude Code tại thư mục repo MEVO và gõ:</p>
        <CopyInline text={command} />
        <p className="mt-2">Claude sẽ tạo thư mục <code>mini-app-instances/{slug}/</code>, tự điền .env và npm install. Còn lại: zmp login, zmp deploy.</p>
      </div>
    </div>
  )
}

// Đoạn text kèm nút copy — dùng cho webhook URL, mật khẩu tạm, câu lệnh onboard.
function CopyInline({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <span className="inline-flex items-center gap-2">
      <code className="rounded bg-white px-2 py-0.5 font-mono text-xs">{text}</code>
      <button type="button" className="text-xs font-medium text-orange-600 hover:underline"
        onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
        {copied ? '✓ Đã copy' : 'Copy'}
      </button>
    </span>
  )
}
```

- [ ] **Step 2: Viết lại `page.tsx` thành wrapper mỏng** (`useSearchParams` trong client component cần bọc Suspense — xác nhận lại trong `node_modules/next/dist/docs/01-app/` nếu Next 16 đổi quy tắc)

```tsx
// admin-web/app/mevo/stores/new/page.tsx
import { Suspense } from 'react'
import StoreWizard from './wizard'

export default function NewStorePage() {
  return (
    <Suspense>
      <StoreWizard />
    </Suspense>
  )
}
```

- [ ] **Step 3: Kiểm tra build + toàn bộ test**

Run (trong `admin-web/`): `npm run build && npm run test`
Expected: build OK không lỗi type, vitest toàn bộ PASS (test cũ + mới)

- [ ] **Step 4: Chạy thử dev server, đi hết wizard bằng mắt** (nếu môi trường cho phép — dùng preview/browser tool, đăng nhập superadmin, tạo quán thử slug `test-wizard-xx`; nếu không đăng nhập được thì ghi rõ trong report là chưa smoke-test tay, phần này TESTING.md sẽ phủ)

- [ ] **Step 5: Commit**

```bash
git add admin-web/app/mevo/stores/new/wizard.tsx admin-web/app/mevo/stores/new/page.tsx
git commit -m "feat(mevo): wizard 5 buoc tao quan moi thay form don"
```

---

### Task 4: Mục `onboard quán <slug>` trong skill replicate-mini-app

**Files:**
- Modify: `.claude/skills/replicate-mini-app/SKILL.md`

- [ ] **Step 1: Thêm section sau phần "## Checklist" (trước "### 1. Business prerequisites")**

```markdown
## Lệnh nhanh: `onboard quán <slug>` (Claude tự sinh thư mục mini-app)

Khi anh Tú gõ `onboard quán <slug>` (thường sau khi chạy xong wizard `/mevo/stores/new`),
Claude làm TỰ ĐỘNG các bước sau — mỗi bước fail thì DỪNG và báo, không làm tiếp:

1. **Đọc DB** (Supabase MCP, KHÔNG đọc secret):
   ```sql
   select s.id, s.name, s.slug, c.zalo_mini_app_id
   from stores s
   left join store_checkout_configs c on c.store_id = s.id
   where s.slug = '<slug>';
   ```
   Không có row → dừng: "Chưa có quán slug này — chạy wizard /mevo/stores/new trước."
2. **Tạo worktree**: `bash scripts/create-mini-app-instance.sh <slug> "<name từ DB>"`
   (thư mục đã tồn tại → script tự chặn; báo lại nguyên văn cho anh Tú).
3. **Điền `.env`** trong `mini-app-instances/<slug>/mini-app/.env`:
   - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`: chép từ instance có sẵn
     (vd `mini-app-instances/pho-ga-pubu/mini-app/.env`) — anon key là key công khai.
   - `VITE_ZALO_APP_ID` + `APP_ID`: = `zalo_mini_app_id` từ DB. Nếu NULL (wizard bỏ qua
     bước Zalo Mini App) → để nguyên placeholder và GHI RÕ trong báo cáo cuối.
   - `VITE_DEFAULT_STORE_SLUG`: script đã điền sẵn, kiểm tra lại.
4. **`npm install`** trong `mini-app-instances/<slug>/mini-app`.
5. **Báo cáo** những việc chỉ người thật làm được (Zalo bắt tương tác):
   - `npx zmp login` rồi `npx zmp deploy` — NHẮC chọn Development (tự test) vs Testing
     (release) theo quy ước deploy.
   - Đăng ký webhook `https://<domain>/api/zalo-webhook/<store_id>` trên console Zalo của quán.
   - Set Notify Url phương thức Chuyển khoản ngân hàng (xem mục Checklist bên dưới).
   - In QR bàn ở /admin → Bàn & QR.

`ZMP_TOKEN` không tự lấy được — nằm ngoài phạm vi lệnh này.
```

- [ ] **Step 2: Đọc lại toàn bộ SKILL.md** — xác nhận section mới không mâu thuẫn phần cũ (phần Checklist thủ công vẫn giữ nguyên làm tài liệu nền).

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/replicate-mini-app/SKILL.md
git commit -m "docs(skill): lenh nhanh 'onboard quan <slug>' tu sinh thu muc mini-app"
```

---

### Task 5: TESTING.md

**Files:**
- Modify: `TESTING.md` (thêm section mới trên cùng hoặc theo vị trí quy ước của file — đọc file trước, bám format các SPRINT hiện có)

- [ ] **Step 1: Thêm section**

```markdown
## SPRINT — Wizard tạo quán + onboard mini-app (2026-07-24)

> Cần tài khoản mevo_superadmin. Dùng quán thử slug `test-wizard`, XOÁ sau khi test xong.

**Test 1 — Wizard đủ 5 bước:**
1. `/mevo/stores/new` → điền tên "Quán Test Wizard" → slug tự gợi ý `quan-test-wizard`, sửa thành `test-wizard` → Tiếp tục.
2. Bước 2 chọn màu → Lưu & tiếp tục. Bước 3 điền tên Mini App + ID giả `9999` + secret giả → Lưu. Bước 4 điền OA ID giả + copy được webhook URL. Bước 5 gán email thử → thấy mật khẩu tạm hiện 1 lần + copy được.
3. Màn cuối: 5 dòng checklist đều ✅, lệnh `onboard quán test-wizard` copy được.
4. Kiểm DB: `stores`, `store_app_configs`, `store_checkout_configs`, `store_zalo_configs`, `mevo_operators` đều có row đúng store_id.

**Test 2 — Bỏ qua + F5:**
1. Tạo quán thứ 2 slug `test-wizard-2`, bước 2 bấm "Bỏ qua, điền sau", đứng ở bước 3 thì F5 → vẫn ở bước 3, URL có `?store=...&step=3`.
2. Bỏ qua nốt tới màn cuối → checklist hiện ⏳ cho các mục bỏ qua, link "Mở trang chi tiết quán" điền tiếp được (mục ZaloPay Checkout lưu bình thường).
3. Tạo quán slug trùng `test-wizard` → bước 1 báo lỗi ngay, không văng trang.

**Test 3 — onboard quán:**
1. Claude Code tại repo: gõ `onboard quán test-wizard` → tạo `mini-app-instances/test-wizard/mini-app` có `.env` điền đúng slug + Mini App ID `9999`, `npm install` chạy xong, báo cáo liệt kê đủ việc thủ công (zmp login/deploy, webhook, Notify Url).
2. Gõ `onboard quán khong-ton-tai` → dừng, báo chưa có quán, KHÔNG tạo thư mục.

**Dọn dẹp:** xoá 2 quán thử (rows các bảng trên) + `git worktree remove mini-app-instances/test-wizard --force` + `git branch -D deploy/test-wizard`.
```

- [ ] **Step 2: Commit**

```bash
git add TESTING.md
git commit -m "docs(test): checklist test wizard tao quan + onboard mini-app"
```

---

### Task 6: Chốt

- [ ] **Step 1: Chạy toàn bộ kiểm tra lần cuối**

Run (trong `admin-web/`): `npm run test && npm run lint && npm run build`
Expected: tất cả PASS/không lỗi

- [ ] **Step 2: Rà lại spec** — đối chiếu từng mục trong `docs/superpowers/specs/2026-07-24-store-creation-wizard-design.md` với code đã commit; thiếu gì bổ sung ngay.

- [ ] **Step 3: DỪNG theo quy tắc CLAUDE.md** — báo anh Tú: "Xong rồi anh, test theo TESTING.md — SPRINT Wizard tạo quán, Test 1–3 nhé", chờ PASS. KHÔNG tự deploy, KHÔNG push khi chưa được bảo.
