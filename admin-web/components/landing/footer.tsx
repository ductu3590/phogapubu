import { ArrowRight, Phone } from 'lucide-react'
import { MAIL_HREF, SITE, TEL_HREF, VIDEOS } from '@/lib/landing/site'
import { LazyVideo } from './lazy-video'
import { Logo } from './logo'
import { FadeInUp } from './reveal'
import { Em, PrimaryButton, SecondaryButton } from './ui'

const LINK = 'text-sm text-gray-400 transition-colors hover:text-white'

type FooterLink = { label: string; href: string; external?: boolean }

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Giải pháp',
    links: [
      { label: 'Gọi món QR', href: '#features' },
      { label: 'Mô hình quán', href: '#mo-hinh' },
      { label: 'Dịch vụ khác', href: '#dich-vu' },
      { label: 'Sản phẩm', href: '#san-pham' },
    ],
  },
  {
    title: 'Liên hệ',
    links: [
      { label: `Zalo ${SITE.phoneDisplay}`, href: SITE.zaloUrl, external: true },
      { label: `Gọi ${SITE.phoneDisplay}`, href: TEL_HREF },
      { label: SITE.email, href: MAIL_HREF },
    ],
  },
  {
    title: 'Khu quản lý',
    links: [
      { label: 'Đăng nhập quản lý', href: '/login' },
      { label: 'Hỏi đáp', href: '#faq' },
    ],
  },
]

export function Footer() {
  return (
    <footer id="contact" className="relative z-0 overflow-hidden border-t border-white/5 px-6 pb-10 pt-32">
      <div aria-hidden className="absolute inset-0 -z-20 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(234,88,12,0.22),transparent_70%)]" />
      <LazyVideo src={VIDEOS.hero} className="absolute inset-0 -z-10 h-full w-full object-cover opacity-40" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-black via-black/60 to-black" />

      <FadeInUp className="mx-auto mb-32 flex max-w-4xl flex-col items-center text-center">
        <h2 className="text-4xl font-medium leading-[1.1] tracking-tight text-white md:text-6xl">
          Sẵn sàng đưa quán lên <Em>Zalo?</Em>
        </h2>
        <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-gray-400">
          Nhắn Zalo hoặc gọi điện để kể quán của anh chị đang vướng ở đâu. Tư vấn ban đầu để hiểu nhu cầu, chưa cần quyết định gì.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <PrimaryButton href={SITE.zaloUrl} external>
            Đăng ký dùng thử <ArrowRight aria-hidden className="size-4" />
          </PrimaryButton>
          <SecondaryButton href={TEL_HREF}>
            <Phone aria-hidden className="size-4" /> Gọi {SITE.phoneDisplay}
          </SecondaryButton>
        </div>
      </FadeInUp>

      <div className="mx-auto mb-24 grid max-w-7xl grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4 md:gap-8">
        <div className="col-span-2 md:col-span-1">
          <Logo className="[&>span]:text-xl [&>span]:font-bold" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-gray-400">
            Gọn quầy, nhanh bếp, rõ tiền — chuyển đổi số cho quán ăn và doanh nghiệp nhỏ tại {SITE.areas.join(', ')}.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title} className={col.title === 'Liên hệ' ? 'col-span-2 sm:col-span-1' : undefined}>
            <p className="mb-4 text-sm font-medium text-white">{col.title}</p>
            <ul className="space-y-3">
              {col.links.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className={`${LINK} break-all`} {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-2 border-t border-white/5 pt-8 text-center text-xs text-gray-400 md:flex-row md:gap-4">
        <span>© 2026 MEVO. Bảo lưu mọi quyền.</span>
        <span aria-hidden className="hidden md:inline">•</span>
        <span>
          Phát triển bởi <span className="text-gray-300">{SITE.owner}</span>
        </span>
        <span aria-hidden className="hidden md:inline">•</span>
        <span className="text-gray-300">{SITE.areas.join(' – ')}</span>
      </div>
    </footer>
  )
}
