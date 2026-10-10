// Khởi chạy bộ chuyển tiếp. Cần Node >= 18, KHÔNG cần cài thư viện.
//   MEVO_HMAC_SECRET=...  (cùng giá trị với relay ZCA và secret MEVO_HMAC_SECRET trên Supabase)
//   PORT=3100             (mặc định)
import { createServer } from 'node:http'
import { handlePhoneProxy } from './proxy.mjs'

const hmacSecret = process.env.MEVO_HMAC_SECRET?.trim()
if (!hmacSecret) {
  console.error('[phone-proxy] Thiếu MEVO_HMAC_SECRET — dừng.')
  process.exit(1)
}
const port = Number(process.env.PORT) || 3100
const MAX_BODY = 4096

createServer((req, res) => {
  const chunks = []
  let size = 0
  let tooBig = false
  req.on('data', (chunk) => {
    size += chunk.length
    if (size > MAX_BODY) { tooBig = true; req.destroy() } else chunks.push(chunk)
  })
  req.on('close', () => { if (tooBig && !res.writableEnded) { res.writeHead(413).end() } })
  req.on('end', async () => {
    const path = (req.url ?? '').split('?')[0]
    const result = await handlePhoneProxy(
      {
        method: req.method ?? '',
        path,
        headers: { 'x-mevo-timestamp': req.headers['x-mevo-timestamp'], 'x-mevo-signature': req.headers['x-mevo-signature'] },
        rawBody: Buffer.concat(chunks).toString('utf8'),
      },
      {
        hmacSecret,
        now: Date.now,
        fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(10_000) }),
        log: (message) => console.log(`${new Date().toISOString()} ${message}`),
      },
    )
    res.writeHead(result.status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(result.body))
  })
}).listen(port, '127.0.0.1', () => console.log(`[phone-proxy] nghe 127.0.0.1:${port}`))
