# Polski — изучение польского языка

Офлайн PWA для русскоговорящих, изучающих польский. Приложение разделяет два независимых слоя
знания: **словарь** (знаю лемму и её значение) и **морфология** (умею правильно изменять слово —
падежи, времена, роды, степени сравнения). Прогресс строится на интервальных повторениях (FSRS)
поверх атомарных навыков, а не «уроков».

Подробности продукта и архитектуры — в `spec/`:

- `spec/requirements.md` — требования и правила разрешения конфликтов между спеками;
- `spec/app-design.md` — продуктовое поведение экранов;
- `spec/architecture.md` — структура каталогов, контентный пайплайн, схема Dexie, SRS;
- `spec/polish-learning-pwa-technical-blueprint.md` — обязательный стек и инженерные правила;
- `spec/tasks/` — пошаговый план реализации.

## Стек

React 19 · TypeScript (strict) · Vite · React Router · Tailwind CSS v4 · shadcn/ui (Radix) ·
Zustand · Dexie (IndexedDB) · Zod · ts-fsrs · vite-plugin-pwa.

Никакого бэкенда, авторизации и облачной синхронизации — всё локально, офлайн-first.

## Разработка

```bash
npm install
npm run dev            # dev-сервер
npm run build           # проверка типов (tsc -b) + production-сборка
npm run preview         # предпросмотр production-сборки
npm run lint             # ESLint
npm run format            # Prettier — автоформатирование
npm run format:check       # Prettier — только проверка
npm test                    # Vitest
npm run test:watch           # Vitest в watch-режиме
npm run test:coverage         # Vitest с отчётом покрытия
npm run e2e                    # Playwright
```

Требования: Node ≥ 20, npm.
