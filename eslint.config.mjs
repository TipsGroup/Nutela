import eslintLove from 'eslint-config-love';
import prettierConfig from 'eslint-config-prettier';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    ignores: ['dist/*', '.history/'],
  },
  {
    ...eslintLove,
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/strict-boolean-expressions': 0,
    },
  },
  prettierConfig,
  eslintPluginPrettierRecommended,
];
