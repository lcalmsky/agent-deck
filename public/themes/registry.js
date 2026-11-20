// Theme registry. Add a theme here and in themes/<id>.css; see themes/README.md for the rules.
// Loaded synchronously in <head> so the saved theme applies before the first paint.
(() => {
  const THEMES = [
    { id: "ceramic", name: "세라믹", scheme: "light", material: "ceramic", swatch: "#f3f1ed" },
    { id: "charcoal", name: "차콜", scheme: "dark", material: "ceramic", swatch: "#3b3b40" },
    { id: "resin", name: "백라이트 레진", scheme: "dark", material: "resin", swatch: "#1d1d22" },
    { id: "edge", name: "미드나잇 엣지", scheme: "dark", material: "edge", swatch: "#131a33" },
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
    root.dataset.theme = t.id;
    root.dataset.material = t.material;
    root.dataset.scheme = t.scheme;
    link("material-css", `./themes/materials/${t.material}.css`);
    link("theme-css", `./themes/${t.id}.css`);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.swatch);
    return t;
  }

  function choose(p) {
    try { localStorage.setItem(KEY, p); } catch {}
    return apply(p);
  }

  dark.addEventListener?.("change", () => { if (pref() === "auto") apply("auto"); });
  window.DeckThemes = { list: THEMES, auto: AUTO, pref, apply, choose };
  apply();
})();
