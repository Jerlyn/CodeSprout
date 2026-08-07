# Sight Words Explorer

A progressive web app for practicing the HMH Into Reading Kindergarten high-frequency word list (120 words, Modules 1–9). Built for offline use on a phone — designed and tested for playing during a commute with no signal.

## Features

- **4 game modes on a bottom tab bar:** Flashcards, Listen & Match quiz, Balloon Pop, Word Builder (spelling). A raw Word List / JSON view exists as a parent tool inside Settings, not in the kid-facing nav.
- **Offline-first PWA:** a service worker caches all app assets on first load, so it keeps working with no connection. Install it to the home screen for a full-screen app experience.
- **Sound on/off:** one tap mutes both word narration (Web Speech API) and sound effects; the preference is remembered.
- **Gamification:** stars for correct answers, a daily play streak, confetti bursts, and unlockable badges at 10 / 25 / 50 / 100 / 200 stars. All progress is saved to `localStorage` on the device — no account, no backend, no network calls.
- **No external dependencies at runtime.** No CDN fonts, no CDN CSS framework, no audio files — everything is self-contained so the app is reliable offline.
- **Accessibility:** WCAG AA-checked color contrast throughout, visible focus rings, `aria-live` feedback regions, 48px-minimum touch targets, and `prefers-reduced-motion` support.

## Layout / information architecture

Redesigned after a first pass had too much permanent chrome above the fold (title block, module selector, streak/star strip, a full badge row, and a scrolling tab strip — all before any game content). Current structure, in priority order:

1. **Slim header** (56px): brand mark + name, a compact streak/star chip, sound toggle, settings gear. That's it.
2. **Game content**, immediately below the header — the first and largest thing on screen.
3. **Bottom tab bar** (fixed, thumb-zone): the 4 game modes, icon + one-word label, matches native mobile app conventions so it's reachable one-handed on a moving bus.
4. **Progress sheet** (tap the streak/star chip): streak, star total, and the full badge grid — opt-in detail instead of a permanently-visible row of mostly-locked badges.
5. **Settings sheet** (tap the gear): word-set/module filter as tappable pills, a narration voice picker, the full word list view, install-to-home-screen, and a reset button. These are configured occasionally, not every session, so they don't need permanent screen space.

## Changing the voice / resetting progress

Both live in the Settings sheet (⚙️ in the header):

- **Reading voice** — a dropdown of every voice the device's browser exposes via the Web Speech API, filtered to English where available. Pick one, tap **Test this voice** to preview. The choice is saved to this device. Voice availability and quality depend entirely on the OS/browser (Android and iOS ship different voice sets); there's no bundled audio, so the list you see is whatever your phone offers.
- **Reset stars, streak & badges** — clears gamification progress only (stars, streak, unlocked badges), stored in `localStorage` on this device. Sound and voice preferences are untouched. Asks for confirmation first since it can't be undone. There's no account or cloud sync, so this is also effectively how you'd start fresh on a new phone (progress doesn't transfer automatically).

## Color system

Went through two revisions before landing here: a "Bright & Playful" light theme built directly on the Design Lady brand colors, then a neon Y2K-inspired accent pass, then this — a calmer, single-primary-color system after feedback that the neon version was too visually noisy for a 6-year-old and that interactive elements needed more consistent styling. Every text/background pairing actually used in the UI is checked against WCAG AA:

| Pairing | Ratio | AA normal text (4.5:1) |
|---|---|---|
| Navy text on white/light bg | 19.3:1 | Pass |
| Purple text/buttons on white | 12.7:1 | Pass |
| White text on purple | 12.7:1 | Pass |
| White text on navy | 19.3:1 | Pass |
| Purple text on purple-tint `#EDE7FA` | 10.6:1 | Pass |

One color principle now, applied everywhere: **purple is the only hue used for interactive elements**, at three weights — solid purple (`#36069A`, primary action, e.g. Next), a light purple tint (`#EDE7FA` bg / purple text, secondary action, e.g. Hear it), and neutral gray (ghost/low-emphasis, e.g. Back). No other color appears on a button. Every card, panel, and container border uses one neutral gray (`#E4E6EA`) instead of colored outlines, for a single unified "canvas" instead of mismatched container styles.

A soft pastel set exists purely for decoration — never on buttons or as a text color — used only for balloons, badge accents, and confetti, so the game still feels colorful and celebratory without the chrome feeling busy:

| Color | Hex | As navy text/border |
|---|---|---|
| Soft blue | `#8FBCF2` | 9.8:1 — Pass |
| Soft mint | `#84D9A8` | 11.5:1 — Pass |
| Soft pink | `#F2A0C4` | 9.8:1 — Pass |
| Soft lavender | `#BBA8F0` | 9.2:1 — Pass |
| Soft peach | `#F5B77E` | 11.0:1 — Pass |

Icons were also unified: the mismatched emoji set (different visual weight/style per glyph) in the header, bottom nav, and flashcard controls was replaced with one hand-drawn outline SVG icon set (2px stroke, `currentColor`, no fill) so every tappable icon shares the same visual language. Scope note: celebratory/inline emoji elsewhere (toast messages, badge icons, secondary buttons inside the Settings sheet) were intentionally left as-is — they're expressive content next to unique text, not a row of affordance icons being visually compared, so the inconsistency argument doesn't really apply there. Happy to extend the icon set further if wanted.

## Running locally

No build step. Serve the folder over HTTP (service workers require a server, not `file://`):

```bash
cd sight-words-explorer
python3 -m http.server 8080
# open http://localhost:8080
```

## Installing on Android (for bus rides)

1. Open the app URL in Chrome.
2. Chrome will usually show an **Install** banner automatically; if not, open Settings inside the app (⚙️) and tap **Install app to home screen** — this uses Chrome's native install prompt (`beforeinstallprompt`).
3. Alternatively: Chrome's ⋮ menu → **Install app** (or **Add to Home screen** on older versions).
4. Launch it from the home screen icon — it runs full-screen and works offline once it's loaded once with a connection.

## Installing on an iPhone

iOS Safari doesn't support the automatic install prompt, so it's manual:

1. Open the app URL in Safari.
2. Tap the Share icon → **Add to Home Screen**.
3. Launch it from the home screen icon.

## File structure

```
index.html      Markup, PWA meta tags
styles.css      All styling, theme variables, WCAG-checked palette
app.js          Game logic, sound, confetti, gamification, service worker registration
manifest.json   PWA manifest
sw.js           Offline cache-first service worker
icons/          App icons (192, 512, maskable variants, apple-touch-icon, favicon)
```

## Updating the word list

Edit `sightWordsData` at the top of `app.js` — it mirrors the structure in the source HMH curriculum PDF (module → week → words). No other file needs to change.

## Deploying

Any static host works (GitHub Pages, Netlify, Vercel). For GitHub Pages: push this folder to a repo, enable Pages on the `main` branch, and update `CACHE_VERSION` in `sw.js` whenever you ship changes so installed devices pick up the update.
