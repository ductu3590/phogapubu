import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/landing/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/staff', '/mevo', '/kitchen', '/print', '/api', '/login'] }],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  }
}
