'use strict'
// 512x512 앱 아이콘 생성 — 브랜드 퍼플 컷보석 on 다크(#14161a). 3x 슈퍼샘플 AA, zlib로 PNG 직접 인코딩.
const fs = require('fs')
const zlib = require('zlib')

const OUT = process.argv[2]
const SIZE = 512
const SS = 3 // 슈퍼샘플 배율

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const BG = hex('#14161a')

// 보석 정점 (512 좌표, x=256 중심)
const TL = [202, 154], TR = [310, 154]        // 테이블(윗면) 좌우
const GL = [146, 214], GR = [366, 214], GM = [256, 214] // 거들(최대폭) 좌·우·중앙
const B = [256, 362]                          // 큘렛(아래 꼭짓점)

const tri = (a, b, c, col) => ({ a, b, c, col: hex(col) })
// 위에서 오는 빛 — 위/좌 밝게, 우/아래 어둡게
const facets = [
  tri(TL, TR, GM, '#b89bff'), // 테이블(가장 밝음)
  tri(TL, GM, GL, '#9a5cff'), // 좌 크라운
  tri(TR, GR, GM, '#7e3aef'), // 우 크라운(그림자)
  tri(GL, GM, B, '#7636e8'),  // 좌 파빌리온
  tri(GM, GR, B, '#5a1cc0'),  // 우 파빌리온(가장 어두움)
]
const LINE = hex('#d9c2ff')
const segs = [[TL, TR], [TL, GL], [TR, GR], [GL, GR], [TL, GM], [TR, GM], [GL, B], [GR, B], [GM, B]]
const LW = 1.5 // 패싯 라인 반폭(512 좌표)

const sign = (px, py, ax, ay, bx, by) => (px - bx) * (ay - by) - (ax - bx) * (py - by)
function inTri(px, py, t) {
  const [ax, ay] = t.a, [bx, by] = t.b, [cx, cy] = t.c
  const d1 = sign(px, py, ax, ay, bx, by)
  const d2 = sign(px, py, bx, by, cx, cy)
  const d3 = sign(px, py, cx, cy, ax, ay)
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}
function distSeg(px, py, a, b) {
  const [ax, ay] = a, [bx, by] = b
  const dx = bx - ax, dy = by - ay
  const L2 = dx * dx + dy * dy
  let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const cx = ax + t * dx, cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

const buf = Buffer.alloc(SIZE * SIZE * 4)
for (let Y = 0; Y < SIZE; Y++) {
  for (let X = 0; X < SIZE; X++) {
    let r = 0, g = 0, bl = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const px = X + (sx + 0.5) / SS
        const py = Y + (sy + 0.5) / SS
        let col = BG
        for (const t of facets) { if (inTri(px, py, t)) { col = t.col; break } }
        let minD = 1e9
        for (const s of segs) { const d = distSeg(px, py, s[0], s[1]); if (d < minD) minD = d }
        if (minD <= LW) col = LINE
        else if (minD < LW + 0.9) {
          const f = (LW + 0.9 - minD) / 0.9
          col = [Math.round(col[0] * (1 - f) + LINE[0] * f), Math.round(col[1] * (1 - f) + LINE[1] * f), Math.round(col[2] * (1 - f) + LINE[2] * f)]
        }
        r += col[0]; g += col[1]; bl += col[2]
      }
    }
    const n = SS * SS, o = (Y * SIZE + X) * 4
    buf[o] = Math.round(r / n); buf[o + 1] = Math.round(g / n); buf[o + 2] = Math.round(bl / n); buf[o + 3] = 255
  }
}

// ── PNG 인코딩 (RGBA 8bit, filter 0) ──
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0, 0); return b }
const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type, data) { const t = Buffer.from(type, 'ascii'); return Buffer.concat([u32(data.length), t, data, u32(crc32(Buffer.concat([t, data])))]) }
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const ihdr = Buffer.concat([u32(SIZE), u32(SIZE), Buffer.from([8, 6, 0, 0, 0])])
const stride = SIZE * 4 + 1
const raw = Buffer.alloc(SIZE * stride)
for (let y = 0; y < SIZE; y++) { raw[y * stride] = 0; buf.copy(raw, y * stride + 1, y * SIZE * 4, (y + 1) * SIZE * 4) }
const idat = zlib.deflateSync(raw, { level: 9 })
const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
fs.writeFileSync(OUT, png)
console.log('wrote ' + OUT + ' ' + png.length + ' bytes ' + SIZE + 'x' + SIZE)
