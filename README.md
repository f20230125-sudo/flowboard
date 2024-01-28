# Flowboard

A visual workflow builder: drag blocks onto a canvas, connect them, press Run, and watch each step execute with its real data. A small n8n, built with Next.js, React and Redux Toolkit.

> Work in progress. The engine that runs flows is finished and tested; the editor is being built on top of it.

## What works today

The engine in [`src/engine`](src/engine) runs a flow from start to finish. It is plain TypeScript with no React in it, so it is tested without a browser.

- **Eight blocks:** manual trigger, HTTP request, condition, set fields, filter list, AI step, delay, output.
- **Branches and parallel paths:** a condition sends data down one side only, and blocks that are ready at the same time run together.
- **References between blocks:** `{{ steps.getUser.body.name }}` reads another block's result. A reference is a path lookup and nothing else, so a flow can never run code.
- **Checks before a run:** one trigger, no loops, required settings, references to blocks that do not exist or do not run first.
- **Clear failures:** a failed step stops the run, and the error says what went wrong in plain words.

## Run it

```bash
npm install
npm run dev        # http://localhost:3020
npm test           # unit tests
npm run lint
npm run typecheck
```

## Layout

```
src/flow/      the saved shape of a flow, the block catalogue, validation, graph helpers
src/engine/    the scheduler, references, conditions, and one executor per block
src/app/       pages and REST route handlers
```

## Licence

MIT
