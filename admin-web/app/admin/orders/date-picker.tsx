'use client'

import { useRouter } from 'next/navigation'

export function DatePicker({ defaultValue }: { defaultValue: string }) {
  const router = useRouter()
  return (
    <input
      type="date"
      defaultValue={defaultValue}
      onChange={(e) => {
        const val = e.target.value
        if (val) router.push(`?date=${val}`)
      }}
      className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
    />
  )
}
