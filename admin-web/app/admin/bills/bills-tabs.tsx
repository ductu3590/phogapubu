'use client'

import { useState, type ReactNode } from 'react'
import { Tabs } from '@/components/ui/tabs'
import type { CashShiftListItem } from '@/lib/cash-shift'
import ShiftsPanel from './shifts-panel'

type Tab = 'bills' | 'shifts'

/**
 * Hai tab của Hoá đơn & Báo cáo: Hoá đơn (báo cáo ngày như cũ) · Ca (mig 122). Quán không bật ca và chưa có ca nào
 * → chỉ vẽ báo cáo, không có thanh tab. Tab giữ bằng state client, KHÔNG đưa lên URL: @modal/(.)bills bắt điều hướng
 * mềm nên đổi URL sẽ dựng lại cả hộp thoại. Tab Hoá đơn chỉ ẩn (không tháo) để bộ lọc / ô tìm giữ nguyên khi đổi tab.
 */
export default function BillsTabs({ showShifts, shifts, children }: {
  showShifts: boolean
  shifts: CashShiftListItem[]
  children: ReactNode
}) {
  const [tab, setTab] = useState<Tab>('bills')
  if (!showShifts) return <>{children}</>
  return (
    <div className="space-y-4">
      <Tabs<Tab>
        label="Hoá đơn & Báo cáo"
        variant="underline"
        value={tab}
        onValueChange={setTab}
        items={[{ value: 'bills', label: 'Hoá đơn' }, { value: 'shifts', label: 'Ca' }]}
      />
      <div hidden={tab !== 'bills'}>{children}</div>
      {tab === 'shifts' ? <ShiftsPanel shifts={shifts} /> : null}
    </div>
  )
}
