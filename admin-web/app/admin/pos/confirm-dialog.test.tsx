import type { ReactElement } from 'react'
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
    <PosBillPanel loadDebtCustomers={async () => ({ ok: true, customers: [] })} selected={session} picked={[]} freeTables={[]} moveTargets={[{ id: 't9', table_number: 'Bàn 9', area_id: null, laterReservationAt: null }]} moveAreas={[]}
      onMoveTable={vi.fn()} onMoveTray={vi.fn()} otherSessions={[]} pickedFreeTables={0} trayColors={new Map()} busy={false}
      onPay={vi.fn()} onPrint={vi.fn()} onReset={vi.fn()} onCreateTray={vi.fn()} onAddTable={vi.fn()}
      onMergeInto={vi.fn()} onReleaseHost={vi.fn()} onConfirmOrder={vi.fn()} onRejectOrder={vi.fn()}
      onPrintOrder={vi.fn()} onOpenManualOrder={vi.fn()} onVoidOrderItem={vi.fn()} onSetItemQuantity={async () => true} onRestoreOrderItem={vi.fn()} onSetDiscount={async () => true} onClearPick={vi.fn()}
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

describe('ConfirmDialog khi đang xử lý', () => {
  // ConfirmDialog không dùng hook nên gọi thẳng như hàm để lấy cây element (không cần DOM).
  const dialogOf = (busy: boolean, onConfirm: () => void, onCancel: () => void) => {
    const el = ConfirmDialog({ open: true, title: 'T', confirmLabel: 'Xác nhận', busy, onConfirm, onCancel }) as ReactElement<{
      onClose: () => void
      dismissible: boolean
      footer: ReactElement<{ children: ReactElement<{ onClick: () => void }>[] }>
    }>
    const [cancelBtn, confirmBtn] = el.props.footer.props.children
    return { el, cancelBtn, confirmBtn }
  }

  it('busy: đóng bằng X / Esc / nền (onClose) và nút xác nhận đều không gọi gì', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const { el, confirmBtn } = dialogOf(true, onConfirm, onCancel)
    expect(el.props.dismissible).toBe(false)
    el.props.onClose()
    confirmBtn.props.onClick()
    expect(onCancel).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('confirmDisabled (vd. A04 số tiền đã cũ): nút xác nhận bị khoá và không gọi onConfirm; Huỷ vẫn đóng được', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const el = ConfirmDialog({ open: true, title: 'T', confirmLabel: 'Đã nhận tiền', busy: false, confirmDisabled: true, onConfirm, onCancel }) as ReactElement<{
      onClose: () => void
      footer: ReactElement<{ children: ReactElement<{ onClick: () => void; disabled?: boolean }>[] }>
    }>
    const [, confirmBtn] = el.props.footer.props.children
    expect(confirmBtn.props.disabled).toBe(true)
    confirmBtn.props.onClick()
    expect(onConfirm).not.toHaveBeenCalled()
    el.props.onClose()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('không busy: onClose gọi onCancel, nút xác nhận gọi onConfirm', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const { el, confirmBtn } = dialogOf(false, onConfirm, onCancel)
    el.props.onClose()
    confirmBtn.props.onClick()
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledTimes(1)
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
