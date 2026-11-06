import type { AgentConfig } from './config'

export type PrinterEntry = { name: string }

export type AgentJob = {
  id: string
  kind: string
  printer_name: string
  render_token: string
  attempts: number
}

export type PairResult =
  | { ok: true; agent_id: string; token: string; store_name: string | null }
  | { ok: false; error: string }

export type PollResult = { ok: true; job: AgentJob | null } | { ok: false; error: string }

// Mạng im mà không có hạn chờ thì tick treo mãi, vòng lặp chết không ai biết
const REQUEST_TIMEOUT_MS = 10_000

export function createApi(config: AgentConfig, fetchImpl: typeof fetch = fetch) {
  async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetchImpl(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as T
  }

  return {
    pair(code: string, name: string, version: string): Promise<PairResult> {
      return rpc('print_agent_pair', { p_code: code, p_name: name, p_version: version })
    },
    poll(token: string, version: string, printers: PrinterEntry[] | null): Promise<PollResult> {
      return rpc('print_agent_poll', { p_token: token, p_version: version, p_printers: printers })
    },
    // Server trả ok:false (revoked, not_printing) thì không có gì để làm thêm: lần hỏi việc sau tự phát hiện
    // revoked, còn job đã quá hạn thì server đã chuyển failed. Chỉ lỗi mạng mới ném để job-loop thử lại.
    async report(token: string, jobId: string, ok: boolean, error: string | null, retryable: boolean): Promise<void> {
      await rpc('print_agent_report', {
        p_token: token,
        p_job_id: jobId,
        p_ok: ok,
        p_error: error,
        p_retryable: retryable,
      })
    },
  }
}

export type Api = ReturnType<typeof createApi>
