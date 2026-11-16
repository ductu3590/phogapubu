import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Server Actions mặc định giới hạn body 1MB. Ảnh upload (banner/logo) đã được
    // nén ở client, nhưng nâng giới hạn để phòng thủ tránh lỗi "unexpected response".
    serverActions: {
      bodySizeLimit: '4mb',
    },
    // Trình duyệt giữ trang vừa xem 5 phút → mở lại là hiện ngay (mặc định Next 16 = 0, lần nào cũng chờ máy chủ).
    // Phải khớp CLIENT_CACHE_SECONDS (lib/revisit-refresh.ts) — components/revisit-refresh.tsx dựa vào đó để tự tải
    // bản mới phía sau khi trang mở lại từ cache.
    staleTimes: {
      dynamic: 300,
    },
  },
};

export default nextConfig;
