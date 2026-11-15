// 公式カード検索からカード一覧（コスト・パワー・色・種族・トリガー・収録先・よみがな）を取得し、
// index.html のカードデータを更新するスクリプト
// 使い方:  node update_cards.mjs index.html
// （Node.js 18以上。公式サイトのHTML構造が変わると調整が必要です）
import fs from "node:fs";

const BASE = "https://www.takaratomy.co.jp/products/horobeat-cardgame/cardlist/";
const file = process.argv[2] || "index.html";

const decode = s => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ");
// ルビ（<rt>）を除いてテキスト化
const text = h => decode(h.replace(/<rt>[\s\S]*?<\/rt>/g, "").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

export function parsePage(html) {
  const out = [];
  // よみがな: <script type="application/json">[{"n":"カード名","k":..,"y":"よみ"}, ...]</script>
  const yomi = {};
  const ym = html.match(/<script[^>]*application\/json[^>]*>\s*(\[\{"n"[\s\S]*?\])\s*<\/script>/);
  if (ym) for (const o of JSON.parse(ym[1])) yomi[o.n] = o.y;

  for (const li of html.split(/<li class="hb_card_item">/).slice(1)) {
    const img = li.match(/<button[^>]*>\s*<img[^>]*src="([^"]*\/img\/card\/[^"]+?\.webp)"[^>]*alt="([^"]*)"/);
    if (!img) continue;
    const id = img[1].split("/").pop().replace(".webp", "");
    const name = decode(img[2]).trim();
    const f = {};
    const re = /<div class="hb_cardlist_detail_item">\s*<dt>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g;
    let m; while ((m = re.exec(li))) f[text(m[1])] = text(m[2]);
    out.push({ id, name, f });
  }
  return { cards: out, yomi };
}

async function fetchPage(p) {
  const res = await fetch(p === 1 ? BASE : `${BASE}?page=${p}`, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`page ${p}: HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const seen = new Set(), rows = [], yomi = {};
  for (let p = 1; p <= 50; p++) {
    const { cards, yomi: y } = parsePage(await fetchPage(p));
    Object.assign(yomi, y);
    const got = cards.filter(c => !seen.has(c.id));
    if (!got.length) break;
    got.forEach(c => { seen.add(c.id); rows.push(c); });
    console.error(`page ${p}: +${got.length}`);
  }
  if (!rows.length) throw new Error("カードが取得できませんでした（サイト構造が変わった可能性があります）");

  const lines = rows.map(({ id, name, f }) => [id, name, f["カードタイプ"], f["色"], f["コスト"], f["パワー"], f["ブースト"],
    f["種族"], f["キーワード能力"], f["トリガー"], f["収録先"], yomi[name]].map(s => (s || "").replace(/[|\n`]/g, " ")).join("|"));

  const html = fs.readFileSync(file, "utf8");
  const next = html.replace(/\/\*CARDS_BEGIN\*\/[\s\S]*?\/\*CARDS_END\*\//, `/*CARDS_BEGIN*/\n${lines.join("\n")}\n/*CARDS_END*/`);
  fs.writeFileSync(file, next);
  console.error(`${lines.length}件で ${file} を更新しました`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.message); process.exit(1); });
