# Agent Deck themes

A theme is two layers:

- **Material** (`materials/<material>.css`): how a key is built — its surface, light, depth, the press, and where the glow sits. Uses only tokens for colour.
- **Palette** (`<id>.css`): the colour tokens that material reads, plus the shared UI tokens.

Several palettes can share one material (`ceramic` and `charcoal` both use the ceramic material).

## Add a theme

1. Pick an existing material, or write `materials/<material>.css`.
2. Write `<id>.css` with every token the material reads and every shared UI token below.
3. Add an entry to `THEMES` in `registry.js`: `{ id, name, scheme: "light" | "dark", material, swatch }`.
   `name` is what the settings sheet shows, in Korean. `swatch` is the colour of its chip in the picker.
4. Preview with `/?theme=<id>` (not saved), then check the rules below on the iPad.

`AUTO` in `registry.js` decides which theme "자동" picks for the light and dark system appearance.

## Scope

- Palette files contain one block: `:root[data-theme="<id>"] { --token: value; ... }`. No selectors.
- Material files nest every rule inside `:root[data-material="<material>"] { ... }`. Keyframes go outside, named after the material.
- Scheme-specific tweaks inside a material use `:root[data-material="<m>"][data-scheme="dark"]`.
- Never edit `layout.css` or `app.js` for a theme. If a material needs a new hook, add it to the markup for every theme and document it here.

## Hooks a material may style

| Hook | What it is |
|---|---|
| `.root`, `.backdrop` | page background; `.backdrop` is an empty layer behind the deck |
| `.deck` | the device body; set `--deck-pad` on the material root to give it a frame |
| `.well` | the socket a key sits in; carries the state class too (`.s-needs.well`) |
| `.key` | the keycap; `.key:active:not(:disabled)` is the press |
| `.glow` | a light layer inside the key, positioned by the material |
| `.grain` | an SVG noise layer filling the key |
| `.mark` | a large copy of the state icon, hidden unless the material shows it |
| `.chip`, `.time`, `.extra`, `.label`, `.name`, `.task`, `.slot` | the key face |
| `.hold` | the ring that fills while a key is held toward the long press |
| `.lift`, `.lift > .glow`, `.lift > .grain`, `.lift-go` | the long-press card; it reads `--ui-*` tokens by default, so a material only styles it to match its keys |
| `.acct-row` | the bottom row: each account is a two-column `.key.acct` in its `.well`, then the Mac key `.key.dev`; the key rules above already style them |
| `.acct.is-default`, `.badge` | the account new sessions start under, and its "기본" badge |
| `.aface`, `.meters`, `.bar`, `.fill.t-ok/.t-warn/.t-bad` | an account key's face and its usage bars |

Geometry (grid, key size, text sizes, the face layout) belongs to `layout.css`. A material may change radius through `--key-radius`, frame through `--deck-pad`, and a name size, nothing else that moves content.

## State contract

Each key has `.s-needs`, `.s-done`, `.s-stalled`, `.s-working`, `.s-idle` or `.s-empty`, and `--c` / `--cd` hold that state's light and deep tone as `r, g, b`. Use them as `rgb(var(--c))` or `rgba(var(--c), .3)`.

- Keep the state hues: amber waits, green is done, red is stalled, blue works. A palette may shift lightness, never the hue family.
- **Waiting keys are the loudest thing on the screen**, and the only ones that move (breathe or pulse).
- Idle and empty keys recede: no state light, lower contrast than any active key.
- Colour is never the only signal: the chip icon and the label stay readable in every theme.
- Nothing behind the keys may tint them with a non-state colour. A coloured backdrop seen through a translucent key reads as a state.

## Readability

- Key name and strip values: contrast 4.5:1 or more against the key surface.
- Task line, time and notes: 3:1 or more.
- The press must show within 120 ms and move no more than 5px.

## Shared UI tokens (every palette)

`--page-bg`, `--ui-bg`, `--ui-ink`, `--ui-ink-2`, `--ui-hair`, `--ui-accent`, `--ui-on-accent`, `--scrim`, `--focus`, `--sent-bg`, `--sent-ink`.

## Motion

Only `transform`, `opacity`, `box-shadow` and `filter` animate. `layout.css` turns every animation off under `prefers-reduced-motion`, so a material must still read without them.
