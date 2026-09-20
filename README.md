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

## Development

```bash
npm test
npm run build
```

`DOCS.md` is the reference for the game rules, the command grammar, the level-file
format and the intentional deviations from the original BSD game. Keep it up to date
when changing behaviour.
