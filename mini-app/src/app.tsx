import { RouterProvider } from "react-router-dom";
import router from "./router";
import { ReactQueryProvider } from "./lib/react-query-provider";
import React, { useEffect } from "react";
import { SnackbarProvider } from "zmp-ui";
import { useAppStore, parseQRParams, PaymentMethod, PaymentTiming } from "./stores/app.store";
import { supabase } from "./services/supabase";
import { sessionOrderService } from "./services/order/order.api";
import { getOrCreateDeviceId } from "./services/device-id";
import { getPublicWorkflow } from "./services/workflow/workflow.api";
import { getUserID } from "zmp-sdk";

function AppInit() {
  const {
    setStoreInfo, setTableInfo, setZaloUserId, setOrderMode, setDeviceId, setSessionState,
    setEntryContext, setWorkflow, setWorkflowError,
  } = useAppStore();
  const storeId = useAppStore((s) => s.storeId);
  const tableId = useAppStore((s) => s.tableId);
  const zaloUserId = useAppStore((s) => s.zaloUserId);
  const deviceId = useAppStore((s) => s.deviceId);
  const paymentTiming = useAppStore((s) => s.paymentTiming);

  // Device id đọc ĐỒNG BỘ từ localStorage, không chờ mạng: nó là chân định danh dự phòng khi
  // getUserID() fail (PB5). Hàm tự idempotent nên StrictMode chạy 2 lần không sinh 2 id.
  useEffect(() => {
    setDeviceId(getOrCreateDeviceId());
  }, [setDeviceId]);

  useEffect(() => {
    getUserID()
      .then((id) => { if (id) setZaloUserId(id); })
      .catch(() => { /* không ở trong Zalo — bỏ qua */ });
  }, [setZaloUserId]);

  useEffect(() => {
    const { storeSlug, entryContext } = parseQRParams();
    if (!storeSlug) return;

    setEntryContext(entryContext);

    const storeQuery = supabase
      .from("stores")
      .select("id, name, slug, logo_url, address, phone, zalo_oa_id, zalo_oa_url, payment_methods, payment_timing, takeaway_banner_url, about_text, wifi_name, wifi_password, primary_color, is_accepting_orders, serving_hours, delivery_area_note, terms_of_use")
      .eq("slug", storeSlug)
      .eq("is_active", true)
      .single();

    const tableQuery =
      entryContext.kind === "table"
        ? supabase
            .from("tables")
            .select("id, table_number")
            .eq("id", entryContext.tableId)
            .eq("is_active", true)
            .single()
        : Promise.resolve({ data: null, error: null });

    let cancelled = false;
    void Promise.all([storeQuery, tableQuery]).then(async ([storeRes, tableRes]) => {
      if (cancelled) return;
      if (storeRes.data) {
        // Màu chủ đạo theo quán (theme runtime) — set CSS var để mọi class Tailwind
        // dùng theme("colors.primary") (đã trỏ sang var(--color-primary) trong tokens.js)
        // đổi màu ngay không cần build lại.
        document.documentElement.style.setProperty(
          "--color-primary",
          storeRes.data.primary_color || "#A0673D",
        );
        setStoreInfo({
          storeSlug: storeRes.data.slug,
          storeId: storeRes.data.id,
          storeName: storeRes.data.name,
          storeLogoUrl: storeRes.data.logo_url ?? "",
          storeAddress: storeRes.data.address ?? "",
          storePhone: storeRes.data.phone ?? "",
          zaloOaId: storeRes.data.zalo_oa_id ?? "",
          zaloOaUrl: storeRes.data.zalo_oa_url ?? "",
          paymentMethods: (() => {
            const raw = (storeRes.data.payment_methods ?? []) as string[];
            // Chuẩn hoá tên cũ 'zalopay' → 'zalo_checkout' (đề phòng config cache/cũ sau rename).
            const norm = raw.map((m) => (m === "zalopay" ? "zalo_checkout" : m));
            const valid = norm.filter((m): m is PaymentMethod =>
              m === "zalo_checkout" || m === "cash"
            );
            return valid.length > 0 ? valid : ["zalo_checkout", "cash"];
          })(),
          paymentTiming: (storeRes.data.payment_timing === "postpay"
            ? "postpay"
            : "prepay") as PaymentTiming,
          takeawayBannerUrl: storeRes.data.takeaway_banner_url ?? "",
          aboutText: storeRes.data.about_text ?? "",
          wifiName: storeRes.data.wifi_name ?? "",
          wifiPassword: storeRes.data.wifi_password ?? "",
          isAcceptingOrders: storeRes.data.is_accepting_orders ?? true,
          servingHours: Array.isArray(storeRes.data.serving_hours)
            ? (storeRes.data.serving_hours as unknown as import("@/utils/store-hours").ServingShift[])
            : [],
          deliveryAreaNote: storeRes.data.delivery_area_note ?? "",
          termsOfUse: storeRes.data.terms_of_use ?? "",
        });

        try {
          const workflow = await getPublicWorkflow(storeRes.data.id);
          if (cancelled) return;
          setWorkflow(workflow);
          setOrderMode(
            entryContext.kind === "table"
              ? "dine_in"
              : workflow.takeawayEnabled || workflow.shippingEnabled
                ? "takeaway"
                : "dine_in",
          );
        } catch {
          if (!cancelled) setWorkflowError("Không tải được cấu hình đặt món của quán.");
        }
      }
      if (tableRes.data) {
        setTableInfo({
          tableId: tableRes.data.id,
          tableNumber: tableRes.data.table_number,
        });
      }
    });
    return () => { cancelled = true; };
  }, [setStoreInfo, setTableInfo, setOrderMode, setEntryContext, setWorkflow, setWorkflowError]);

  // Trạng thái phiên bàn — effect RIÊNG, chạy sau khi store + bàn + hai chân định danh đã sẵn
  // sàng. KHÔNG gộp vào effect load store phía trên: lúc đó zaloUserId thường còn rỗng
  // (getUserID chạy song song, không ai chờ ai) nên sẽ hỏi phiên bằng danh tính thiếu.
  useEffect(() => {
    if (!storeId || !tableId) return;
    if (paymentTiming !== "postpay") {
      setSessionState({ mode: "prepay" });
      return;
    }
    let aborted = false;
    const refresh = () => {
      void sessionOrderService
        .getTableSessionState(tableId, zaloUserId || null, deviceId || null)
        .then((st) => { if (!aborted) setSessionState(st); })
        .catch(() => {
          // Không hỏi được trạng thái thì không khóa oan; RPC tạo đơn vẫn là chốt chặn thật.
          if (!aborted) setSessionState(null);
        });
    };
    refresh();
    // Chủ quán có thể vừa nhận khách ở POS trong khi khách vẫn mở QR ở đây.
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    const interval = window.setInterval(refresh, 10_000);
    return () => {
      aborted = true;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      window.clearInterval(interval);
    };
  }, [storeId, tableId, zaloUserId, deviceId, paymentTiming, setSessionState]);

  return null;
}

export default function MiniApp() {
  return (
    <React.StrictMode>
      <SnackbarProvider>
        <ReactQueryProvider>
          <AppInit />
          <RouterProvider router={router} />
        </ReactQueryProvider>
      </SnackbarProvider>
    </React.StrictMode>
  );
}
