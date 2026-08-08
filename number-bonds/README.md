# Number Bonds Explorer

A progressive web app for practicing number bonds (part-part-whole addition/subtraction facts). Built to match the [Sight Words Explorer](../sight-words-explorer) design system — same PWA structure, same calm single-purple-primary theme, offline-first.

## Features

- **2 modes on a bottom tab bar:** Bonds (interactive bond-tree practice with a keypad and audio prompts) and Worksheet (a printable grid of 12 bond problems).
- **Printable worksheet:** a dedicated print stylesheet strips the app down to plain black-on-white bond diagrams with a Name/Date line — no color reliance, no wasted ink, one page for 12 problems. Tap **Print** in the Worksheet toolbar.
- **Target number picker:** presets (5, 6, 10, 20, 50, 100) plus a custom stepper/slider (2–100), tucked into the Settings sheet instead of taking permanent space on the practice screen.
- **Offline-first PWA:** a service worker caches all app assets on first load. Install it to the home screen for a full-screen app experience.
- **Sound on/off:** one tap mutes both spoken prompts (Web Speech API) and sound effects; the preference is remembered.
- **Gamification:** stars for correct answers, a daily play streak, an in-session streak next to the bond card, confetti bursts, and unlockable badges at 10 / 25 / 50 / 100 / 200 stars. All progress saves to `localStorage` on the device.
- **Visual counter helper:** optional dot counters under the bond tree for kids who aren't ready for pure recall yet — hideable once they are.
- **No external dependencies at runtime.** No CDN fonts, no CDN CSS framework, no FontAwesome, no audio files — everything self-contained so the app is reliable offline.
- **Accessibility:** WCAG AA-checked color contrast throughout (same palette as Sight Words Explorer), visible focus rings, `aria-live` feedback regions for both modes, 48px-minimum touch targets, and `prefers-reduced-motion` support.

## What changed from the original prototype

`number_bonds_adventure_game.html` was a single dark-themed file (Tailwind CDN + FontAwesome + purple/pink gradients). This version:

1. **Reskinned to the calm light theme** — the same WCAG AA-verified palette, component patterns (slim header, bottom nav, slide-up sheets), and unified outline-SVG icon set as Sight Words Explorer, dropping the Tailwind/FontAwesome CDN dependencies so the app works fully offline.
2. **Moved the target-number bar into Settings** — it used to be a permanent bar above the game; now it's opt-in, matching the "minimal fixed chrome, game content is the first thing on screen" principle from Sight Words Explorer.
3. **Added gamification parity** — badges and a daily streak, which the original prototype didn't have (it only tracked stars/streak in-session, reset on reload).
4. **Made the worksheet printable** — added a `@media print` stylesheet that hides all app chrome and renders the 12-problem grid as plain black-outlined bond diagrams with a Name/Date line, sized to fit one page. The on-screen worksheet still grades itself with green/red input states.
5. **Added `aria-live` feedback** for both modes so screen readers announce correct/incorrect and the worksheet grading summary — the original had no accessible feedback channel.

## Color system

Identical to Sight Words Explorer — see that project's README for the full contrast table. One addition: the bond tree uses soft lavender (`#BBA8F0`) for the first part and soft pink (`#F2A0C4`) for the second part, both navy-text-safe pastels already in the shared palette, so the reused parts/whole visual language stays AA-compliant without introducing new colors.

## Running locally

No build step. Serve the folder over HTTP (service workers require a server, not `file://`):

```bash
cd number-bonds-explorer
python3 -m http.server 8080
# open http://localhost:8080
```

## Installing on Android / iPhone

Same steps as Sight Words Explorer — see that README's "Installing" sections.

## File structure

```
index.html      Markup, PWA meta tags
styles.css      All styling, theme variables, WCAG-checked palette, print stylesheet
app.js          Game logic, sound, confetti, gamification, service worker registration
manifest.json   PWA manifest
sw.js           Offline cache-first service worker
icons/          App icons (192, 512, maskable variants, apple-touch-icon, favicon)
```

## Changing the problem count or difficulty

- Worksheet problem count: `WORKSHEET_SIZE` at the top of `app.js` (default 12, sized to fit one printed page at 3 columns).
- How often the "whole" (vs. a "part") is the missing node: `MISSING_WEIGHTS` in `app.js`.
- Target-number presets shown in Settings: `TARGET_PRESETS` in `app.js`.

## Deploying

Any static host works (GitHub Pages, Netlify, Vercel). For GitHub Pages: push this folder to a repo, enable Pages on the `main` branch, and bump `CACHE_VERSION` in `sw.js` whenever you ship changes so installed devices pick up the update.
