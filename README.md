# CodeSprout

Small, offline-friendly learning apps built for my daughter, one folder per app.

## Apps

- **[sight-words](./sight-words)** — HMH Into Reading Kindergarten high-frequency words. Flashcards, Listen & Match, Balloon Pop, and Word Builder, with a daily streak, stars, and badges. Works offline as an installable PWA.

## Adding a new app

Each app lives in its own folder at the repo root with its own `index.html`, so it can be installed and used independently. To add one:

```bash
mkdir new-app-name
# build the app inside new-app-name/
git add .
git commit -m "Add <app name> app"
git push
```

If GitHub Pages is enabled (Settings → Pages → Deploy from branch → main → /root), each app is live at:

```
https://jerlyn.github.io/CodeSprout/<app-folder>/
```
