import { Check, MapPin, Phone, Mail, MessageCircle } from 'lucide-react'
import { FNB_FEATURES, FNB_MODELS, PRODUCTS, SERVICES, STEPS } from '@/lib/landing/content'
import { MAIL_HREF, NAV, SITE, TEL_HREF } from '@/lib/landing/site'
import { Button, Section, ShotPlaceholder } from './ui'

export function FnbSection() {
  return (
    <Section
      id="giai-phap"
      eyebrow="Giải pháp MEVO F&B"
      title="Gọi món QR và quản lý quán, cấu hình theo đúng mô hình của quán"
      intro="Cùng một hệ thống, bật tắt và cấu hình để chạy được nhiều kiểu quán: trả trước hay trả sau, tại bàn hay mang đi, gọi theo bàn hay theo phòng."
      tone="soft"
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FNB_FEATURES.map((f) => (
          <li key={f.title} className="rounded-2xl border border-border bg-surface p-5">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary-light text-primary">
              <f.icon aria-hidden className="size-6" />
            </span>
            <h3 className="mt-4 text-lg font-semibold leading-snug text-foreground">{f.title}</h3>
            <p className="mt-2 text-base leading-relaxed text-muted">{f.body}</p>
          </li>
        ))}
      </ul>

      <h3 className="mt-14 text-xl font-bold text-foreground">Một hệ thống, nhiều mô hình quán</h3>
      <ul className="mt-5 grid gap-4 sm:grid-cols-2">
        {FNB_MODELS.map((m) => (
          <li key={m.title} className="flex gap-4 rounded-2xl border border-border bg-surface p-5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
              <m.icon aria-hidden className="size-6" />
            </span>
            <div>
              <p className="inline-flex rounded-full bg-accent-bg px-2.5 py-0.5 text-xs font-semibold text-accent">{m.tag}</p>
              <h4 className="mt-2 text-base font-semibold leading-snug text-foreground">{m.title}</h4>
              <p className="mt-1 text-base leading-relaxed text-muted">{m.body}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <ShotPlaceholder label="Admin web: sơ đồ bàn và đơn realtime" />
        <ShotPlaceholder label="Zalo Mini App: khách gọi món tại bàn" />
      </div>
    </Section>
  )
}

export function ServicesSection() {
  return (
    <Section
      id="dich-vu"
      eyebrow="Dịch vụ khác"
      title="Ngoài quán ăn, tôi còn nhận các việc số hoá khác"
      intro="Làm việc theo hướng freelancer: anh chị nói việc cần giải quyết, tôi tư vấn cách làm gọn nhất rồi trực tiếp triển khai."
    >
      <ul className="grid gap-4 md:grid-cols-2">
        {SERVICES.map((s) => (
          <li key={s.title} className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary-light text-primary">
                <s.icon aria-hidden className="size-6" />
              </span>
              <h3 className="text-lg font-semibold leading-snug text-foreground">{s.title}</h3>
            </div>
            <p className="mt-3 text-base leading-relaxed text-muted">{s.body}</p>
            <ul className="mt-4 space-y-2">
              {s.points.map((p) => (
                <li key={p} className="flex gap-2 text-base text-foreground">
                  <Check aria-hidden className="mt-1 size-4 shrink-0 text-success" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Section>
  )
}

export function ProductsSection() {
  return (
    <Section
      id="san-pham"
      eyebrow="Sản phẩm đã làm"
      title="Những thứ tôi đã tự tay dựng"
      intro="Chỉ liệt kê sản phẩm có thật. Ảnh chụp màn hình sẽ được bổ sung."
      tone="soft"
    >
      <ul className="grid gap-4 sm:grid-cols-2">
        {PRODUCTS.map((p) => (
          <li key={p.name} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
            <ShotPlaceholder label={p.shot} ratio="aspect-[16/9]" />
            <div>
              <p
                className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  p.tagTone === 'soon'
                    ? 'border-warning-border bg-warning-bg text-warning'
                    : 'border-success-border bg-success-bg text-success'
                }`}
              >
                {p.tag}
              </p>
              <h3 className="mt-2 text-lg font-semibold text-foreground">{p.name}</h3>
              <p className="mt-1 text-base leading-relaxed text-muted">{p.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}

export function ProcessSection() {
  return (
    <Section
      id="quy-trinh"
      eyebrow="Quy trình làm việc"
      title="Bốn bước, làm cùng anh chị từ đầu đến khi chạy ổn"
    >
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground tabular">
                {i + 1}
              </span>
              <s.icon aria-hidden className="size-5 text-muted" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-foreground">{s.title}</h3>
            <p className="mt-2 text-base leading-relaxed text-muted">{s.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  )
}

export function ContactSection() {
  return (
    <section id="lien-he" className="bg-foreground text-surface">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-20">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent-dot">Liên hệ</p>
        <h2 className="mt-2 max-w-2xl text-2xl font-bold leading-tight sm:text-3xl">
          Kể cho tôi nghe quán hoặc doanh nghiệp của anh chị đang vướng ở đâu
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-border-strong">
          Nhắn Zalo hoặc gọi điện. Tư vấn ban đầu để hiểu nhu cầu, chưa cần quyết định gì.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href={SITE.zaloUrl} external>
            <MessageCircle aria-hidden className="size-5" /> Nhắn Zalo {SITE.phoneDisplay}
          </Button>
          <a
            href={TEL_HREF}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border-strong px-5 text-base font-semibold text-surface hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface"
          >
            <Phone aria-hidden className="size-5" /> Gọi {SITE.phoneDisplay}
          </a>
        </div>
        <ul className="mt-8 space-y-3 text-base">
          <li className="flex items-center gap-3">
            <Mail aria-hidden className="size-5 shrink-0 text-accent-dot" />
            <a href={MAIL_HREF} className="underline underline-offset-4">{SITE.email}</a>
          </li>
          <li className="flex items-center gap-3">
            <MapPin aria-hidden className="size-5 shrink-0 text-accent-dot" />
            <span>Phục vụ khu vực {SITE.areas.join(', ')}; làm việc từ xa với nơi khác.</span>
          </li>
        </ul>
      </div>
    </section>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-foreground text-border-strong">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm sm:px-6 md:flex-row md:items-center md:justify-between">
        <p>© 2026 {SITE.owner} · MEVO · {SITE.areas.join(', ')}</p>
        <nav aria-label="Chân trang" className="flex flex-wrap gap-x-5 gap-y-2">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="hover:text-surface">{n.label}</a>
          ))}
          <a href="/login" className="font-semibold text-surface">Đăng nhập quản lý</a>
        </nav>
      </div>
    </footer>
  )
}
