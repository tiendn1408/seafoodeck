---
name: Seafood Deck (learner app)
description: Deep-sea water for working, cold ice for reading, one salmon button to cast the haul.
colors:
  action: "#e8743b"
  action-hover: "#f0864f"
  action-ink: "#1b0f08"
  action-lip: "#a94e1d"
  deep-950: "#05141b"
  deep-900: "#071c26"
  deep-800: "#0b3341"
  deep-700: "#0e4554"
  deep-ink: "#f2f8f9"
  deep-muted: "#a9c3c9"
  deep-accent: "#8fd3dc"
  rope: "#e8d9b5"
  ice-bg: "#f3f7f8"
  ice-surface: "#ffffff"
  ice-raised: "#e9f1f2"
  ice-ink: "#0b2230"
  ice-muted: "#4c5e66"
  ice-line: "#d4e0e3"
  ice-focus: "#0b6a7c"
  ice-bg-dark: "#0a1c24"
  ice-surface-dark: "#102a35"
  ice-raised-dark: "#16343f"
  ice-ink-dark: "#e8f1f3"
  ice-muted-dark: "#a3b9bf"
  ice-line-dark: "#24434e"
  group-fish: "#a8243a"
  group-fish-ink: "#ffffff"
  group-crustacean: "#ee8a7a"
  group-crustacean-ink: "#3a120c"
  group-mollusc: "#c99a2e"
  group-mollusc-ink: "#2b1e05"
  group-other: "#4f6b5e"
  group-other-ink: "#ffffff"
  group-none: "#5e6f78"
  group-none-ink: "#ffffff"
typography:
  display:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "clamp(36px, 20px + 3.3vw, 62px)"
    fontWeight: 800
    lineHeight: 1.03
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  scientific:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.35
    fontFeature: "font-style: italic"
  label:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.2
rounded:
  sm: "8px"
  md: "14px"
  lg: "20px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "7": "32px"
  "8": "48px"
  "9": "64px"
components:
  button-cast:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-ink}"
    rounded: "{rounded.md}"
    typography: "{typography.title}"
    height: "62px"
    padding: "0 32px"
  button-cast-hover:
    backgroundColor: "{colors.action-hover}"
  header:
    backgroundColor: "{colors.deep-900}"
    textColor: "{colors.deep-ink}"
    height: "64px"
  tabbar:
    backgroundColor: "{colors.deep-950}"
    textColor: "{colors.deep-muted}"
    height: "64px"
  species-card-tile:
    backgroundColor: "{colors.ice-surface}"
    textColor: "{colors.ice-ink}"
    rounded: "{rounded.md}"
    padding: "8px"
  species-tag-fish:
    backgroundColor: "{colors.group-fish}"
    textColor: "{colors.group-fish-ink}"
    rounded: "6px"
    padding: "2px 8px"
  cover-frame:
    backgroundColor: "{colors.deep-950}"
    rounded: "{rounded.lg}"
    padding: "16px"
---

# Design System: Seafood Deck (learner app)

## Overview

**Creative North Star: "Biển sâu × Ấn bản loài" (deep water, species edition)**

The learner works a fishing boat's day. Working surfaces (home, study) are deep water: ink-blue to deep-sea teal with slow light rays. Reading surfaces (library, review, progress, profile) are cold ice-white. Species appear like magazine covers: the photo whole, the four names beneath it, the scientific name in italic. Brand lives in small, exact details (a scalloped header edge, a buoy, a pressed button) rather than in decoration.

Density is calm and large-target: phone first, short sessions, one obvious action per screen. Colour carries meaning twice, as taxonomy (four seafood-flesh hues) and as action (one salmon). Everything else is deep teal or ice neutral.

**Key Characteristics:**
- Two tones: deep (never changes with theme) and ice (has a dark variant).
- One action colour, salmon, always on a pressed button with a darker bottom lip.
- Group colours are taken from cooked or raw seafood flesh, not from a generic status palette.
- Progress is a rope with buoys, not a bar.
- Heavy, tight Be Vietnam Pro headings; italic scientific names; tabular numerals for every count.

## Colors

A deep-sea teal field and a cold ice field, with a single salmon for action and four flesh tones for taxonomy.

### Primary
- **Salmon Action** (`action`): the only action colour. Cast button, active-tab underline, current buoy ring, scale-arc logo mark, skip link, counts on deep. Text on it is `action-ink` (near-black brown), never white (6.2:1).
- **Salmon Lip** (`action-lip`): the darker bottom edge of the pressed button; `action-hover` is the lighter hover fill.

### Secondary (taxonomic groups; fill plus its `-ink` text colour)
- **Tuna Red** (`group-fish`): fish, white text 7.0:1.
- **Cooked-Shrimp Pink** (`group-crustacean`): crustaceans, dark text 6.7:1.
- **Clam-Flesh Ochre** (`group-mollusc`): molluscs, dark text 6.3:1.
- **Sea-Cucumber Grey-Green** (`group-other`): other, white text 5.8:1.

### Neutral
- **Blue-Grey, No Group** (`group-none`): species with no recorded group. White text 5.3:1. The neutral is announced once by the list (header and count line); the per-card tag is hidden for it.
- **Deep Sea** (`deep-950` to `deep-700`, gradient 900 to 800 to 700 top to bottom): header, tab bar (950), deep screens. `deep-ink` text, `deep-muted` secondary text (9.4:1 on 900), `deep-accent` light-ray cyan for focus rings and links on deep.
- **Rope** (`rope`): warm sand for the float rope only.
- **Ice** (`ice-bg`, `ice-surface`, `ice-raised`, `ice-line`, `ice-ink`, `ice-muted`): reading surfaces. `ice-muted` is 6.3:1 on `ice-bg`. `ice-focus` (teal) is the focus ring and hover border on ice.
- **Ice, dark theme** (the `-dark` tokens): follows `prefers-color-scheme` unless `data-theme='light'`; `data-theme='dark'` forces it. Only ice surfaces change: `ice-muted` becomes 8.5:1 and `ice-focus` becomes `deep-accent`.

### Named Rules
**The One Action Colour Rule.** Salmon is the only colour that means "press this". Group colours label species and never appear on buttons; no second accent, no purple, no neon.

**The Cold Ice Rule.** Reading surfaces are blue-white (`ice-bg`), never cream or paper.

**The Deep Never Flips Rule.** Deep screens, header and tab bar look the same in light and dark theme. Cards floating on deep water stay light (`#f7fbfc`) whatever the theme.

## Typography

**Display, Body and Label Font:** Be Vietnam Pro (system-ui, sans-serif fallback); weights 400, 500, 600, 700, 800 plus real 400 and 500 italic faces. Japanese names use the `--font-ja` stack (Hiragino, Noto Sans JP, Yu Gothic UI, Meiryo). `font-synthesis: none` is set, so italics are never faked.

**Character:** heavy and tight in headings (800, negative tracking), calm and plain in body. Vietnamese diacritics stay legible at every size because line-heights never drop below 1.03 on display and 1.2 elsewhere.

### Hierarchy
- **Display** (800, `clamp(36px, 20px + 3.3vw, 62px)`, 1.03, -0.035em): home hero title, max 13ch. Study screens use larger clamps up to 4.5rem for the answer word.
- **Headline** (800, 1.5rem, 1.2, -0.02em): section bands; page titles on ice go up to `clamp(2rem, 1.3rem + 2.8vw, 3.25rem)`.
- **Title** (800, 1rem to 1.1875rem, 1.25, -0.01em): species names on cards; the cast button label.
- **Body** (400 to 500, 1rem, 1.5): paragraphs; subtitles 1.0625rem; max line length 34ch to 62ch.
- **Scientific name** (italic 400, 0.875rem, 1.35, `ice-muted`): always italic.
- **Label** (600 to 700, 0.75rem to 0.875rem): tags, chips, tab bar items, hints. Tag text is 0.6875rem at 800.

### Named Rules
**The Italic Binomial Rule.** Scientific names are italic and nothing else is.

**The Tabular Numeral Rule.** Counts, buoy numbers, scores and dates use `font-variant-numeric: tabular-nums`.

**The Heavy Heading Rule.** Headings are 800 with negative tracking; do not use light weights for display.

**The No Eyebrow Rule.** No small caps or uppercase label above a heading. The build uses no `text-transform` anywhere.

## Layout

Phone first. The shell switches at 900px: desktop gets a 64px header with tabs centred (grid `auto / 1fr / auto`), phone gets a compact 56px header and a fixed four-item bottom tab bar (64px plus the safe-area inset). Content is capped at 1240px with gutters from `clamp(16px, 4vw, 56px)`. Study cover goes photo-left, names-right at 900px and up; on phone, rope, photo, names stack.

Spacing is a 4px base: 4, 8, 12, 16, 20, 24, 32, 48, 64. Section bands below the fold separate with `clamp(48px, 6vw, 72px)`. The page's primary action belongs to the screen; the shell never carries one. All safe-area insets are honoured on header, tab bar and main (landscape notch included). Interactive targets are at least 44px; primary list and form controls are 48px; the cast button is 62px.

## Elevation & Depth

Hybrid. Ice surfaces are tonal: white cards on blue-white, defined by a 1px `ice-line` border and a quiet two-layer `shadow-raise`. Deep surfaces use darkness and glow: floating cards and photo frames lift with a long soft dark shadow. The only hard-edged shadow is the pressed-button lip, which is a physical lip, not decoration.

### Shadow Vocabulary
- **Press** (`0 6px 0 #a94e1d, 0 16px 32px rgb(232 116 59 / 0.32)`): resting cast button.
- **Press down** (`0 2px 0 #a94e1d, 0 6px 14px rgb(232 116 59 / 0.32)`): `:active`, with the button moving down 4px.
- **Float** (`0 18px 40px rgb(2 12 17 / 0.38)`): cards and photo frame on deep water; hover adds a 3px salmon ring.
- **Raise** (`0 2px 6px rgb(11 34 48 / 0.08), 0 10px 24px rgb(11 34 48 / 0.06)`): ice tiles; heavier black version in dark theme.

### Named Rules
**The Pressed Lip Rule.** The lip is reserved for the salmon action button (`shadow-press` and `shadow-press-down`). Do not put a hard offset shadow on cards, chips or anything else.

## Shapes

Soft, rounded rectangles with a small number of radii: 8px (controls, skip link, small buttons), 14px (cards, cast button, notices), 20px (photo frames and large panels), pill (chips, filters), 50% (buoys, round badges). Tags are 6px, photo wells 10px inside a 14px card. Scale arcs are a recurring motif but only as decoration: the scalloped bottom edge of the solid header, the faint fade at the bottom of the cover frame, empty states, and the logo mark. They are never an image frame, mask or clip.

## Components

### Buttons
- **Shape:** 14px radius, 62px tall on the cast button; 44 to 48px for secondary controls.
- **Primary (cast):** salmon fill, `action-ink` text, 800 weight, 1.1875rem, padding 0 32px, full width on phone. Pressed lip beneath (see Elevation).
- **Hover / Active:** hover lightens to `action-hover`; active drops 4px and shortens the lip. Disabled is 62% opacity with a progress cursor.
- **Secondary:** transparent on deep with a 1px `rgb(255 255 255 / 0.28)` border; on ice, `ice-raised` fill with `ice-line` border and 700 text. No lip.

### Chips
- **Group filter:** pill, `ice-surface` with `ice-line` border, a small group-colour dot, label, tabular count. Selected state is a filled deep-ink pill with light text (see library screenshot). The group colour never fills a filter button.

### Cards / Containers
- **Species card (one component, three variants):** photo on a 4:3 `ice-raised` panel, `object-fit: contain`, name link covering the whole card, italic scientific name, then a four-scale mastery indicator. A group tag (6px radius, group fill, `-ink` text) overlaps the top edge, except for the no-group neutral which is hidden.
  - **float** (home): light card on deep water, 8px padding, Float shadow, salmon ring on hover.
  - **tile** (library grid): white, 1px `ice-line` border, Raise shadow, teal border on hover; a 2px-high group-colour rule sits above the names.
  - **row** (compact lists): horizontal, 72px square photo, tag in flow.
- **Species cover (study):** magazine cover on deep water: rope, then photo frame, then names. Frame is a dark radial well (`#24414b` to `deep-950`), 20px radius, 16px padding, with faint scale arcs fading in at its bottom. Photo stays whole (max-height `min(62vh, 600px)`), with a quiet 12px-ish credit line under it (links in `deep-accent`, 44px target).
- **Missing photo:** a neutral fish silhouette at 40% opacity with "Ảnh đang bổ sung"; never a fake or stock photo. On row cards the words stay for screen readers only.

### Navigation
- **Header:** always deep-sea. Transparent over deep screens, solid `deep-900` with a scalloped fish-scale bottom edge over ice screens. Logo (scale-arc mark in salmon plus 800 wordmark) and an internal-release chip (salmon-tinted 1px border, `#ffc9ad` text) at left; theme toggle and sign-out at right (sign-out label shows from 1180px).
- **Tabs (desktop):** Học / Thư viện / Ôn tập / Tiến độ, 700 weight, `deep-muted` becoming `deep-ink` when current, with a 3px salmon underline that scales in from the centre.
- **Tab bar (phone):** fixed, `deep-950`, four equal items with icon and 0.75rem label; the current item shows a salmon bar at the top edge and a salmon icon.
- **Phone header chip:** on an internal release the wordmark collapses to the mark (still the link's accessible name) so the chip fits on one row; home and profiles keep the wordmark and put the chip on its own line.

### Float Rope (signature component)
Haul progress as buoys on a heavy, sagging rope: a 4.5px sand cord with a darker dashed lay drawn over it, buoys positioned along it with `--x`. Buoy states: **empty** (hull dark, sand cap), **caught** (ice-white cap, group-coloured hull, the number on the hull, rises from below on arrival), **missed** (dashed sand ring, dark fill), **current** (salmon 3px ring over a dark gap). Buoys are 46px (38px under 600px), bob 6px on a 4.6s loop with staggered delays, and carry a soft highlight. An ice variant uses translucent ink for the rope (`ice-rope`).

### Mastery Scale
Four fish scales (58 by 14px), outlined in `ice-muted`, filled in `ice-focus` for each level reached. Decoration-plus-data: the value is also stated in text elsewhere.

### Motion
Easing is `cubic-bezier(0.16, 1, 0.3, 1)`; durations 140ms (fast) and 260ms. Ambient motion: two slow light-ray fans on home (16s and 23s sway), buoy bob, a home pulse, and the flashcard flip (560ms). Ambient animations pause when the tab is hidden (`.paused` on home and the rope). Under `prefers-reduced-motion`, transitions and animations are removed across the shell and home, and the buoys stop.

## Do's and Don'ts

### Do:
- **Do** show every species photo whole (`object-fit: contain`) on a calm panel; letterbox it rather than crop it.
- **Do** use salmon only for the one primary action per screen and for current-state markers (active tab, current buoy).
- **Do** set scientific names in italic and numerals tabular.
- **Do** pair every group fill with its `-ink` colour; keep text at 4.5:1 or better (all recorded pairs are 5.3:1 or more).
- **Do** give every control a 44px target and a 3px focus ring: `deep-accent` on deep, `ice-focus` on ice, offset 3px.
- **Do** respect `env(safe-area-inset-*)` on header, tab bar and main.
- **Do** pause ambient animation when the page is hidden and remove it for reduced motion.

### Don't:
- **Don't** use scale arcs as an image frame, mask or clip; they are decoration only.
- **Don't** put an eyebrow, kicker or uppercase label above a heading.
- **Don't** introduce a second action colour or use group colours on buttons.
- **Don't** use cream or paper tones for reading surfaces, or let deep screens change with the theme.
- **Don't** replace the rope with a progress bar or the bottom bar with a sidebar.
- **Don't** fabricate a photo when none exists; show the silhouette.
- **Don't** use light weights for headings or faux italics.
