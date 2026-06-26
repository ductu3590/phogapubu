import { RouterProvider } from "react-router-dom";
import router from "./router";
import { ReactQueryProvider } from "./lib/react-query-provider";
import React, { useEffect, useState } from "react";
import { SnackbarProvider } from "zmp-ui";
import { useAppStore, parseQRParams, PaymentMethod } from "./stores/app.store";
import { supabase } from "./services/supabase";
import { getUserID } from "zmp-sdk";
import OaFollowSheet from "./components/common/oa-follow-sheet";

function AppInit() {
  const {
    setStoreInfo, setTableInfo, setZaloUserId,
    storeId, zaloOaId,
  } = useAppStore();
  const [showOaSheet, setShowOaSheet] = useState(false);

  useEffect(() => {
    getUserID()
      .then((id) => { if (id) setZaloUserId(id); })
      .catch(() => { /* không ở trong Zalo — bỏ qua */ });
  }, [setZaloUserId]);

  useEffect(() => {
    const { storeSlug, tableId } = parseQRParams();
    if (!storeSlug || !tableId) return;

    Promise.all([
      supabase
        .from("stores")
        .select("id, name, slug, logo_url, address, phone, zalo_oa_id, zalo_oa_url, payment_methods")
        .eq("slug", storeSlug)
        .eq("is_active", true)
        .single(),
      supabase
        .from("tables")
        .select("id, table_number")
        .eq("id", tableId)
        .eq("is_active", true)
        .single(),
    ]).then(([storeRes, tableRes]) => {
      if (storeRes.data) {
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
              m === "zalopay" || m === "cash"
            );
            return valid.length > 0 ? valid : ["zalopay", "cash"];
          })(),
        });
      }
      if (tableRes.data) {
        setTableInfo({
          tableId: tableRes.data.id,
          tableNumber: tableRes.data.table_number,
        });
      }
    });
  }, [setStoreInfo, setTableInfo]);

  // Hiện OA sheet 1 lần sau khi load xong store + có OA ID
  useEffect(() => {
    if (!storeId || !zaloOaId) return;
    const flagKey = `mevo_oa_prompted_${storeId}`;
    if (!localStorage.getItem(flagKey)) {
      setShowOaSheet(true);
    }
  }, [storeId, zaloOaId]);

  const handleOaSheetClose = () => {
    if (storeId) localStorage.setItem(`mevo_oa_prompted_${storeId}`, "1");
    setShowOaSheet(false);
  };

  return (
    <OaFollowSheet
      oaId={zaloOaId}
      visible={showOaSheet}
      onClose={handleOaSheetClose}
    />
  );
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
