import { createBrowserRouter } from "react-router-dom";
import Layout from "./components/layout";
import { getBasePath } from "./utils/zma";
import MenuPage from "./pages/menu";
import type { RouteHandle } from "./types/router.types";

// Trang menu là lối vào chính nên nạp sẵn; các trang còn lại tách thành file riêng,
// chỉ tải khi khách mở tới → file JS đầu tiên nhẹ hơn, app lên màn hình nhanh hơn.
const lazyPage = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({
  Component: (await load()).default,
});

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Layout />,
      // Hiện trong lúc nạp trang đầu tiên (nếu lối vào không phải menu).
      HydrateFallback: () => null,
      children: [
        // Trang chính: menu (dùng thanh công cụ chung của Layout)
        { path: "/", element: <MenuPage /> },
        { path: "/menu", element: <MenuPage /> },

        // Tab: Đơn đã gọi trong phiên (placeholder, Task 6)
        { path: "/session-orders", lazy: lazyPage(() => import("./pages/session-orders")), handle: { title: "Đơn gọi", hideCart: true } satisfies RouteHandle },

        // Tab: Thông tin nhà hàng
        { path: "/store-info", lazy: lazyPage(() => import("./pages/store-info")), handle: { title: "Thông tin nhà hàng", back: true, hideBottomTabs: true, hideCart: true } satisfies RouteHandle },
        { path: "/account", lazy: lazyPage(() => import("./pages/account")), handle: { title: "Tài khoản", back: true, hideBottomTabs: true, hideCart: true } satisfies RouteHandle },

        { path: "/reservations", lazy: lazyPage(() => import("./pages/reservations")), handle: { title: "Đặt bàn", hideCart: true } satisfies RouteHandle },
        { path: "/reservations/new", lazy: lazyPage(() => import("./pages/reservations/new")), handle: { title: "Đặt thêm bàn", back: true, hideCart: true } satisfies RouteHandle },
        { path: "/reservations/:reservationId", lazy: lazyPage(() => import("./pages/reservations/detail")), handle: { title: "Chi tiết đặt bàn", back: true, hideCart: true } satisfies RouteHandle },
        { path: "/reservations/:reservationId/preorder", lazy: lazyPage(() => import("./pages/reservations/preorder")), handle: { title: "Chọn món đặt trước", back: true, hideBottomTabs: true, hideCart: true } satisfies RouteHandle },
        { path: "/reservations/:reservationId/preorder/checkout", lazy: lazyPage(() => import("./pages/reservations/preorder-checkout")), handle: { title: "Xác nhận món đặt trước", back: true, hideBottomTabs: true, hideCart: true } satisfies RouteHandle },

        // Checkout: đặt món + chọn thanh toán
        {
          path: "/checkout",
          lazy: lazyPage(() => import("./pages/checkout")),
          handle: {
            title: "Xác nhận đơn",
            back: true,
            hideBottomTabs: true,
            hideCart: true,
            headerPosition: "sticky",
          } satisfies RouteHandle,
        },

        // Trạng thái đơn hàng (realtime)
        {
          path: "/order-status/:orderId",
          lazy: lazyPage(() => import("./pages/order-status")),
          handle: {
            title: "Trạng thái đơn",
            back: false,
            hideBottomTabs: true,
            hideCart: true,
            headerPosition: "sticky",
          } satisfies RouteHandle,
        },
      ],
    },
  ],
  { basename: getBasePath() },
);

export default router;
