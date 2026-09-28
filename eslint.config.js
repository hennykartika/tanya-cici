import js from '@eslint/js';
import globals from 'globals';

const sharedRules = {
  'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  'no-console': 'error',
  'no-var': 'error',
  'prefer-const': 'error',
  eqeqeq: ['error', 'smart'],
  'no-implicit-coercion': ['error', { boolean: false }],
  'object-shorthand': 'error',
  'no-return-await': 'error',
};

export default [
  { ignores: ['node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'api/**/*.js', 'scripts/**/*.js', 'test/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: sharedRules,
  },
  {
    files: ['public/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: sharedRules,
  },
];
