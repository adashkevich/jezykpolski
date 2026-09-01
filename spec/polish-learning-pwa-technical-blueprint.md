# Polish Learning PWA — Technical Blueprint

> Implementation brief for Claude / coding agent
> Status: MVP architecture
> Date: 2026-08-28

---

## 1. Project goal

Build a **Progressive Web App (PWA) for learning Polish**.

The application must:

* be written in **React + TypeScript**;
* be installable as a PWA;
* work offline after the first successful load;
* store learning progress locally in the browser;
* support vocabulary learning, exercises and spaced repetition;
* be mobile-first, but work well on desktop;
* require **no custom backend**.

### Explicitly out of scope for the current version

Do **not** implement or add:

* authentication;
* Google OAuth;
* Supabase;
* Firebase;
* backend/API server;
* Node/Express server;
* server-side rendering;
* Next.js;
* cloud synchronization;
* payments;
* AI/LLM integrations;
* admin panel.

The architecture should make it possible to add authentication and cloud sync later without rewriting the learning domain.

---

# 2. Mandatory technology stack

Use the latest stable mutually compatible versions and commit the lockfile.

## Core

| Purpose             | Technology                    |
| ------------------- | ----------------------------- |
| UI framework        | React 19                      |
| Language            | TypeScript                    |
| Build tool          | Vite                          |
| Routing             | React Router                  |
| Styling             | Tailwind CSS v4               |
| Component system    | shadcn/ui                     |
| Headless primitives | Radix-based shadcn components |
| Icons               | Lucide React                  |

## Local state and persistence

| Purpose                   | Technology        |
| ------------------------- | ----------------- |
| Persistent local DB       | IndexedDB         |
| IndexedDB wrapper         | Dexie.js          |
| React/Dexie integration   | dexie-react-hooks |
| UI/session state          | Zustand           |
| Runtime schema validation | Zod               |

## PWA

| Purpose             | Technology                      |
| ------------------- | ------------------------------- |
| PWA integration     | vite-plugin-pwa                 |
| Service Worker      | Workbox through vite-plugin-pwa |
| Initial SW strategy | `generateSW`                    |

Do not write a custom service worker until the generated Workbox service worker is insufficient.

## Learning algorithm

| Purpose           | Technology |
| ----------------- | ---------- |
| Spaced repetition | `ts-fsrs`  |

Use FSRS through a small application adapter so that the rest of the codebase does not directly depend on library-specific types everywhere.

`ts-fsrs` currently requires Node.js >= 20, so use **Node.js 20+** for development/build tooling.

## Testing

| Purpose              | Technology            |
| -------------------- | --------------------- |
| Unit/component tests | Vitest                |
| React tests          | React Testing Library |
| Browser/E2E          | Playwright            |

## Code quality

* ESLint
* Prettier
* TypeScript strict mode

---

# 3. Package manager

Use **npm** unless the repository already uses another package manager.

Do not mix npm, pnpm and yarn.

Commit:

```text
package.json
package-lock.json
```

---

# 4. High-level architecture

The application is **local-first**.

```text
                     ┌────────────────────┐
                     │ Static app content │
                     │ lessons / words    │
                     │ grammar / media    │
                     └──────────┬─────────┘
                                │
                                ▼
┌────────────────┐      ┌───────────────┐
│ Service Worker │◄────►│   React PWA   │
│ + Cache Storage│      └───────┬───────┘
└────────────────┘              │
                                │
                 ┌──────────────┴──────────────┐
                 │                             │
                 ▼                             ▼
          ┌────────────┐                ┌────────────┐
          │  Zustand   │                │   Dexie    │
          │ UI/session │                │ IndexedDB  │
          │   state    │                │ persistent │
          └────────────┘                │   state    │
                                        └────────────┘
```

### Source of truth rules

1. **Static learning content**

    * words;
    * lessons;
    * grammar explanations;
    * exercise definitions;
    * static audio metadata.

   Source of truth: files in the repository.

2. **Persistent user data**

    * progress;
    * FSRS cards;
    * review history;
    * settings;
    * statistics;
    * completed lessons.

   Source of truth: **IndexedDB via Dexie**.

3. **Temporary UI/session state**

    * current exercise index;
    * selected answer;
    * open dialogs;
    * filters;
    * active session;
    * temporary navigation state.

   Source of truth: React local state or Zustand.

### Important

Do **not** duplicate Dexie records into a global Zustand store.

Use `useLiveQuery()` where the UI needs to react to IndexedDB changes.

---

# 5. Proposed application structure

Use a pragmatic feature-based architecture.

```text
src/
├── app/
│   ├── App.tsx
│   ├── router.tsx
│   ├── providers/
│   │   └── AppProviders.tsx
│   └── styles/
│       └── globals.css
│
├── pages/
│   ├── home/
│   │   └── HomePage.tsx
│   ├── learn/
│   │   └── LearnPage.tsx
│   ├── lesson/
│   │   └── LessonPage.tsx
│   ├── vocabulary/
│   │   └── VocabularyPage.tsx
│   ├── review/
│   │   └── ReviewPage.tsx
│   ├── grammar/
│   │   └── GrammarPage.tsx
│   ├── progress/
│   │   └── ProgressPage.tsx
│   └── settings/
│       └── SettingsPage.tsx
│
├── features/
│   ├── lesson-session/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── model/
│   │   └── utils/
│   │
│   ├── exercises/
│   │   ├── components/
│   │   │   ├── MultipleChoiceExercise.tsx
│   │   │   ├── TranslationExercise.tsx
│   │   │   ├── TypingExercise.tsx
│   │   │   └── ExerciseFeedback.tsx
│   │   ├── model/
│   │   └── utils/
│   │
│   ├── vocabulary/
│   │   ├── components/
│   │   │   ├── WordCard.tsx
│   │   │   ├── WordList.tsx
│   │   │   └── PronunciationButton.tsx
│   │   ├── hooks/
│   │   └── model/
│   │
│   ├── review/
│   │   ├── components/
│   │   │   ├── ReviewCard.tsx
│   │   │   └── ReviewRatingButtons.tsx
│   │   ├── fsrs/
│   │   │   ├── fsrs-adapter.ts
│   │   │   └── fsrs.types.ts
│   │   ├── hooks/
│   │   └── model/
│   │
│   ├── progress/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── model/
│   │
│   └── settings/
│       ├── components/
│       └── model/
│
├── components/
│   ├── ui/
│   │   └── ... shadcn components
│   └── app/
│       ├── AppHeader.tsx
│       ├── BottomNavigation.tsx
│       ├── PageContainer.tsx
│       ├── LoadingScreen.tsx
│       └── ErrorState.tsx
│
├── content/
│   ├── vocabulary/
│   │   ├── a1/
│   │   ├── a2/
│   │   └── b1/
│   ├── grammar/
│   │   ├── a1/
│   │   ├── a2/
│   │   └── b1/
│   ├── lessons/
│   │   ├── a1/
│   │   ├── a2/
│   │   └── b1/
│   └── index.ts
│
├── db/
│   ├── database.ts
│   ├── schema.ts
│   ├── migrations/
│   └── repositories/
│       ├── progress.repository.ts
│       ├── reviews.repository.ts
│       ├── settings.repository.ts
│       └── statistics.repository.ts
│
├── stores/
│   ├── lesson-session.store.ts
│   └── app-ui.store.ts
│
├── hooks/
│   ├── useOnlineStatus.ts
│   └── useInstallPrompt.ts
│
├── lib/
│   ├── cn.ts
│   ├── dates.ts
│   ├── audio.ts
│   └── export-import.ts
│
├── schemas/
│   ├── content.schema.ts
│   ├── lesson.schema.ts
│   └── settings.schema.ts
│
├── types/
│   ├── content.ts
│   ├── lesson.ts
│   ├── progress.ts
│   └── common.ts
│
├── assets/
│   └── ...
│
├── main.tsx
└── vite-env.d.ts

public/
├── icons/
├── audio/
└── images/
```

---

# 6. Routing

Use standard client-side React Router.

Suggested routes:

```text
/                    Home / dashboard
/learn               Learning paths / topics
/lesson/:lessonId    Lesson
/vocabulary          Vocabulary browser
/review              Due spaced-repetition reviews
/grammar             Grammar topics
/progress            Learning statistics
/settings            Settings
```

Use a shared application layout.

Mobile navigation should preferably be bottom navigation for primary areas.

Example:

```text
Home | Learn | Review | Progress
```

Settings can be accessible from the header/profile/settings button.

### Hosting requirement

Production hosting must support SPA fallback:

```text
unknown route -> /index.html
```

Do not use `HashRouter` unless the deployment environment cannot provide SPA fallback.

---

# 7. UI architecture

## Use shadcn/ui for generic primitives

Examples:

* Button
* Card
* Dialog
* Drawer
* Sheet
* Tabs
* Progress
* Select
* RadioGroup
* Checkbox
* Tooltip
* Skeleton
* Badge
* DropdownMenu
* Alert
* Sonner/Toast

Do not recreate generic primitives with raw Tailwind when a suitable shadcn component exists.

## Build custom learning components

These should be application-specific:

```text
WordCard
ExerciseCard
AnswerButton
PronunciationButton
LessonProgress
DailyGoal
Streak
ReviewCard
GrammarTip
CompletionCard
LearningPathCard
```

shadcn is the primitive layer, not the visual identity of the app.

Custom components should use Tailwind classes and design tokens.

---

# 8. Styling rules

Use:

* Tailwind CSS v4;
* CSS variables/design tokens;
* shadcn theme tokens;
* mobile-first layout.

Avoid:

* inline `style={{ ... }}` except truly dynamic values;
* arbitrary duplicated color values;
* large page-specific CSS files;
* MUI;
* Chakra UI;
* Mantine;
* Bootstrap.

Create semantic tokens for learning states, for example:

```text
success
error
warning
muted
mastered
learning
new
```

Do not hard-code the same status colors throughout many components.

---

# 9. Static learning content

Learning content belongs in the repository and must be separate from UI code.

Prefer JSON or TypeScript data files validated by Zod.

Example word:

```ts
export interface VocabularyWord {
  id: string;
  polish: string;
  translation: string;
  level: 'A1' | 'A2' | 'B1';
  partOfSpeech: 'noun' | 'verb' | 'adjective' | 'adverb' | 'other';
  topicIds: string[];
  example?: {
    polish: string;
    translation: string;
  };
  audio?: string;
}
```

Example:

```json
{
  "id": "word-jablko",
  "polish": "jabłko",
  "translation": "яблоко",
  "level": "A1",
  "partOfSpeech": "noun",
  "topicIds": ["food"],
  "example": {
    "polish": "Jem jabłko.",
    "translation": "Я ем яблоко."
  },
  "audio": "/audio/words/jablko.mp3"
}
```

### Important content IDs

IDs must be:

* stable;
* unique;
* independent from array position;
* independent from translated text.

User progress refers to static content through these IDs.

Never use an array index as a persistent word/lesson identifier.

---

# 10. Lesson model

A lesson should be data-driven rather than hard-coded as one React component per lesson.

Example:

```ts
type ExerciseType =
  | 'multiple-choice'
  | 'translation'
  | 'typing'
  | 'flashcard';

interface Lesson {
  id: string;
  title: string;
  level: 'A1' | 'A2' | 'B1';
  topicId: string;
  description?: string;
  exerciseIds: string[];
}
```

Exercises should use a discriminated union.

Example:

```ts
interface ExerciseBase {
  id: string;
  type: ExerciseType;
}

interface MultipleChoiceExercise extends ExerciseBase {
  type: 'multiple-choice';
  prompt: string;
  options: string[];
  correctOption: string;
}

interface TypingExercise extends ExerciseBase {
  type: 'typing';
  prompt: string;
  acceptedAnswers: string[];
}

type Exercise =
  | MultipleChoiceExercise
  | TypingExercise;
```

Add new exercise types without rewriting the lesson page.

---

# 11. IndexedDB / Dexie

Use Dexie as the only application-level IndexedDB access layer.

Do not call IndexedDB APIs directly from React components.

Suggested database:

```text
PolishLearningDB
```

Suggested tables:

```text
lessonProgress
vocabularyProgress
reviewLogs
userSettings
dailyStats
```

Possible schema:

```ts
class PolishLearningDatabase extends Dexie {
  lessonProgress!: Table<LessonProgress>;
  vocabularyProgress!: Table<VocabularyProgress>;
  reviewLogs!: Table<ReviewLog>;
  userSettings!: Table<UserSettings>;
  dailyStats!: Table<DailyStats>;

  constructor() {
    super('PolishLearningDB');

    this.version(1).stores({
      lessonProgress:
        'lessonId, status, completedAt, updatedAt',

      vocabularyProgress:
        'wordId, state, due, lastReviewAt, updatedAt',

      reviewLogs:
        '++id, wordId, reviewedAt, rating',

      userSettings:
        'key',

      dailyStats:
        'date',
    });
  }
}
```

Exact indexes may be adjusted based on real query patterns.

### Database migrations

Never destructively change an existing Dexie schema without a migration.

Keep DB version changes explicit.

---

# 12. Persistent domain models

Suggested minimal models:

```ts
type LessonStatus =
  | 'not-started'
  | 'in-progress'
  | 'completed';

interface LessonProgress {
  lessonId: string;
  status: LessonStatus;
  completedExerciseIds: string[];
  correctAnswers: number;
  wrongAnswers: number;
  startedAt?: Date;
  completedAt?: Date;
  updatedAt: Date;
}
```

For vocabulary:

```ts
interface VocabularyProgress {
  wordId: string;

  state:
    | 'new'
    | 'learning'
    | 'review'
    | 'mastered';

  due?: Date;
  lastReviewAt?: Date;

  correctAnswers: number;
  wrongAnswers: number;

  fsrsCard?: unknown;

  updatedAt: Date;
}
```

Do not expose `unknown` FSRS storage objects throughout the app. The FSRS adapter should convert between application records and `ts-fsrs` types.

---

# 13. Spaced repetition / FSRS

Use `ts-fsrs`.

Create an isolation layer:

```text
features/review/fsrs/fsrs-adapter.ts
```

The rest of the app should call application-level functions such as:

```ts
scheduleNewWord(...)
reviewWord(...)
getNextReviewDate(...)
getDueWords(...)
```

rather than importing `ts-fsrs` in UI components.

User-facing review ratings:

```text
Again
Hard
Good
Easy
```

Store enough state to reconstruct future review scheduling.

Also store review logs for future statistics and possible migration/cloud sync.

---

# 14. Zustand usage

Use Zustand only where state is:

* temporary;
* cross-component;
* session-specific;
* not the durable source of truth.

Good examples:

```text
current lesson session
current exercise index
selected answer
session correct/wrong counters
temporary filters
mobile navigation state
```

Bad examples:

```text
all vocabulary progress
all review history
all completed lessons
```

Those belong in Dexie.

Prefer component state when state is used by only one small component tree.

Do not turn Zustand into a universal store.

---

# 15. Audio and pronunciation

Preferred order:

1. recorded/static pronunciation audio;
2. browser Speech Synthesis as optional fallback.

Static audio example:

```text
public/audio/words/jablko.mp3
```

Audio should be available offline when reasonable.

Do not precache thousands of large audio files blindly.

For larger content libraries, use runtime caching and/or cache audio when first requested.

Create an audio abstraction:

```ts
playPronunciation(word)
stopPronunciation()
```

Do not scatter raw Web Audio / SpeechSynthesis calls across components.

---

# 16. PWA requirements

Configure `vite-plugin-pwa`.

The PWA must include:

* Web App Manifest;
* app name;
* short name;
* theme color;
* background color;
* 192x192 icon;
* 512x512 icon;
* maskable icon where appropriate;
* `display: standalone`;
* service worker;
* offline application shell;
* update behavior.

Start with Workbox `generateSW`.

### Update UX

Do not silently create confusing stale application states.

Provide a simple update experience if a new app version is available.

Example:

```text
New version available
[Update]
```

or use automatic updating only if it does not interrupt an active lesson.

### Offline goal

After the user has opened the application successfully once:

```text
app shell          -> offline
cached lesson data -> offline
local progress     -> offline
review queue       -> offline
```

The core learning flow must not depend on the network.

---

# 17. Cache strategy

Conceptually:

### Precache

* HTML application shell;
* JS/CSS bundles;
* icons;
* essential static assets;
* small core learning data.

### Runtime cache

* lesson images;
* pronunciation audio;
* optional larger media.

Do not treat IndexedDB as HTTP cache.

Do not store user progress in Cache Storage.

---

# 18. Export / import backup

Because there is no account/cloud sync yet, provide local backup.

Settings page should eventually expose:

```text
Export progress
Import progress
Reset learning data
```

Suggested export:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-08-28T12:00:00.000Z",
  "lessonProgress": [],
  "vocabularyProgress": [],
  "reviewLogs": [],
  "settings": {}
}
```

Validate imports with Zod before changing IndexedDB.

Never trust imported JSON structure blindly.

---

# 19. Error handling

Do not wrap every function in `try/catch`.

Handle errors at meaningful boundaries:

* IndexedDB initialization;
* data import;
* corrupted content;
* audio loading;
* PWA update flow.

Provide reusable UI states:

```text
LoadingScreen
EmptyState
ErrorState
```

Unexpected errors should be visible enough during development to debug.

---

# 20. Accessibility

Treat accessibility as a baseline requirement.

Requirements:

* keyboard-accessible controls;
* visible focus states;
* correct button semantics;
* labels for inputs;
* meaningful aria labels for icon-only buttons;
* adequate contrast;
* do not rely on color alone for correct/wrong state;
* support reduced motion;
* touch targets appropriate for mobile.

Prefer accessible shadcn/Radix primitives over handwritten modal/popover behavior.

---

# 21. Mobile-first UX

The primary target experience should feel like a mobile learning app.

Design around widths around:

```text
320px -> 480px
```

and then progressively enhance for tablet/desktop.

Avoid layouts that assume a wide desktop screen.

Learning exercises should usually have:

* clear prompt;
* large answer targets;
* limited distractions;
* visible progress;
* easy one-handed interaction.

---

# 22. Suggested screens for MVP

## Home

Show:

* daily goal/progress;
* continue learning;
* reviews due;
* basic streak/statistics.

## Learn

Show:

* levels: A1 / A2 / B1;
* topics;
* lessons;
* lesson completion state.

## Lesson

Run a sequence of exercises.

Show:

* progress;
* prompt;
* answer area;
* feedback;
* continue action.

## Vocabulary

Show:

* word list;
* search;
* topic filter;
* learning state;
* pronunciation.

## Review

Show FSRS cards due now.

Flow:

```text
prompt
  ->
reveal answer
  ->
Again / Hard / Good / Easy
  ->
next card
```

## Grammar

Show structured Polish grammar topics.

## Progress

Show simple useful metrics, initially:

* lessons completed;
* words learned;
* reviews today;
* accuracy;
* current streak.

Avoid building a large analytics dashboard in MVP.

## Settings

Initially:

* sound;
* daily goal;
* export data;
* import data;
* reset data;
* app/version information.

---

# 23. Suggested shared UI components

Create only after they are actually reused.

Potential components:

```text
PageHeader
PageContainer
BottomNavigation
SectionHeader

WordCard
ExerciseCard
AnswerButton
PronunciationButton

LessonCard
LessonProgress

ReviewRatingButtons

StatCard
EmptyState
ErrorState
```

Do not create an abstraction before there is a real repeated pattern.

---

# 24. Data validation

Use Zod at data boundaries.

Validate:

* imported backup files;
* static JSON content loaded from files;
* persisted settings when schema evolution makes it useful.

Do not add Zod validation to every internal function for no reason.

TypeScript types remain the primary compile-time contract.

---

# 25. Testing strategy

Do not chase arbitrary 100% coverage.

Prioritize domain behavior.

## Unit tests

Test:

* answer evaluation;
* normalization of typed answers;
* FSRS adapter;
* progress calculation;
* streak calculation;
* content parsing;
* export/import transformation.

## Component tests

Test important interaction components:

* exercise flow;
* answer feedback;
* review buttons;
* settings inputs.

## E2E

Critical flows:

1. open app;
2. start lesson;
3. answer exercises;
4. complete lesson;
5. reload browser;
6. verify progress persisted;
7. open review;
8. complete review;
9. verify data persisted.

Also test the production build/PWA where feasible, not only Vite dev mode.

---

# 26. TypeScript rules

Enable strict TypeScript.

Avoid:

```ts
any
```

unless there is a documented integration boundary where it is unavoidable.

Prefer:

* discriminated unions;
* explicit domain models;
* narrow public interfaces;
* typed repositories;
* typed route parameters.

Do not create giant `types.ts` files containing unrelated types.

---

# 27. Import conventions

Configure alias:

```text
@/* -> src/*
```

Preferred imports:

```ts
import { Button } from '@/components/ui/button';
import { db } from '@/db/database';
```

Avoid long relative paths:

```ts
../../../../components/...
```

---

# 28. Repository layer

Components should not contain complex Dexie queries.

Use repositories/hooks where logic is meaningful.

Example:

```ts
progressRepository.getLessonProgress(lessonId)
progressRepository.markLessonCompleted(...)
reviewsRepository.getDueReviews(...)
```

Do not create enterprise-style repository abstractions for trivial one-line local reads unless they improve reuse/testability.

Keep architecture pragmatic.

---

# 29. Content/domain separation

React components must not mutate static lesson definitions.

Example:

```text
content lesson
      +
user progress from Dexie
      ↓
derived UI view
```

Do not add mutable `completed` fields into static lesson objects.

---

# 30. Future cloud sync compatibility

Do not implement sync now.

However, make these choices to simplify future sync:

* stable UUID/string IDs for user-generated/persistent entities;
* stable IDs for static content;
* `createdAt` / `updatedAt` where appropriate;
* schema version for exports;
* repository/domain layer around persistent operations;
* FSRS state stored explicitly;
* review history retained.

Future architecture may become:

```text
React
  │
  ├── IndexedDB / Dexie
  │
  └── cloud sync adapter
          │
          └── Supabase
```

The current UI must not know about Supabase.

---

# 31. Things NOT to add without an actual requirement

Do not introduce these proactively:

* Redux / Redux Toolkit;
* TanStack Query;
* Next.js;
* MobX;
* XState;
* GraphQL;
* Axios;
* Formik;
* React Hook Form unless forms become sufficiently complex;
* date libraries for trivial native `Date` usage;
* a custom backend;
* dependency injection frameworks;
* microfrontends;
* monorepo;
* Docker for local frontend development;
* Storybook unless a real component-system need appears.

Keep dependencies intentional.

---

# 32. Suggested initial dependencies

Conceptual list; install current stable compatible versions.

```bash
npm install \
  react \
  react-dom \
  react-router \
  zustand \
  dexie \
  dexie-react-hooks \
  zod \
  lucide-react \
  ts-fsrs
```

Tailwind/shadcn dependencies should be installed using their current Vite setup/CLI.

PWA:

```bash
npm install -D vite-plugin-pwa
```

Testing:

```bash
npm install -D \
  vitest \
  @testing-library/react \
  @testing-library/jest-dom \
  @testing-library/user-event \
  playwright
```

Use the current recommended Vite React tooling when scaffolding.

---

# 33. Initial project setup direction

A suitable starting point is a Vite React TypeScript app.

Conceptually:

```bash
npm create vite@latest polish-learning -- --template react-ts
cd polish-learning
npm install
```

Then configure:

1. Tailwind CSS v4;
2. `@/*` path alias;
3. shadcn/ui;
4. React Router;
5. Dexie;
6. Zustand;
7. Zod;
8. `ts-fsrs`;
9. `vite-plugin-pwa`;
10. tests.

Do not generate dozens of unused shadcn components at project creation.

Add components as they become necessary.

---

# 34. Suggested implementation order

## Phase 1 — shell

Implement:

* Vite + React + TypeScript;
* Tailwind;
* shadcn;
* routing;
* app layout;
* responsive navigation;
* basic PWA manifest.

Result: installable shell with empty pages.

## Phase 2 — content model

Implement:

* vocabulary types;
* lesson types;
* exercise discriminated unions;
* Zod schemas;
* several sample A1 lessons.

Result: static content can be rendered reliably.

## Phase 3 — exercise engine

Implement:

* lesson session;
* multiple choice;
* typing;
* answer feedback;
* completion screen.

Result: one complete lesson can be finished.

## Phase 4 — local persistence

Implement:

* Dexie database;
* lesson progress;
* vocabulary progress;
* settings;
* persistence across reloads.

Result: progress survives refresh/browser restart.

## Phase 5 — spaced repetition

Implement:

* FSRS adapter;
* due review query;
* review screen;
* review logs.

Result: vocabulary can enter and move through review scheduling.

## Phase 6 — PWA/offline

Implement/test:

* service worker;
* precache;
* runtime caching;
* offline navigation;
* update UX.

Result: core learning works offline.

## Phase 7 — backup and polish

Implement:

* export;
* import;
* reset;
* accessibility pass;
* E2E tests;
* performance review.

---

# 35. MVP acceptance criteria

The MVP is considered technically successful when:

* [ ] app builds with no TypeScript errors;
* [ ] app is installable as a PWA;
* [ ] app opens offline after initial load;
* [ ] at least one full lesson can be completed;
* [ ] lesson state persists after page reload;
* [ ] vocabulary progress persists after reload;
* [ ] FSRS review scheduling works;
* [ ] due reviews are shown correctly;
* [ ] review results persist;
* [ ] app is usable on a 320px-wide viewport;
* [ ] keyboard navigation works for major flows;
* [ ] no backend is required;
* [ ] no Auth/Supabase code exists;
* [ ] production build passes critical E2E flow.

---

# 36. Coding-agent instructions

When implementing this project:

1. Follow this document as the architecture baseline.
2. Do not add a backend.
3. Do not add authentication or Supabase.
4. Do not substitute Next.js for Vite.
5. Do not add libraries simply because they are common.
6. Prefer existing platform capabilities when they are sufficient.
7. Keep persistent state in Dexie, not Zustand.
8. Keep static content separate from user progress.
9. Keep React components small and feature-oriented.
10. Avoid premature abstractions.
11. Keep FSRS behind an adapter.
12. Validate external/file data at boundaries with Zod.
13. Preserve offline-first behavior.
14. Prefer accessible shadcn primitives for generic UI.
15. Write tests for domain logic and critical user flows.
16. Use stable IDs, never persistent array indices.
17. Use `@/` import aliases.
18. Keep TypeScript strict and avoid `any`.
19. If a decision conflicts with this document, explain the reason before changing the architecture.
20. Implement the smallest maintainable solution that satisfies the current requirement.

---

# 37. Recommended first vertical slice

Before building every page, implement one complete end-to-end feature:

```text
Home
  ↓
A1 lesson
  ↓
3-5 exercises
  ↓
completion
  ↓
save lesson progress in Dexie
  ↓
reload app
  ↓
completed lesson still shown as completed
```

Then add one vocabulary/review slice:

```text
learn word
  ↓
create FSRS card
  ↓
save in Dexie
  ↓
word becomes due
  ↓
Review screen
  ↓
Again / Hard / Good / Easy
  ↓
new due date saved
```

This validates the architecture before the project grows.

---

# 38. Architecture summary

Use this mental model:

```text
React           = rendering and interaction
React Router    = navigation
shadcn/ui       = generic accessible UI primitives
Tailwind        = visual styling/design system
Zustand         = temporary shared UI/session state
Dexie           = durable local user state
IndexedDB       = browser database
Zod             = boundary validation
ts-fsrs         = spaced repetition scheduling
vite-plugin-pwa = installability + service worker
Workbox         = caching/offline behavior
Vitest/RTL      = unit/component tests
Playwright      = critical browser flows
```

The most important architectural rule:

> **Static learning content lives in the application bundle, durable user progress lives in IndexedDB, and temporary UI state lives in React/Zustand.**

No backend is required for this phase.
