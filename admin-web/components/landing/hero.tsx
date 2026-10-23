import { ArrowRight, Phone, MessageCircle } from 'lucide-react'
import { HERO_FLOW } from '@/lib/landing/content'
import { SITE, TEL_HREF } from '@/lib/landing/site'
import { Button } from './ui'

export function Hero() {
  return (
    <section id="top" className="bg-gradient-to-b from-primary-light to-surface">
      <div className="mx-auto w-full max-w-6xl px-4 pb-14 pt-10 sm:px-6 md:pb-20 md:pt-16">
        <p className="inline-flex rounded-full border border-accent-border bg-surface px-3 py-1 text-sm font-medium text-accent">
          {SITE.owner} · Tư vấn và triển khai giải pháp số · {SITE.areas.join(' – ')}
        </p>
        <h1 className="mt-5 max-w-3xl text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl md:text-5xl">
          <span className="text-primary">MEVO</span> — chuyển đổi số cho quán ăn, nhà hàng và doanh nghiệp nhỏ
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          Khách quét QR tại bàn, gọi món và thanh toán ngay trên điện thoại. Chủ quán nhìn đơn, sơ đồ bàn và doanh thu
          theo thời gian thực. Tôi trực tiếp khảo sát, cấu hình và đồng hành vận hành cùng anh chị.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button href={SITE.zaloUrl} external>
            Đăng ký dùng thử <ArrowRight aria-hidden className="size-5" />
          </Button>
          <Button href={SITE.zaloUrl} external variant="outline">
            <MessageCircle aria-hidden className="size-5" /> Nhắn Zalo
          </Button>
          <Button href={TEL_HREF} variant="outline">
            <Phone aria-hidden className="size-5" /> Gọi {SITE.phoneDisplay}
          </Button>
        </div>

        <ol className="mt-10 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Hành trình của khách">
          {HERO_FLOW.map((s, i) => (
            <li key={s.label} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary">
                <s.icon aria-hidden className="size-5" />
              </span>
              <span className="text-sm font-semibold leading-tight text-foreground">
                <span className="block text-xs font-medium text-muted">Bước {i + 1}</span>
                {s.label}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
