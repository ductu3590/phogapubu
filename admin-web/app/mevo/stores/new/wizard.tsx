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
        {...(onChange ? { value: value ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value) } : { defaultValue })}
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
