# agent-deck

An iPad page that looks like a stream deck and shows the coding-agent sessions running in Herdr on this Mac. One key per session; pressing a key focuses that session's terminal in the Herdr window.

Setup guide for a new machine: [docs/install.html](docs/install.html).

## Run

```sh
npm start            # node server/server.mjs, port 8787
```

The server prints the address to open on the iPad, with a token: `http://<mac-ip>:8787/?t=<token>`. The first visit trades the token for a cookie. The token lives in `~/.config/agent-deck/token`; delete it and restart to issue a new one.

To keep it running at login: `scripts/launchd.sh install` (log: `~/.local/state/agent-deck/server.log`).

## Where the data comes from

- Sessions: `~/.config/herdr-app/mods/night-city-street/scan.sh`, every 3 s
- Terminals: `herdr-app ls`; a key press runs `herdr-app do pane.focus {"terminal": ...}` and brings Herdr to the front
- Usage: `/api/oauth/usage` every 5 min with each account's Claude Code token from the keychain, else the caches in `~/.local/state/herdr-tower/usage/*.json`; account names from `~/.local/state/herdr-tower/labels`, the default account from `~/.local/state/herdr-tower/current`
- Opened results: `~/.local/state/agent-deck/seen.json` (a finished session reads "결과 도착" until opened from the deck)

Status rules follow `night-city-street/model.js`: waiting -> needs you, busy and silent for 10 minutes with nothing in the background -> stalled, idle -> result arrived.

## Layout

- `server/` server and the state model (`npm test`)
- `public/` the deck page; the gear on the connection key picks a theme, `?theme=<id>` previews one (`public/themes/README.md`)
- `mockup/` the static design mockups

Env: `AGENT_DECK_PORT`, `AGENT_DECK_HOST`, `AGENT_DECK_SCAN`, `AGENT_DECK_HERDR`, `AGENT_DECK_CCA`.
