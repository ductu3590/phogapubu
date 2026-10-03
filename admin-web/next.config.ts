import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // POS cũ /admin/cashier đã thay bằng /admin/pos (2026-10-03). Giữ chuyển hướng cho dấu trang / máy
  // thu ngân còn mở URL cũ; query (?id=, ?job=) của trang in được giữ nguyên.
  async redirects() {
    return [
      { source: '/admin/cashier', destination: '/admin/pos', permanent: false },
      { source: '/admin/cashier/print-order', destination: '/admin/pos/print-order', permanent: false },
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
