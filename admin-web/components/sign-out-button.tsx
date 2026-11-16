'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { LogOut } from 'lucide-react'
import { signOut } from '@/app/(auth)/login/actions'
import { Button, IconButton } from '@/components/ui/button'
import { getButtonClasses } from '@/components/ui/button-classes'
import { useBackdropDismiss } from '@/components/ui/use-backdrop-dismiss'
import { cn } from '@/lib/utils'

// Nút đăng xuất DÙNG CHUNG cho mọi khu (/staff, POS/admin, /mevo) — bấm là hỏi lại rồi mới thoát
// (2026-10-14): chạm nhầm giữa ca là văng ra màn đăng nhập, phải gõ lại mật khẩu.
// Kiểu nút là chuỗi (không nhận hàm render) để layout server truyền vào được.
//  - icon: nút vuông chỉ icon (thanh trên /staff, thẻ tài khoản /mevo)
//  - rail: ô chỉ icon ở chân thanh icon dọc POS/admin (tên ở title/aria-label, 2026-11-16)
//  - row:  dòng ghost rộng hết khung (ngăn kéo menu màn hẹp)

function ConfirmButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="primary" isLoading={pending} className="w-full">
      Đăng xuất
    </Button>
  )
}

export default function SignOutButton({
  email,
  variant = 'icon',
  className,
}: {
  email?: string | null
  variant?: 'icon' | 'rail' | 'row'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const show = () => setOpen(true)
  const backdrop = useBackdropDismiss(() => setOpen(false))

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  let trigger
  if (variant === 'rail') {
    trigger = (
      <button
        type="button"
        onClick={show}
        aria-label="Đăng xuất"
        title={email ? `Đăng xuất (${email})` : 'Đăng xuất'}
        className={cn(
          'flex min-h-11 w-16 cursor-pointer items-center justify-center rounded-xl px-1 py-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-700 [&>svg]:size-5',
          className,
        )}
      >
        <LogOut aria-hidden />
      </button>
    )
  } else if (variant === 'row') {
    trigger = (
      <button type="button" onClick={show} className={cn(getButtonClasses('ghost'), 'w-full justify-start px-3', className)}>
        <LogOut className="size-4" aria-hidden />
        Đăng xuất
      </button>
    )
  } else {
    trigger = <IconButton icon={<LogOut />} label="Đăng xuất" onClick={show} className={className} />
  }

  return (
    <>
      {trigger}
      {/* Hộp xác nhận gọn: chỉ tiêu đề + 2 nút (anh Tú 2026-10-14 — không cần chữ giải thích, không nút X).
          Esc hoặc bấm ra ngoài = Ở lại. */}
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onCancel={(event) => { event.preventDefault(); setOpen(false) }}
        {...backdrop}
        className="ui-dialog m-auto w-[min(320px,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-foreground shadow-modal"
      >
        {/* Đệm nằm ở div trong: đệm trên chính <dialog> thì bấm vào đệm bị tính là bấm ra ngoài. */}
        <div className="p-5">
          <h2 id={titleId} className="text-center text-base font-semibold">Đăng xuất?</h2>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button onClick={() => setOpen(false)} className="w-full">Ở lại</Button>
            <form action={signOut}>
              <ConfirmButton />
            </form>
          </div>
        </div>
      </dialog>
    </>
  )
}
