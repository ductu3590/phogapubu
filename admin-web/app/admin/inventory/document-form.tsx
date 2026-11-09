'use client'

import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { postInventoryDocument } from '@/lib/actions/inventory'
import { buildDocumentLines, type DocKind, type DraftLine } from '@/lib/inventory'
import ConfirmDialog from '../pos/confirm-dialog'

/** Ngày YYYY-MM-DD cộng n ngày (lịch, không theo giờ). */
export function addDaysIso(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Ngày ghi lùi tối đa (khớp RPC inventory_post_document). */
export const MAX_BACKDATE_DAYS = 7

export type DocumentHeader = {
  docDate: string
  supplierName: string | null
  note: string | null
  paidStatus: 'paid' | 'unpaid' | null
  paidMethod: 'cash' | 'bank' | null
}

/**
 * Gửi một phiếu. `clientRequestId` sinh MỘT lần khi form mở (form mount theo lần mở) và giữ nguyên qua mọi lần bấm
 * Lưu thất bại: mạng rớt mà server đã lưu thì gửi lại trả đúng phiếu cũ (`replayed`), không ra phiếu thứ hai.
 * Chỉ bỏ khi lưu xong hoặc đóng form (component unmount).
 */
export function useDocumentSubmit(kind: DocKind, today: string, onSaved: () => void, opts?: { withCost?: boolean }) {
  const toast = useToast()
  const [clientRequestId] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(header: DocumentHeader, drafts: DraftLine[]) {
    if (busy) return
    const built = buildDocumentLines(kind, drafts, opts)
    if (!built.ok) {
      setError(built.error)
      return
    }
    setBusy(true)
    setError(null)
    const res = await postInventoryDocument({
      kind,
      // Hôm nay gửi null: server lấy ngày kinh doanh của chính nó (mốc = lúc lưu).
      docDate: header.docDate === today ? null : header.docDate,
      supplierName: header.supplierName,
      note: header.note,
      paidStatus: header.paidStatus,
      paidMethod: header.paidMethod,
      lines: built.lines,
      clientRequestId,
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    toast({ tone: 'success', title: `Đã lưu ${res.docNo}` })
    if (res.beforeCountDocNo) {
      toast({
        tone: 'info',
        title: `Phiếu ghi lùi ngày trước phiếu kiểm ${res.beforeCountDocNo} nên tồn hiện tại không đổi`,
        description: 'Số đếm ở phiếu kiểm là số thật; phiếu này chỉ hiện trong thẻ kho trước mốc kiểm.',
      })
    }
    onSaved()
  }

  return { busy, error, submit }
}

/**
 * Vỏ chung của form phiếu: Dialog bên phải (sheet dưới trên mobile), không đóng khi bấm ra ngoài.
 * Đóng khi đã gõ → hỏi "Bỏ phiếu đang nhập?" bằng ConfirmDialog (không window.confirm).
 */
export function DocumentFormShell({ title, description, dirty, busy, blocker, error, onClose, onSave, children }: {
  title: string
  description?: ReactNode
  dirty: boolean
  busy: boolean
  /** Lý do chưa lưu được (nút Lưu tắt, chữ hiện cạnh nút). */
  blocker: string | null
  /** Lỗi lần lưu trước (server hoặc dòng sai). */
  error: string | null
  onClose: () => void
  onSave: () => void
  children: ReactNode
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const requestClose = () => {
    if (busy) return
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }

  return (
    <>
      <Dialog
        open
        placement="side"
        dismissible={false}
        onClose={requestClose}
        title={title}
        description={description}
        className="md:w-[640px]"
        footer={
          <>
            {blocker ? <p className="mr-auto text-[13px] text-warning">{blocker}</p> : null}
            <Button onClick={requestClose} disabled={busy}>Đóng</Button>
            <Button variant="primary" onClick={onSave} isLoading={busy} disabled={blocker !== null}>Lưu</Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? (
            <p role="alert" className="rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-sm text-critical">{error}</p>
          ) : null}
          {children}
        </div>
      </Dialog>
      {confirmDiscard ? (
        <ConfirmDialog
          open
          title="Bỏ phiếu đang nhập?"
          description="Các dòng đã nhập sẽ mất."
          confirmLabel="Bỏ phiếu"
          tone="danger"
          busy={false}
          onConfirm={() => { setConfirmDiscard(false); onClose() }}
          onCancel={() => setConfirmDiscard(false)}
        />
      ) : null}
    </>
  )
}
