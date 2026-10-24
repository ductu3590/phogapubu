import { Check } from 'lucide-react'
import { FNB_MODELS, PRODUCTS, SERVICES, STEPS } from '@/lib/landing/content'
import { FadeInUp } from './reveal'
import { Badge, Em, SectionHeading, ShotPlaceholder } from './ui'

const CARD = 'h-full rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-white/20 hover:bg-white/[0.05]'

function IconBox({ children }: { children: React.ReactNode }) {
  return <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white">{children}</span>
}

export function ModelsSection() {
  return (
    <section id="mo-hinh" className="mx-auto max-w-7xl px-6 py-24">
      <FadeInUp>
        <SectionHeading
          eyebrow={<Badge tone="orange">✨ MEVO F&B</Badge>}
          title={<>Một hệ thống, <Em>nhiều mô hình quán.</Em></>}
          intro="Cùng một phần mềm, bật tắt và cấu hình để chạy đúng cách quán đang làm: trả trước hay trả sau, tại bàn hay mang đi, gọi theo bàn hay theo phòng."
        />
      </FadeInUp>
      <ul className="mt-14 grid gap-4 sm:grid-cols-2">
        {FNB_MODELS.map((m, i) => (
          <li key={m.title}>
            <FadeInUp delay={i * 100} className="h-full">
              <div className={`${CARD} flex gap-5`}>
                <IconBox><m.icon aria-hidden strokeWidth={1.5} className="size-5" /></IconBox>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-orange-300">{m.tag}</p>
                  <h3 className="mt-2 text-lg font-semibold text-white">{m.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-gray-400">{m.body}</p>
                </div>
              </div>
            </FadeInUp>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ServicesSection() {
  return (
    <section id="dich-vu" className="border-y border-white/5 bg-[#0A0A0B]">
      <div className="mx-auto max-w-7xl px-6 py-24">
        <FadeInUp>
          <SectionHeading
            eyebrow={<Badge>✨ Dịch vụ khác</Badge>}
            title={<>Không chỉ quán ăn. <Em>Việc số hoá nào cũng có thể bàn.</Em></>}
            intro="Làm việc theo kiểu freelancer: anh chị nói việc cần giải quyết, tôi tư vấn cách làm gọn nhất rồi trực tiếp triển khai, không qua trung gian."
          />
        </FadeInUp>
        <ul className="mt-14 grid gap-4 md:grid-cols-2">
          {SERVICES.map((s, i) => (
            <li key={s.title}>
              <FadeInUp delay={(i % 2) * 100} className="h-full">
                <div className={CARD}>
                  <div className="flex items-center gap-4">
                    <IconBox><s.icon aria-hidden strokeWidth={1.5} className="size-5" /></IconBox>
                    <h3 className="text-lg font-semibold text-white">{s.title}</h3>
                  </div>
                  <p className="mt-4 text-[15px] leading-relaxed text-gray-400">{s.body}</p>
                  <ul className="mt-5 space-y-2.5">
                    {s.points.map((p) => (
                      <li key={p} className="flex gap-3 text-[15px] text-gray-300">
                        <Check aria-hidden className="mt-1 size-4 shrink-0 text-gray-400" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </FadeInUp>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function ProductsSection() {
  return (
    <section id="san-pham" className="mx-auto max-w-7xl px-6 py-24">
      <FadeInUp>
        <SectionHeading
          eyebrow={<Badge>✨ Sản phẩm đã làm</Badge>}
          title={<>Những thứ tôi <Em>đã tự tay dựng.</Em></>}
          intro="Chỉ liệt kê sản phẩm có thật. Ảnh chụp màn hình sẽ được bổ sung."
        />
      </FadeInUp>
      <ul className="mt-14 grid gap-4 sm:grid-cols-2">
        {PRODUCTS.map((p, i) => (
          <li key={p.name}>
            <FadeInUp delay={(i % 2) * 100} className="h-full">
              <div className={`${CARD} flex flex-col gap-5 p-4 sm:p-5`}>
                <ShotPlaceholder label={p.shot} />
                <div className="px-1 pb-1">
                  <p className={`text-xs font-medium uppercase tracking-wide ${p.tagTone === 'soon' ? 'text-amber-300' : 'text-emerald-300'}`}>{p.tag}</p>
                  <h3 className="mt-2 text-lg font-semibold text-white">{p.name}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-gray-400">{p.body}</p>
                </div>
              </div>
            </FadeInUp>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ProcessSection() {
  return (
    <section id="quy-trinh" className="border-y border-white/5 bg-[#0A0A0B]">
      <div className="mx-auto max-w-7xl px-6 py-24">
        <FadeInUp>
          <SectionHeading
            eyebrow={<Badge>✨ Quy trình</Badge>}
            title={<>Bốn bước, <Em>làm cùng anh chị</Em> đến khi chạy ổn.</>}
          />
        </FadeInUp>
        <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <FadeInUp delay={i * 100} className="h-full">
                <div className={CARD}>
                  <div className="flex items-center justify-between">
                    <span className="font-[family-name:var(--font-landing-serif)] text-4xl italic text-white/90 tabular">0{i + 1}</span>
                    <s.icon aria-hidden strokeWidth={1.5} className="size-5 text-gray-400" />
                  </div>
                  <h3 className="mt-6 text-lg font-semibold text-white">{s.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-gray-400">{s.body}</p>
                </div>
              </FadeInUp>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
