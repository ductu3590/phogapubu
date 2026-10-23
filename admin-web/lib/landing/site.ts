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
  { href: '#giai-phap', label: 'Giải pháp quán ăn' },
  { href: '#dich-vu', label: 'Dịch vụ khác' },
  { href: '#san-pham', label: 'Sản phẩm' },
  { href: '#quy-trinh', label: 'Quy trình' },
  { href: '#lien-he', label: 'Liên hệ' },
] as const
