'use client'

import { useState } from 'react'

// Bọc quanh 1 server action để hiện thông báo lưu thành công/lỗi — form action trần trong
// Server Component không tự hiện gì khi thành công (chỉ crash toàn trang nếu lỗi).
export default function SaveForm({
  action,
  children,
  submitLabel = 'Lưu',
}: {
  action: (formData: FormData) => Promise<void>
  children: React.ReactNode
  submitLabel?: string
}) {
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)

  async function handleSubmit(formData: FormData) {
    setError('')
    setSaved(false)
    setPending(true)
    try {
      await action(formData)
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra')
    } finally {
      setPending(false)
    }
  }

  return (
    <form action={handleSubmit} className="space-y-3">
      {children}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
        >
          {pending ? 'Đang lưu...' : submitLabel}
        </button>
        {saved && <span className="text-sm font-medium text-green-600">✓ Đã lưu</span>}
        {error && <span className="text-sm font-medium text-red-600">{error}</span>}
      </div>
    </form>
  )
}
