---
name: Modern Polish Lexicon
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#5b4041'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#8f6f70'
  outline-variant: '#e4bdbe'
  surface-tint: '#be0437'
  primary: '#b00032'
  on-primary: '#ffffff'
  primary-container: '#d62246'
  on-primary-container: '#fff0f0'
  inverse-primary: '#ffb3b6'
  secondary: '#545f73'
  on-secondary: '#ffffff'
  secondary-container: '#d5e0f8'
  on-secondary-container: '#586377'
  tertiary: '#004cca'
  on-tertiary: '#ffffff'
  tertiary-container: '#2865ed'
  on-tertiary-container: '#f2f2ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdada'
  primary-fixed-dim: '#ffb3b6'
  on-primary-fixed: '#40000c'
  on-primary-fixed-variant: '#920028'
  secondary-fixed: '#d8e3fb'
  secondary-fixed-dim: '#bcc7de'
  on-secondary-fixed: '#111c2d'
  on-secondary-fixed-variant: '#3c475a'
  tertiary-fixed: '#dbe1ff'
  tertiary-fixed-dim: '#b4c5ff'
  on-tertiary-fixed: '#00174b'
  on-tertiary-fixed-variant: '#003ea8'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  mono-case-table:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  space-xxs: 0.125rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-base: 1rem
  space-lg: 1.25rem
  space-xl: 1.5rem
  space-2xl: 2rem
  space-3xl: 2.5rem
  space-4xl: 3.5rem
  screen-margin-mobile: 1rem
  screen-margin-tablet: 1.5rem
  card-padding: 1.25rem
  gutter-base: 0.75rem
---

## Brand & Style

The design system positions language acquisition not as an infantile gamified chore, but as an elegant, high-craft editorial experience. Tailored for dedicated adult learners, expatriates, and heritage speakers tackling the rigorous grammatical architecture of the Polish language, the interface honors cultural heritage through a distinctly contemporary European lens.

The visual direction merges **Modern Editorial Craft** with the tactical precision of native mobile HIG and Material 3 design paradigms. It abandons juvenile celebratory animations and cartoon mascots in favor of structural clarity, typography-driven rhythm, and purposeful micro-interactions. The Polish national crimson identity is distilled into a sharp, energetic visual anchor set against expansive white and warm slate planes. 

Key attributes:
- **Academic Rigor, Consumer Grace**: Complex grammatical paradigms (such as seven grammatical cases and verb aspects) are rendered intuitive through structured layout systems, not oversimplification.
- **Diacritic-First Legibility**: Polish glyphs (`ą`, `ć`, `ę`, `ł`, `ń`, `ó`, `ś`, `ź`, `ż`) receive generous vertical breathing room, avoiding diacritic clipping across all dynamic scales.
- **Haptic & Tactile Feedback**: UI surfaces feel physically grounded with smooth squircle radii, subtle borders, and low-amplitude elevation models.

## Colors

The color system modernizes historical Polish carmine red into a digitally resilient, accessible primary palette. It avoids flat saturated primaries by employing nuanced contextual swatches optimized for high contrast, semantic status mapping, and eye comfort during long study drills.

### Primary Palette (Crimson & Slate)
- **Primary Accent (`#D62246`)**: Dynamic Polish Carmine. Used for primary calls-to-action, active streak indications, mastery highlights, and interactive audio triggers.
- **Primary Pressed/Hover (`#B91C3C`)**: Deeper crimson providing instantaneous visual feedback.
- **Primary Subdued (`#FEE2E2` in Light / `#3B111A` in Dark)**: Background for crimson pill badges, exercise prompts, and active selection states.
- **Slate Ground (`#0F172A`)**: Primary foreground text in light mode; serves as base surface elevation tier 0 in dark mode.

### Semantic Tiers
- **Mastery / Retained (`#059669` / Dark `#10B981`)**: Polish "Opanowane" (Mastered/Known) status. Used for correct validation runs, retention confidence charts, and memory indicators.
- **Learning Queue (`#2563EB` / Dark `#3B82F6`)**: Blue tier denoting active grammatical review, spaced repetition queues, and conjugation references.
- **Grammar Case Markers**: Muted contextual identifiers for declension cases (e.g., Mianownik, Dopełniacz, Biernik) utilizing slate tints (`#475569`) to prevent chromatic fatigue.

### Dark Mode Architecture
Dark mode transitions from crisp paper whites (`#FFFFFF`, `#F8FAFC`) to deep obsidian and slate foundations (`#0F172A`, `#1E293B`). Borders shift from soft translucent slate (`rgba(15, 23, 42, 0.08)`) to low-contrast luminescence (`rgba(255, 255, 255, 0.08)`), maintaining visual hierarchy without high-contrast glare.

## Typography

The typography is built upon `Inter`, selected for its meticulously crafted x-height, extensive diacritic coverage, and tabular numeral support crucial for linguistic conjugation grids.

### Special Diacritic Rules
- **Line Heights**: Line heights never drop below 1.35x on display scales or 1.45x on body text. This protects superscript diacritics (`ć`, `ś`, `ź`, `ż`, `ó`) and ogoneks (`ą`, `ę`) from ascender/descender collision during rapid dynamic rendering.
- **Tabular Figures & Declensions**: All grammatical declension paradigms, phonetic guides, and case comparison cells enforce `font-feature-settings: "tnum" 1, "cv05" 1` to align morphological stem changes effortlessly.
- **Emphasis Hierarchy**: Polish root words and inflected case suffixes are differentiated typographically: roots remain at `body-md (Regular 400)`, while changing endings (e.g., `-owi`, `-ego`, `-ami`) utilize `body-md (SemiBold 600)` tinted in carmine or blue.

## Layout & Spacing

The layout is built on an **8pt rhythmic base grid** with a nested **4pt sub-grid** for micro-components (chips, badges, declension tables).

### Mobile Form Factor (Default)
- **Fluid Single-Column**: Maximum content width is constrained to `640px` and centered on wider displays.
- **Screen Margins**: `16px` on phones (`< 480px`), scaling to `24px` on large devices (`> 480px`).
- **Interactive Stride**: Primary interactive targets (flashcard buttons, answer options, conjugation selectors) maintain a minimum vertical height of `52px` with `8px` inter-item spacing to eliminate mis-taps.

### Adaptability & Declension Layouts
Complex 7-case declension data (singular and plural) avoids wide horizontal scroll containers that impede quick scanning. The system employs **Stacked Segmented Panes**:
- A sticky top segmented control toggles between `Liczba pojedyncza` (Singular) and `Liczba mnoga` (Plural).
- The resulting 7-row table fits standard viewport widths (`320px–428px`) without horizontal overflow.

## Elevation & Depth

Visual depth is achieved through **Tonal Layers paired with Crisp Micro-Borders** rather than heavy drop shadows. This reflects the modern HIG and M3 philosophy of structural restraint.

### Surface Tiers (Light Mode)
- **Base Canvas (Level 0)**: `#F8FAFC` (Off-white porcelain).
- **Surface Container (Level 1)**: `#FFFFFF` with a 1px solid border of `rgba(15, 23, 42, 0.06)` and an ambient shadow: `0px 1px 3px rgba(15, 23, 42, 0.04), 0px 6px 16px rgba(15, 23, 42, 0.02)`.
- **Raised Interactive / Flashcards (Level 2)**: `#FFFFFF` with `0px 4px 20px rgba(15, 23, 42, 0.08)` and border `rgba(15, 23, 42, 0.08)`. During swipe interactions, the card lifts to `0px 12px 32px rgba(214, 34, 70, 0.12)`.
- **Modals & Overlays (Level 3)**: `#FFFFFF` with `0px 16px 48px rgba(15, 23, 42, 0.16)`.

### Surface Tiers (Dark Mode)
- **Base Canvas (Level 0)**: `#0B0F17`.
- **Surface Container (Level 1)**: `#161F30` with border `rgba(255, 255, 255, 0.07)`.
- **Raised Interactive (Level 2)**: `#1E2B42` with border `rgba(255, 255, 255, 0.12)` and ambient shadow `0px 4px 24px rgba(0, 0, 0, 0.45)`.
- **Modals (Level 3)**: `#253552` with border `rgba(255, 255, 255, 0.18)`.

## Shapes

The design system uses a rounded geometry (`roundedness: 2`), reflecting the polished, humanistic curves of contemporary mobile software:

- **Base Radius (`8px` / `0.5rem`)**: Inner chips, segmented indicator buttons, text input fields, case table cells.
- **Card & Sheet Radius (`16px`–`20px` / `1rem`–`1.25rem`)**: Standard practice modules, grammatical rules containers, declension summaries.
- **Study Flashcard Deck (`24px` / `1.5rem`)**: Primary focus cards providing an organic, tactile physical boundary.
- **Pill Badges (`9999px`)**: Lexical tags, parts of speech (`rzeczownik`, `czasownik`), difficulty indicators, and streak markers.

## Components

### 1. Buttons
- **Primary Action**: Carmine red background (`#D62246`), pure white bold text (`label-lg`), height `52px`, `rounded-xl` (`16px`). Pressed state scales to `0.98` with background darkening to `#B91C3C`.
- **Secondary Action**: Subtle slate wash (`#F1F5F9` light / `#1E293B` dark), text `#0F172A` / `#F8FAFC`, height `52px`.
- **Tertiary / Audio Trigger**: Circular `44px` icon button housing an intentional audio waveform glyph, with a translucent carmine tint (`rgba(214, 34, 70, 0.08)`).

### 2. Segmented Controls
- Continuous track container with `4px` internal padding, `rounded-xl` border, and slate surface.
- Sliding pill indicator uses surface elevation 1 with crisp border and subtle spring translation physics.
- Used for navigating grammatical person (1st, 2nd, 3rd) and number (Pojedyncza / Mnoga).

### 3. Flashcards & Challenge Modules
- Stacked card interface sized dynamically to the viewport height (approx. 58vh).
- Polish source phrase presented in `headline-lg` with grammatical inflection points highlighted.
- English translation hidden beneath a subtle blurred scrim until tap-to-reveal.
- Bottom docked validation responses: "Jeszcze raz" (Again - Slate), "Dobrze" (Good - Blue), "Opanowane" (Mastered - Emerald).

### 4. Declension & Conjugation Tables
- Eliminates sideways scrolling through vertical alternating row strips (`zebra-striping` at 3% slate opacity).
- Two-column locked layout:
  - Column 1 (35% width): Case name + question prompt (e.g., `Biernik (kogo? co?)`) in `label-sm` slate text.
  - Column 2 (65% width): Inflected Polish word form with phonetics in `mono-case-table` text.
- Micro-badge on hover/tap reveals the governing preposition (e.g., `do`, `w`, `z`).

### 5. Chips & Grammatical Badges
- Strict height bounds of `24px` (small) and `32px` (medium).
- Integrated with case tags:
  - Carmine Tint: Accusative / Genitive drills.
  - Emerald Tint: Complete / Mastered state.
  - Blue Tint: Active study session.
- Border thickness: `1px` continuous border matching 15% opacity of the badge text color.

### 6. Inputs & Cloze Tests
- Gap-fill inputs for typing Polish characters directly.
- On screen diacritic assistant: A docked bar above the soft keyboard exposing `Ą`, `Ć`, `Ę`, `Ł`, `Ń`, `Ó`, `Ś`, `Ź`, `Ż` as individual rapid-tap targets with active state haptics.
- Instant error boundary: Incorrect letters bounce horizontally with a crimson highlight (`#D62246`), transitioning to correct green (`#059669`) without shifting screen layout.