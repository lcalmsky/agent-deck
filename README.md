# agent-deck

An iPad page that looks like a stream deck and shows the coding-agent sessions running in Herdr on this Mac. One key per session; pressing a key focuses that session's terminal in the Herdr window.

Setup guide for a new machine: [docs/install.html](docs/install.html).

## Install with a coding agent

Paste this into Claude Code (or another coding agent) on the Mac that runs your sessions. It installs the deck, checks what is missing, and tells you what each missing piece costs.

```text
Install agent-deck on this Mac and onboard me. Answer in the language I write in.

1. Clone https://github.com/lcalmsky/agent-deck into ~/git-repo/agent-deck (or a folder I name) unless it is already there, then read its README.md and docs/install.html.
2. Check each requirement below and report a table: item, found or missing, what I lose without it, how to fix it.
   - macOS and Node 20 or later (`node -v`). Required: the server does not start without it.
   - The session scan script: $AGENT_DECK_SCAN if set, else ~/.config/herdr-app/mods/night-city-street/scan.sh. Required: no keys appear without it. If it is missing, explain the one-JSON-line-per-session format in docs/install.html and offer to write a scan script for the agent tool I use.
   - Herdr desktop app and the herdr-app CLI ($AGENT_DECK_HERDR, else ~/.local/bin/herdr-app). Recommended: keys show but pressing one does not focus the terminal.
   - Claude Code logged in (an entry in the login keychain for Claude Code) or usage caches in ~/.local/state/herdr-tower/usage/. Optional: the account usage row stays empty.
   - The account switcher cca ($AGENT_DECK_CCA, else ~/.local/bin/cca). Optional: tapping an account to make it the default fails.
3. Do not install or change anything outside the agent-deck folder without asking me first. For each missing item, ask before installing it.
4. Run `npm test`, then `npm start` in the background, and give me the iPad address it prints (http://<mac-ip>:8787/?t=<token>). Remind me the iPad must be on the same Wi-Fi or the same private network (Tailscale and the like).
5. Ask whether to start it at login with `scripts/launchd.sh install`.
6. End with what works now, what is still missing, and the single next step for me.
```

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
- Conversation preview (long press): the last exchange of the session's transcript, read from `$CLAUDE_CONFIG_DIR` (else `~/.claude`) and `~/.claude-accounts/*`
- Opened results: `~/.local/state/agent-deck/seen.json` (a finished session reads "결과 도착" until opened from the deck)

Status rules follow `night-city-street/model.js`: waiting -> needs you, busy and silent for 10 minutes with nothing in the background -> stalled, idle -> result arrived.

## Layout

- `server/` server and the state model (`npm test`)
- `public/` the deck page; the gear on the connection key picks a theme, `?theme=<id>` previews one (`public/themes/README.md`)
- `mockup/` the static design mockups

Env: `AGENT_DECK_PORT`, `AGENT_DECK_HOST`, `AGENT_DECK_SCAN`, `AGENT_DECK_HERDR`, `AGENT_DECK_CCA`.
