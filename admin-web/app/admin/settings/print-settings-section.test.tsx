import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { PrintSettings } from '@/lib/print/print-settings'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc: vi.fn() }) }))
vi.mock('@/lib/pos-browser-reads', () => ({ readPrintStatus: vi.fn() }))
vi.mock('@/lib/actions/print-settings', () => ({
  savePrintMode: vi.fn(), savePrintStation: vi.fn(), deletePrintStation: vi.fn(),
  createPairCode: vi.fn(), revokePrintAgent: vi.fn(), enqueueTestPrint: vi.fn(),
}))

const { default: PrintSettingsSection } = await import('./print-settings-section')

const base: PrintSettings = {
  mode: 'browser',
  stations: [],
  agent: null,
  kitchen_release_policy: 'pos_confirmation',
  staff_order_release_policy: 'pos_confirmation',
}
const agentSettings: PrintSettings = {
  ...base,
  mode: 'agent',
  stations: [
    { id: 'st-pos', name: 'Quầy', is_pos: true, is_default_kitchen: false, printer_name: 'XP-80' },
    { id: 'st-bep', name: 'Bếp', is_pos: false, is_default_kitchen: true, printer_name: null },
    { id: 'st-bar', name: 'Quầy bar', is_pos: false, is_default_kitchen: false, printer_name: null },
  ],
  agent: { id: 'a1', name: 'Máy quầy', version: '1.0.0', last_seen_at: null, online: true, printers: [{ name: 'XP-80' }, { name: 'XP-58' }] },
}
const render = (initial: PrintSettings | null) =>
  renderToStaticMarkup(<PrintSettingsSection storeId="store-1" initial={initial} />)

describe('PrintSettingsSection', () => {
  it('browser: có link In thử, không có danh sách trạm', () => {
    const html = render(base)
    expect(html).toContain('href="/print/test-slip"')
    expect(html).toContain('Một nơi (in bằng trình duyệt)')
    expect(html).toContain('Nhiều nơi (qua phần mềm in)')
    expect(html).not.toContain('Thêm máy')
    expect(html).not.toContain('Quầy bar')
  })

  it('chưa có dữ liệu (mig 114 chưa áp): hiện như hôm nay, chỉ có link In thử', () => {
    const html = render(null)
    expect(html).toContain('href="/print/test-slip"')
    expect(html).not.toContain('Nhiều nơi')
  })

  it('agent: có trạm, nút In thử theo từng trạm, nút Thêm máy', () => {
    const html = render(agentSettings)
    expect(html).toContain('Quầy bar')
    expect(html).toContain('Thêm máy')
    expect(html).toContain('Gỡ máy')
    expect((html.match(/>In thử</g) ?? []).length).toBe(3)
    expect(html).not.toContain('href="/print/test-slip"')
    // máy in để chọn lấy từ danh sách phần mềm báo lên
    expect(html).toContain('XP-58')
    expect(html).toContain('Đã kết nối')
  })

  it('trạm Quầy và Bếp mặc định không có nút Xoá, trạm thường có', () => {
    const html = render(agentSettings)
    expect((html.match(/>Xoá</g) ?? []).length).toBe(1)
  })

  it('policy automatic, đang browser: Nhiều nơi chọn được', () => {
    const html = render({ ...base, kitchen_release_policy: 'automatic' })
    expect(html).not.toMatch(/<input(?=[^>]*value="agent")(?=[^>]*disabled="")[^>]*>/)
  })

  it('agent + một policy automatic: ghi chú máy chủ tự xếp phiếu, không còn bắt giữ POS mở', () => {
    for (const patch of [{ staff_order_release_policy: 'automatic' as const }, { kitchen_release_policy: 'automatic' as const }]) {
      const html = render({ ...agentSettings, ...patch })
      expect(html).toContain('máy chủ tự xếp phiếu bếp và phiếu bàn')
      expect(html).toContain('không cần mở màn POS')
      expect(html).toContain('quá 30 phút trước khi phần mềm in chạy lại thì không được in')
      expect(html).not.toContain('chỉ in khi màn POS đang mở')
      expect(html).not.toContain('Quán trả trước chưa tự in được')
    }
  })

  it('agent + cả hai pos_confirmation, hoặc chế độ trình duyệt: không có ghi chú', () => {
    expect(render(agentSettings)).not.toContain('máy chủ tự xếp phiếu')
    expect(render({ ...base, staff_order_release_policy: 'automatic' })).not.toContain('máy chủ tự xếp phiếu')
  })

  it('cả hai policy pos_confirmation: Nhiều nơi chọn được', () => {
    const html = render(base)
    expect(html).not.toMatch(/<input(?=[^>]*value="agent")(?=[^>]*disabled="")[^>]*>/)
  })

  it('agent offline: hiện "Chưa kết nối"', () => {
    const html = render({ ...agentSettings, agent: { ...agentSettings.agent!, online: false } })
    expect(html).toContain('Chưa kết nối')
    expect(html).not.toContain('Đã kết nối')
  })

  it('agent chưa ghép máy nào: Chưa kết nối + nút Thêm máy, không có Gỡ máy', () => {
    const html = render({ ...agentSettings, agent: null })
    expect(html).toContain('Chưa kết nối')
    expect(html).toContain('Thêm máy')
    expect(html).not.toContain('Gỡ máy')
  })
})
