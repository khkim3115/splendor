// 테스트 타이틀의 §태그 → docs/rules-mapping.md 자동 생성
// 사용법: node scripts/gen-rules-mapping.mjs
// docs/rules-mapping.md는 수동 편집 금지 — CI가 stale 여부를 검사한다.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const testsDir = join(root, 'tests')

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (name.endsWith('.test.ts')) out.push(p)
  }
  return out
}

const TITLE_RE = /\b(?:it|describe)\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g
const TAG_RE = /§[0-9][0-9.]*(?:-[A-Za-z0-9~]+)?/g

const mapping = new Map() // tag -> [{file, title}]
for (const file of walk(testsDir).sort()) {
  const rel = relative(root, file).replaceAll('\\', '/')
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(TITLE_RE)) {
    const title = m[2]
    const tags = new Set((title.match(TAG_RE) ?? []).map((t) => t.replace(/\.+$/, '')))
    for (const tag of tags) {
      if (!mapping.has(tag)) mapping.set(tag, [])
      mapping.get(tag).push({ file: rel, title })
    }
  }
}

const tagSort = (a, b) => {
  const parse = (t) => {
    const [num, suffix = ''] = t.slice(1).split('-')
    return [num.split('.').map(Number), suffix]
  }
  const [na, sa] = parse(a)
  const [nb, sb] = parse(b)
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const d = (na[i] ?? 0) - (nb[i] ?? 0)
    if (d !== 0) return d
  }
  return sa.localeCompare(sb)
}

const tags = [...mapping.keys()].sort(tagSort)
const total = [...mapping.values()].reduce((s, v) => s + v.length, 0)

let md = `# 룰 조항 ↔ 테스트 매핑

> 자동 생성 문서 — 직접 편집 금지. 재생성: \`node scripts/gen-rules-mapping.mjs\`
> 원본 조항: [RULES.md](RULES.md) · 태그된 테스트 ${total}건 / 조항 ${tags.length}개

| 조항 | 테스트 수 | 테스트 |
|---|---|---|
`
for (const tag of tags) {
  const entries = mapping.get(tag)
  const list = entries
    .map((e) => `\`${e.file.replace('tests/', '')}\` — ${e.title.replaceAll('|', '\\|')}`)
    .join('<br>')
  md += `| **${tag}** | ${entries.length} | ${list} |\n`
}

writeFileSync(join(root, 'docs/rules-mapping.md'), md)
console.log(`generated docs/rules-mapping.md: ${tags.length} tags, ${total} tagged tests`)
