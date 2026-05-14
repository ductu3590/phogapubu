import { createBrowserRouter } from "react-router-dom";
import Layout from "./components/layout";
import { getBasePath } from "./utils/zma";
import MenuPage from "./pages/menu";
import CheckoutPage from "./pages/checkout";
import OrderStatusPage from "./pages/order-status";

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Layout />,
      children: [
        // Trang chính: menu (header ẩn — menu tự có header riêng)
        { path: "/", element: <MenuPage />, handle: { hideHeader: true } },
        { path: "/menu", element: <MenuPage />, handle: { hideHeader: true } },

        // Checkout: đặt món + chọn thanh toán
        {
          path: "/checkout",
          element: <CheckoutPage />,
          handle: {
            title: "Xác nhận đơn",
            back: true,
            whiteBackground: true,
            hideFooter: true,
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
            hideFooter: true,
            headerPosition: "sticky",
            hideCart: true,
          },
        },
      ],
    },
  ],
  {
    basename: getBasePath(),
  },
);

export default router;
