// Lists rules in lazily loaded CSS chunks that repeat a selector from the entry stylesheet with a different value.
// Media contexts are compared loosely: a chunk rule inside @media still overrides an unconditional entry rule on the
// viewports where both apply, so a pair is reported whenever the selector and property match.
// Code splitting moves component CSS after index.css, so such a pair silently flips which declaration wins.
//
//   npm run build && node tools/perf/css-order-check.mjs [dist/client/assets]
// Exits 1 when a conflict exists. Declarations marked !important in the entry sheet are not conflicts.
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2] ?? "dist/client/assets");
// Dev-only and self-contained views never share a page with the game screens.
const ignored = /^(FxPreview|TutorialApp|GameOverviewGuide)-/;

function parse(css) {
  const rules = [];
  const walk = (source, media) => {
    let at = 0;
    while (at < source.length) {
      const open = source.indexOf("{", at); if (open < 0) break;
      const head = source.slice(at, open).trim(); let depth = 1; let end = open + 1;
      while (depth && end < source.length) { if (source[end] === "{") depth += 1; else if (source[end] === "}") depth -= 1; end += 1; }
      const body = source.slice(open + 1, end - 1);
      if (/^@(media|supports|layer|container)/.test(head)) walk(body, `${media} ${head}`.trim());
      else if (!head.startsWith("@")) {
        const props = {};
        for (const declaration of body.split(";")) { const colon = declaration.indexOf(":"); if (colon > 0) props[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim(); }
        for (const selector of head.split(/,(?![^(]*\))/)) rules.push({ media, selector: selector.trim(), props });
      }
      at = end;
    }
  };
  walk(css, "");
  return rules;
}

const files = fs.readdirSync(dir).filter((name) => name.endsWith(".css"));
const entry = files.find((name) => name.startsWith("index-"));
const entryRules = new Map();
for (const rule of parse(fs.readFileSync(path.join(dir, entry), "utf8"))) {
  const list = entryRules.get(rule.selector) ?? []; list.push(rule); entryRules.set(rule.selector, list);
}
const conflicts = [];
for (const file of files.filter((name) => name !== entry && !ignored.test(name))) {
  for (const rule of parse(fs.readFileSync(path.join(dir, file), "utf8"))) {
    for (const base of entryRules.get(rule.selector) ?? []) for (const [prop, value] of Object.entries(rule.props)) {
      if (prop in base.props && base.props[prop] !== value && !base.props[prop].includes("!important")) conflicts.push(`${file}: ${rule.selector} { ${prop} } chunk${rule.media ? ` [${rule.media}]` : ""}=${value.slice(0, 80)} entry${base.media ? ` [${base.media}]` : ""}=${base.props[prop].slice(0, 80)}`);
    }
  }
}
console.log(conflicts.length ? conflicts.join("\n") : "no lazy-chunk CSS overrides of entry rules");
if (conflicts.length) process.exitCode = 1;
