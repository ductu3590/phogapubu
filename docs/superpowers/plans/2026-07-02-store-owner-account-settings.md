# Store Owner Account Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/admin/account` so store owners can update display name, phone, and password while email remains read-only.

**Architecture:** Add small pure validation helpers with Vitest coverage, then wire server actions to Supabase Auth for the current authenticated store owner. Add a focused client form page under the existing `/admin` layout and a sidebar link.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase Auth, Vitest, Tailwind CSS.

---

## File Structure

- Create `admin-web/lib/account/validation.ts`: pure validation helpers for profile and password form data.
- Create `admin-web/lib/account/validation.test.ts`: Vitest tests for validation behavior.
- Create `admin-web/lib/actions/account.ts`: server actions that authenticate `store_owner`, update `auth.users.user_metadata`, and update password.
- Create `admin-web/app/admin/account/page.tsx`: server page that loads current user email and metadata.
- Create `admin-web/app/admin/account/account-client.tsx`: client forms for profile and password updates.
- Modify `admin-web/app/admin/layout.tsx`: add sidebar link to `/admin/account`.
- Read `admin-web/node_modules/next/dist/docs/` relevant App Router/server actions docs before code edits if present, per `admin-web/AGENTS.md`.

## Task 1: Account Validation Helpers

**Files:**
- Create: `admin-web/lib/account/validation.ts`
- Create: `admin-web/lib/account/validation.test.ts`

- [ ] **Step 1: Write failing tests**

Create `admin-web/lib/account/validation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseAccountProfile, parseAccountPassword } from './validation'

describe('account validation', () => {
  it('trims profile fields and keeps empty phone as empty string', () => {
    const formData = new FormData()
    formData.set('full_name', '  Nguyen Van A  ')
    formData.set('phone', '  0901 234 567  ')

    expect(parseAccountProfile(formData)).toEqual({
      fullName: 'Nguyen Van A',
      phone: '0901 234 567',
    })
  })

  it('rejects a display name longer than 100 characters', () => {
    const formData = new FormData()
    formData.set('full_name', 'a'.repeat(101))
    formData.set('phone', '0901234567')

    expect(() => parseAccountProfile(formData)).toThrow('Họ tên tối đa 100 ký tự')
  })

  it('rejects a phone longer than 30 characters', () => {
    const formData = new FormData()
    formData.set('full_name', 'Nguyen Van A')
    formData.set('phone', '1'.repeat(31))

    expect(() => parseAccountProfile(formData)).toThrow('Số điện thoại tối đa 30 ký tự')
  })

  it('accepts a valid matching password', () => {
    const formData = new FormData()
    formData.set('password', 'matkhau123')
    formData.set('confirm_password', 'matkhau123')

    expect(parseAccountPassword(formData)).toEqual({ password: 'matkhau123' })
  })

  it('rejects password shorter than 8 characters', () => {
    const formData = new FormData()
    formData.set('password', '1234567')
    formData.set('confirm_password', '1234567')

    expect(() => parseAccountPassword(formData)).toThrow('Mật khẩu mới phải có ít nhất 8 ký tự')
  })

  it('rejects password confirmation mismatch', () => {
    const formData = new FormData()
    formData.set('password', 'matkhau123')
    formData.set('confirm_password', 'matkhau456')

    expect(() => parseAccountPassword(formData)).toThrow('Mật khẩu nhập lại không khớp')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd admin-web
npm test -- lib/account/validation.test.ts
```

Expected: FAIL because `./validation` does not exist.

- [ ] **Step 3: Implement validation helpers**

Create `admin-web/lib/account/validation.ts`:

```ts
export type AccountProfileInput = {
  fullName: string
  phone: string
}

export type AccountPasswordInput = {
  password: string
}

function readString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

export function parseAccountProfile(formData: FormData): AccountProfileInput {
  const fullName = readString(formData, 'full_name')
  const phone = readString(formData, 'phone')

  if (fullName.length > 100) throw new Error('Họ tên tối đa 100 ký tự')
  if (phone.length > 30) throw new Error('Số điện thoại tối đa 30 ký tự')

  return { fullName, phone }
}

export function parseAccountPassword(formData: FormData): AccountPasswordInput {
  const password = readString(formData, 'password')
  const confirmPassword = readString(formData, 'confirm_password')

  if (password.length < 8) throw new Error('Mật khẩu mới phải có ít nhất 8 ký tự')
  if (password !== confirmPassword) throw new Error('Mật khẩu nhập lại không khớp')

  return { password }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd admin-web
npm test -- lib/account/validation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-web/lib/account/validation.ts admin-web/lib/account/validation.test.ts
git commit -m "feat: thêm validation tài khoản chủ quán"
```

## Task 2: Server Actions For Account Updates

**Files:**
- Create: `admin-web/lib/actions/account.ts`
- Uses: `admin-web/lib/auth/operator.ts`
- Uses: `admin-web/lib/supabase/server.ts`
- Uses: `admin-web/lib/account/validation.ts`

- [ ] **Step 1: Add server actions**

Create `admin-web/lib/actions/account.ts`:

```ts
'use server'

import { parseAccountPassword, parseAccountProfile } from '@/lib/account/validation'
import { requireStoreOwnerStoreId } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateAccountProfile(formData: FormData) {
  await requireStoreOwnerStoreId()
  const { fullName, phone } = parseAccountProfile(formData)
  const supabase = await createClient()

  const { error } = await supabase.auth.updateUser({
    data: {
      full_name: fullName || null,
      phone: phone || null,
    },
  })

  if (error) throw new Error(`updateAccountProfile: ${error.message}`)
  revalidatePath('/admin/account')
}

export async function updateAccountPassword(formData: FormData) {
  await requireStoreOwnerStoreId()
  const { password } = parseAccountPassword(formData)
  const supabase = await createClient()

  const { error } = await supabase.auth.updateUser({ password })

  if (error) throw new Error(`updateAccountPassword: ${error.message}`)
  revalidatePath('/admin/account')
}
```

- [ ] **Step 2: Run focused validation tests**

Run:

```bash
cd admin-web
npm test -- lib/account/validation.test.ts
```

Expected: PASS. This guards the behavior used by the server actions.

- [ ] **Step 3: Commit**

```bash
git add admin-web/lib/actions/account.ts
git commit -m "feat: thêm action cập nhật tài khoản"
```

## Task 3: Account Page And Client Forms

**Files:**
- Create: `admin-web/app/admin/account/page.tsx`
- Create: `admin-web/app/admin/account/account-client.tsx`

- [ ] **Step 1: Create server page**

Create `admin-web/app/admin/account/page.tsx`:

```tsx
import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AccountClient from './account-client'

type UserMetadata = {
  full_name?: unknown
  phone?: unknown
}

function readMetadataString(metadata: UserMetadata, key: keyof UserMetadata): string {
  const value = metadata[key]
  return typeof value === 'string' ? value : ''
}

export default async function AccountPage() {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'store_owner') redirect('/mevo')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const metadata = user.user_metadata as UserMetadata

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Tài khoản</h1>
        <p className="text-sm text-gray-500">Cập nhật thông tin đăng nhập của chủ quán</p>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <AccountClient
          email={user.email ?? ''}
          fullName={readMetadataString(metadata, 'full_name')}
          phone={readMetadataString(metadata, 'phone')}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create client form component**

Create `admin-web/app/admin/account/account-client.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateAccountPassword, updateAccountProfile } from '@/lib/actions/account'

type Props = {
  email: string
  fullName: string
  phone: string
}

export default function AccountClient({ email, fullName, phone }: Props) {
  const router = useRouter()
  const [profileSaved, setProfileSaved] = useState(false)
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [passwordError, setPasswordError] = useState('')

  useEffect(() => {
    if (!profileSaved) return
    const t = setTimeout(() => setProfileSaved(false), 2500)
    return () => clearTimeout(t)
  }, [profileSaved])

  useEffect(() => {
    if (!passwordSaved) return
    const t = setTimeout(() => setPasswordSaved(false), 2500)
    return () => clearTimeout(t)
  }, [passwordSaved])

  return (
    <div className="flex max-w-xl flex-col gap-6 text-gray-900">
      <form
        action={async (fd) => {
          setProfileError('')
          try {
            await updateAccountProfile(fd)
            setProfileSaved(true)
            router.refresh()
          } catch (e) {
            setProfileError(e instanceof Error ? e.message : 'Lỗi khi lưu thông tin')
          }
        }}
        className="rounded-xl border border-gray-200 bg-white p-5"
      >
        <h2 className="text-base font-semibold text-gray-900">Thông tin cá nhân</h2>
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <label className="label">Email đăng nhập</label>
            <input value={email} readOnly className="input bg-gray-50 text-gray-500" />
          </div>
          <div>
            <label className="label">Họ tên</label>
            <input name="full_name" defaultValue={fullName} maxLength={100} className="input" />
          </div>
          <div>
            <label className="label">Số điện thoại</label>
            <input name="phone" type="tel" defaultValue={phone} maxLength={30} className="input" />
          </div>
        </div>
        {profileError && <p className="mt-3 text-sm text-red-600">{profileError}</p>}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Lưu thông tin
          </button>
          {profileSaved && <span className="text-sm text-green-600">Đã lưu</span>}
        </div>
      </form>

      <form
        action={async (fd) => {
          setPasswordError('')
          try {
            await updateAccountPassword(fd)
            setPasswordSaved(true)
            router.refresh()
          } catch (e) {
            setPasswordError(e instanceof Error ? e.message : 'Lỗi khi đổi mật khẩu')
          }
        }}
        className="rounded-xl border border-gray-200 bg-white p-5"
      >
        <h2 className="text-base font-semibold text-gray-900">Đổi mật khẩu</h2>
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <label className="label">Mật khẩu mới</label>
            <input name="password" type="password" minLength={8} autoComplete="new-password" className="input" />
          </div>
          <div>
            <label className="label">Nhập lại mật khẩu mới</label>
            <input name="confirm_password" type="password" minLength={8} autoComplete="new-password" className="input" />
          </div>
        </div>
        {passwordError && <p className="mt-3 text-sm text-red-600">{passwordError}</p>}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Đổi mật khẩu
          </button>
          {passwordSaved && <span className="text-sm text-green-600">Đã đổi mật khẩu</span>}
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Run type/lint check**

Run:

```bash
cd admin-web
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add admin-web/app/admin/account/page.tsx admin-web/app/admin/account/account-client.tsx
git commit -m "feat: thêm trang tài khoản chủ quán"
```

## Task 4: Sidebar Link And Final Verification

**Files:**
- Modify: `admin-web/app/admin/layout.tsx`
- Read: `TESTING.md`

- [ ] **Step 1: Add sidebar item**

In `admin-web/app/admin/layout.tsx`, add the account link after `Cài đặt quán`:

```tsx
<NavLink href="/admin/account" icon="👤">Tài khoản</NavLink>
```

- [ ] **Step 2: Run full admin checks**

Run:

```bash
cd admin-web
npm test
npm run lint
npm run build
```

Expected:
- `npm test`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS.

- [ ] **Step 3: Read project testing checklist**

Run:

```bash
Get-Content -Raw TESTING.md
```

Expected: identify the matching checklist for this completed task and stop for anh Tú to test manually.

- [ ] **Step 4: Commit final UI wiring**

```bash
git add admin-web/app/admin/layout.tsx
git commit -m "feat: thêm lối vào tài khoản chủ quán"
```

## Self-Review

- Spec coverage: `/admin/account`, read-only email, profile metadata, password update, store owner guard, and sidebar link are covered.
- Placeholder scan: no TODO/TBD/later placeholders remain.
- Type consistency: plan uses `full_name`, `phone`, `password`, and `confirm_password` consistently across validation, actions, and forms.
