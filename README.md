# ATC Game

TypeScript re-implementation of the BSD Games air traffic controller game originally made by Ed James.
It runs entirely in the browser and has no runtime dependencies.

## Run locally

Requires a current Node.js release with npm.

```bash
npm install
npm run dev
```

Vite prints the local URL (normally <http://localhost:5173>). Open it in a desktop
browser, select a level, and press **Start**.

To create a static production bundle:

```bash
npm run build
```

The result is written to `dist/` and can be served by any static-file server.

## Deployment

Pushing to `master` runs `.github/workflows/deploy.yml`, which checks formatting, runs
the tests, builds the bundle and publishes it to GitHub Pages:
<https://benediktwerner.github.io/atc-game/>. The Vite `base` is relative, so the
bundle also works from any other path.

## Development

```bash
npm test
npm run build
```

`DOCS.md` is the reference for the game rules, the command grammar, the level-file
format and the intentional deviations from the original BSD game. Keep it up to date
when changing behaviour.
