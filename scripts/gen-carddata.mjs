// data/cards.json(검증된 원본) → src/engine/data/cards.ts, nobles.ts 생성기
// 사용법: node scripts/gen-carddata.mjs
// CardId/NobleId는 이 스크립트의 정렬 순서로 확정되므로, 재정렬은 세이브 호환성을 깨뜨린다.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const GEMS = ['white', 'blue', 'green', 'red', 'black']

const raw = JSON.parse(readFileSync(join(root, 'data/cards.json'), 'utf8'))

const costTuple = (m) => GEMS.map((g) => m[g])
const byCanonicalOrder = (a, b) =>
  a.tier - b.tier ||
  GEMS.indexOf(a.bonus) - GEMS.indexOf(b.bonus) ||
  a.points - b.points ||
  costTuple(a.cost).join().localeCompare(costTuple(b.cost).join())

const cards = [...raw.cards].sort(byCanonicalOrder)
const nobles = [...raw.nobles].sort((a, b) =>
  costTuple(a.requirement).join().localeCompare(costTuple(b.requirement).join()),
)

if (cards.length !== 90 || nobles.length !== 10) {
  throw new Error(`unexpected counts: ${cards.length} cards, ${nobles.length} nobles`)
}

const gemMap = (m) => `{ white: ${m.white}, blue: ${m.blue}, green: ${m.green}, red: ${m.red}, black: ${m.black} }`

const header = `// 자동 생성 파일 — 직접 수정 금지.
// 원본: data/cards.json (이중 독립 수집으로 교차 검증된 데이터)
// 재생성: node scripts/gen-carddata.mjs
`

writeFileSync(
  join(root, 'src/engine/data/cards.ts'),
  `${header}import type { Card } from '../types'

export const CARDS: readonly Card[] = [
${cards.map((c, i) => `  { id: ${i}, tier: ${c.tier}, points: ${c.points}, bonus: '${c.bonus}', cost: ${gemMap(c.cost)} },`).join('\n')}
]
`,
)

writeFileSync(
  join(root, 'src/engine/data/nobles.ts'),
  `${header}import type { Noble } from '../types'

export const NOBLES: readonly Noble[] = [
${nobles.map((n, i) => `  { id: ${i}, points: 3, requirement: ${gemMap(n.requirement)} },`).join('\n')}
]
`,
)

console.log(`generated: ${cards.length} cards, ${nobles.length} nobles`)
