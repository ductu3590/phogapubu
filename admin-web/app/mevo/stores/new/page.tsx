'use client'

import { createStore } from '@/lib/actions/mevo-stores'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function NewStorePage() {
  const router = useRouter()
  const [error, setError] = useState('')

  async function action(formData: FormData) {
    try {
      const storeId = await createStore(formData)
      router.push(`/mevo/stores/${storeId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra')
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Tạo quán mới</h1>
      <form action={action} className="max-w-md space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        <Field label="Tên quán" name="name" required />
        <Field label="Slug (URL-friendly, vd: pho-ga-pubu)" name="slug" required />
        <Field label="Số điện thoại" name="phone" />
        <Field label="Địa chỉ" name="address" />
        <button type="submit" className="w-full rounded-xl bg-orange-500 px-4 py-2 font-semibold text-white hover:bg-orange-600">
          Tạo quán
        </button>
      </form>
    </div>
  )
}

function Field({ label, name, required }: { label: string; name: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <input name={name} required={required} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
    </label>
  )
}
