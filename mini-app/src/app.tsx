import { RouterProvider } from "react-router-dom";
import router from "./router";
import { ReactQueryProvider } from "./lib/react-query-provider";
import React, { useEffect } from "react";
import { SnackbarProvider } from "zmp-ui";
import { useAppStore, parseQRParams } from "./stores/app.store";
import { supabase } from "./services/supabase";

function AppInit() {
  const { setStoreInfo, setTableInfo } = useAppStore();

  useEffect(() => {
    const { storeSlug, tableId } = parseQRParams();
    if (!storeSlug || !tableId) return;

    // Lấy thông tin quán + bàn từ Supabase
    Promise.all([
      supabase
        .from("stores")
        .select("id, name, slug")
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
