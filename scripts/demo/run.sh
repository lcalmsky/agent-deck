#!/bin/sh
# Run the deck on made-up sessions and accounts, isolated from this Mac's real state: scripts/demo/run.sh [port]
set -eu
DIR=$(cd "$(dirname "$0")" && pwd)
HOME_DIR=$(mktemp -d "${TMPDIR:-/tmp}/agent-deck-demo.XXXXXX")
USAGE="$HOME_DIR/.local/state/herdr-tower/usage"
mkdir -p "$USAGE" "$HOME_DIR/.config/agent-deck"
NOW=$(date +%s)
printf '{"five_hour":{"used":34,"resets_at":%s},"seven_day":{"used":58,"resets_at":%s},"updated_at":%s}\n' $((NOW+7200)) $((NOW+260000)) "$NOW" > "$USAGE/work.json"
printf '{"five_hour":{"used":8,"resets_at":%s},"seven_day":{"used":21,"resets_at":%s},"updated_at":%s}\n' $((NOW+12000)) $((NOW+400000)) "$NOW" > "$USAGE/side.json"
printf 'work\twork\nside\tside\n' > "$HOME_DIR/.local/state/herdr-tower/labels"
printf 'work\n' > "$HOME_DIR/.local/state/herdr-tower/current"
for a in work:Max side:Pro; do
  mkdir -p "$HOME_DIR/.claude-accounts/${a%%:*}"
  printf '{"oauthAccount":{"planDisplayName":"%s"}}\n' "${a#*:}" > "$HOME_DIR/.claude-accounts/${a%%:*}/.claude.json"
done
printf 'demo-token-not-secret\n' > "$HOME_DIR/.config/agent-deck/token"
chmod +x "$DIR/scan.sh" "$DIR/herdr-app" "$DIR"/bin/*
echo "demo deck: http://127.0.0.1:${1:-8790}/?t=demo-token-not-secret"
HOME="$HOME_DIR" CLAUDE_CONFIG_DIR="$HOME_DIR/.claude" PATH="$DIR/bin:$PATH" AGENT_DECK_PORT="${1:-8790}" AGENT_DECK_HOST=127.0.0.1 \
  AGENT_DECK_SCAN="$DIR/scan.sh" AGENT_DECK_HERDR="$DIR/herdr-app" AGENT_DECK_CCA="$DIR/bin/open" \
  exec node "$DIR/../../server/server.mjs"
