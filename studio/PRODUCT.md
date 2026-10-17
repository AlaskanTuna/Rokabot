# Product

## Register

product

## Platform

web

## Users

The primary user is the **deployer**: a technical person who self-hosts the bot on a Raspberry Pi, a VPS or another
Docker host. They open Persona Studio on their own machine (`npm run studio`, localhost only) before a restart, to
shape a character and the bot around it, then restart the bot to apply the change.

## Product Purpose

Persona Studio is the one place to configure the bot end to end, whatever character it runs: the character pack
(persona prompts, voice, moods, user-facing lines), `config.yml` (models, fallback, memory, limits) and the secrets in
`.env`. Every edit is checked by the bot's own validation before it is saved, so a saved configuration is one the bot
will start with. Success means a deployer never hand-edits YAML to change the character or the model, and never
learns about a mistake from a bot that refuses to start.

## Positioning

One local console for the whole bot, validated by the same rules the bot runs, with a live preview of exactly what the
model will read.

## Brand Personality

Minimalist, professional, modern. The interface carries no character theming: it is a general configuration platform,
and the character lives in the content, not the chrome. The feel follows polished 2026 desktop apps in the vein of
Raycast and Arc: calm surfaces, crisp type, quiet motion.

## Anti-references

Character-themed chrome: no mascot colours, anime styling or persona flavour in the UI itself.

## Design Principles

- **Validated before saved.** Show the bot's own error, on the field that caused it, before anything reaches disk.
- **Preview what the model reads.** The assembled prompt for a chosen mood, hour and memory mode, with its token count, is always one step away.
- **Character-neutral.** Every screen works the same for any pack; nothing assumes Roka.
- **Secrets stay local.** Keys are masked, written only to the local `.env`, and never shown in full after entry.

## Accessibility & Inclusion

WCAG 2.2 AA: AA contrast, full keyboard use with visible focus, and reduced-motion support.
