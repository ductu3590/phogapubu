'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { LogOut } from 'lucide-react'
import { signOut } from '@/app/(auth)/login/actions'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'

// Nút đăng xuất chỉ có icon + hộp thoại xác nhận (màn /staff, 2026-10-14): nhân viên cầm điện thoại
// một tay giữa lúc bưng bê, chạm nhầm góc phải là văng ra màn đăng nhập.

function ConfirmButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="primary" icon={<LogOut />} isLoading={pending}>
      Đăng xuất
    </Button>
  )
}

export default function SignOutButton({ email }: { email?: string | null }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <IconButton icon={<LogOut />} label="Đăng xuất" onClick={() => setOpen(true)} />
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
