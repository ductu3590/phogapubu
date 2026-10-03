import type { Metadata } from "next";
import { Be_Vietnam_Pro, Geist_Mono } from "next/font/google";
import "./globals.css";

// Font chung toàn hệ (chốt 2026-10-02): thiết kế riêng cho tiếng Việt, dấu chồng không bị cắt.
const beVietnam = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Giữ cho các chỗ đang dùng `font-mono` (mã, phiếu in). Số tiền/giờ dùng `.tabular`, không dùng mono.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MEVO Admin",
  description: "Quản lý nhà hàng MEVO",
  other: {
    "zalo-platform-site-verification": "QyE_4et3RnTOzVardjXuAq3Fw1oikJr7DJGq",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${beVietnam.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden">{children}</body>
    </html>
  );
}
