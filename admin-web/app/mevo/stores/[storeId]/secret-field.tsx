'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export default function SecretField({ label, name, value }: { label: string; name: string; value: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground/80">{label}</span>
      <span className="flex items-center gap-2">
        <input
          name={name}
          type={visible ? 'text' : 'password'}
          defaultValue={value}
          placeholder={value ? 'Đã có — bỏ trống nếu không đổi' : undefined}
          className="input min-w-0 flex-1"
        />
        <button
          type="button"
          aria-label={visible ? `Ẩn ${label}` : `Hiện ${label}`}
          title={visible ? 'Ẩn giá trị' : 'Hiện giá trị'}
          onClick={() => setVisible((current) => !current)}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface text-muted hover:bg-button-hover hover:text-foreground md:size-10"
        >
          {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </span>
      <span className="mt-1 block text-xs text-muted">Chỉ người có quyền MEVO superadmin mới thấy giá trị này.</span>
    </label>
  )
}
