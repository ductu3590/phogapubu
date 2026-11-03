import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { OpenTableSession } from '@/lib/actions/table-session'
import PosBillPanel from './bill-panel'
import ConfirmDialog from './confirm-dialog'

const base: OpenTableSession = {
  session_id: 's1',
  table_id: 't6',
  table_number: 'Bàn 6, Bàn 7',
  tables: [{ id: 't6', table_number: 'Bàn 6' }, { id: 't7', table_number: 'Bàn 7' }],
  is_open_ordering: true,
  status: 'open',
  close_reason: null,
  opened_at: new Date().toISOString(),
  opened_by: 'staff',
  last_activity_at: new Date().toISOString(),
  has_host: false,
  needs_review: false,
  order_count: 0,
  total: 0,
  unpaid_total: 0,
  cooking_count: 0,
  idle_timeout_minutes: 360,
  orders: [],
}

function panel(session: OpenTableSession) {
  return renderToStaticMarkup(
    <PosBillPanel selected={session} picked={[]} freeTables={[]} moveTargets={[{ id: 't9', table_number: 'Bàn 9', area_id: null, laterReservationAt: null }]} moveAreas={[]}
      onMoveTable={vi.fn()} onMoveTray={vi.fn()} otherSessions={[]} pickedFreeTables={0} trayColors={new Map()} busy={false}
      onPay={vi.fn()} onPrint={vi.fn()} onReset={vi.fn()} onCreateTray={vi.fn()} onAddTable={vi.fn()}
      onMergeInto={vi.fn()} onReleaseHost={vi.fn()} onConfirmOrder={vi.fn()} onRejectOrder={vi.fn()}
      onPrintOrder={vi.fn()} onOpenManualOrder={vi.fn()} onVoidOrderItem={vi.fn()} onSetItemQuantity={async () => true} onRestoreOrderItem={vi.fn()} onClearPick={vi.fn()}
      onDismiss={vi.fn()} preorders={[]} onPrintPreorder={async () => ({ ok: true })} />,
  )
}

describe('ConfirmDialog', () => {
  it('hiện tiêu đề, mô tả, nút Huỷ và nút xác nhận', () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog open title="Bàn 16 có khách đặt lúc 21:00" description="Từ 20:00 khách không tự gọi món qua QR được." confirmLabel="Vẫn chuyển" busy={false} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(html).toContain('Bàn 16 có khách đặt lúc 21:00')
    expect(html).toContain('Từ 20:00 khách không tự gọi món qua QR được.')
    expect(html).toContain('Huỷ')
    expect(html).toContain('Vẫn chuyển')
  })

  it('đang chạy: khoá nút Huỷ và nút xác nhận báo bận', () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog open title="Bỏ bàn Bàn 5?" confirmLabel="Bỏ bàn" tone="danger" busy onConfirm={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(html).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Huỷ/)
    expect(html).toContain('aria-busy="true"')
  })
})

describe('MoveTableControl theo số bàn của phiên', () => {
  it('mâm nhiều bàn có hai lựa chọn Đổi một bàn / Chuyển cả mâm sang một bàn', () => {
    const html = panel(base)
    expect(html).toContain('Đổi một bàn')
    expect(html).toContain('Chuyển cả mâm sang một bàn')
  })

  it('phiên một bàn giữ nguyên, không hiện lựa chọn mới', () => {
    const html = panel({ ...base, table_number: 'Bàn 6', tables: [base.tables[0]] })
    expect(html).not.toContain('Chuyển cả mâm sang một bàn')
    expect(html).toContain('Chuyển sang bàn trống')
  })
})
