import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['**/dist/**', '.serena/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  { files: ['web/**/*.{ts,tsx}'], ...reactHooks.configs.flat.recommended },
);
