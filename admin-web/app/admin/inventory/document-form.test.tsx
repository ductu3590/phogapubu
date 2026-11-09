import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

// Giả lập Dialog để bắt props: vỏ form phiếu phải nối Esc (onEscape) về cùng đường đóng với nút Đóng / X.
const captured: Array<{ dismissible?: boolean; onClose: () => void; onEscape?: () => void }> = []
vi.mock('@/components/ui/dialog', () => ({
  Dialog: (props: { dismissible?: boolean; onClose: () => void; onEscape?: () => void; children?: ReactNode; footer?: ReactNode }) => {
    captured.push(props)
    return <div>{props.children}{props.footer}</div>
  },
}))
vi.mock('@/lib/actions/inventory', () => ({ postInventoryDocument: vi.fn() }))

const { DocumentFormShell } = await import('./document-form')

function shell(props: { dirty: boolean; busy: boolean; onClose: () => void }) {
  captured.length = 0
  renderToStaticMarkup(
    <DocumentFormShell title="Tạo phiếu nhập" blocker={null} error={null} onSave={vi.fn()} {...props}><p /></DocumentFormShell>,
  )
  return captured[0]
}

describe('DocumentFormShell — Esc', () => {
  it('hộp khoá (không đóng khi bấm ra ngoài) nhưng Esc vẫn đi qua đường đóng của form', () => {
    const onClose = vi.fn()
    const d = shell({ dirty: false, busy: false, onClose })
    expect(d.dismissible).toBe(false)
    expect(typeof d.onEscape).toBe('function')
    // Chưa gõ gì: Esc đóng luôn.
    d.onEscape!()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('đang lưu: Esc không đóng', () => {
    const onClose = vi.fn()
    shell({ dirty: true, busy: true, onClose }).onEscape!()
    expect(onClose).not.toHaveBeenCalled()
  })
})
