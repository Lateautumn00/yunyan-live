import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/.vite/**',
      '**/build/**',
      '**/vendor/**',
      '**/*.config.js',
      '**/*.config.mjs'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  pluginVue.configs['flat/recommended'],
  {
    // 格式化归 prettier 管：关闭与 prettier 输出冲突的 vue 风格规则
    // （max-attributes-per-line / singleline-html-element-content-newline /
    //   html-self-closing / html-closing-bracket-newline / html-indent /
    //   multiline-html-element-content-newline）
    rules: {
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/html-indent': 'off',
      'vue/multiline-html-element-content-newline': 'off'
    }
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    rules: {
      'vue/multi-word-component-names': 'off'
    }
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.node }
    }
  },
  {
    files: ['**/*.{ts,mts,tsx,vue}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node }
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }
      ]
    }
  },
  {
    files: ['**/ClassRoom/WhiteBoard.vue'],
    rules: {
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/ban-ts-comment': 'off'
    }
  },
  {
    files: ['**/pages/classroom/*.vue'],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off'
    }
  }
);
