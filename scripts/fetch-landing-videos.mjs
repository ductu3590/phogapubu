#!/usr/bin/env node
// Tải 3 video nền của landing mevo.vn về admin-web/public/landing/ để tự host trên CDN của Vercel.
// Chạy 1 lần ở thư mục gốc repo:  node scripts/fetch-landing-videos.mjs
// Có ffmpeg trong PATH thì nén lại cho nhẹ (720p, không tiếng, +faststart để phát ngay khi đang tải);
// không có thì giữ nguyên bản gốc. Xong: git add admin-web/public/landing && commit && push,
// rồi xoá link dự phòng sceneai.art trong admin-web/lib/landing/site.ts.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = 'https://cdn.sceneai.art/Hero%20Section%20Video/'
const VIDEOS = {
  'hero.mp4': '50b4f304-cdca-4e12-8735-580d225834be.mp4',
  'feature-order.mp4': '1bcc8fa3-37f6-4c53-8591-0347e4c7f8ac.mp4',
  'feature-realtime.mp4': '736fd4a0-70ac-4f44-9633-55769ead6aca.mp4',
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'admin-web', 'public', 'landing')
mkdirSync(outDir, { recursive: true })
const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0
const mb = (f) => (statSync(f).size / 1024 / 1024).toFixed(1) + ' MB'

for (const [name, remote] of Object.entries(VIDEOS)) {
  const target = join(outDir, name)
  const raw = target + '.raw'
  process.stdout.write(`Tải ${name}… `)
  const res = await fetch(BASE + remote)
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
  writeFileSync(raw, Buffer.from(await res.arrayBuffer()))
  process.stdout.write(`${mb(raw)}`)
  if (hasFfmpeg) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-an', '-vf', 'scale=-2:min(720\\,ih)',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', target])
    rmSync(raw)
    console.log(` → nén còn ${mb(target)}`)
  } else {
    renameSync(raw, target)
    console.log(' (không có ffmpeg, giữ bản gốc)')
  }
}
console.log(`Xong. File nằm ở ${outDir}`)
