import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSpoolCommands, parsePrintJobs, waitForSpool, type SpoolEntry } from './spooler'

const JOB = '11111111-2222-3333-4444-555555555555'
const entry = (over: Partial<SpoolEntry> = {}): SpoolEntry => ({
  id: 7,
  documentName: `MEVO-${JOB}`,
  status: 'Printing',
  ...over,
})

describe('parsePrintJobs', () => {
  it('parsePrintJobs: một object lẫn mảng đều ra mảng; chuỗi rỗng ra []', () => {
    const one = { Id: 7, DocumentName: 'MEVO-a', JobStatus: 'Printing' }
    const parsed = { id: 7, documentName: 'MEVO-a', status: 'Printing' }
    expect(parsePrintJobs(JSON.stringify(one))).toEqual([parsed])
    expect(parsePrintJobs(JSON.stringify([one, { ...one, Id: 8 }]))).toEqual([parsed, { ...parsed, id: 8 }])
    expect(parsePrintJobs('')).toEqual([])
    expect(parsePrintJobs('  \r\n')).toEqual([])
    expect(parsePrintJobs('[]')).toEqual([])
  })

  it('bỏ BOM đầu chuỗi mà PowerShell 5.1 có thể in ra', () => {
    expect(parsePrintJobs('﻿[]')).toEqual([])
  })

  it('JobStatus dạng số vẫn ra chuỗi, thiếu tên thì ra chuỗi rỗng', () => {
    expect(parsePrintJobs('{"Id":1,"DocumentName":null,"JobStatus":16}')).toEqual([
      { id: 1, documentName: '', status: '16' },
    ])
  })

  it('JSON hỏng thì ném để bên gọi coi như lệnh lỗi', () => {
    expect(() => parsePrintJobs('Get-PrintJob : lỗi')).toThrow()
  })
})

describe('waitForSpool', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // sleep giả đẩy đồng hồ đi, nên deadline tính bằng thời gian thật vẫn test được
  const sleep = async (ms: number) => {
    vi.advanceTimersByTime(ms)
  }
  const base = { printer: 'XP-80', jobId: JOB, timeoutMs: 15000, sleep }

  it('waitForSpool: việc biến mất trong hạn trả clear, không gọi remove', async () => {
    const list = vi.fn().mockResolvedValueOnce([entry()]).mockResolvedValueOnce([entry()]).mockResolvedValue([])
    const remove = vi.fn()
    await expect(waitForSpool({ ...base, list, remove })).resolves.toBe('clear')
    expect(list).toHaveBeenCalledTimes(3)
    expect(list).toHaveBeenCalledWith('XP-80')
    expect(remove).not.toHaveBeenCalled()
  })

  it('waitForSpool: quá 15 giây trả stuck và gọi remove đúng id', async () => {
    const other = entry({ id: 9, documentName: 'Tài liệu khác' })
    const list = vi.fn().mockResolvedValue([other, entry({ id: 42 })])
    const remove = vi.fn().mockResolvedValue(undefined)
    const started = Date.now()
    await expect(waitForSpool({ ...base, list, remove })).resolves.toBe('stuck')
    expect(Date.now() - started).toBeGreaterThanOrEqual(15000)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith('XP-80', 42)
  })

  it('chưa tới 15 giây thì chưa kết luận kẹt', async () => {
    const started = Date.now()
    const list = vi.fn(async () => (Date.now() - started < 14000 ? [entry()] : []))
    const remove = vi.fn()
    await expect(waitForSpool({ ...base, list, remove })).resolves.toBe('clear')
    expect(list.mock.calls.length).toBeGreaterThan(1)
    expect(remove).not.toHaveBeenCalled()
  })

  it('waitForSpool: lệnh PowerShell lỗi không kết luận stuck, trả clear', async () => {
    const list = vi.fn().mockRejectedValue(new Error('powershell chết'))
    const remove = vi.fn()
    await expect(waitForSpool({ ...base, list, remove })).resolves.toBe('clear')
    expect(remove).not.toHaveBeenCalled()
  })

  it('xoá khỏi hàng đợi lỗi: vẫn trả stuck, không ném', async () => {
    const list = vi.fn().mockResolvedValue([entry()])
    const remove = vi.fn().mockRejectedValue(new Error('Access denied'))
    await expect(waitForSpool({ ...base, list, remove })).resolves.toBe('stuck')
  })

  it('việc của tài liệu khác không làm chờ', async () => {
    const list = vi.fn().mockResolvedValue([entry({ documentName: 'MEVO-khac' })])
    const remove = vi.fn()
    await expect(waitForSpool({ ...base, list, remove })).resolves.toBe('clear')
  })

  it('việc đã in xong mà Windows còn giữ lại (Keep printed documents) không tính là kẹt', async () => {
    const list = vi.fn().mockResolvedValue([entry({ status: 'Printed, Retained' })])
    const remove = vi.fn()
    await expect(waitForSpool({ ...base, list, remove })).resolves.toBe('clear')
    expect(remove).not.toHaveBeenCalled()
  })
})

describe('createSpoolCommands', () => {
  function fakeExec(stdout: string, err: Error | null = null) {
    return vi.fn(
      (
        _file: string,
        _args: string[],
        _opts: { env: NodeJS.ProcessEnv; windowsHide: boolean; encoding: 'utf8'; timeout: number },
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        cb(err, stdout, '')
      },
    )
  }

  it('list: gọi powershell.exe không profile, ẩn cửa sổ, có hạn chờ', async () => {
    const exec = fakeExec('[{"Id":3,"DocumentName":"MEVO-x","JobStatus":"Error, Printing"}]')
    const jobs = await createSpoolCommands(exec).list("Bếp 'Sân vườn'")
    expect(jobs).toEqual([{ id: 3, documentName: 'MEVO-x', status: 'Error, Printing' }])

    const [file, args, opts] = exec.mock.calls[0]
    expect(file).toBe('powershell.exe')
    expect(args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-Command'])
    expect(opts).toMatchObject({ windowsHide: true, encoding: 'utf8' })
    expect(opts.timeout).toBeGreaterThan(0)
  })

  it('tên máy in chỉ đi qua biến môi trường, không nằm trong câu lệnh', async () => {
    const exec = fakeExec('[]')
    await createSpoolCommands(exec).list("Bếp 'Sân vườn'; rm")
    const [, args, opts] = exec.mock.calls[0]
    const script = args[3]
    expect(opts.env.MEVO_PRINTER).toBe("Bếp 'Sân vườn'; rm")
    expect(script).toContain('Get-PrintJob -PrinterName $env:MEVO_PRINTER')
    expect(script).not.toContain('Sân vườn')
    expect(script).toContain('[Console]::OutputEncoding')
    expect(script).toContain('@(')
    expect(script).toContain('ConvertTo-Json')
  })

  it('remove: truyền máy và id qua biến môi trường', async () => {
    const exec = fakeExec('')
    await createSpoolCommands(exec).remove('XP-80', 42)
    const [, args, opts] = exec.mock.calls[0]
    expect(args[3]).toContain('Remove-PrintJob -PrinterName $env:MEVO_PRINTER -ID $env:MEVO_SPOOL_ID')
    expect(opts.env).toMatchObject({ MEVO_PRINTER: 'XP-80', MEVO_SPOOL_ID: '42' })
  })

  it('lệnh lỗi thì list ném', async () => {
    const exec = fakeExec('', new Error('exit 1'))
    await expect(createSpoolCommands(exec).list('XP-80')).rejects.toThrow('exit 1')
  })
})
