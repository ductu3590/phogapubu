import { useEffect, useState } from "react";
import { followOA } from "zmp-sdk";
import { useAppStore } from "@/stores/app.store";
import type { OaFollowOutcome } from "@/utils/oa-follow-message";

// Sự kiện để MỌI chỗ dùng hook (thanh công cụ, trang Thông tin nhà hàng) cùng đổi sang
// "Đã quan tâm" ngay khi khách quan tâm ở một chỗ.
const EVENT = "mevo:oa-connected";

const keyFor = (storeId: string) => (storeId ? `mevo_oa_connected_v2_${storeId}` : "");

function readConnected(key: string): boolean {
  if (!key) return false;
  try {
    return !!localStorage.getItem(key);
  } catch {
    return false;
  }
}

/**
 * Trạng thái quan tâm OA của quán. Chỉ đánh dấu "đã quan tâm" khi followOA THÀNH CÔNG
 * (bài học 2026-07-06: cờ cũ set cả khi khách từ chối nên lời mời biến mất vĩnh viễn).
 * Giữ nguyên key `mevo_oa_connected_v2_<storeId>` để khách đã quan tâm không bị mời lại.
 */
export function useOaFollow() {
  const { storeId, zaloOaId } = useAppStore();
  const key = keyFor(storeId);
  const [connected, setConnected] = useState(() => readConnected(key));
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setConnected(readConnected(key));
    const sync = () => setConnected(readConnected(key));
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, [key]);

  /** Ghi nhận đã quan tâm (khi follow thành công ở PermissionSheet hoặc ở nút). */
  const markConnected = () => {
    if (!key) return;
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* trình duyệt chặn lưu trữ — vẫn đổi trạng thái trong phiên */
    }
    setConnected(true);
    window.dispatchEvent(new Event(EVENT));
  };

  /** Kết quả để nơi gọi báo cho khách — trước đây nuốt lỗi nên bấm "không có tác dụng gì" (2026-10-09). */
  const follow = async (): Promise<OaFollowOutcome | null> => {
    if (!zaloOaId || !key || pending) return null;
    if (connected) return { kind: "already" };
    setPending(true);
    try {
      await followOA({ id: zaloOaId });
      markConnected();
      return { kind: "followed" };
    } catch (error) {
      const code = (error as { code?: number | string } | null)?.code;
      // -201: khách bấm từ chối — giữ nút để bấm lại, không báo lỗi.
      if (code === -201) return { kind: "denied" };
      return { kind: "error", code };
    } finally {
      setPending(false);
    }
  };

  return { available: !!zaloOaId, connected, pending, follow, markConnected };
}
