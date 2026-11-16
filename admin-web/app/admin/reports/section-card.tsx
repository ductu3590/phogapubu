import type { ReactNode } from 'react'

export function SectionCard({ title, hint, action, className = '', children }: {
  title: string; hint?: string; action?: ReactNode; className?: string; children: ReactNode
}) {
  return (
    <section className={`min-w-0 rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgb(15_23_42/0.04)] ${className}`}>
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {hint ? <div className="text-[12.5px] text-muted">{hint}</div> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
