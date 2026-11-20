import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const THEMES_DIR = path.join(import.meta.dirname, "../public/themes");
const SRC = fs.readFileSync(path.join(THEMES_DIR, "registry.js"), "utf8");

// registry.js is a browser IIFE; run it against a minimal fake DOM
function load({ darkMode = false, saved = null, search = "" } = {}) {
  const listeners = [];
  const media = { matches: darkMode, addEventListener: (_, fn) => listeners.push(fn) };
  const links = {};
  const meta = { content: "", setAttribute(_, v) { this.content = v; } };
  const root = { dataset: {} };
  const store = saved == null ? {} : { "deck-theme": saved };
  const document = {
    documentElement: root,
    head: { appendChild: (el) => { links[el.id] = el; } },
    getElementById: (id) => links[id] ?? null,
    createElement: () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] ?? null; } }),
    querySelector: () => meta,
  };
  const window = {};
  vm.runInNewContext(SRC, {
    window, document, location: { search }, URLSearchParams,
    matchMedia: () => media,
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
  });
  const href = (id) => links[id].getAttribute("href");
  const flip = (dark) => { media.matches = dark; listeners.forEach((fn) => fn()); };
  return { api: window.DeckThemes, root, meta, href, flip };
}

test("an auto-scheme theme picks the palette for the system appearance", () => {
  const { root, meta, href } = load({ saved: "jewel", darkMode: true });
  assert.equal(root.dataset.theme, "jewel-dark");
  assert.equal(root.dataset.scheme, "dark");
  assert.equal(root.dataset.material, "jewel");
  assert.equal(href("theme-css"), "./themes/jewel-dark.css");
  assert.equal(href("material-css"), "./themes/materials/jewel.css");
  assert.equal(meta.content, "#070709");
});

test("an auto-scheme theme follows a live appearance change", () => {
  const { root, href, flip } = load({ saved: "gel", darkMode: false });
  assert.equal(root.dataset.theme, "gel-light");
  flip(true);
  assert.equal(root.dataset.theme, "gel-dark");
  assert.equal(root.dataset.scheme, "dark");
  assert.equal(href("theme-css"), "./themes/gel-dark.css");
});

test("a fixed-scheme theme ignores the appearance change", () => {
  const { root, flip } = load({ saved: "ceramic", darkMode: false });
  flip(true);
  assert.equal(root.dataset.theme, "ceramic");
  assert.equal(root.dataset.scheme, "light");
});

test("?theme= previews an auto-scheme theme", () => {
  const { root } = load({ search: "?theme=aurora", darkMode: true });
  assert.equal(root.dataset.theme, "aurora-dark");
});

test("every registered theme has its material and palette files", () => {
  const { api } = load();
  for (const t of api.list) {
    assert.ok(fs.existsSync(path.join(THEMES_DIR, "materials", `${t.material}.css`)), `${t.id}: material ${t.material}`);
    const palettes = t.scheme === "auto" ? [t.palettes.light, t.palettes.dark] : [t.id];
    for (const p of palettes) {
      const css = fs.readFileSync(path.join(THEMES_DIR, `${p}.css`), "utf8");
      assert.match(css, new RegExp(`:root\\[data-theme="${p}"\\]`), `${t.id}: palette ${p}`);
    }
    if (t.scheme === "auto") assert.ok(t.bar?.light && t.bar?.dark, `${t.id}: bar colours`);
  }
});

test("an auto-scheme theme updates the theme-color when the appearance flips", () => {
  const { meta, flip } = load({ saved: "jewel", darkMode: false });
  assert.equal(meta.content, "#f2f1ef");
  flip(true);
  assert.equal(meta.content, "#070709");
});

test("every asset a theme stylesheet refers to exists", () => {
  const files = [...fs.readdirSync(THEMES_DIR).map((f) => path.join(THEMES_DIR, f)), ...fs.readdirSync(path.join(THEMES_DIR, "materials")).map((f) => path.join(THEMES_DIR, "materials", f))]
    .filter((f) => f.endsWith(".css"));
  for (const f of files) {
    for (const [, ref] of fs.readFileSync(f, "utf8").matchAll(/url\("\.\.\/\.\.\/assets\/([^"]+)"\)/g)) {
      assert.ok(fs.existsSync(path.join(import.meta.dirname, "../public/assets", ref)), `${path.basename(f)}: ${ref}`);
    }
  }
});
