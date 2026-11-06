import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ usePathname: () => '/print/agent/11111111-1111-4111-8111-111111111111' }))
vi.mock('./print-ready', () => ({
  default: ({ jobId, error, retryable }: { jobId: string; error?: string; retryable?: boolean }) => (
    <i data-job={jobId} data-error={error ?? ''} data-retryable={retryable ? '1' : ''} />
  ),
}))

const { default: AgentPrintError } = await import('./error')

describe('/print/agent error boundary', () => {
  it('lỗi render cũng có tín hiệu cho phần mềm in: lỗi + retryable + jobId lấy từ URL', () => {
    const html = renderToStaticMarkup(<AgentPrintError error={new Error('boom')} reset={() => {}} />)
    expect(html).toContain('data-job="11111111-1111-4111-8111-111111111111"')
    expect(html).toContain('data-error="Không dựng được phiếu"')
    expect(html).toContain('data-retryable="1"')
    expect(html).toContain('Không dựng được phiếu')
  })
})
