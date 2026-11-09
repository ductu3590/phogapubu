import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { PrintStatus } from '@/lib/pos-browser-reads'
import PrintStatusBanner, { PRINT_BANNER_VISIBLE_JOBS } from './print-status-banner'

const base: PrintStatus = { mode: 'agent', agent_online: true, last_seen_at: null, queued_count: 0, problem_jobs: [] }
const job = (over: Record<string, unknown> = {}) => ({
  id: 'j1', kind: 'kitchen_ticket', status: 'failed' as const, error: 'Máy in hết giấy', created_at: '2026-11-09T10:00:00Z',
  label: 'Phiếu bếp · Bàn 5', request: { kind: 'order' as const, orderId: 'o1' }, ...over,
})
const render = (status: PrintStatus | null, busy?: ReadonlySet<string>) =>
  renderToStaticMarkup(<PrintStatusBanner status={status} onRetry={vi.fn()} onBrowserPrint={vi.fn()} onDismiss={vi.fn()} onDismissAll={vi.fn()} busyJobIds={busy} />)

describe('PrintStatusBanner', () => {
  it('chưa đọc được trạng thái / browser: không vẽ gì', () => {
    expect(render(null)).toBe('')
    expect(render({ ...base, mode: 'browser', agent_online: false, problem_jobs: [job()] })).toBe('')
  })
  it('agent online không lỗi: không vẽ gì', () => {
    expect(render(base)).toBe('')
  })
  it('agent offline: có "Máy in chưa kết nối"', () => {
    expect(render({ ...base, agent_online: false })).toContain('Máy in chưa kết nối')
  })
  it('job failed: hiện label, lỗi, 2 nút', () => {
    const html = render({ ...base, problem_jobs: [job()] })
    expect(html).toContain('Phiếu bếp · Bàn 5')
    expect(html).toContain('Máy in hết giấy')
    expect(html).toContain('In lại')
    expect(html).toContain('In bằng trình duyệt')
  })
  it('job expired: hiện như failed', () => {
    const html = render({ ...base, problem_jobs: [job({ status: 'expired', error: null })] })
    expect(html).toContain('Phiếu bếp · Bàn 5')
    expect(html).toContain('In bằng trình duyệt')
  })
  it('job test (request null): không có nút In bằng trình duyệt', () => {
    const html = render({ ...base, problem_jobs: [job({ kind: 'test', label: 'In thử', request: null })] })
    expect(html).toContain('In lại')
    expect(html).not.toContain('In bằng trình duyệt')
  })
  it('agent offline và có job lỗi: hiện cả hai', () => {
    const html = render({ ...base, agent_online: false, problem_jobs: [job()] })
    expect(html).toContain('Máy in chưa kết nối')
    expect(html).toContain('Phiếu bếp · Bàn 5')
  })
})

describe('PrintStatusBanner: sự cố dài', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => job({ id: `j${i}`, label: `Phiếu số ${i}` }))
  it('50 phiếu lỗi: một dòng tóm tắt + chỉ vài phiếu đầu, có Xem tất cả và Bỏ qua tất cả', () => {
    const html = render({ ...base, problem_jobs: many(50) })
    expect(html).toContain('50 phiếu in lỗi')
    expect((html.match(/Phiếu số \d+ — in lỗi/g) ?? []).length).toBe(PRINT_BANNER_VISIBLE_JOBS)
    expect(html).toContain('Xem tất cả')
    expect(html).toContain('Bỏ qua tất cả')
  })
  it('ít phiếu: không có Xem tất cả; mỗi phiếu có nút Bỏ qua', () => {
    const html = render({ ...base, problem_jobs: many(2) })
    expect(html).not.toContain('Xem tất cả')
    expect((html.match(/>Bỏ qua</g) ?? []).length).toBe(2)
  })
  it('phiếu đang chạy thao tác: nút bị khoá', () => {
    const html = render({ ...base, problem_jobs: [job()] }, new Set(['j1']))
    expect(html).toMatch(/aria-disabled="true"[^>]*>(?:(?!<\/button>).)*In lại/)
  })
})
