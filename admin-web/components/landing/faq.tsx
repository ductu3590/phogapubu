'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { FAQS } from '@/lib/landing/content'

// Accordion: thân câu trả lời mở bằng grid-template-rows 0fr → 1fr; dấu + xoay 45° thành ×.
export function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className="rounded-xl border border-white/10 bg-transparent">
      {FAQS.map((f, i) => {
        const isOpen = open === i
        const id = `faq-${i}`
        return (
          <div key={f.q} className={i < FAQS.length - 1 ? 'border-b border-white/10' : ''}>
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`${id}-body`}
                id={`${id}-btn`}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-6 px-6 py-6 text-left text-base font-medium text-white"
              >
                <span>{f.q}</span>
                <Plus aria-hidden className={`size-5 shrink-0 text-gray-300 transition-transform duration-300 ${isOpen ? 'rotate-45' : ''}`} />
              </button>
            </h3>
            <div
              id={`${id}-body`}
              role="region"
              aria-labelledby={`${id}-btn`}
              className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
            >
              <div className="overflow-hidden" inert={!isOpen}>
                <p className="px-6 pb-6 text-sm leading-relaxed text-gray-400">{f.a}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
