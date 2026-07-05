import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },

  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // 결정론 보장: 무작위성은 engine/rng.ts의 시드 RNG, 시간 접근은 명시적 예외 파일만.
      // 예외가 필요한 파일(ai/client.ts 타임아웃, store 저장 타임스탬프)은 파일 단위
      // eslint-disable 주석으로만 허용한다. (docs/ARCHITECTURE.md §1)
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: '결정론 위반: engine/rng.ts의 시드 RNG를 사용하세요.',
        },
        {
          object: 'Date',
          property: 'now',
          message: '결정론 위반: 시간 접근은 허용된 파일에서 파일 단위 disable로만.',
        },
      ],
    },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // 의존 방향 강제: ui → store → engine ← ai (docs/ARCHITECTURE.md §1)
  // engine/과 ai/는 React도 DOM도 상위 계층도 모르는 순수 모듈이어야 한다.
  {
    files: ['src/engine/**/*.ts', 'src/ai/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message: 'engine/ai는 순수 모듈입니다 — React 의존 금지.',
            },
            {
              group: ['**/ui/**', '**/ui', '**/store/**', '**/store'],
              message: '의존 방향 위반: engine/ai에서 ui/store를 import할 수 없습니다.',
            },
          ],
        },
      ],
    },
  },
)
