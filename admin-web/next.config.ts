import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // POS cũ /admin/cashier đã thay bằng /admin/pos (2026-10-03). Giữ chuyển hướng cho dấu trang / máy
  // thu ngân còn mở URL cũ; query (?id=, ?job=) của trang in được giữ nguyên.
  async redirects() {
    return [
      // Vòng quay đã gộp vào trang Ưu đãi (2026-10-11).
      { source: '/admin/spin', destination: '/admin/vouchers', permanent: false },
      { source: '/admin/cashier', destination: '/admin/pos', permanent: false },
      { source: '/admin/cashier/print-order', destination: '/print/order', permanent: false },
      // Trang in dời ra ngoài khung /admin và /staff (2026-10-12): in ngầm trong iframe không được kéo theo
      // thanh nav, chuông, realtime của khung.
      { source: '/admin/pos/print-order', destination: '/print/order', permanent: false },
      { source: '/staff/tables/print', destination: '/print/bill', permanent: false },
    ]
  },
  experimental: {
    // Server Actions mặc định giới hạn body 1MB. Ảnh upload (banner/logo) đã được
    // nén ở client, nhưng nâng giới hạn để phòng thủ tránh lỗi "unexpected response".
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
};

export default nextConfig;
