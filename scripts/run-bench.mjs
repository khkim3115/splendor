// `npm run bench` 진입점 — tests/bench/bench.test.ts를 BENCH=1로 실행한다.
// cmd.exe/PowerShell/bash 어디서든 "npm run bench" 한 번으로 동작하도록,
// env 접두 문법(`BENCH=1 cmd`, bash 전용) 대신 Node 자식 프로세스에 env를 주입한다.
// (새 devDependency 없이 크로스플랫폼 env 가드를 만드는 표준 방법)
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const vitestBin = join(root, 'node_modules', 'vitest', 'vitest.mjs')

const result = spawnSync(
  process.execPath,
  // --reporter=verbose 없이는 기본 리포터가 통과한 테스트의 console.log를 감춰
  // 사람이 읽는 벤치 리포트가 출력되지 않는다.
  [vitestBin, 'run', 'tests/bench/bench.test.ts', '--reporter=verbose'],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, BENCH: '1' },
  },
)

process.exit(result.status ?? 1)
