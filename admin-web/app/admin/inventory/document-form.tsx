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

/**
 * Đóng một form nhập liệu (nút Đóng / X / Esc) thì làm gì: đang lưu → bỏ qua; đã gõ → hỏi bỏ; chưa gõ → đóng luôn.
 * Dùng chung cho form phiếu và hộp hàng hoá.
 */
export function closeAction(dirty: boolean, busy: boolean): 'ignore' | 'confirm' | 'close' {
  if (busy) return 'ignore'
  return dirty ? 'confirm' : 'close'
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

type PostResult = Awaited<ReturnType<typeof postInventoryDocument>>

/**
 * Hàm gửi phiếu thuần (không React) gắn chặt MỘT `clientRequestId`: gọi bao nhiêu lần cũng gửi cùng mã đó, nên
 * mạng rớt mà server đã lưu thì lần gửi lại trả đúng phiếu cũ (`replayed`), không ra phiếu thứ hai.
 */
export function makeDocumentSubmit(deps: {
  kind: DocKind
  today: string
  clientRequestId: string
  post: typeof postInventoryDocument
  withCost?: boolean
}) {
  return async (header: DocumentHeader, drafts: DraftLine[]): Promise<PostResult> => {
    const built = buildDocumentLines(deps.kind, drafts, { withCost: deps.withCost })
    if (!built.ok) return { ok: false, error: built.error }
    return deps.post({
      kind: deps.kind,
      // Hôm nay gửi null: server lấy ngày kinh doanh của chính nó (mốc = lúc lưu).
      docDate: header.docDate === deps.today ? null : header.docDate,
      supplierName: header.supplierName,
      note: header.note,
      paidStatus: header.paidStatus,
      paidMethod: header.paidMethod,
      lines: built.lines,
      clientRequestId: deps.clientRequestId,
    })
  }
}

/**
 * Gửi một phiếu từ form. `clientRequestId` sinh MỘT lần khi form mount (mỗi lần mở form là một lần mount) và giữ
 * nguyên qua mọi lần bấm Lưu thất bại; chỉ bỏ khi lưu xong hoặc đóng form (unmount).
 */
export function useDocumentSubmit(kind: DocKind, today: string, onSaved: () => void, opts?: {
  withCost?: boolean
  /** Tiêu đề toast khi lưu xong (mặc định "Đã lưu PN-0004"). */
  successTitle?: (docNo: string) => string
}) {
  const toast = useToast()
  const [clientRequestId] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const send = makeDocumentSubmit({ kind, today, clientRequestId, post: postInventoryDocument, withCost: opts?.withCost })

  async function submit(header: DocumentHeader, drafts: DraftLine[]) {
    if (busy) return
    setBusy(true)
    setError(null)
    const res = await send(header, drafts)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    toast({ tone: 'success', title: opts?.successTitle?.(res.docNo) ?? `Đã lưu ${res.docNo}` })
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
 * Đóng (nút Đóng, X, Esc) khi đã gõ → hỏi "Bỏ phiếu đang nhập?" bằng ConfirmDialog (không window.confirm).
 * Lỗi lưu và lý do chưa lưu được nằm ở CHÂN hộp, cạnh nút Lưu: thân hộp cuộn, ở 375px lỗi đặt trên đầu sẽ khuất.
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
    const action = closeAction(dirty, busy)
    if (action === 'confirm') setConfirmDiscard(true)
    else if (action === 'close') onClose()
  }

  return (
    <>
      <Dialog
        open
        placement="side"
        dismissible={false}
        onClose={requestClose}
        onEscape={requestClose}
        title={title}
        description={description}
        className="md:w-[640px]"
        footer={
          <>
            {error ? (
              <p role="alert" data-slot="form-error"
                className="basis-full rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-sm text-critical">
                {error}
              </p>
            ) : null}
            {blocker ? <p data-slot="form-blocker" className="mr-auto text-[13px] text-warning">{blocker}</p> : null}
            <Button onClick={requestClose} disabled={busy}>Đóng</Button>
            <Button variant="primary" onClick={onSave} isLoading={busy} disabled={blocker !== null}>Lưu</Button>
          </>
        }
      >
        <div className="space-y-4">{children}</div>
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
