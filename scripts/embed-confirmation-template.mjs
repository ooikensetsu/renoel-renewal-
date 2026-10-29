// 物件確認依頼書の様式（xlsx）を、管理画面のコードから読める base64 の文字列にする。
// 様式を差し替えたら、このスクリプトを流して src/lib/confirmationTemplate.ts を作り直す。
//   node scripts/embed-confirmation-template.mjs [様式の xlsx]
//
// 原本の xlsx はリポジトリに入れない（.gitignore の *.xlsx。O-08）。埋め込んだ文字列が正本になる。
// 様式を作った人の手元のフォルダ名（C:\Users\…）が xlsx に入っているため、埋め込む前に消す
// （リポジトリは public）。原本と食い違っていないかは confirmationRequestXlsx.test.ts で確かめる。
import { readFileSync, writeFileSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const source = process.argv[2] ?? "src/templates/property-confirmation-request.xlsx";
const target = "src/lib/confirmationTemplate.ts";

const files = unzipSync(readFileSync(source));
const workbook = strFromU8(files["xl/workbook.xml"]).replace(/<mc:AlternateContent[\s\S]*?<\/mc:AlternateContent>/, "");
if (/absPath|C:\\Users/.test(workbook)) throw new Error("フォルダ名を消せませんでした");
files["xl/workbook.xml"] = strToU8(workbook);
const base64 = Buffer.from(zipSync(files, { level: 9 })).toString("base64");
const lines = base64.match(/.{1,100}/g).map((l) => `  "${l}",`).join("\n");

writeFileSync(
  target,
  `// このファイルは scripts/embed-confirmation-template.mjs が作る。手で直さない。
// 元：モリシタハウスから受け取った物件確認依頼書の様式（物件確認依頼_モリシタハウス.xlsx・2026-10-15）

const TEMPLATE_BASE64 = [
${lines}
].join("");

/** 物件確認依頼書の様式（xlsx のバイト列） */
export function confirmationTemplate(): Uint8Array {
  return Uint8Array.from(atob(TEMPLATE_BASE64), (c) => c.charCodeAt(0));
}
`
);
console.log(`${target} を作りました（${base64.length} 文字）`);
