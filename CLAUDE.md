# CLAUDE.md

## Finding things in this codebase

**Use `ripwire` first.** Before opening files, before `grep`, before spawning a search agent — ask ripwire. It returns ranked signatures and call edges instead of file bodies, so orienting costs ~2K tokens instead of ~20K, and "who calls this" costs ~600 tokens instead of a grep plus three file reads. It indexes this repo (~370 files, ~2100 symbols) in about 0.15 s with no server, no embeddings and no API key.

```bash
ripwire . --max-tokens=2500
```

| Question | Command |
| --- | --- |
| Orient me in this repo | `ripwire . --max-tokens=2500` |
| Where is X handled? | `ripwire . --for="<the change, in words>"` |
| Who calls this? | `ripwire . --callers=SYM` |
| Is it safe to change? | `ripwire . --impact=SYM` and `--uses=SYM` |
| Show me this one function | `ripwire . --expand=SYM --top-k=0` |
| Set me up for a task | `ripwire . --pack-task="…"` |
| What do the specs already say? | `ripwire . --recall="…"` |
| What should I run before committing? | `ripwire . --test-gate`, then `--situ` |

Pass `--max-tokens` on the broad verbs. Output is dense XML-ish text — pipe through `tail -c` when only the payload matters. `ripwire --help-task` lists the rest.

Install (macOS/Linux, checksum-verified, no sudo — safe to re-run to upgrade):

```bash
RIPWIRE_REPO=redhat-et/ripwire bash -c "$(curl -fsSL https://raw.githubusercontent.com/redhat-et/ripwire/main/scripts/install.sh)"
```

The MCP server (`ripwire --mcp`) is deliberately **not** wired up: its verb schemas would sit in the agent's context every session whether called or not, which defeats the point. Use the CLI.

### After ripwire

- **LSP** (`typescript-lsp` plugin) once a specific symbol is in hand and the answer must be exact — `goToDefinition`, `findReferences`, `goToImplementation`, call hierarchy. It does not report type errors; use `npx tsc --noEmit` for that.
- **grep** only for non-symbol text: string literals, CSS classes, config keys, comments, and the Polish content under `data/`.

## Layout

`src/` splits by concern rather than by file type:

- `content/` — dictionary index, shards, paradigms, codec
- `learning/` — SRS (`srs/`, FSRS adapter), skills model, session and practice queue building, progress aggregation
- `db/` — IndexedDB repositories
- `features/` — feature UIs, notably `session-runner/`
- `app/` — providers, router, shell
- `components/`, `hooks/`, `stores/`, `lib/`, `pages/`, `types/`

`spec/` holds the design docs and numbered task write-ups (`spec/tasks/NN-*.md`) that describe why things are the way they are; `ripwire . --recall="…"` searches them without reading them all. Content is built from `data/` by `scripts/build-content.ts`.

## Commands

```bash
npm run dev            # vite dev server
npm test               # vitest run
npm run lint           # eslint
npm run build          # build:content, then tsc -b && vite build, then bundle-size check
npm run e2e            # playwright
```

Prefer the Browser pane's `preview_start` over running a server through a shell. `.claude/launch.json`
defines one configuration, `preview` — it serves the **built** output on port 4173, so run `npm run build`
first. There is no launch entry for `npm run dev`.
