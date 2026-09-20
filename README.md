# ATC

A clean-room TypeScript web implementation of the BSD Games air traffic controller
game. It runs entirely in the browser and has no runtime dependencies.

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

## Controls

Commands start with a plane letter. Directions use the eight physical keys around
`s`, so their positions work regardless of keyboard layout.

| Command                                      | Effect                                                       |
| -------------------------------------------- | ------------------------------------------------------------ |
| `<plane>t<dir>`                              | Turn to an absolute direction                                |
| `<plane>tt<b\|*\|e\|a><n>`                   | Turn towards beacon, exit, or airport number                 |
| `<plane>c`, `<plane>cr`, `<plane>cl`         | Circle clockwise, explicitly clockwise, or counter-clockwise |
| `<plane>a<n>`                                | Set altitude, in thousands of feet                           |
| `<plane>ac<n>` / `<plane>ad<n>`              | Climb or descend by an amount                                |
| `<plane>m`, `<plane>u`, `<plane>i`           | Mark, unmark, or ignore a plane                              |
| `@b<n>`, `@*<n>`, `ab<n>`, or `a*<n>` suffix | Apply a heading command when the plane reaches a beacon      |

Press **Enter** on an empty command line to force an update. **Space** advances one
step without executing or changing the command you are typing. **Backspace** removes
a token, **Ctrl-U** clears the command, `?` displays context-sensitive input help,
and **Escape** pauses the game.

## Development

```bash
npm test
npm run build
```

`DOCS.md` is the reference for the game rules, the command grammar, the level-file
format and the intentional deviations from the original BSD game. Keep it up to date
when changing behaviour.
