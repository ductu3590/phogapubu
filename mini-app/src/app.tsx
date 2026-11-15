import { RouterProvider } from "react-router-dom";
import router from "./router";
import { ReactQueryProvider } from "./lib/react-query-provider";
import React, { useEffect, useRef } from "react";
import { SnackbarProvider as ZaSnackbarProvider, useSnackbar } from "zmp-ui";
import { useAppStore, parseQRParams, PaymentMethod, PaymentTiming } from "./stores/app.store";
import { supabase } from "./services/supabase";
import { sessionOrderService } from "./services/order/order.api";
import { getOrCreateDeviceId } from "./services/device-id";
import { getPublicWorkflow, mapPublicWorkflow } from "./services/workflow/workflow.api";
import { buildMenu, categoryService } from "./services/category/category.api";
import { parseBootstrap, pickTableForStore, type BootstrapPayload, type StoreBootRow } from "@/utils/bootstrap";
import { parseActiveDiscounts } from "@/utils/menu-discount";
import { GET_STORE_MENU_KEY } from "@/constants/api";
import { useQueryClient } from "@tanstack/react-query";
import type { PublicWorkflow } from "@/types/workflow.types";
import { applyPrimaryColor, applyTheme } from "@/utils/theme-color";
import { THEME_CACHE_KEY, encodeThemeSeed, resolveTheme } from "@/utils/theme";
import { movedTableNotice } from "@/utils/session-moved";
import { getUserID } from "zmp-sdk";

// zmp-ui khai kiểu SnackbarProvider thiếu export mặc định nên tsc không coi nó là component.
// Lúc chạy vẫn là component bình thường — chỉ ép kiểu, không đổi hành vi.
const SnackbarProvider = ZaSnackbarProvider as unknown as React.ComponentType<{ children: React.ReactNode }>;

function AppInit() {
  const {
    setStoreInfo, setTableInfo, setZaloUserId, setOrderMode, setDeviceId, setSessionState,
    setEntryContext, setWorkflow, setWorkflowError, setBootDone,
  } = useAppStore();
  const queryClient = useQueryClient();
  const storeId = useAppStore((s) => s.storeId);
  const tableId = useAppStore((s) => s.tableId);
  const zaloUserId = useAppStore((s) => s.zaloUserId);
  const deviceId = useAppStore((s) => s.deviceId);
  const paymentTiming = useAppStore((s) => s.paymentTiming);
  // Snackbar qua ref để effect phiên bàn không bị chạy lại chỉ vì identity của hàm đổi.
  const { openSnackbar } = useSnackbar();
  const openSnackbarRef = useRef(openSnackbar);
  openSnackbarRef.current = openSnackbar;

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
    if (!storeSlug) {
      setBootDone();
      return;
    }

    setEntryContext(entryContext);
    const entryTableId = entryContext.kind === "table" ? entryContext.tableId : null;
    let cancelled = false;

    const applyStore = (row: StoreBootRow) => {
      // Màu chủ đạo theo quán (theme runtime) — set CSS var để mọi class Tailwind
      // dùng theme("colors.primary") (đã trỏ sang var(--color-primary) trong tokens.js)
      // đổi màu ngay không cần build lại.
      applyPrimaryColor(row.primary_color);
      // Bộ giao diện theo quán (mig 134). Nhớ lại để lần mở sau vẽ đúng ngay từ khung đầu.
      const theme = resolveTheme(row.mini_app_theme);
      applyTheme(theme);
      try {
        window.localStorage.setItem(THEME_CACHE_KEY, encodeThemeSeed({ theme, primary: row.primary_color }));
      } catch {
        // không ghi được cache thì lần sau vẫn chạy, chỉ là nháy màu một nhịp
      }
      setStoreInfo({
        theme,
        storeSlug: row.slug,
        storeId: row.id,
        storeName: row.name,
        storeLogoUrl: row.logo_url ?? "",
        storeAddress: row.address ?? "",
        googleMapsUrl: row.google_maps_url ?? "",
        storePhone: row.phone ?? "",
        zaloOaId: row.zalo_oa_id ?? "",
        zaloOaUrl: row.zalo_oa_url ?? "",
        paymentMethods: (() => {
          const raw = (row.payment_methods ?? []) as string[];
          // Chuẩn hoá tên cũ 'zalopay' → 'zalo_checkout' (đề phòng config cache/cũ sau rename).
          const norm = raw.map((m) => (m === "zalopay" ? "zalo_checkout" : m));
          const valid = norm.filter((m): m is PaymentMethod =>
            m === "zalo_checkout" || m === "cash"
          );
          return valid.length > 0 ? valid : ["zalo_checkout", "cash"];
        })(),
        paymentTiming: (row.payment_timing === "postpay"
          ? "postpay"
          : "prepay") as PaymentTiming,
        takeawayBannerUrl: row.takeaway_banner_url ?? "",
        aboutText: row.about_text ?? "",
        wifiName: row.wifi_name ?? "",
        wifiPassword: row.wifi_password ?? "",
        isAcceptingOrders: row.is_accepting_orders ?? true,
        servingHours: Array.isArray(row.serving_hours)
          ? (row.serving_hours as unknown as import("@/utils/store-hours").ServingShift[])
          : [],
        deliveryAreaNote: row.delivery_area_note ?? "",
        termsOfUse: row.terms_of_use ?? "",
      });
    };

    const applyWorkflow = (workflow: PublicWorkflow) => {
      setWorkflow(workflow);
      setOrderMode(
        entryContext.kind === "table"
          ? "dine_in"
          : workflow.takeawayEnabled || workflow.shippingEnabled
            ? "takeaway"
            : "dine_in",
      );
    };

    // Đường đọc gốc (2 lượt nối tiếp): chỉ chạy khi get_mini_app_bootstrap gọi lỗi.
    const loadLegacy = async () => {
      const storeQuery = supabase
        .from("stores")
        .select("id, name, slug, logo_url, address, google_maps_url, phone, zalo_oa_id, zalo_oa_url, payment_methods, payment_timing, takeaway_banner_url, about_text, wifi_name, wifi_password, primary_color, mini_app_theme, is_accepting_orders, serving_hours, delivery_area_note, terms_of_use")
        .eq("slug", storeSlug)
        .eq("is_active", true)
        .single();

      const tableQuery = entryTableId
        ? supabase
            .from("tables")
            .select("id, table_number, store_id")
            .eq("id", entryTableId)
            .eq("is_active", true)
            .single()
        : Promise.resolve({ data: null, error: null });

      const [storeRes, tableRes] = await Promise.all([storeQuery, tableQuery]);
      if (cancelled) return;
      if (storeRes.data) {
        applyStore(storeRes.data as StoreBootRow);
        try {
          const workflow = await getPublicWorkflow(storeRes.data.id);
          if (cancelled) return;
          applyWorkflow(workflow);
        } catch {
          if (!cancelled) setWorkflowError("Không tải được cấu hình đặt món của quán.");
        }
      }
      // Chỉ nhận bàn thuộc đúng quán của slug (khớp mig 140); bàn quán khác → bỏ.
      const table = pickTableForStore(tableRes.data, storeRes.data?.id);
      if (table) {
        setTableInfo({
          tableId: table.id,
          tableNumber: table.table_number,
        });
      }
    };

    // Khởi động MỘT lượt (mig 135): quán + bàn + workflow + giảm giá trong một lần gọi theo slug,
    // menu đọc song song cũng theo slug. Có đủ cả hai thì nạp sẵn menu vào cache TRƯỚC khi đặt
    // storeId, để trang menu vẽ ngay và không gọi lại. Thiếu menu thì useStoreMenu tự đọc như cũ.
    const menuRows = categoryService.getMenuRowsBySlug(storeSlug).catch(() => null);
    void (async () => {
      let boot: BootstrapPayload | null;
      try {
        const { data, error } = await supabase.rpc("get_mini_app_bootstrap", { p_slug: storeSlug, p_table_id: entryTableId });
        if (error) throw error;
        boot = parseBootstrap(data);
      } catch {
        if (!cancelled) {
          await loadLegacy().catch(() => undefined);
          if (!cancelled) setBootDone();
        }
        return;
      }
      if (cancelled) return;
      // null = không có quán đang hoạt động với slug này → giữ màn chờ, giống đường cũ.
      if (!boot) {
        setBootDone();
        return;
      }
      const rows = await menuRows;
      if (cancelled) return;
      if (rows) {
        queryClient.setQueryData(
          [GET_STORE_MENU_KEY, boot.store.id],
          buildMenu(rows, parseActiveDiscounts(boot.discounts)),
        );
      }
      applyStore(boot.store);
      if (boot.workflow) applyWorkflow(mapPublicWorkflow(boot.workflow));
      else setWorkflowError("Không tải được cấu hình đặt món của quán.");
      if (boot.table) setTableInfo({ tableId: boot.table.id, tableNumber: boot.table.table_number });
      setBootDone();
    })();
    return () => { cancelled = true; };
  }, [setStoreInfo, setTableInfo, setOrderMode, setEntryContext, setWorkflow, setWorkflowError, setBootDone, queryClient]);

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
        .then((st) => {
          if (aborted) return;
          // Thu ngân đã chuyển bàn của khách: đổi sang bàn mới (effect tự chạy lại vì tableId đổi),
          // KHÔNG lưu 'moved' vào store. Chặn nếu hai lần hỏi chồng nhau (focus + interval) cùng
          // trả 'moved' → store đã sang bàn mới rồi thì không báo/đổi lần nữa.
          const cur = useAppStore.getState();
          const moved = movedTableNotice(cur.tableNumber, st);
          if (moved) {
            if (cur.tableId !== tableId) return;
            setTableInfo({ tableId: moved.tableId, tableNumber: moved.tableNumber });
            // Lối vào QR bàn phải trỏ bàn mới, không thì tableId !== entryContext.tableId
            // → layout/menu/checkout coi bàn chưa xác thực và khoá gọi món. Lối vào root giữ nguyên.
            if (cur.entryContext.kind === "table") setEntryContext(moved.entryContext);
            // Bỏ trạng thái bàn cũ; null = "chưa biết", không khoá UI. Lần hỏi kế tiếp điền lại.
            setSessionState(null);
            openSnackbarRef.current({ text: moved.message, type: "success", duration: 4000 });
            return;
          }
          setSessionState(st);
        })
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
  }, [storeId, tableId, zaloUserId, deviceId, paymentTiming, setSessionState, setTableInfo, setEntryContext]);

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
