import globals from 'globals';

export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // จับกรณีเรียกใช้ฟังก์ชัน/ตัวแปรที่ไม่มีอยู่จริง (เช่นเผลอลบไปตอนย้ายโค้ด)
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none' }],
      'no-constant-condition': 'warn',
    },
  },
  { ignores: ['node_modules/', 'data/'] },
];
