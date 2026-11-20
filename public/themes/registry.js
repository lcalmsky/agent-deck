// Theme registry. Add a theme here and in themes/<id>.css; see themes/README.md for the rules.
// Loaded synchronously in <head> so the saved theme applies before the first paint.
(() => {
  const THEMES = [
    { id: "ceramic", name: "세라믹", scheme: "light", material: "ceramic", swatch: "#f3f1ed" },
    { id: "charcoal", name: "차콜", scheme: "dark", material: "ceramic", swatch: "#3b3b40" },
    { id: "resin", name: "백라이트 레진", scheme: "dark", material: "resin", swatch: "#1d1d22" },
    { id: "edge", name: "미드나잇 엣지", scheme: "dark", material: "edge", swatch: "#131a33" },
    { id: "resinart", name: "레진 아트", scheme: "light", material: "pour", swatch: "#bfe9ec" },
    { id: "lineart", name: "라인 아트", scheme: "light", material: "ink", swatch: "#fdfcf8" },
    // scheme "auto": follows the system appearance, picking palettes[light|dark]; bar is the theme-color per scheme
    { id: "jewel", name: "보석 컷", scheme: "auto", material: "jewel", palettes: { light: "jewel-light", dark: "jewel-dark" }, bar: { light: "#f2f1ef", dark: "#070709" }, swatch: "linear-gradient(135deg, #f2f1ef 50%, #070709 50%)" },
    { id: "chrome", name: "미러 크롬", scheme: "auto", material: "chrome", palettes: { light: "chrome-light", dark: "chrome-dark" }, bar: { light: "#eceef1", dark: "#060607" }, swatch: "linear-gradient(135deg, #eceef1 50%, #060607 50%)" },
    { id: "gel", name: "캔디 젤", scheme: "auto", material: "gel", palettes: { light: "gel-light", dark: "gel-dark" }, bar: { light: "#f5f4f2", dark: "#09090c" }, swatch: "linear-gradient(135deg, #f5f4f2 50%, #09090c 50%)" },
    { id: "holo", name: "홀로그램 포일", scheme: "auto", material: "holo", palettes: { light: "holo-light", dark: "holo-dark" }, bar: { light: "#edeef2", dark: "#08080c" }, swatch: "linear-gradient(135deg, #edeef2 50%, #08080c 50%)" },
    { id: "neon", name: "네온 튜브", scheme: "auto", material: "neon", palettes: { light: "neon-light", dark: "neon-dark" }, bar: { light: "#e9ebef", dark: "#07070a" }, swatch: "linear-gradient(135deg, #e9ebef 50%, #07070a 50%)" },
    { id: "crystal", name: "보석·크리스털", scheme: "auto", material: "crystal", palettes: { light: "crystal-light", dark: "crystal-dark" }, bar: { light: "#f1f0ee", dark: "#070709" }, swatch: "linear-gradient(135deg, #f1f0ee 50%, #070709 50%)" },
    { id: "metal", name: "크롬 메탈", scheme: "auto", material: "metal", palettes: { light: "metal-light", dark: "metal-dark" }, bar: { light: "#eceef1", dark: "#060607" }, swatch: "linear-gradient(135deg, #eceef1 50%, #060607 50%)" },
    { id: "jelly", name: "젤리 캔디", scheme: "auto", material: "jelly", palettes: { light: "jelly-light", dark: "jelly-dark" }, bar: { light: "#f5f4f2", dark: "#09090c" }, swatch: "linear-gradient(135deg, #f5f4f2 50%, #09090c 50%)" },
    { id: "aurora", name: "오로라 유리", scheme: "auto", material: "aurora", palettes: { light: "aurora-light", dark: "aurora-dark" }, bar: { light: "#eef1f5", dark: "#05070b" }, swatch: "linear-gradient(135deg, #eef1f5 50%, #05070b 50%)" },
    { id: "led", name: "LED 도트", scheme: "auto", material: "led", palettes: { light: "led-light", dark: "led-dark" }, bar: { light: "#e9ebef", dark: "#030305" }, swatch: "linear-gradient(135deg, #e9ebef 50%, #030305 50%)" },
    { id: "float", name: "플로팅 글래스", scheme: "auto", material: "float", palettes: { light: "float-light", dark: "float-dark" }, bar: { light: "#eef0f4", dark: "#07080c" }, swatch: "linear-gradient(135deg, #eef0f4 50%, #07080c 50%)" },
    { id: "enamel", name: "칠보 에나멜", scheme: "auto", material: "enamel", palettes: { light: "enamel-light", dark: "enamel-dark" }, bar: { light: "#f1eff0", dark: "#08080b" }, swatch: "linear-gradient(135deg, #f1eff0 50%, #08080b 50%)" },
    { id: "liquid", name: "액체 메탈", scheme: "auto", material: "liquid", palettes: { light: "liquid-light", dark: "liquid-dark" }, bar: { light: "#eceef2", dark: "#050506" }, swatch: "linear-gradient(135deg, #eceef2 50%, #050506 50%)" },
  ];
  // what "자동" picks for each system appearance
  const AUTO = { light: "ceramic", dark: "resin" };
  const KEY = "deck-theme";
  const dark = matchMedia("(prefers-color-scheme: dark)");

  function link(id, href) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("link");
      el.rel = "stylesheet";
      el.id = id;
      document.head.appendChild(el);
    }
    if (el.getAttribute("href") !== href) el.setAttribute("href", href);
  }

  function pref() {
    // ?theme=<id> previews a theme without saving it
    const q = new URLSearchParams(location.search).get("theme");
    if (q && THEMES.some((t) => t.id === q)) return q;
    try {
      const p = localStorage.getItem(KEY);
      return p === "auto" || THEMES.some((t) => t.id === p) ? p : "auto";
    } catch { return "auto"; }
  }

  function resolve(p) {
    const id = p === "auto" ? AUTO[dark.matches ? "dark" : "light"] : p;
    return THEMES.find((t) => t.id === id) ?? THEMES[0];
  }

  function apply(p = pref()) {
    const t = resolve(p);
    const root = document.documentElement;
    const scheme = t.scheme === "auto" ? (dark.matches ? "dark" : "light") : t.scheme;
    const palette = t.palettes ? t.palettes[scheme] : t.id;
    root.dataset.theme = palette;
    root.dataset.material = t.material;
    root.dataset.scheme = scheme;
    link("material-css", `./themes/materials/${t.material}.css`);
    link("theme-css", `./themes/${palette}.css`);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.bar ? t.bar[scheme] : t.swatch);
    return t;
  }

  function choose(p) {
    try { localStorage.setItem(KEY, p); } catch {}
    return apply(p);
  }

  dark.addEventListener?.("change", () => { const p = pref(); if (p === "auto" || resolve(p).scheme === "auto") apply(p); });
  window.DeckThemes = { list: THEMES, auto: AUTO, pref, apply, choose };
  apply();
})();
