import { execFile } from 'node:child_process'

export type SpoolEntry = { id: number; documentName: string; status: string }
export type ListFn = (printer: string) => Promise<SpoolEntry[]>
export type RemoveFn = (printer: string, id: number) => Promise<void>
export type SleepFn = (ms: number) => Promise<void>

const SPOOL_POLL_MS = 500
const POWERSHELL_TIMEOUT_MS = 10_000

export function parsePrintJobs(json: string): SpoolEntry[] {
  const text = json.replace(/^﻿/, '').trim()
  if (!text) return []
  const parsed: unknown = JSON.parse(text)
  const rows = (Array.isArray(parsed) ? parsed : [parsed]) as Record<string, unknown>[]
  return rows.map((row) => ({
    id: Number(row.Id),
    documentName: String(row.DocumentName ?? ''),
    status: String(row.JobStatus ?? ''),
  }))
}

/**
 * print() thành công chỉ nghĩa là Windows đã nhận việc. Máy in bị rút dây thì việc nằm lại hàng đợi rồi tự in
 * khi cắm lại, hàng giờ sau. Nên phải canh tới khi việc rời hàng đợi; quá hạn thì xoá hẳn để nó không in muộn.
 */
export async function waitForSpool(input: {
  printer: string
  jobId: string
  timeoutMs: number
  list: ListFn
  remove: RemoveFn
  sleep: SleepFn
}): Promise<'clear' | 'stuck'> {
  const { printer, timeoutMs, list, remove, sleep } = input
  const needle = input.jobId.toLowerCase()
  const deadline = Date.now() + timeoutMs

  for (;;) {
    let jobs: SpoolEntry[]
    try {
      jobs = await list(printer)
    } catch {
      // Không đọc được hàng đợi thì không có bằng chứng kẹt; kết luận kẹt sẽ xoá nhầm một phiếu đang in
      return 'clear'
    }

    const pending = jobs.filter(
      // Máy bật "Keep printed documents" giữ lại việc đã in xong với trạng thái Printed
      (job) => job.documentName.toLowerCase().includes(needle) && !/\bPrinted\b/.test(job.status),
    )
    if (pending.length === 0) return 'clear'

    if (Date.now() >= deadline) {
      for (const job of pending) {
        await remove(printer, job.id).catch(() => undefined)
      }
      return 'stuck'
    }
    await sleep(SPOOL_POLL_MS)
  }
}

type ExecFileLike = (
  file: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; windowsHide: boolean; encoding: 'utf8'; timeout: number },
  callback: (error: Error | null, stdout: string, stderr: string) => void,
) => unknown

// Tên máy in đi qua biến môi trường: tên có dấu nháy không làm hỏng câu lệnh.
const PREAMBLE = "$ErrorActionPreference='Stop';[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;"
// JobStatus là enum, ConvertTo-Json của PowerShell 5.1 sẽ ra số nếu không ép chuỗi.
// -InputObject chứ không dùng ống |: ống tháo mảng ra, một việc thành object và không việc nào thành rỗng.
const LIST_SCRIPT =
  PREAMBLE +
  "$j=@(Get-PrintJob -PrinterName $env:MEVO_PRINTER | Select-Object Id,DocumentName,@{Name='JobStatus';Expression={[string]$_.JobStatus}});" +
  'ConvertTo-Json -InputObject $j -Compress'
const REMOVE_SCRIPT = PREAMBLE + 'Remove-PrintJob -PrinterName $env:MEVO_PRINTER -ID $env:MEVO_SPOOL_ID'

export function createSpoolCommands(exec: ExecFileLike = execFile as unknown as ExecFileLike): {
  list: ListFn
  remove: RemoveFn
} {
  function run(script: string, env: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { env: { ...process.env, ...env }, windowsHide: true, encoding: 'utf8', timeout: POWERSHELL_TIMEOUT_MS },
        (error, stdout) => (error ? reject(error) : resolve(stdout)),
      )
    })
  }

  return {
    list: async (printer) => parsePrintJobs(await run(LIST_SCRIPT, { MEVO_PRINTER: printer })),
    remove: async (printer, id) => {
      await run(REMOVE_SCRIPT, { MEVO_PRINTER: printer, MEVO_SPOOL_ID: String(id) })
    },
  }
}
