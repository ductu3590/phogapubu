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

// Video nền lấy theo prompt thiết kế, đang nằm trên CDN bên thứ ba (sceneai.art). Nên tải về và tự host
// (public/landing/*.mp4 hoặc Supabase Storage) trước khi chạy lâu dài: CDN lạ có thể đổi/xoá link bất cứ lúc nào.
// Video hỏng thì nền gradient phía sau vẫn hiện, trang không vỡ.
export const VIDEOS = {
  hero: 'https://cdn.sceneai.art/Hero%20Section%20Video/50b4f304-cdca-4e12-8735-580d225834be.mp4',
  featureOrder: 'https://cdn.sceneai.art/Hero%20Section%20Video/1bcc8fa3-37f6-4c53-8591-0347e4c7f8ac.mp4',
  featureRealtime: 'https://cdn.sceneai.art/Hero%20Section%20Video/736fd4a0-70ac-4f44-9633-55769ead6aca.mp4',
} as const
