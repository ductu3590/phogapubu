import type { Metadata } from 'next'
import { Header } from '@/components/landing/header'
import { Hero } from '@/components/landing/hero'
import { ContactSection, FnbSection, Footer, ProcessSection, ProductsSection, ServicesSection } from '@/components/landing/sections'
import { SITE } from '@/lib/landing/site'

// Trang chủ mevo.vn (landing giới thiệu). Tĩnh hoàn toàn: không gọi Supabase, không cần JavaScript để đọc.
// Khu quản lý vẫn ở /login, /admin, /staff, /mevo — không đổi URL (xem proxy.ts: "/" được bỏ qua bước Supabase).
const TITLE = 'MEVO — Chuyển đổi số cho quán ăn, nhà hàng | Lào Cai, Yên Bái'
const DESCRIPTION =
  'Gọi món qua QR, đặt bàn, quản lý quán realtime, thanh toán VietQR về thẳng tài khoản quán. Ngoài ra: Zalo Mini App, tự động hoá, website và tư vấn ứng dụng AI cho doanh nghiệp nhỏ tại Lào Cai, Yên Bái.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    'phần mềm gọi món QR Lào Cai', 'gọi món qua QR quán ăn', 'chuyển đổi số quán ăn Yên Bái',
    'Zalo Mini App Lào Cai', 'quản lý nhà hàng', 'tự động hoá doanh nghiệp nhỏ', 'thiết kế website Lào Cai', 'tư vấn ứng dụng AI',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website', locale: 'vi_VN', url: '/', siteName: 'MEVO', title: TITLE, description: DESCRIPTION,
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'MEVO — chuyển đổi số cho quán ăn, nhà hàng và doanh nghiệp nhỏ' }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: ['/og.png'] },
}

// Chưa có địa chỉ cố định nên không khai `address`; chỉ khai vùng phục vụ. Khi có địa chỉ thì thêm vào đây.
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ProfessionalService',
  '@id': `${SITE.url}/#business`,
  name: 'MEVO',
  url: SITE.url,
  description: DESCRIPTION,
  telephone: `+84${SITE.phone.slice(1)}`,
  email: SITE.email,
  founder: { '@type': 'Person', name: SITE.owner },
  areaServed: SITE.areas.map((name) => ({ '@type': 'AdministrativeArea', name: `${name}, Việt Nam` })),
  knowsAbout: ['Gọi món QR cho nhà hàng', 'Zalo Mini App', 'Tự động hoá quy trình', 'Thiết kế website', 'Ứng dụng AI cho doanh nghiệp'],
}

export default function LandingPage() {
  return (
    <div data-landing className="text-foreground">
      <script
        type="application/ld+json"
        // Thay "<" để chuỗi JSON không thể đóng thẻ script.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <Header />
      <main>
        <Hero />
        <FnbSection />
        <ServicesSection />
        <ProductsSection />
        <ProcessSection />
        <ContactSection />
      </main>
      <Footer />
    </div>
  )
}
