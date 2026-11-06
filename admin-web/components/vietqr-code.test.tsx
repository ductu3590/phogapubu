import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import QRCode from 'qrcode'
import VietQrCode, { VIETQR_QUIET_ZONE } from './vietqr-code'

const PAYLOAD = '00020101021238570010A00000072701270006970436011300110012345670208QRIBFTTA530370454061550005802VN62170813BAN 12 A1B2C363047A8C'
const qr = QRCode.create(PAYLOAD, { errorCorrectionLevel: 'M' })

it('render đầu tiên đã có SVG, không dùng thẻ img', () => {
  const html = renderToStaticMarkup(<VietQrCode payload={PAYLOAD} size="44mm" />)
  expect(html).toContain('<svg')
  expect(html).not.toContain('<img')
  expect(html).toContain('width="44mm"')
  expect(html).toContain(`viewBox="0 0 ${qr.modules.size + 2 * VIETQR_QUIET_ZONE} ${qr.modules.size + 2 * VIETQR_QUIET_ZONE}"`)
  expect(html).toContain('shape-rendering="crispEdges"')
  expect(html).toContain('role="img"')
})

it('nhận size là số px', () => {
  expect(renderToStaticMarkup(<VietQrCode payload={PAYLOAD} size={176} />)).toContain('width="176"')
})

it('vẽ đủ mọi module đen', () => {
  const html = renderToStaticMarkup(<VietQrCode payload={PAYLOAD} size={176} />)
  const drawn = [...html.matchAll(/M\d+ \d+h(\d+)/g)].reduce((n, m) => n + Number(m[1]), 0)
  expect(drawn).toBe(qr.modules.data.reduce((n, v) => n + (v ? 1 : 0), 0))
})
