'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { LogOut } from 'lucide-react'
import { signOut } from '@/app/(auth)/login/actions'
import { Button, IconButton } from '@/components/ui/button'
import { getButtonClasses } from '@/components/ui/button-classes'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// Nút đăng xuất DÙNG CHUNG cho mọi khu (/staff, POS/admin, /mevo) — bấm là hỏi lại rồi mới thoát
// (2026-10-14): chạm nhầm giữa ca là văng ra màn đăng nhập, phải gõ lại mật khẩu.
// Kiểu nút là chuỗi (không nhận hàm render) để layout server truyền vào được.
//  - icon: nút vuông chỉ icon (thanh trên /staff, thẻ tài khoản /mevo)
//  - rail: ô icon + chữ trên thanh icon dọc POS/admin
//  - row:  dòng ghost rộng hết khung (ngăn kéo menu màn hẹp)

function ConfirmButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="primary" icon={<LogOut />} isLoading={pending}>
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
  const show = () => setOpen(true)

  let trigger
  if (variant === 'rail') {
    trigger = (
      <button
        type="button"
        onClick={show}
        title={email ? `Đăng xuất (${email})` : 'Đăng xuất'}
        className={cn(
          'flex w-16 cursor-pointer flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[12px] leading-tight font-medium text-slate-500 transition-colors hover:bg-red-50 hover:text-red-700 [&>svg]:size-[18px]',
          className,
        )}
      >
        <LogOut aria-hidden />
        Đăng xuất
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
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Đăng xuất?"
        description={email ? `Tài khoản ${email} sẽ thoát khỏi máy này.` : 'Tài khoản sẽ thoát khỏi máy này.'}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Ở lại</Button>
            <form action={signOut}>
              <ConfirmButton />
            </form>
          </>
        }
      >
        <p className="text-sm text-muted">Lần sau cần đăng nhập lại bằng email và mật khẩu.</p>
      </Dialog>
    </>
  )
}
