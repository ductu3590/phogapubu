import { describe, expect, it, vi } from 'vitest'
import { applyCollectOutcome } from './collect-flow'

// Ngăn kéo A04 sau khi bấm "Đã nhận tiền": thông báo phải đưa LÊN TRANG (BillsReportView), không giữ trong ngăn kéo —
// thu xong dòng 'W:S:<phiên>' thành 'P:<khoản>', ngăn kéo (bám theo key cũ) bị gỡ cùng mọi state bên trong.
const handlers = () => ({ notify: vi.fn(), refresh: vi.fn(), close: vi.fn(), showError: vi.fn() })

describe('applyCollectOutcome', () => {
  it('đã thu từ trước: báo lên trang câu nêu khoản ĐÃ GHI, tải lại, đóng ngăn kéo', () => {
    const h = handlers()
    applyCollectOutcome({ kind: 'done', message: 'Bàn đã được thu trước đó: Tiền mặt 90.000đ' }, h)
    expect(h.notify).toHaveBeenCalledWith('Bàn đã được thu trước đó: Tiền mặt 90.000đ')
    expect(h.refresh).toHaveBeenCalledTimes(1)
    expect(h.close).toHaveBeenCalledTimes(1)
    expect(h.showError).not.toHaveBeenCalled()
    // báo TRƯỚC khi đóng: thông báo sống ở trang, không mất theo ngăn kéo
    expect(h.notify.mock.invocationCallOrder[0]).toBeLessThan(h.close.mock.invocationCallOrder[0])
  })

  it('thu mới bình thường: không báo gì, tải lại, đóng ngăn kéo', () => {
    const h = handlers()
    applyCollectOutcome({ kind: 'done', message: null }, h)
    expect(h.notify).not.toHaveBeenCalled()
    expect([h.refresh.mock.calls.length, h.close.mock.calls.length]).toEqual([1, 1])
  })

  it('lỗi (thử lại được / bill đổi): hiện lỗi trong hộp, KHÔNG đóng, KHÔNG tải lại', () => {
    for (const out of [{ kind: 'retry', error: 'Lỗi kết nối' }, { kind: 'stale', error: 'Số tiền không khớp bill' }] as const) {
      const h = handlers()
      applyCollectOutcome(out, h)
      expect(h.showError).toHaveBeenCalledWith(out.error)
      expect([h.notify.mock.calls.length, h.refresh.mock.calls.length, h.close.mock.calls.length]).toEqual([0, 0, 0])
    }
  })
})
