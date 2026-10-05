import { UserIcon } from "@/components/common/icons";

// Khung chờ (spec Q7): sau này là nơi lấy thông tin Zalo, điểm tích luỹ, mã giảm giá.
export default function AccountPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-primary/10 text-primary"><UserIcon className="size-8" /></span>
      <p className="text-large-m font-bold text-text-primary">Tài khoản</p>
      <p className="text-small text-text-secondary">Cập nhật trong phiên bản sắp tới</p>
    </div>
  );
}
