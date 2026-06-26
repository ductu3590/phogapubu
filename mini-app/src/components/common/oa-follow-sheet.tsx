// Hiện bottom sheet prompt khách follow OA để nhận thông báo ZNS.
// Chỉ show 1 lần per store (flag trong localStorage do app.tsx quản lý).
import { useState } from "react";
import { followOA } from "zmp-sdk";

interface OaFollowSheetProps {
  oaId: string;
  visible: boolean;
  onClose: () => void;
}

export default function OaFollowSheet({ oaId, visible, onClose }: OaFollowSheetProps) {
  const [loading, setLoading] = useState(false);

  if (!oaId || !visible) return null;

  const handleFollow = async () => {
    setLoading(true);
    try {
      await followOA({ id: oaId });
    } catch {
      // -201 = user từ chối — không sao, vẫn đóng sheet
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative rounded-t-2xl bg-white">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-neutral100" />
        </div>
        <div className="flex flex-col items-center gap-4 px-6 pb-8 pt-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <span className="text-3xl">🔔</span>
          </div>
          <div>
            <p className="text-large-m font-bold text-text-primary">
              Nhận thông báo món ăn
            </p>
            <p className="mt-1.5 text-small text-text-secondary">
              Quan tâm để nhận thông báo Zalo khi món của bạn sắp được mang ra.
              Hoàn toàn miễn phí.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2.5 pt-1">
            <button
              onClick={handleFollow}
              disabled={loading}
              className="w-full rounded-xl bg-primary py-3 text-small-m font-semibold text-white disabled:opacity-60 active:opacity-80"
            >
              {loading ? "Đang xử lý..." : "Quan tâm để nhận thông báo"}
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
