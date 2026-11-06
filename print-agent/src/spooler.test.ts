import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSpoolCommands, matchesJob, parsePrintJobs, waitForSpool, type SpoolEntry } from './spooler'

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
    expect(parsePrintJobs(`${String.fromCharCode(0xfeff)}[]`)).toEqual([])
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

describe('matchesJob', () => {
  it('tên chứa đủ jobId thì khớp, kể cả có chữ khác quanh nó, không phân biệt hoa thường', () => {
    expect(matchesJob(`MEVO-${JOB}`, JOB)).toBe(true)
    expect(matchesJob(`Chrome - MEVO-${JOB}.pdf`, JOB)).toBe(true)
    expect(matchesJob(`MEVO-ABCDEF12-0000`, 'abcdef12-0000-0000-0000-000000000000')).toBe(true)
  })

  it('driver cắt tên: MEVO- cộng ít nhất 8 ký tự là tiền tố của jobId thì khớp', () => {
    expect(matchesJob('MEVO-11111111', JOB)).toBe(true)
    expect(matchesJob('MEVO-11111111-2222-33', JOB)).toBe(true)
  })

  it('cắt còn dưới 8 ký tự thì không khớp, tránh đụng nhầm việc khác', () => {
    expect(matchesJob('MEVO-1111111', JOB)).toBe(false)
    expect(matchesJob('MEVO-', JOB)).toBe(false)
  })

  it('tiền tố của phiếu khác, hoặc không phải việc MEVO thì không khớp', () => {
    expect(matchesJob('MEVO-22222222', JOB)).toBe(false)
    expect(matchesJob('11111111', JOB)).toBe(false)
    expect(matchesJob('Báo cáo tháng 11111111', JOB)).toBe(false)
    expect(matchesJob('', JOB)).toBe(false)
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

  // Hàng đợi giả: remove xoá được thì việc biến mất khỏi các lần đọc sau
  function queue(initial: SpoolEntry[]) {
    let jobs = initial
    return {
      list: vi.fn(async () => jobs),
      remove: vi.fn(async (_printer: string, id: number) => {
        jobs = jobs.filter((j) => j.id !== id)
      }),
    }
  }

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
    const q = queue([other, entry({ id: 42 })])
    const started = Date.now()
    await expect(waitForSpool({ ...base, ...q })).resolves.toBe('stuck')
    expect(Date.now() - started).toBeGreaterThanOrEqual(15000)
    expect(q.remove).toHaveBeenCalledTimes(1)
    expect(q.remove).toHaveBeenCalledWith('XP-80', 42)
  })

  it('việc bị driver cắt tên vẫn được canh và xoá', async () => {
    const q = queue([entry({ id: 42, documentName: 'MEVO-11111111-2222' })])
    await expect(waitForSpool({ ...base, ...q })).resolves.toBe('stuck')
    expect(q.remove).toHaveBeenCalledWith('XP-80', 42)
  })

  it('chưa tới 15 giây thì chưa kết luận kẹt', async () => {
    const started = Date.now()
    const list = vi.fn(async () => (Date.now() - started < 14000 ? [entry()] : []))
    const remove = vi.fn()
    await expect(waitForSpool({ ...base, list, remove })).resolves.toBe('clear')
    expect(list.mock.calls.length).toBeGreaterThan(1)
    expect(remove).not.toHaveBeenCalled()
  })

  it('xoá xong đọc lại mà việc còn: stuck_remaining', async () => {
    const list = vi.fn().mockResolvedValue([entry()])
    const remove = vi.fn().mockResolvedValue(undefined)
    await expect(waitForSpool({ ...base, list, remove })).resolves.toBe('stuck_remaining')
  })

  it('đọc lại đúng một lần sau khi xoá', async () => {
    const q = queue([entry()])
    await waitForSpool({ ...base, ...q })
    const lastRemove = q.remove.mock.invocationCallOrder[0]
    const readsAfter = q.list.mock.invocationCallOrder.filter((order) => order > lastRemove)
    expect(readsAfter).toHaveLength(1)
  })

  it('xoá khỏi hàng đợi lỗi: không ném, việc còn đó nên stuck_remaining', async () => {
    const list = vi.fn().mockResolvedValue([entry()])
    const remove = vi.fn().mockRejectedValue(new Error('Access denied'))
    await expect(waitForSpool({ ...base, list, remove })).resolves.toBe('stuck_remaining')
  })

  it('đọc lại sau khi xoá bị lỗi: không chắc đã xoá nên stuck_remaining', async () => {
    let removed = false
    const list = vi.fn(async () => {
      if (removed) throw new Error('powershell chết')
      return [entry()]
    })
    const remove = vi.fn(async () => {
      removed = true
    })
    await expect(waitForSpool({ ...base, list, remove })).resolves.toBe('stuck_remaining')
  })

  it('lệnh PowerShell lỗi suốt tới hết hạn: trả clear, báo onWatchFailed đúng một lần', async () => {
    const failure = new Error('powershell chết')
    const list = vi.fn().mockRejectedValue(failure)
    const remove = vi.fn()
    const onWatchFailed = vi.fn()
    const started = Date.now()
    await expect(waitForSpool({ ...base, list, remove, onWatchFailed })).resolves.toBe('clear')
    expect(Date.now() - started).toBeGreaterThanOrEqual(15000)
    expect(list.mock.calls.length).toBeGreaterThan(1)
    expect(remove).not.toHaveBeenCalled()
    expect(onWatchFailed).toHaveBeenCalledTimes(1)
    expect(onWatchFailed).toHaveBeenCalledWith(failure)
  })

  it('lệnh lỗi một lần rồi đọc được: vẫn thấy việc kẹt, không kết luận clear sớm', async () => {
    const q = queue([entry()])
    q.list.mockRejectedValueOnce(new Error('thoáng qua'))
    const onWatchFailed = vi.fn()
    await expect(waitForSpool({ ...base, ...q, onWatchFailed })).resolves.toBe('stuck')
    expect(q.remove).toHaveBeenCalledTimes(1)
    expect(onWatchFailed).not.toHaveBeenCalled()
  })

  it('lệnh lỗi rồi đọc được hàng đợi sạch: clear, không báo cảnh báo', async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error('thoáng qua')).mockResolvedValue([])
    const onWatchFailed = vi.fn()
    await expect(waitForSpool({ ...base, list, remove: vi.fn(), onWatchFailed })).resolves.toBe('clear')
    expect(onWatchFailed).not.toHaveBeenCalled()
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
