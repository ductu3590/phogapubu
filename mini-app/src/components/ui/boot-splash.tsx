// Màn chờ khởi động của theme garden (anh Tú 2026-11-19): chỉ một dòng chữ ở giữa, không logo, không thanh đầu /
// thanh tab — để không chớp "M · MEVO" rồi mới đổi sang logo quán. Layout hiện màn này tới khi đọc xong quán (bootDone).
export const BOOT_SPLASH_TEXT = "MEVO.VN - Siêu ứng dụng cho nhà hàng, quán ăn, cà phê...";

export default function BootSplash() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background px-8" role="status" aria-live="polite">
      <p className="text-center text-[15px] leading-snug text-text-secondary">{BOOT_SPLASH_TEXT}</p>
    </div>
  );
}
