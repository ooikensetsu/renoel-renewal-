import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * IPA 5-(i)：ウェブページに出力する全ての要素に対して、エスケープ処理を施す。
 * docs/inspections.md 2026-09-03 の指摘4。
 *
 * 【何を守っているか】
 * `page.tsx` は確定版のHTML（約600行）を `dangerouslySetInnerHTML` でそのまま埋め込んでいる。
 * この中では React のエスケープが効かない。**外部由来の値をここへ1つ入れた時点で XSS になる。**
 *
 * 2026-09-03 の監査では埋め込む変数を全て追跡し、いずれも設定ファイルの定数と
 * 固定パスであることを確認した。ただし「今そうである」ことは、次に触る人には伝わらない。
 * そこで、埋め込んでよい式を下の許可リストに固定し、機械で確かめられるようにする。
 *
 * 【このテストが落ちたら】
 * 追加した式が外部由来の値（物件名・会員名・URLパラメータ・DBの値）でないかを確かめる。
 * 外部由来なら **許可リストへ足さない。** JSX 側へ出す（React が自動でエスケープする）か、
 * `page.tsx` の該当箇所を JSX へ分解する。
 * 定数であることが確実なときだけ、理由を1行添えて許可リストへ足す。
 */

const HOME_PAGE = new URL("./page.tsx", import.meta.url);

/**
 * `page.tsx` の中で `${...}` に書いてよい式。
 * ここにあるものは全て、外部からの入力を含まないと確認済み。
 *   - COMPANY.*        … src/config/company.ts の定数（社名・電話・リンク）
 *   - signInPath(...)  … src/lib/authPaths.ts が組み立てる自サイト内の固定パス
 */
const ALLOWED_EXPRESSIONS = [
  /^COMPANY\.[A-Za-z]+$/,
  /^COMPANY\.[A-Za-z]+\.replace\("[^"]*", "[^"]*"\)$/,
  /^signInPath\(AFTER_LOGIN_PATH\)$/,
];

/** `${ ... }` を1つずつ取り出す。入れ子の `{` を含む式は捕らえきれないため別に検査する。 */
function interpolations(source: string): string[] {
  return [...source.matchAll(/\$\{([^{}]*)\}/g)].map((m) => m[1]!.trim());
}

test("トップページに埋め込む式は、許可リストのものだけである", () => {
  const source = readFileSync(HOME_PAGE, "utf8");
  const found = interpolations(source);

  // 式が1つも取れないときは、正規表現かファイルの形が変わっている（検査が空振りする）
  assert.ok(found.length > 0, "埋め込み式が1つも見つからない。この検査自体が壊れている");

  const notAllowed = [...new Set(found)].filter(
    (expr) => !ALLOWED_EXPRESSIONS.some((re) => re.test(expr))
  );

  assert.deepEqual(
    notAllowed,
    [],
    `許可リストにない式が埋め込まれている: ${JSON.stringify(notAllowed)}\n` +
      "外部由来の値なら許可リストへ足さず、JSX 側へ出すこと（このファイルの先頭を読む）"
  );
});

test("入れ子の式は使わない（許可リストの検査をすり抜けるため）", () => {
  const source = readFileSync(HOME_PAGE, "utf8");
  // `${` のあとに `}` より先に `{` が来る形。テンプレートリテラルの入れ子など
  assert.equal(
    source.match(/\$\{[^}]*\{/g)?.length ?? 0,
    0,
    "入れ子の ${...{...}...} がある。上の検査が式を取りこぼすため、分解すること"
  );
});

test("許可リストは、実際に使われている式を全て通す", () => {
  // 許可リスト側の書き間違いで検査がゆるくなっていないかを、既知の式で確かめる
  const known = [
    "COMPANY.brandName",
    "COMPANY.legalName",
    'COMPANY.legalName.replace("株式会社", "")',
    "COMPANY.tel",
    "COMPANY.telLink",
    "signInPath(AFTER_LOGIN_PATH)",
  ];
  for (const expr of known) {
    assert.ok(
      ALLOWED_EXPRESSIONS.some((re) => re.test(expr)),
      `許可リストが ${expr} を通していない`
    );
  }
  // 外部由来の値は必ず落とすこと
  for (const expr of ["property.title", "user.name", "searchParams.q", "COMPANY.tel + evil"]) {
    assert.ok(
      !ALLOWED_EXPRESSIONS.some((re) => re.test(expr)),
      `許可リストが ${expr} を通してしまう`
    );
  }
});
