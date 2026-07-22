import { RouterProvider } from "react-router-dom";
import router from "./router";
import { ReactQueryProvider } from "./lib/react-query-provider";
import React, { useEffect } from "react";
import { SnackbarProvider } from "zmp-ui";
import { useAppStore, parseQRParams, PaymentMethod } from "./stores/app.store";
import { supabase } from "./services/supabase";
import { getUserID } from "zmp-sdk";

function AppInit() {
  const {
    setStoreInfo, setTableInfo, setZaloUserId, setOrderMode,
  } = useAppStore();

  useEffect(() => {
    getUserID()
      .then((id) => { if (id) setZaloUserId(id); })
      .catch(() => { /* không ở trong Zalo — bỏ qua */ });
  }, [setZaloUserId]);

  useEffect(() => {
    const { storeSlug, tableId, orderMode } = parseQRParams();
    if (!storeSlug) return;

    setOrderMode(orderMode);

    const storeQuery = supabase
      .from("stores")
      .select("id, name, slug, logo_url, address, phone, zalo_oa_id, zalo_oa_url, payment_methods, takeaway_banner_url, about_text, wifi_name, wifi_password, primary_color, is_accepting_orders, serving_hours, delivery_area_note, terms_of_use")
      .eq("slug", storeSlug)
      .eq("is_active", true)
      .single();

    const tableQuery =
      orderMode === "dine_in" && tableId
        ? supabase
            .from("tables")
            .select("id, table_number")
            .eq("id", tableId)
            .eq("is_active", true)
            .single()
        : Promise.resolve({ data: null, error: null });

    Promise.all([storeQuery, tableQuery]).then(([storeRes, tableRes]) => {
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
            const valid = raw.filter((m): m is PaymentMethod =>
              m === "zalo_checkout" || m === "cash"
            );
            return valid.length > 0 ? valid : ["zalo_checkout", "cash"];
          })(),
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
      }
      if (tableRes.data) {
        setTableInfo({
          tableId: tableRes.data.id,
          tableNumber: tableRes.data.table_number,
        });
      }
    });
  }, [setStoreInfo, setTableInfo, setOrderMode]);

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
