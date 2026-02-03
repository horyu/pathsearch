// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],
      'no-console': 'off'
    }
  },
  {
    files: ['src/lib/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'vscode',
              message: 'VS Code 依存は src/ 配下に配置してください。'
            }
          ],
          patterns: [
            {
              group: ['../*', '../**'],
              message: 'src/lib は src/ 直下に依存しないでください。'
            }
          ]
        }
      ]
    }
  },
  {
    ignores: ['out/**', 'node_modules/**', '*.js', '*.d.ts']
  }
];
