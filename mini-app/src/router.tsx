import { createBrowserRouter } from "react-router-dom";
import Layout from "./components/layout";
import { getBasePath } from "./utils/zma";
import MenuPage from "./pages/menu";
import CheckoutPage from "./pages/checkout";
import OrderStatusPage from "./pages/order-status";
import SessionOrdersPage from "./pages/session-orders";
import StoreInfoPage from "./pages/store-info";
import ReservationsPage from "./pages/reservations";
import NewReservationPage from "./pages/reservations/new";
import ReservationDetailPage from "./pages/reservations/detail";
import ReservationPreorderPage from "./pages/reservations/preorder";
import ReservationPreorderCheckoutPage from "./pages/reservations/preorder-checkout";
import type { RouteHandle } from "./types/router.types";

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Layout />,
      children: [
        // Trang chính: menu (header ẩn — menu tự có header riêng)
        { path: "/", element: <MenuPage />, handle: { hideHeader: true } },
        { path: "/menu", element: <MenuPage />, handle: { hideHeader: true } },

        // Tab: Đơn đã gọi trong phiên (placeholder, Task 6)
        { path: "/session-orders", element: <SessionOrdersPage />, handle: { hideHeader: true } },

        // Tab: Thông tin nhà hàng
        { path: "/store-info", element: <StoreInfoPage />, handle: { hideHeader: true } },

        { path: "/reservations", element: <ReservationsPage />, handle: { title: "Đặt bàn của tôi", back: false, hideCart: true, headerPosition: "sticky" } satisfies RouteHandle },
        { path: "/reservations/new", element: <NewReservationPage />, handle: { title: "Đặt bàn trước", back: true, hideBottomTabs: true, hideCart: true, headerPosition: "sticky" } satisfies RouteHandle },
        { path: "/reservations/:reservationId", element: <ReservationDetailPage />, handle: { title: "Chi tiết đặt bàn", back: true, hideBottomTabs: true, hideCart: true, headerPosition: "sticky" } satisfies RouteHandle },
        { path: "/reservations/:reservationId/preorder", element: <ReservationPreorderPage />, handle: { title: "Chọn món trước", back: true, hideBottomTabs: true, hideCart: true, headerPosition: "sticky" } satisfies RouteHandle },
        { path: "/reservations/:reservationId/preorder/checkout", element: <ReservationPreorderCheckoutPage />, handle: { title: "Xác nhận món trước", back: true, hideBottomTabs: true, hideCart: true, headerPosition: "sticky" } satisfies RouteHandle },

        // Checkout: đặt món + chọn thanh toán
        {
          path: "/checkout",
          element: <CheckoutPage />,
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
          element: <OrderStatusPage />,
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
