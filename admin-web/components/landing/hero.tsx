import { ArrowRight, Phone } from 'lucide-react'
import { CAPABILITIES } from '@/lib/landing/content'
import { SITE, TEL_HREF, VIDEOS } from '@/lib/landing/site'
import { LazyVideo } from './lazy-video'
import { FadeInUp } from './reveal'
import { Badge, Em, PrimaryButton, SecondaryButton } from './ui'

export function Hero() {
  return (
    <section id="about" className="relative z-0 flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pb-20 pt-32">
      {/* Nền dự phòng (khi video chưa tải / tắt video): quầng cam mờ trên nền đen. */}
      <div aria-hidden className="absolute inset-0 -z-20 bg-[radial-gradient(ellipse_80%_60%_at_50%_20%,rgba(234,88,12,0.28),transparent_70%)]" />
      <LazyVideo sources={VIDEOS.hero} className="absolute left-1/2 top-1/2 -z-10 min-h-full min-w-full -translate-x-1/2 -translate-y-1/2 object-cover opacity-90" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-black/30 via-transparent to-black" />

      <div className="flex max-w-5xl flex-col items-center text-center">
        <FadeInUp>
          <div className="mb-8">
            <Badge>✨ Gọi món QR trên Zalo · Tự động hoá · AI</Badge>
          </div>
        </FadeInUp>

        <h1 className="mb-6 text-[2.5rem] font-medium leading-[1.08] tracking-tight text-white sm:text-5xl md:text-7xl">
          Chuyển đổi số cho quán ăn, <br className="hidden md:block" />
          nhà hàng và <Em>doanh nghiệp nhỏ.</Em>
        </h1>

        <FadeInUp delay={150}>
          <p className="max-w-2xl text-[16px] leading-relaxed text-gray-400">
            Khách quét QR tại bàn, gọi món và thanh toán ngay trên Zalo. Chủ quán nhìn đơn, sơ đồ bàn và doanh thu theo
            thời gian thực. {SITE.owner} trực tiếp khảo sát, cấu hình và đồng hành vận hành cùng anh chị.
          </p>
        </FadeInUp>

        <FadeInUp delay={300}>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <PrimaryButton href={SITE.zaloUrl} external>
              Đăng ký dùng thử <ArrowRight aria-hidden className="size-4" />
            </PrimaryButton>
            <SecondaryButton href={TEL_HREF}>
              <Phone aria-hidden className="size-4" /> Gọi {SITE.phoneDisplay}
            </SecondaryButton>
          </div>
        </FadeInUp>
      </div>

      <FadeInUp delay={450} className="mt-24 w-full max-w-7xl">
        <p className="mb-8 text-center text-sm font-medium text-gray-400">Những gì MEVO làm được cho quán của anh chị</p>
        <Marquee />
      </FadeInUp>
    </section>
  )
}

// Chạy ngang vô hạn: dãy được nhân 4 lần, animation dịch đúng 1/4 chiều dài (xem @keyframes landing-marquee)
// nên điểm nối không bao giờ lộ; mép trái/phải mờ dần bằng mask-image.
function Marquee() {
  const loops = [0, 1, 2, 3]
  return (
    <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
      <ul className="flex w-max animate-[landing-marquee_30s_linear_infinite] motion-reduce:animate-none">
        {loops.flatMap((loop) =>
          CAPABILITIES.map((c) => (
            <li key={`${loop}-${c.label}`} aria-hidden={loop > 0 || undefined} className="flex flex-shrink-0 items-center gap-2.5 px-8 text-gray-300">
              <c.icon aria-hidden strokeWidth={1.5} className="size-6" />
              <span className="whitespace-nowrap text-lg font-medium tracking-tight">{c.label}</span>
            </li>
          )),
        )}
      </ul>
    </div>
  )
}
