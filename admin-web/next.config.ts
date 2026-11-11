import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Server Actions mặc định giới hạn body 1MB. Ảnh upload (banner/logo) đã được
    // nén ở client, nhưng nâng giới hạn để phòng thủ tránh lỗi "unexpected response".
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
};

export default nextConfig;
