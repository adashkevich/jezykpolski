# 06 — App shell, роутинг, PWA

**Зависит от:** 01
**Результат:** устанавливаемая оболочка с навигацией и пустыми экранами.

---

## Шаги

### 1. Роутинг

`src/app/router.tsx`, React Router (declarative mode), маршруты — `architecture.md` §9.

`:wordId` — URL-encoded `lemma|POS` (`kobieta%7CNOUN`). Хелперы `wordPath(wordId)` /
`parseWordParam(param)`, чтобы кодирование не размазалось по компонентам.

`HashRouter` не использовать. Хостинг обязан отдавать SPA-fallback (blueprint §6).

### 2. Layout

```text
AppShell
├── Outlet (контент страницы)
└── BottomNavigation:  Главная · Слова · Практика · Прогресс
```

Настройки — иконкой в шапке, не в нижней навигации.

Разделы «Сущ. / Глаголы / Прил.» — **не отдельные вкладки нижней навигации**, а переключатель
части речи внутри «Слова» (`architecture.md` §9). Это устраняет четыре почти одинаковых экрана.

### 3. Mobile-first

Базовая вёрстка на 320px, безопасные зоны (`env(safe-area-inset-bottom)` для нижней навигации),
тач-таргеты ≥ 44px, контент не уезжает под нижнюю панель.

### 4. Общие состояния

`components/app/`: `PageContainer`, `PageHeader`, `LoadingScreen`, `EmptyState`, `ErrorState`.
Создавать сейчас — они нужны всем последующим задачам (blueprint §23 разрешает: паттерн реальный).

### 5. Иконки PWA

Сгенерировать `192×192`, `512×512`, `512×512 maskable`, `apple-touch-icon`, favicon.
Положить в `public/icons/`. Удалить `public/icons.svg` из шаблона Vite.

### 6. Манифест

```text
name: "Polski — изучение польского"
short_name: "Polski"
display: standalone
orientation: portrait
theme_color / background_color — из design tokens
lang: "ru"
start_url: "/"
```

### 7. `vite-plugin-pwa`

`registerType: 'prompt'`. Precache: app shell, JS/CSS, иконки, `content/manifest.json`,
`content/index.json`, `content/senses/*.json`.
`content/paradigms/*` **исключить из precache** — их 64 и 13.8 МБ.
Полная настройка runtime-кэша — задача 25; здесь достаточно рабочего офлайн-shell.

### 8. Тема

Светлая и тёмная через CSS-переменные и `prefers-color-scheme`. Переключатель — задача 24.

---

## Acceptance

- [ ] Все маршруты из `architecture.md` §9 открываются и рендерят заглушку
- [ ] Нижняя навигация подсвечивает активный раздел, работает с клавиатуры
- [ ] Приложение проходит установку как PWA (Lighthouse installability = pass)
- [ ] После первой загрузки shell открывается офлайн (production-сборка, не dev)
- [ ] Вёрстка корректна на 320px без горизонтального скролла
- [ ] Нижняя навигация не перекрывает контент и учитывает safe-area на iOS
- [ ] `wordPath` / `parseWordParam` — round-trip тест на лемме со спецсимволами
- [ ] Тёмная тема не ломает контраст (проверить `AA` на основных поверхностях)
