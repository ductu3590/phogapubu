// Thông tin liên hệ + SEO của landing mevo.vn. Đổi số/email ở ĐÚNG file này, các section tự cập nhật.
export const SITE = {
  url: 'https://mevo.vn',
  name: 'MEVO',
  owner: 'Đỗ Đức Tú',
  tagline: 'Chuyển đổi số cho quán ăn, nhà hàng và doanh nghiệp nhỏ',
  phone: '0962814888',
  phoneDisplay: '0962 814 888',
  email: 'mrtu.yb@gmail.com',
  zaloUrl: 'https://zalo.me/0962814888',
  areas: ['Lào Cai', 'Yên Bái'],
} as const

export const TEL_HREF = `tel:${SITE.phone}`
export const MAIL_HREF = `mailto:${SITE.email}`

export const NAV = [
  { href: '#about', label: 'Giới thiệu' },
  { href: '#features', label: 'Giải pháp' },
  { href: '#dich-vu', label: 'Dịch vụ' },
  { href: '#san-pham', label: 'Sản phẩm' },
  { href: '#faq', label: 'Hỏi đáp' },
  { href: '#contact', label: 'Liên hệ' },
] as const

// Video nền tự host trên CDN của Vercel (thư mục admin-web/public/landing/, tải về bằng
// `node scripts/fetch-landing-videos.mjs`). Phần tử thứ hai là nguồn gốc (CDN sceneai.art) — CHỈ dùng dự phòng
// khi file tự host chưa có; commit xong 3 file mp4 thì xoá link dự phòng này đi.
// Cả hai đều hỏng thì nền gradient phía sau vẫn hiện, trang không vỡ.
export const VIDEOS = {
  hero: ['/landing/hero.mp4', 'https://cdn.sceneai.art/Hero%20Section%20Video/50b4f304-cdca-4e12-8735-580d225834be.mp4'],
  featureOrder: ['/landing/feature-order.mp4', 'https://cdn.sceneai.art/Hero%20Section%20Video/1bcc8fa3-37f6-4c53-8591-0347e4c7f8ac.mp4'],
  featureRealtime: ['/landing/feature-realtime.mp4', 'https://cdn.sceneai.art/Hero%20Section%20Video/736fd4a0-70ac-4f44-9633-55769ead6aca.mp4'],
} as const satisfies Record<string, readonly string[]>
