// Запуск .ts-скриптов чистым Node (≥ 23, type stripping) без сборщика:
// импорты без расширения → .ts, алиас «@/» → корень проекта.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

registerHooks({
  resolve(spec, ctx, next) {
    let s = spec;
    if (s.startsWith('@/')) s = pathToFileURL(path.join(root, s.slice(2))).href;
    if ((s.startsWith('.') || s.startsWith('file:')) && !/\.[cm]?[jt]sx?$|\.json$/.test(s)) {
      const base = s.startsWith('file:') ? fileURLToPath(s) : path.resolve(path.dirname(fileURLToPath(ctx.parentURL)), s);
      for (const ext of ['.ts', '.tsx', '/index.ts']) {
        if (existsSync(base + ext)) return next(pathToFileURL(base + ext).href, ctx);
      }
    }
    return next(s, ctx);
  },
});
