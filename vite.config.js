import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';
import pkg from './package.json' with { type: 'json' };

const RAW_BASE =
  'https://raw.githubusercontent.com/NemoKing1210/backloggd-data-transfer/main';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'terser',
    terserOptions: {
      compress: { passes: 2, pure_getters: true },
      mangle: true,
      format: { comments: false },
    },
    cssMinify: true,
    target: 'es2018',
    reportCompressedSize: true,
  },
  esbuild: {
    legalComments: 'none',
  },
  plugins: [
    monkey({
      entry: 'src/main.js',
      userscript: {
        name: {
          '': 'Backloggd Data Transfer',
          ru: 'Backloggd Data Transfer',
        },
        namespace: 'https://github.com/NemoKing1210/backloggd-data-transfer',
        version: pkg.version,
        description: {
          '': 'Import game logs into Backloggd from other platforms via a unified transfer file',
          ru: 'Импорт игровых логов в Backloggd из других площадок через единый transfer-файл',
        },
        author: 'NemoKing1210',
        tag: ['backloggd', 'games', 'import', 'export'],
        homepageURL: 'https://github.com/NemoKing1210/backloggd-data-transfer',
        supportURL: 'https://github.com/NemoKing1210/backloggd-data-transfer/issues',
        updateURL: `${RAW_BASE}/backloggd-data-transfer.user.js`,
        downloadURL: `${RAW_BASE}/backloggd-data-transfer.user.js`,
        license: 'MIT',
        icon: 'https://www.backloggd.com/favicon.ico',
        match: [
          'https://www.backloggd.com/*',
          'https://backloggd.com/*',
        ],
        connect: ['www.backloggd.com', 'backloggd.com'],
        'run-at': 'document-idle',
        noframes: true,
      },
      server: {
        prefix: 'dev:',
      },
      build: {
        fileName: 'backloggd-data-transfer.user.js',
        metaFileName: true,
      },
    }),
  ],
});
