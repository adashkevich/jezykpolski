# 01 — Настройка тулчейна

**Зависит от:** —
**Результат:** проект собирается в strict-режиме, есть Tailwind v4, shadcn/ui, роутинг, алиасы, тесты, форматтер.

---

## Текущее состояние (проверено)

Установлено и работает: React 19.2, Vite 8.2, TypeScript 6.0, Dexie 4.4, dexie-react-hooks, Zustand 5.
Node v24.18, npm 12.0 — требование blueprint (Node ≥ 20) выполнено.

Проблемы, которые нужно закрыть в этой задаче:

| Проблема | Где |
|---|---|
| `strict: true` **отсутствует** в компилятор-опциях | `tsconfig.app.json` |
| Нет алиаса `@/* → src/*` | `tsconfig.app.json`, `vite.config.ts` |
| `vite-plugin-pwa` установлен, но **не подключён** | `vite.config.ts` |
| `zod` есть в `node_modules` только транзитивно, **нет в `package.json`** | `package.json` |
| Нет `react-router`, `tailwindcss`, `lucide-react`, `ts-fsrs` | `package.json` |
| Нет Vitest, RTL, Playwright, Prettier | `package.json` |
| Стартовый шаблон Vite всё ещё на месте | `src/App.tsx`, `src/App.css`, `src/assets/*` |

---

## Шаги

### 1. Зависимости

```bash
npm install react-router zod lucide-react ts-fsrs @tanstack/react-virtual
```

```bash
npm install -D tailwindcss @tailwindcss/vite prettier vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test
```

`@tanstack/react-virtual` — обоснованное отклонение от blueprint §31, см. `spec/requirements.md` §4.
Запиши это в журнал решений в `00-progress.md`.

### 2. TypeScript

В `tsconfig.app.json` добавить:

```jsonc
"strict": true,
"noUncheckedIndexedAccess": true,
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

`noUncheckedIndexedAccess` важен: код много работает с массивами форм и вариантов ответа,
и молчаливый `undefined` там — источник трудноуловимых багов.

В `tsconfig.node.json` добавить `"strict": true`.

### 3. Vite

`vite.config.ts` — плагины `react()`, `tailwindcss()`, `VitePWA({...})`, алиас `@`,
и `test` секция для Vitest (`environment: 'jsdom'`, `setupFiles`).
Конфиг PWA пока минимальный — детальная настройка в задаче 06.

### 4. Tailwind v4 + design tokens

`src/app/styles/globals.css`:

```css
@import "tailwindcss";
```

Определить семантические токены (blueprint §8) — цвета не хардкодить по компонентам:

```text
--color-success  --color-error  --color-warning  --color-muted
--color-state-new  --color-state-learning  --color-state-known  --color-state-mastered
```

Токены должны работать в светлой и тёмной теме.

### 5. shadcn/ui

Инициализировать через CLI. **Не генерировать компоненты пачкой** (blueprint §33) — добавлять
по мере надобности. На этом шаге поставить только `button` и `card`, чтобы проверить, что сборка
и токены работают.

### 6. Prettier + ESLint

`.prettierrc`, `.prettierignore` (исключить `data/`, `public/content/`, `dist/`).
Скрипты: `format`, `format:check`. Убедиться, что ESLint и Prettier не конфликтуют.

### 7. Очистка шаблона

Удалить: `src/App.css`, `src/assets/hero.png`, `src/assets/react.svg`, `src/assets/vite.svg`,
содержимое `src/App.tsx`, `public/icons.svg` (иконки заменятся в задаче 06).
Переписать `README.md` под реальный проект.
Обновить `index.html`: `lang="ru"`, осмысленный `<title>`, `theme-color`.

### 8. Скрипты в `package.json`

```text
dev · build · preview · lint · format · format:check
test · test:watch · test:coverage · e2e
```

---

## Acceptance

- [ ] `npm run build` проходит без ошибок TypeScript при `strict: true`
- [ ] `npm run lint` проходит без ошибок и предупреждений
- [ ] Импорт `@/lib/…` резолвится и в TS, и в Vite-сборке
- [ ] Tailwind-класс применяется на пустой странице; семантические токены объявлены
- [ ] `npm test` запускается и проходит хотя бы один smoke-тест
- [ ] `npx playwright test` запускается (пусть и с пустым набором)
- [ ] В репозитории не осталось файлов стартового шаблона Vite
- [ ] `package-lock.json` закоммичен
