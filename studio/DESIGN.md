---
name: Persona Studio
description: One local console for the whole bot, validated by the same rules the bot runs.
colors:
  signal-rose: '#bb086f'
  signal-rose-deep: '#9c005a'
  signal-rose-ink: '#ff74b0'
  signal-rose-focus: '#f84b9f'
  rose-wash: '#ffe7ef'
  rose-wash-dark: '#511130'
  canvas: '#ffffff'
  canvas-dark: '#0e0f12'
  sidebar: '#f6f7f9'
  sidebar-dark: '#121417'
  surface: '#ffffff'
  surface-dark: '#16171a'
  raised: '#ffffff'
  raised-dark: '#1c1e22'
  subtle: '#eff0f3'
  subtle-dark: '#1c1e22'
  border: '#e3e4e8'
  border-dark: '#24262b'
  border-strong: '#d2d4d8'
  border-strong-dark: '#3a3d43'
  ink: '#0e0f12'
  ink-dark: '#f6f7f9'
  ink-secondary: '#55585f'
  ink-secondary-dark: '#b5b7bd'
  ink-tertiary: '#646870'
  ink-tertiary-dark: '#8f9299'
  on-accent: '#ffffff'
  success: '#007a43'
  success-dark: '#3bb974'
  warning: '#946000'
  warning-dark: '#f5ae39'
  danger: '#d01c29'
  danger-dark: '#f4514f'
  info: '#006bb4'
  info-dark: '#3f9fe8'
  glass-surface: '#ffffff9e'
  glass-surface-dark: '#16171a8f'
  glass-raised: '#ffffffcc'
  glass-raised-dark: '#1c1e22b8'
  glass-border: '#ffffffb2'
  glass-border-dark: '#ffffff1a'
  glass-accent: '#bb086fdb'
  glass-scrim: '#0e0f123d'
  glass-scrim-dark: '#06070970'
  glow-blue: '#3f9fe8'
  glow-blue-deep: '#0077c7'
  glow-rose: '#f84b9f'
typography:
  title:
    fontFamily: 'Geist Variable, Geist, system-ui, sans-serif'
    fontSize: '24px'
    fontWeight: 600
    lineHeight: '32px'
    letterSpacing: '-0.01em'
  headline:
    fontFamily: 'Geist Variable, Geist, system-ui, sans-serif'
    fontSize: '18px'
    fontWeight: 600
    lineHeight: '26px'
    letterSpacing: '-0.005em'
  section:
    fontFamily: 'Geist Variable, Geist, system-ui, sans-serif'
    fontSize: '15px'
    fontWeight: 600
    lineHeight: '22px'
    letterSpacing: '-0.002em'
  body:
    fontFamily: 'Geist Variable, Geist, system-ui, sans-serif'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: '20px'
  body-strong:
    fontFamily: 'Geist Variable, Geist, system-ui, sans-serif'
    fontSize: '14px'
    fontWeight: 500
    lineHeight: '20px'
  body-small:
    fontFamily: 'Geist Variable, Geist, system-ui, sans-serif'
    fontSize: '13px'
    fontWeight: 400
    lineHeight: '18px'
  label:
    fontFamily: 'Geist Variable, Geist, system-ui, sans-serif'
    fontSize: '12px'
    fontWeight: 500
    lineHeight: '16px'
    letterSpacing: '0.002em'
  code:
    fontFamily: 'Geist Mono Variable, Geist Mono, ui-monospace, monospace'
    fontSize: '13px'
    fontWeight: 400
    lineHeight: '20px'
  code-small:
    fontFamily: 'Geist Mono Variable, Geist Mono, ui-monospace, monospace'
    fontSize: '12px'
    fontWeight: 400
    lineHeight: '18px'
rounded:
  sm: '6px'
  md: '8px'
  lg: '12px'
  xl: '16px'
  full: '999px'
spacing:
  '0-5': '2px'
  '1': '4px'
  '1-5': '6px'
  '2': '8px'
  '3': '12px'
  '4': '16px'
  '5': '20px'
  '6': '24px'
  '8': '32px'
  '10': '40px'
  '12': '48px'
components:
  button-primary:
    backgroundColor: '{colors.glass-accent}'
    textColor: '{colors.on-accent}'
    typography: '{typography.body-strong}'
    rounded: '{rounded.md}'
    padding: '8px 12px'
    height: '38px'
  button-primary-hover:
    backgroundColor: '{colors.signal-rose-deep}'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.md}'
    padding: '8px 12px'
    height: '38px'
  button-secondary-hover:
    backgroundColor: '{colors.subtle}'
  button-ghost:
    backgroundColor: '{colors.glass-surface}'
    textColor: '{colors.ink-secondary}'
    rounded: '{rounded.md}'
    padding: '8px 12px'
    height: '38px'
  button-danger:
    backgroundColor: '{colors.danger}'
    textColor: '{colors.on-accent}'
    rounded: '{rounded.md}'
    padding: '8px 12px'
    height: '36px'
  action-chip-primary:
    backgroundColor: '{colors.signal-rose}'
    textColor: '{colors.on-accent}'
    typography: '{typography.body-small}'
    rounded: '{rounded.sm}'
    padding: '5px 10px'
    height: '28px'
  action-chip-secondary:
    backgroundColor: '{colors.glass-surface}'
    textColor: '{colors.ink}'
    typography: '{typography.body-small}'
    rounded: '{rounded.sm}'
    padding: '5px 10px'
    height: '28px'
  icon-button:
    backgroundColor: '{colors.glass-surface}'
    rounded: '{rounded.md}'
    size: '32px'
  field:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.code}'
    rounded: '{rounded.md}'
    padding: '6px 8px 6px 12px'
    height: '34px'
  badge:
    backgroundColor: '{colors.subtle}'
    textColor: '{colors.ink-secondary}'
    typography: '{typography.label}'
    rounded: '{rounded.full}'
    padding: '2px 8px'
    height: '22px'
  nav-item:
    textColor: '{colors.ink-secondary}'
    typography: '{typography.body}'
    rounded: '{rounded.md}'
    padding: '6px 8px'
    height: '32px'
  nav-item-selected:
    backgroundColor: '{colors.rose-wash}'
    textColor: '{colors.signal-rose}'
    typography: '{typography.body-strong}'
  tab:
    textColor: '{colors.ink-secondary}'
    rounded: '{rounded.sm}'
    padding: '4px 12px'
    height: '28px'
  tab-selected:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
  section-row:
    textColor: '{colors.ink-secondary}'
    typography: '{typography.code-small}'
    rounded: '{rounded.md}'
    padding: '6px 8px'
    height: '34px'
  sidebar:
    backgroundColor: '{colors.glass-surface}'
    rounded: '14px'
    padding: '16px 12px'
    width: '248px'
  sidebar-collapsed:
    width: '64px'
  main-island:
    backgroundColor: '{colors.glass-surface}'
    rounded: '{rounded.xl}'
  popover:
    backgroundColor: '{colors.glass-raised}'
    rounded: '{rounded.lg}'
    padding: '6px'
  notifications-panel:
    backgroundColor: '{colors.glass-raised}'
    rounded: '{rounded.lg}'
    padding: '6px'
    width: '396px'
  toast:
    backgroundColor: '{colors.glass-raised}'
    rounded: '{rounded.lg}'
    padding: '12px 16px'
    width: '380px'
  dialog:
    backgroundColor: '{colors.glass-raised}'
    rounded: '{rounded.lg}'
    padding: '20px 24px'
    width: '440px'
---

# Design System: Persona Studio

Source of truth: the approved Figma file, https://www.figma.com/design/Ba19iXZHD64vXDB20VmL1L (pages Foundations,
Brand, Iconography, Components, Mockups). Every color above is a Figma variable; a key ending in `-dark` is the same
token in the Dark mode. Ship both modes from the same token names.

## 1. Overview

**Creative North Star: "The Quiet Console"**

A calm instrument panel for one person shaping a bot before a restart. Graphite surfaces sit under thin frosted glass,
a faint cool light drifts behind them, and a single rose signal marks the one thing that matters on the screen: the
primary action, the current selection, an unsaved change. The product brief asks for "calm surfaces, crisp type, quiet
motion" in the vein of Raycast and Arc, and every choice below serves that line.

Density is that of a desktop tool, not a website: 14 px body, 32 px controls, three working columns on wide screens.
The chrome is character-neutral. The character lives in the content (the prompts, the moods, the preview), never in
the UI. This system rejects "character-themed chrome: no mascot colours, anime styling or persona flavour in the UI
itself" (PRODUCT.md), the cream-paper SaaS look, and glass used as decoration on content.

Layout: a floating glass sidebar (248 px, or a 64 px icon rail) and one floating glass main island, both inset 8 px
from the window with 8 px between them, over the ambient canvas. The island holds a header (title, path, status
badges, theme switch, notification bell, page actions) and the page body. Below 1024 px wide the sidebar starts as
the rail; below 768 px the three editor columns stack.

**Key Characteristics:**

- Graphite neutrals with a 0.004-0.01 chroma tint, one rose accent.
- Glass on chrome layers only; content sits on solid surfaces.
- One family, Geist, plus Geist Mono for paths, keys, YAML and token counts.
- State-rich vocabulary: every control has default, hover, focus, active, disabled, loading and error.
- Quiet motion: 150-200 ms state changes and one slow ambient drift.

## 2. Colors

A restrained graphite scale with one rose signal and four status hues.

### Primary

- **Signal Rose** (#bb086f): primary buttons (as 86% glass), the selected nav item text in light mode, action chips,
  the unread count. White on it is 6.2:1.
- **Signal Rose Deep** (#9c005a): primary hover and pressed; white on it is 8.2:1.
- **Signal Rose Ink** (#ff74b0): accent text and focus ring in dark mode.
- **Signal Rose Focus** (#f84b9f): the focus ring and the accent badge border in light mode.
- **Rose Wash** (#ffe7ef light, #511130 dark): the selected row or nav item background. Never a large surface.

### Neutral

- **Canvas** (#ffffff / #0e0f12): the window behind everything; the ambient glow paints on it.
- **Sidebar Graphite** (#f6f7f9 / #121417): the sidebar's solid fallback where blur is unsupported.
- **Surface** (#ffffff / #16171a) and **Raised** (#ffffff / #1c1e22): fields, editor and preview wells, cards.
- **Subtle** (#eff0f3 / #1c1e22): hover fills, skeleton lines, badge fills, icon wells.
- **Hairline** (#e3e4e8 / #24262b) and **Strong Hairline** (#d2d4d8 / #3a3d43): dividers; field and secondary
  button borders.
- **Ink** (#0e0f12 / #f6f7f9), **Secondary Ink** (#55585f / #b5b7bd), **Tertiary Ink** (#646870 / #8f9299): text in
  three steps. Tertiary is for helper text and timestamps only, and still clears 4.5:1 on Surface, Subtle and Rose Wash.

### Status

- **Success** (#007a43 / #3bb974), **Warning** (#946000 / #f5ae39), **Danger** (#d01c29 / #f4514f), **Info**
  (#006bb4 / #3f9fe8): badge text and border, status icons, field error text. Danger buttons fill with #d01c29 in
  both modes.

### Glass

- **Glass Surface** (white 62% / ink 56%): sidebar, main island, ghost buttons, icon buttons, theme switch.
- **Glass Raised** (white 80% / ink 72%): popovers, the notifications panel, toasts, dialogs.
- **Glass Edge** (white 70% / white 10%): the 1 px border on every glass layer.
- **Glass Scrim** (ink 24% / near-black 44%): behind a dialog, with a 10 px blur.

### Named Rules

**The One Rose Rule.** Signal Rose marks the primary action, the current selection, focus and unread counts, and
nothing else. It covers less than 10% of any screen. If two rose buttons share a view, one is wrong.

**The Glass Is Chrome Rule.** Glass belongs to layers that frame or float: sidebar, main island, popovers, toasts,
dialogs and CTAs. The text the user edits or reads (editor, preview, tables) sits on Surface or Raised, never on
glass.

**The Quiet Glow Rule.** The ambient canvas is three blurred glows (two blue, one rose) at 22/17/12% opacity in dark
mode and 12/9/7% in light, drifting on a 48 s ease-in-out loop. They animate transform only, stop under
`prefers-reduced-motion: reduce` and pause while the tab is hidden.

## 3. Typography

**Display Font:** Geist (Geist Variable, self-hosted, with system-ui)
**Body Font:** Geist
**Label/Mono Font:** Geist Mono (Geist Mono Variable, with ui-monospace)

**Character:** One neutral grotesque in four weights keeps the chrome quiet; the mono carries everything the user
could paste into a terminal or a YAML file.

### Hierarchy

- **Title** (600, 24/32, -0.01em): the brand wordmark and empty-state headings.
- **Headline** (600, 18/26): the page title in the header.
- **Section** (600, 15/22): card and column headings.
- **Body** (400, 14/20) and **Body Strong** (500, 14/20): all UI copy, buttons, nav. Prose stays under 72ch.
- **Body Small** (400, 13/18): helper text, notification bodies, captions under fields.
- **Label** (500, 12/16, +0.002em): field labels, badges, sidebar group names. Sentence case, never uppercase.
- **Code** (Mono 400, 13/20): field values, the editor, the prompt preview. **Code Small** (Mono 400, 12/18): file
  paths, key names, token counts.

### Named Rules

**The Terminal Text Rule.** Anything the user could copy into a shell or a file (paths, env keys, model ids, YAML,
token counts) is set in Geist Mono. Everything else is Geist.

## 4. Elevation

Depth comes from glass layers and a small shadow set; surfaces inside a layer stay flat.

### Shadow Vocabulary

- **Hairline lift** (`box-shadow: 0 1px 2px #0d0f1a0f`): the selected tab.
- **Card** (`box-shadow: 0 8px 24px -4px #0d0f1a29, 0 2px 6px -2px #0d0f1a14`): floating cards outside glass.
- **Lifted** (`box-shadow: 0 24px 48px -12px #0d0f1a42, 0 4px 12px -4px #0d0f1a1a`): menus without glass.
- **Glass Panel** (`backdrop-filter: blur(24px) saturate(140%); box-shadow: 0 8px 24px -8px #0d0f1a24`): sidebar and
  main island.
- **Glass Overlay** (`backdrop-filter: blur(40px) saturate(140%); box-shadow: 0 24px 48px -12px #0d0f1a47, 0 4px 12px
-4px #0d0f1a1a`): popovers, notifications panel, toasts, dialogs.
- **Glass CTA** (`backdrop-filter: blur(12px); box-shadow: 0 4px 12px -4px #0d0f1a38`): primary, ghost and icon
  buttons, the theme switch, the bell.
- **Glass Scrim** (`backdrop-filter: blur(10px)`): the layer behind a dialog.

### Named Rules

**The Flat Inside Rule.** Nothing inside the main island casts a shadow except the selected tab. If a card in the
body has a drop shadow, remove it and use a hairline border.

## 5. Components

### Buttons

- **Shape:** gently curved (8 px), 38 px tall, 8/12 px padding, 6 px icon gap, 16 px Lucide icon.
- **Primary:** Signal Rose glass (86%) with a Glass Edge border, white Body Strong text, Glass CTA effect.
- **Hover / Focus:** hover fills Signal Rose Deep with no border; focus draws a 2 px focus ring (`border/focus`)
  outside the shape. Pressed scales to 0.98 over 120 ms.
- **Secondary:** Surface fill, Strong Hairline border, Ink text; hover fills Subtle.
- **Ghost:** Glass Surface with Glass Edge, Secondary Ink text; hover fills Subtle and turns the text Ink.
- **Danger:** Danger fill, white text, 36 px; used only to confirm a destructive step inside a dialog.
- **Disabled:** 45% opacity, no hover. **Loading:** a 14 px spinner replaces the icon and the label reads "Saving…".

### Action Chips

- **Style:** 28 px compact buttons inside notifications and toasts; 6 px radius, Body Small. Primary is solid Signal
  Rose; Secondary is Glass Surface with a Glass Edge. An optional 14 px leading icon.

### Badges

- **Style:** fully rounded, 22 px, Subtle fill, a 1 px border in the tone color, Label text in the tone color, and a 6
  px dot. Tones: Neutral, Accent, Success, Warning, Danger.

### Cards / Containers

- **Corner Style:** 12 px for cards, 16 px for the main island, 14 px for the sidebar.
- **Background:** Surface in the body; Glass Raised for the preview column.
- **Shadow Strategy:** flat inside the island (see Elevation).
- **Border:** 1 px Hairline.
- **Internal Padding:** 20 px for cards, 16-24 px for columns.

### Inputs / Fields

- **Style:** Label (12 px, Secondary Ink) above a 34 px field (Surface fill, 1 px Strong Hairline, 8 px radius,
  6/8/6/12 px padding, Code text), then Body Small helper text in Tertiary Ink; 6 px between the three.
- **Focus:** a 2 px Signal Rose focus border, no glow.
- **Error:** a 1 px Danger border, and the helper line becomes the bot's own error text in Danger.
- **Disabled:** 50% opacity.
- **Select:** the same field with a 16 px chevron; the open menu is a Glass Raised popover with 50 px two-line
  options and a check on the selected one.
- **Toggle:** 32x18 px track (Signal Rose on, Strong Hairline off), 14 px white knob, 8 px gap to a Body label.

### Navigation

- **Sidebar toggle:** the logo mark is the expand/collapse control; on hover or keyboard focus it crossfades (150 ms) to
  the panel-left-close or panel-left-open icon on a Subtle fill. There is no separate collapse button.
- **Sidebar:** group labels in Label / Tertiary Ink; 32 px items with a 16 px icon, Body, Secondary Ink and a mono
  count on the right. Hover fills Subtle; selected fills Rose Wash with Signal Rose (light) or Rose Ink (dark) Body
  Strong text. The collapsed rail shows 40 px icon buttons with tooltips.
- **Tabs:** 28 px segments in a Subtle track; the selected segment is Surface with the hairline lift.
- **Section rows:** 34 px rows with a grip handle, a mono name and a source badge (`pack`, `harness`, `locked`).

### Header Utilities

- **Theme switch:** a Glass Surface segmented control of three 28x26 px segments (sun, moon, monitor): Light, Dark,
  System. The selected segment is Glass Raised with Ink icon; others are Tertiary Ink.
- **Notification bell:** a 32 px icon button with a Signal Rose count pill (16 px, Label, 2 px Canvas ring).

### Notifications Panel (Signature Component)

A 396 px Glass Overlay popover under the bell, right-aligned with an 8 px gap. Header: "Notifications", an accent
"N new" badge and a "Mark all read" text button. Rows: a 28 px tone well (Subtle) with a status icon, title (Body
Strong when unread, Body when read), timestamp, an unread rose dot, a Body Small body and up to two action chips.
Empty: a bell well, "You're all caught up" and one line of guidance.

### Toasts

380 px Glass Overlay cards at the bottom right: status icon, Body Strong title, Body Small body, an optional
Secondary action chip and a close button. They stay 6 s, pause on hover, and errors stay until closed.

## 6. Do's and Don'ts

### Do:

- **Do** keep Signal Rose (#bb086f) to the primary action, the current selection, focus and unread counts.
- **Do** put glass only on chrome: sidebar, main island, popovers, toasts, dialogs, CTAs (The Glass Is Chrome Rule).
- **Do** set paths, env keys, model ids, YAML and token counts in Geist Mono.
- **Do** show the bot's own validation error on the field or line that caused it, in Danger, before anything is saved.
- **Do** give every control default, hover, focus-visible, active, disabled, loading and error states.
- **Do** keep transitions at 150-200 ms with an ease-out curve, and stop the ambient drift under reduced motion.
- **Do** test both themes: every text pair passes WCAG 2.2 AA (4.5:1 body, 3:1 large and UI).

### Don't:

- **Don't** add "character-themed chrome: no mascot colours, anime styling or persona flavour in the UI itself"
  (PRODUCT.md). Roka's name may appear in content, never in the chrome.
- **Don't** put editable or long-form text on glass, or stack glass on glass more than two layers deep.
- **Don't** raise the ambient glow above 22% opacity, or animate anything but transform and opacity for it.
- **Don't** use a cream, sand or paper background; the canvas is pure white or graphite.
- **Don't** use a colored side stripe (border-left over 1 px) on rows, cards or alerts; use a tone well or badge.
- **Don't** use uppercase tracked labels, gradient text, or a second accent color.
- **Don't** open a modal where an inline control works; dialogs are for destructive confirmation and secret entry.
