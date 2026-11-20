// A small Markdown renderer for agent answers on the long-press card. Everything is escaped first,
// so the only tags that reach the page are the ones built here. Links open only for http(s).
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function fmt(t) {
    return t
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1") // local file links mean nothing on the iPad
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?!\w)/g, "$1<em>$2</em>")
      .replace(/~~(.+?)~~/g, "<del>$1</del>");
  }
  // code spans are set aside first so their text stays literal, yet bold can still wrap them
  function inline(s) {
    const codes = [];
    const held = String(s).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
    return fmt(esc(held)).replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${esc(codes[n])}</code>`);
  }

  const FENCE = /^\s*(```|~~~)/;
  const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  const HEAD = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
  const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
  const QUOTE = /^\s*>\s?/;
  const SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
  const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const isTable = (lines, i) => lines[i].includes("|") && i + 1 < lines.length && SEP.test(lines[i + 1]);
  const startsBlock = (lines, i) => FENCE.test(lines[i]) || HEAD.test(lines[i]) || RULE.test(lines[i]) || QUOTE.test(lines[i]) || ITEM.test(lines[i]) || isTable(lines, i);

  function list(items) {
    const stack = [];
    let html = "";
    for (const it of items) {
      while (stack.length && it.indent < stack.at(-1).indent) html += `</li></${stack.pop().tag}>`;
      if (!stack.length || it.indent > stack.at(-1).indent) {
        const tag = it.ordered ? "ol" : "ul";
        stack.push({ indent: it.indent, tag });
        html += `<${tag}><li>`;
      } else html += "</li><li>";
      html += inline(it.text);
    }
    while (stack.length) html += `</li></${stack.pop().tag}>`;
    return html;
  }

  function render(src) {
    const lines = String(src ?? "").replace(/\r/g, "").split("\n");
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      let m;
      if (!l.trim()) { i++; continue; }
      if (FENCE.test(l)) {
        const buf = [];
        i++;
        while (i < lines.length && !FENCE.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
      } else if ((m = l.match(HEAD))) {
        out.push(m[1].length <= 2 ? `<h3>${inline(m[2])}</h3>` : `<h4>${inline(m[2])}</h4>`);
        i++;
      } else if (RULE.test(l)) {
        out.push("<hr>");
        i++;
      } else if (isTable(lines, i)) {
        const head = cells(l);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
        out.push(`<div class="md-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      } else if (QUOTE.test(l)) {
        const buf = [];
        while (i < lines.length && QUOTE.test(lines[i])) buf.push(lines[i++].replace(QUOTE, ""));
        out.push(`<blockquote>${render(buf.join("\n"))}</blockquote>`);
      } else if (ITEM.test(l)) {
        const items = [];
        while (i < lines.length) {
          const it = lines[i].match(ITEM);
          if (it) { items.push({ indent: it[1].length, ordered: /\d/.test(it[2]), text: it[3] }); i++; continue; }
          if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) { items.at(-1).text += ` ${lines[i].trim()}`; i++; continue; }
          // a blank line between items keeps the list going
          if (!lines[i].trim() && i + 1 < lines.length && ITEM.test(lines[i + 1])) { i++; continue; }
          break;
        }
        out.push(list(items));
      } else {
        const buf = [];
        while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) buf.push(lines[i++].trim());
        out.push(`<p>${buf.map(inline).join("<br>")}</p>`);
      }
    }
    return out.join("");
  }

  window.renderMarkdown = render;
})();
