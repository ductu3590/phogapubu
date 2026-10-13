import { useState } from "react";
import { openPhone } from "zmp-sdk";
import { PhoneIcon } from "@/components/common/icons";
import ConfirmSheet from "@/components/ui/confirm-sheet";
import { callPhone } from "@/utils/call-phone";
import { isZaloWebview } from "@/utils/open-external";
import { formatPhoneDisplay } from "@/utils/account-profile";

const displayPhone = (phone: string) => formatPhoneDisplay(phone.replace(/[^\d+]/g, "")) || phone;

/** Mở màn gọi điện thật của máy (trong Zalo `tel:` không gọi được — xem utils/call-phone.ts). */
export function dialPhone(phone: string): void {
  callPhone(phone, {
    inZalo: isZaloWebview(navigator.userAgent),
    openInZalo: openPhone,
    fallback: (tel) => { window.location.href = tel; },
  });
}

/** Hộp đáy "Gọi cho quán" + nút "Gọi ngay" — dùng khi chỗ bấm chỉ là dòng số điện thoại, chưa phải nút gọi. */
export function CallPhoneSheet({ phone, open, onClose }: { phone: string; open: boolean; onClose: () => void }) {
  return (
    <ConfirmSheet
      open={open}
      title="Gọi cho quán"
      description={<span className="text-large-m font-bold text-text-primary">{displayPhone(phone)}</span>}
      confirmLabel="Gọi ngay"
      cancelLabel="Đóng"
      onConfirm={() => { onClose(); dialPhone(phone); }}
      onClose={onClose}
    />
  );
}

// Số điện thoại quán bấm được: chạm → hộp đáy "Gọi cho quán" → "Gọi ngay" mở màn gọi điện thật của máy.
export default function CallPhoneButton({ phone }: { phone: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-2.5 text-left active:opacity-70">
        <PhoneIcon className="size-4 shrink-0 text-text-secondary" />
        <span className="text-small font-semibold text-primary underline decoration-primary/40 underline-offset-2">{displayPhone(phone)}</span>
      </button>
      <CallPhoneSheet phone={phone} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
