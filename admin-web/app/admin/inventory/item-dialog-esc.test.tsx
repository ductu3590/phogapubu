import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { StockRow } from '@/lib/inventory'

// Giả lập Dialog để bắt props: Esc (onEscape), X (onClose) phải đi chung một đường đóng có hỏi bỏ thay đổi.
type Captured = { title?: ReactNode; dismissible?: boolean; onClose: () => void; onEscape?: () => void }
const captured: Captured[] = []
vi.mock('@/components/ui/dialog', () => ({
  Dialog: (props: Captured & { children?: ReactNode; footer?: ReactNode }) => {
    captured.push(props)
    return <div>{props.children}{props.footer}</div>
  },
}))
vi.mock('@/lib/actions/inventory', () => ({ saveInventoryItem: vi.fn(), postInventoryDocument: vi.fn() }))

const { ToastProvider } = await import('@/components/ui/toast')
const { default: ItemDialog } = await import('./item-dialog')
const { closeAction } = await import('./document-form')

const item: StockRow = {
  id: 'a', name: 'Bia Hà Nội lon', unit: 'lon', kind: 'goods', sku: null, minStock: null, isActive: true, qty: 0,
  lastUnitCost: null, stockValue: 0,
}

describe('ItemDialog — Esc', () => {
  it('closeAction: đang lưu → bỏ qua; đã gõ → hỏi bỏ; chưa gõ → đóng', () => {
    expect(closeAction(false, true)).toBe('ignore')
    expect(closeAction(true, true)).toBe('ignore')
    expect(closeAction(true, false)).toBe('confirm')
    expect(closeAction(false, false)).toBe('close')
  })

  it('Esc và X dùng chung đường đóng; chưa gõ gì thì Esc đóng luôn', () => {
    const onClose = vi.fn()
    captured.length = 0
    renderToStaticMarkup(<ToastProvider><ItemDialog item={item} onClose={onClose} onSaved={vi.fn()} /></ToastProvider>)
    const d = captured.find((c) => c.title === 'Sửa hàng hoá')!
    expect(typeof d.onEscape).toBe('function')
    expect(d.onEscape).toBe(d.onClose)
    d.onEscape!()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
