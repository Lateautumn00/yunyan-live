import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import globals from 'globals';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/essential'],
  ...vue.configs['flat/recommended'],
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'build/**',
      'locales/**',
      'src/assets/**',
      'public/**',
      'src/**/*.d.ts'
    ]
  },
  {
    files: ['**/*.{ts,mts,cts,tsx,vue}'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue']
      },
      globals: {
        ...globals.browser,
        ...globals.es2022,
        GlobalPropertiesApi: 'readonly',
        ViteCompression: 'readonly',
        ViteEnv: 'readonly',
        PlatformConfigs: 'readonly',
        StorageConfigs: 'readonly',
        ToRouteType: 'readonly',
        RouteConfigsTable: 'readonly'
      }
    },
    settings: {
      'vue/essential': true
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-useless-assignment': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-restricted-syntax': 'off',
      'no-prototype-builtins': 'off',
      'no-useless-assignment': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],
      'vue/multi-word-component-names': 'off',
      'vue/component-definition-name-casing': 'off',
      'vue/no-unused-vars': 'off',
      'vue/no-template-shadow': 'off',
      'vue/one-component-per-file': 'off',
      'vue/require-default-prop': 'off',
      'vue/attribute-hyphenation': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'no-undef': 'off'
    }
  }
];
