'use client'

import { useState } from 'react'

export default function SecretField({ label, name, value }: { label: string; name: string; value: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <span className="flex items-center gap-2">
        <input
          name={name}
          type={visible ? 'text' : 'password'}
          defaultValue={value}
          placeholder={value ? 'Đã có — bỏ trống nếu không đổi' : undefined}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          aria-label={visible ? `Ẩn ${label}` : `Hiện ${label}`}
          title={visible ? 'Ẩn giá trị' : 'Hiện giá trị'}
          onClick={() => setVisible((current) => !current)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          {visible ? '🙈' : '👁'}
        </button>
      </span>
      <span className="mt-1 block text-xs text-gray-500">Chỉ người có quyền MEVO superadmin mới thấy giá trị này.</span>
    </label>
  )
}
