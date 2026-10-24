import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/landing/site'

// Chỉ trang công khai. Khu quản lý (/login, /admin, /staff, /mevo...) cố ý không có trong sitemap.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE.url, changeFrequency: 'monthly', priority: 1 }]
}
