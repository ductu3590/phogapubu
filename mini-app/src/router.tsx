import { createBrowserRouter } from "react-router-dom";
import Layout from "./components/layout";
import { getBasePath } from "./utils/zma";
import MenuPage from "./pages/menu";
import CheckoutPage from "./pages/checkout";
import OrderStatusPage from "./pages/order-status";

// Placeholder pages — sẽ được implement trong Task 6 và Task 7
const SessionOrdersPage = () => <div className="flex h-full items-center justify-center text-text-secondary">Đang tải...</div>;
const StoreInfoPage = () => <div className="flex h-full items-center justify-center text-text-secondary">Đang tải...</div>;

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

        // Tab: Thông tin nhà hàng (placeholder, Task 7)
        { path: "/store-info", element: <StoreInfoPage />, handle: { hideHeader: true } },

        // Checkout: đặt món + chọn thanh toán
        {
          path: "/checkout",
          element: <CheckoutPage />,
          handle: {
            title: "Xác nhận đơn",
            back: true,
            whiteBackground: true,
            hideBottomTabs: true,
            hideCart: true,
            headerPosition: "sticky",
          },
        },

        // Trạng thái đơn hàng (realtime)
        {
          path: "/order-status/:orderId",
          element: <OrderStatusPage />,
          handle: {
            title: "Trạng thái đơn",
            back: false,
            whiteBackground: true,
            hideBottomTabs: true,
            hideCart: true,
            headerPosition: "sticky",
          },
        },
      ],
    },
  ],
  { basename: getBasePath() },
);

export default router;
