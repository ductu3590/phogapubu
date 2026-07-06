// Bottom sheet xin 3 quyền: Follow OA (ZNS) + tên + SĐT.
// Cả hai SDK calls trong cùng handler — lỗi bỏ qua, không block UX.
import { useState } from "react";
import { followOA, authorize } from "zmp-sdk";

interface PermissionSheetProps {
  oaId: string;
  visible: boolean;
  onClose: () => void;
  // followed = user thực sự quan tâm OA thành công (không phải chỉ bấm nút rồi từ chối)
  onGranted: (followed: boolean) => void;
}

export default function PermissionSheet({
  oaId,
  visible,
  onClose,
  onGranted,
}: PermissionSheetProps) {
  const [loading, setLoading] = useState(false);

  if (!visible) return null;

  const handleGrant = async () => {
    setLoading(true);
    let followed = false;
    try {
      if (oaId) {
        await followOA({ id: oaId });
        followed = true;
      }
    } catch { /* -201 = user từ chối — không đánh dấu đã kết nối */ }
    try {
      await authorize({ scopes: ["scope.userInfo", "scope.userPhonenumber"] });
    } catch { /* bỏ qua nếu app chưa được cấp quyền */ }
    setLoading(false);
    onGranted(followed);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative rounded-t-2xl bg-white">
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-neutral100" />
        </div>
        <div className="flex flex-col gap-4 px-6 pb-8 pt-4">
          <div className="text-center">
            <p className="text-large-m font-bold text-text-primary">
              Kết nối để nhận ưu đãi
            </p>
            <p className="mt-1 text-small text-text-secondary">
              Cấp quyền một lần, dùng mãi mãi
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-yellow-50 text-xl">
                🔔
              </div>
              <div>
                <p className="text-small-m font-semibold text-text-primary">
                  Nhận thông báo Zalo (ZNS)
                </p>
                <p className="text-xxsmall text-text-secondary">
                  Biết ngay khi món xong. Hoàn toàn miễn phí.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-purple-50 text-xl">
                👤
              </div>
              <div>
                <p className="text-small-m font-semibold text-text-primary">
                  Tên &amp; Số điện thoại
                </p>
                <p className="text-xxsmall text-text-secondary">
                  Điền form mang về nhanh hơn. Không spam.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <button
              onClick={handleGrant}
              disabled={loading}
              className="w-full rounded-xl bg-primary py-3 text-small-m font-semibold text-white disabled:opacity-60 active:opacity-80"
            >
              {loading ? "Đang xử lý..." : "Đồng ý & Kết nối"}
            </button>
            <button
              onClick={onClose}
              className="w-full rounded-xl py-3 text-small text-text-secondary active:opacity-60"
            >
              Để sau
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
