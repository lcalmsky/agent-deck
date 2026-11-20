// Renders the deck from the server's state stream and sends key presses back.
(() => {
  const SLOTS = 15; // 5 x 3
  const LABEL = { needs: "내 차례", done: "결과 도착", stalled: "멈춤", working: "작업 중", idle: "쉬는 중" };
  const svg = (inner, extra = "") => `<svg ${extra} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const ICON = {
    done: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 'stroke-width="2.4"'),
    working: svg('<circle cx="12" cy="12" r="8" opacity=".25"/><path d="M12 4a8 8 0 0 1 8 8"/>', 'class="spin" stroke-width="2.4"'),
    needs: svg('<path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4.5 19.5l1.3-4.2A7.5 7.5 0 1 1 20 11.5z"/><path d="M9 11.5h.01M12.5 11.5h.01M16 11.5h.01" stroke-width="2.8"/>', 'stroke-width="2"'),
    stalled: svg('<path d="M10 8v8"/><path d="M14 8v8"/>', 'stroke-width="2.4"'),
    idle: svg('<path d="M19.5 14.2A7.5 7.5 0 1 1 9.8 4.5a6 6 0 0 0 9.7 9.7z"/>', 'stroke-width="2"'),
  };
  const GRAIN = '<svg class="grain" aria-hidden="true"><rect width="100%" height="100%" filter="url(#deck-noise)"/></svg>';

  const deck = document.getElementById("deck");
  const grid = document.getElementById("grid");
  const strip = document.getElementById("strip");
  let state = null;
  let offset = 0; // server clock minus device clock
  let lastMsg = 0;
  let online = false;
  let pressed = null; // { terminal, text, until }
  let pressedAcct = null; // { id, text, until }

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const now = () => Date.now() + offset;

  function ago(ms) {
    if (ms == null) return "";
    const s = Math.max(0, Math.round((now() - ms) / 1000));
    if (s < 60) return "방금";
    const m = Math.round(s / 60);
    if (m < 60) return `${m}분`;
    const h = Math.floor(m / 60);
    return h < 24 ? `${h}시간` : `${Math.floor(h / 24)}일`;
  }
  function until(sec) {
    const m = Math.max(0, Math.round((sec * 1000 - now()) / 60000));
    if (m < 60) return `${m}분 뒤 리셋`;
    const h = Math.floor(m / 60);
    return h < 24 ? `${h}시간 ${m % 60}분 뒤 리셋` : `${Math.floor(h / 24)}일 ${h % 24}시간 뒤 리셋`;
  }
  const day = (sec) => { const d = new Date(sec * 1000); return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

  function keyHtml(k) {
    const st = k.status;
    const task = st === "needs" ? k.ask || k.topic || ""
      : (st === "done" || st === "stalled") && k.line ? k.line
      : k.topic || k.line || "";
    const sent = pressed && pressed.terminal === k.terminal && pressed.until > Date.now();
    const label = `${LABEL[st]}, ${k.name}${task ? `, ${task}` : ""}${k.terminal ? `, 누르면 맥에서 이 터미널로 이동` : ""}, 길게 누르면 자세히`;
    // no disabled attribute even without a terminal: Safari drops pointer events on disabled buttons, and the long press still works
    return `<li class="well s-${st}"><button type="button" class="key s-${st}${sent ? " is-sent" : ""}" data-id="${esc(k.id)}" ${k.terminal ? `data-terminal="${esc(k.terminal)}"` : `aria-disabled="true"`} aria-label="${esc(label)}">
  <span class="glow"></span>${GRAIN}<span class="mark" aria-hidden="true">${ICON[st]}</span><span class="hold" aria-hidden="true"></span>
  <span class="face">
    <span class="top">
      <span class="chip" aria-hidden="true">${ICON[st]}</span>
      <span class="meta">${k.background ? `<span class="extra">+${k.background}</span>` : ""}<span class="time">${esc(ago(k.since))}</span></span>
    </span>
    <span class="bottom">
      <span class="label">${esc(k.kind || LABEL[st])}</span>
      <span class="name">${esc(k.name)}</span>
      <span class="task">${esc(task)}</span>
    </span>
  </span>
  <span class="sent">${sent ? esc(pressed.text) : ""}</span>
</button></li>`;
  }

  const emptyHtml = `<li class="well s-empty"><div class="key s-empty" aria-hidden="true">${GRAIN}<span class="slot"></span></div></li>`;

  const tone = (v) => (v == null || v === 0 ? "t-none" : v >= 90 ? "t-bad" : v >= 70 ? "t-warn" : "t-ok");
  function resetIn(w) {
    if (w.stale) return "리셋 지남";
    if (!w.resetsAt) return "";
    const m = Math.max(0, Math.round((w.resetsAt * 1000 - now()) / 60000));
    if (m < 60) return `${m}분 뒤`;
    const h = Math.floor(m / 60);
    return h < 24 ? `${h}시간 ${m % 60}분 뒤` : `${Math.floor(h / 24)}일 ${h % 24}시간 뒤`;
  }
  const ICON_ACCT = svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', 'stroke-width="2"');

  // an account is a wide key: the same material as the session keys, two columns wide
  function acctHtml(a, span) {
    const flash = pressedAcct && pressedAcct.id === a.id && pressedAcct.until > Date.now();
    const meters = a.windows.length ? a.windows.map((w) => `<span class="m${w.stale ? " stale" : ""}"><span class="mt"><span class="mn">${esc(w.name)}</span><span class="mr">${esc(resetIn(w))}</span><b class="mv">${w.value}%</b></span><span class="bar"><span class="fill ${w.stale ? "t-none" : tone(w.value)}" style="width:${Math.min(100, w.value)}%"></span></span></span>`).join("")
      : `<span class="m none">상태 줄이 아직 기록하지 않았어</span>`;
    const label = `${a.label}${a.plan ? ` ${a.plan}` : ""}${a.current ? ", 기본 계정" : ""}, ${a.windows.map((w) => `${w.name} ${w.value}%`).join(", ")}, ${a.current ? "" : "누르면 기본 계정으로 바꾸기, "}길게 누르면 자세히`;
    return `<li class="well acct-well${span > 1 ? " span2" : ""}"><button type="button" class="key acct${a.current ? " is-default" : ""}${flash ? " is-sent" : ""}" data-account="${esc(a.id)}" aria-label="${esc(label)}">
  <span class="glow"></span>${GRAIN}<span class="hold" aria-hidden="true"></span>
  <span class="aface">
    <span class="ahead">
      <span class="top"><span class="chip" aria-hidden="true">${ICON_ACCT}</span>${a.current ? `<span class="badge">기본</span>` : ""}</span>
      <span class="bottom"><span class="label">${esc(a.plan || "플랜 모름")}</span><span class="name">${esc(a.label)}</span></span>
    </span>
    <span class="meters">${meters}</span>
  </span>
  <span class="sent">${flash ? esc(pressedAcct.text) : ""}</span>
</button></li>`;
  }

  // ---- themes come from themes/registry.js, which already applied the saved one ----
  const Themes = window.DeckThemes;
  const themesEl = document.getElementById("themes");
  themesEl.innerHTML = [{ id: "auto", name: "자동", swatch: `linear-gradient(135deg, ${Themes.list.find((t) => t.id === Themes.auto.light).swatch} 50%, ${Themes.list.find((t) => t.id === Themes.auto.dark).swatch} 50%)` }, ...Themes.list]
    .map((t) => `<button type="button" class="theme-pick" data-theme-pick="${esc(t.id)}"><i style="background:${t.swatch}"></i>${esc(t.name)}</button>`).join("");

  // ---- fullscreen: hides the status bar; needs a tap each time the page opens ----
  const root = document.documentElement;
  const canFull = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  let wantFull = false;
  try { wantFull = localStorage.getItem("deck-full") === "1"; } catch {}
  function enterFull() { (root.requestFullscreen || root.webkitRequestFullscreen)?.call(root)?.catch?.(() => {}); }
  function exitFull() { (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {}); }
  const saveFull = (v) => { wantFull = v; try { localStorage.setItem("deck-full", v ? "1" : "0"); } catch {} };
  // re-enter on the first touch after the page opens, if fullscreen was on last time
  document.addEventListener("pointerdown", () => { if (canFull && wantFull && !isFull()) enterFull(); }, { capture: true });

  const ICON_GEAR = svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', 'stroke-width="1.8"');

  // ---- settings sheet: opened from the gear in the strip ----
  const sheet = document.getElementById("sheet");
  const fullBtn = document.getElementById("full-toggle");
  fullBtn.hidden = !canFull;
  document.getElementById("full-none").hidden = canFull;
  function syncSheet() {
    for (const b of sheet.querySelectorAll("[data-theme-pick]")) b.setAttribute("aria-pressed", String(b.dataset.themePick === Themes.pref()));
    fullBtn.setAttribute("aria-pressed", String(isFull()));
    fullBtn.querySelector("span").textContent = isFull() ? "켜짐" : "꺼짐";
  }
  function openSheet() { syncSheet(); sheet.hidden = false; }
  function closeSheet() { sheet.hidden = true; }
  strip.addEventListener("click", (e) => {
    if (e.target.closest('[data-tool="menu"]')) return openSheet();
    if (swallowClick) { swallowClick = false; return; }
    const acct = e.target.closest(".key[data-account]");
    if (!acct) return;
    const a = state?.accounts?.find((x) => x.id === acct.dataset.account);
    if (!a) return;
    if (a.current) {
      pressedAcct = { id: a.id, text: "이미 기본 계정이야", until: Date.now() + 1400 };
      render();
      setTimeout(render, 1500);
    } else openLift("confirm", a.id, acct);
  });
  sheet.addEventListener("click", (e) => {
    if (e.target === sheet || e.target.closest("[data-close]")) return closeSheet();
    const pick = e.target.closest("[data-theme-pick]");
    if (pick) {
      Themes.choose(pick.dataset.themePick);
      syncSheet();
      return;
    }
    if (e.target.closest("#full-toggle")) {
      if (isFull()) { saveFull(false); exitFull(); } else { saveFull(true); enterFull(); closeSheet(); }
    }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) closeSheet(); });
  document.addEventListener("fullscreenchange", syncSheet);
  document.addEventListener("webkitfullscreenchange", syncSheet);

  function deviceHtml() {
    const host = esc(state?.host || "Mac");
    const err = state?.error;
    const note = !online ? "다시 연결하는 중, 마지막 값 표시"
      : err ? `스캔 오류: ${err.slice(0, 40)}`
      : ago(state?.scannedAt) === "방금" ? "방금 갱신" : `${ago(state?.scannedAt)} 전 갱신`;
    return `<li class="well dev-well"><div class="key dev ${online ? "s-done" : "s-stalled"}">
  <span class="glow"></span>${GRAIN}
  <span class="face">
    <span class="top"><span class="chip" aria-hidden="true"><span class="dot${online ? "" : " off"}"></span></span><button type="button" class="tool" data-tool="menu" aria-label="설정: 테마와 전체 화면">${ICON_GEAR}</button></span>
    <span class="bottom"><span class="label">${online ? "연결됨" : "연결 끊김"}</span><span class="name">${host}</span><span class="task">${esc(note)}</span></span>
  </span>
</div></li>`;
  }

  // replace only on change, so a held key and the spinner are not reset every second
  function setHtml(el, html) {
    if (el._html === html) return;
    el._html = html;
    el.innerHTML = html;
  }

  function render() {
    deck.classList.toggle("offline", !online);
    const keys = state?.keys ?? [];
    const items = keys.slice(0, SLOTS).map(keyHtml);
    while (items.length < SLOTS) items.push(emptyHtml);
    setHtml(grid, items.join("\n"));
    const accts = (state?.accounts ?? []).slice(0, 4);
    const span = accts.length <= 2 ? 2 : 1;
    setHtml(strip, accts.map((a) => acctHtml(a, span)).join("\n") + deviceHtml());
    renderLift();
  }

  // ---- long press: the key grows into a 3x3 card with everything the scan knows ----
  const HOLD_MS = 450;
  const layer = document.getElementById("lift-layer");
  let hold = null; // { key, timer, x, y }
  let lift = null; // { kind: "key" | "acct" | "confirm", id }
  let liftMsg = "";
  let swallowClick = false;
  const I = {
    you: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', 'stroke-width="1.8"'),
    bot: svg('<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M9 13h.01M15 13h.01"/>', 'stroke-width="1.8"'),
    tool: svg('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>', 'stroke-width="1.8"'),
    pr: svg('<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M6 8.5v7M18 15.5V9a3 3 0 0 0-3-3h-4"/>', 'stroke-width="1.8"'),
    place: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/>', 'stroke-width="1.8"'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', 'stroke-width="1.8"'),
    layers: svg('<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>', 'stroke-width="1.8"'),
    open: svg('<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>', 'stroke-width="1.8"'),
    close: svg('<path d="M6 6l12 12M18 6 6 18"/>', 'stroke-width="2"'),
  };
  const agoText = (ms) => { const a = ago(ms); return !a ? "" : a === "방금" ? a : `${a} 전`; };
  const bgText = (b) => b ? [b.shells && `셸 ${b.shells}`, b.agents && `서브에이전트 ${b.agents}`, b.monitors && `감시 ${b.monitors}`].filter(Boolean).join(", ") : "";

  function liftBody(k) {
    const d = k.detail ?? {};
    const facts = [
      d.agent && [I.bot, "에이전트", esc(d.agent)],
      d.startedAt && [I.clock, "시작", esc(agoText(d.startedAt))],
      d.round && [I.layers, "라운드", `${d.round}번째`],
      d.bg && [I.layers, "백그라운드", esc(bgText(d.bg))],
      d.doneTasks && [I.layers, "끝낸 백그라운드 작업", `${d.doneTasks}건`],
      d.tool && [I.tool, "마지막 도구", esc(`${d.tool.name}${d.tool.at ? `, ${agoText(d.tool.at)}` : ""}`)],
      d.pr && [I.pr, "PR", d.pr.url ? `<a href="${esc(d.pr.url)}" target="_blank" rel="noopener">#${d.pr.number}</a>` : `#${d.pr.number}`],
      d.place && [I.place, "Herdr 위치", esc([d.place.space, d.place.tab].filter(Boolean).join(" › "))],
    ].filter(Boolean);
    const theirs = k.status === "needs" && k.ask
      ? `<div class="say ask"><b>${I.bot}물어본 것</b><p>${esc(k.ask)}</p></div>`
      : d.agentSaid ? `<div class="say bot"><b>${I.bot}${esc(d.agent || "에이전트")}</b><p>${esc(d.agentSaid)}</p></div>` : "";
    return `<header class="lift-head"><span class="chip">${ICON[k.status]}</span><span class="lift-state">${esc(k.kind || LABEL[k.status])}<em>${esc(agoText(k.since))}</em></span><button type="button" class="lift-x" data-close aria-label="닫기">${I.close}</button></header>
    <h2 id="lift-title">${esc(k.name)}</h2>
    ${k.topic ? `<p class="lift-topic">${esc(k.topic)}</p>` : ""}
    ${d.objective ? `<p class="lift-objective">목표: ${esc(d.objective)}</p>` : ""}
    <div class="talk">${d.you ? `<div class="say me"><b>${I.you}나</b><p>${esc(d.you)}</p></div>` : ""}${theirs}${d.action ? `<div class="doing">${ICON.working}${esc(d.action)}</div>` : ""}</div>
    <ul class="facts">${facts.map(([icon, key, val]) => `<li>${icon}<span>${key}</span><b>${val}</b></li>`).join("")}</ul>
    <footer class="lift-foot"><span class="lift-path">${esc(d.cwd || "")}</span>${k.terminal ? `<button type="button" class="lift-go" data-go="${esc(k.terminal)}">${I.open}${esc(pressed?.terminal === k.terminal && pressed.until > Date.now() ? pressed.text : "맥에서 열기")}</button>` : `<span class="lift-path">이 세션은 Herdr 창 밖에 있어</span>`}</footer>`;
  }

  const findLift = () => !lift ? null : lift.kind === "key" ? state?.keys.find((x) => x.id === lift.id) : state?.accounts?.find((x) => x.id === lift.id);

  function acctBody(a) {
    const d = a.detail;
    const rows = a.windows.map((w) => `<li><span>${esc(w.name)}</span><b>${w.value}%</b><em>${esc(w.stale ? "리셋 지남" : resetIn(w) ? `${resetIn(w)} 리셋` : "")}</em><span class="bar"><span class="fill ${w.stale ? "t-none" : tone(w.value)}" style="width:${Math.min(100, w.value)}%"></span></span></li>`).join("");
    const facts = [
      [I.layers, "플랜", esc(a.plan || "모름")],
      d?.share && [I.layers, "주간 중 Fable 몫", `${d.share.used}% / ${d.share.allowance}%`],
      ...(d?.breakdown ?? []).filter((b) => b.value > 0).map((b) => [I.bot, `이번 주 ${esc(b.name)}`, `${b.value}%`]),
      d && d.extraUsage != null && [I.layers, "추가 사용량", d.extraUsage ? "켜짐" : "꺼짐"],
      [I.clock, "기준 시각", esc(a.updatedAt ? agoText(a.updatedAt * 1000) : "모름")],
    ].filter(Boolean);
    return `<header class="lift-head"><span class="chip">${ICON_ACCT}</span><span class="lift-state">${a.current ? "기본 계정" : "계정"}<em>${esc(a.plan || "")}</em></span><button type="button" class="lift-x" data-close aria-label="닫기">${I.close}</button></header>
    <h2 id="lift-title">${esc(a.label)}</h2>
    <ul class="limits">${rows || "<li>상태 줄이 아직 기록하지 않았어</li>"}</ul>
    <ul class="facts">${facts.map(([icon, key, val]) => `<li>${icon}<span>${key}</span><b>${val}</b></li>`).join("")}</ul>
    <footer class="lift-foot"><span class="lift-path">${esc(liftMsg || (a.current ? "새로 시작하는 세션이 이 계정을 써" : d ? "" : "사용량 API를 읽지 못해서 상태 줄 기록으로 보여 주는 중"))}</span>${a.current ? "" : `<button type="button" class="lift-go" data-use="${esc(a.id)}">${ICON_ACCT}기본 계정으로 쓰기</button>`}</footer>`;
  }

  function confirmBody(a) {
    return `<header class="lift-head"><span class="chip">${ICON_ACCT}</span><span class="lift-state">기본 계정 바꾸기<em>${esc(a.plan || "")}</em></span><button type="button" class="lift-x" data-close aria-label="닫기">${I.close}</button></header>
    <h2 id="lift-title">${esc(a.label)}을 기본 계정으로 쓸까?</h2>
    <p class="lift-topic">새로 시작하는 세션부터 이 계정을 써. 이미 열린 세션은 그대로야.</p>
    <footer class="lift-foot"><span class="lift-path">${esc(liftMsg)}</span><button type="button" class="lift-alt" data-close>취소</button><button type="button" class="lift-go" data-use="${esc(a.id)}">${ICON_ACCT}바꾸기</button></footer>`;
  }

  function openLift(kind, id, keyEl) {
    lift = { kind, id };
    liftMsg = "";
    const item = findLift();
    if (!item) { lift = null; return; }
    const g = grid.getBoundingClientRect();
    const d = deck.getBoundingClientRect();
    const r = keyEl.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 22;
    const colW = (g.width + gap) / 5;
    const col = Math.round((r.left + r.width / 2 - g.left - colW / 2) / colW);
    const c0 = Math.min(Math.max(col - 1, 0), 2);
    const h = kind === "confirm" ? Math.min(g.height, 250) : g.height;
    const box = { left: g.left - d.left + c0 * colW, top: g.bottom - d.top - h, width: colW * 3 - gap, height: h };
    const st = kind === "key" ? ` s-${item.status}` : "";
    layer.innerHTML = `<article class="lift${st}" role="dialog" aria-modal="true" aria-labelledby="lift-title" style="left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px"><span class="glow"></span>${GRAIN}<div class="lift-body"></div></article>`;
    const card = layer.firstElementChild;
    card.style.transform = `translate(${r.left - d.left - box.left}px, ${r.top - d.top - box.top}px) scale(${r.width / box.width}, ${r.height / box.height})`;
    layer.hidden = false;
    deck.classList.add("lifted");
    renderLift();
    requestAnimationFrame(() => requestAnimationFrame(() => { card.style.transform = "none"; card.classList.add("in"); card.querySelector(".lift-x")?.focus({ preventScroll: true }); }));
  }

  function closeLift() {
    if (!lift) return;
    lift = null;
    layer.hidden = true;
    layer.innerHTML = "";
    deck.classList.remove("lifted");
  }

  function renderLift() {
    if (!lift) return;
    const item = findLift();
    const card = layer.querySelector(".lift");
    if (!item || !card) return closeLift(); // the session ended while open
    const st = lift.kind === "key" ? ` s-${item.status}` : "";
    card.className = `lift${st}${card.classList.contains("in") ? " in" : ""}`;
    setHtml(card.querySelector(".lift-body"), lift.kind === "key" ? liftBody(item) : lift.kind === "acct" ? acctBody(item) : confirmBody(item));
  }

  async function useAccount(id) {
    liftMsg = "바꾸는 중";
    renderLift();
    try {
      const r = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account: id }) });
      const j = await r.json().catch(() => ({}));
      liftMsg = j.ok ? "" : `바꾸지 못했어: ${j.error || r.status}`;
      if (j.ok) {
        closeLift();
        pressedAcct = { id, text: "기본 계정으로 바꿨어", until: Date.now() + 1600 };
        render();
        setTimeout(render, 1700);
        return;
      }
    } catch {
      liftMsg = "맥에 닿지 않아";
    }
    renderLift();
  }

  function cancelHold() {
    if (!hold) return;
    clearTimeout(hold.timer);
    hold.key.classList.remove("holding");
    hold = null;
  }
  function startHold(e) {
    const key = e.target.closest(".key[data-id], .key[data-account]");
    if (!key || lift || e.target.closest(".tool")) return;
    cancelHold();
    key.classList.add("holding");
    hold = { key, x: e.clientX, y: e.clientY, timer: setTimeout(() => {
      cancelHold();
      swallowClick = true;
      if (key.dataset.account) openLift("acct", key.dataset.account, key);
      else openLift("key", key.dataset.id, key);
      window.getSelection?.().removeAllRanges();
    }, HOLD_MS) };
  }
  for (const el of [grid, strip]) {
    el.addEventListener("pointerdown", startHold);
    el.addEventListener("pointermove", (e) => { if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 12) cancelHold(); });
    for (const ev of ["pointerup", "pointercancel", "pointerleave"]) el.addEventListener(ev, cancelHold);
  }
  // belt and braces for iOS, which can still start a selection on a long press despite user-select
  document.addEventListener("selectstart", (e) => e.preventDefault());
  document.addEventListener("contextmenu", (e) => { if (e.target.closest(".key, .lift")) e.preventDefault(); });
  layer.addEventListener("click", (e) => {
    if (e.target === layer || e.target.closest("[data-close]")) return closeLift();
    const go = e.target.closest("[data-go]");
    if (go) focusTerminal(go.dataset.go);
    const use = e.target.closest("[data-use]");
    if (use) useAccount(use.dataset.use);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeLift(); });

  grid.addEventListener("click", (e) => {
    if (swallowClick) { swallowClick = false; return; }
    const btn = e.target.closest(".key[data-terminal]");
    if (btn) focusTerminal(btn.dataset.terminal);
  });

  async function focusTerminal(terminal) {
    pressed = { terminal, text: "여는 중", until: Date.now() + 4000 };
    render();
    try {
      const r = await fetch("/api/focus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ terminal }) });
      const j = await r.json().catch(() => ({}));
      pressed = { terminal, text: j.ok ? "맥에서 열었어" : "열지 못했어", until: Date.now() + 1600 };
    } catch {
      pressed = { terminal, text: "맥에 닿지 않아", until: Date.now() + 1600 };
    }
    render();
    setTimeout(render, 1700);
  }

  function connect() {
    const es = new EventSource("/events");
    es.onmessage = (e) => {
      try { state = JSON.parse(e.data); } catch { return; }
      offset = state.now - Date.now();
      lastMsg = Date.now();
      online = true;
      render();
    };
    es.onerror = () => { online = false; render(); };
  }

  // the server pushes every 3 s; silence past 10 s means the link is gone even if the socket looks open
  setInterval(() => {
    if (online && Date.now() - lastMsg > 10000) online = false;
    render();
  }, 1000);

  render();
  connect();
})();
