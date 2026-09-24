import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import CustomerCallTasks, { dueCustomerCallTasks } from './customer-call-tasks'

const task = {
  taskId: 'task-1', reservationId: 'reservation-1', customerName: 'Nguyễn Văn A',
  customerPhone: '0900123456', partySize: 4, arrivalAt: '2026-09-24T12:00:00.000Z',
  dueAt: '2026-09-24T11:00:00.000Z', createdAt: '2026-09-24T09:00:00.000Z',
}

describe('CustomerCallTasks', () => {
  it('chỉ hiển thị task đến hạn, mở tel nhưng không tự đánh dấu đã gọi', () => {
    expect(dueCustomerCallTasks([task], new Date('2026-09-24T10:59:59.000Z'))).toEqual([])
    const html = renderToStaticMarkup(<CustomerCallTasks tasks={[task]} busy={false} onResolve={() => undefined} />)
    expect(html).toContain('Gọi nhắc khách')
    expect(html).toContain('href="tel:0900123456"')
    expect(html).toContain('Đã gọi')
    expect(html).toContain('Chưa liên hệ được')
  })
})
