/**
 * 取扱会社名の読みを辞書（kuromoji）で推定し、読みが未登録の会社にだけ入れる（2026-10-19）。
 *
 * 物件確認依頼書を50音順に並べるための読みの初期値。推定の印（estimated）を付けて入れるので、
 * 管理画面 /admin/agency-readings の「推定のまま」で確かめて直す。
 * 登録済みの読み（推定のままのものも含む）は書き換えない。新しい取扱会社が増えたら再実行してよい。
 * 辞書に無い漢字（髙・﨑 など）が残る会社は入れない（未登録のまま。管理画面で入れる）。
 *
 * 本番DBに書き込むので、AIは実行しない（CLAUDE.md D-15）。大野が実行する。
 *
 * 使い方（リポジトリ直下で）:
 *   set -a; . ./.env.renoel-renewal; set +a
 *   node --experimental-strip-types scripts/estimate-agency-readings.mjs <控えの保存先フォルダ>
 *       → 数えるだけ。入れる予定の読みを <保存先>/読みの推定.csv に書く
 *   node --experimental-strip-types scripts/estimate-agency-readings.mjs <控えの保存先フォルダ> --execute --expect <件数>
 *       → 入れる
 *
 * D-17：
 *   1. 数える … 未登録の会社数・推定できた数・できなかった数を出す
 *   2. 控え   … 入れる内容を CSV に残す（追加だけで既存の行は変えないため、変更前の控えは要らない）
 *   3. 確認   … --expect が推定できた数と一致しなければ入れない
 * 戻し方：DELETE FROM "AgencyReading" WHERE "estimated" = true AND "agencyName" IN (CSV の会社名);
 *        何度実行しても同じ会社に二重には入らない（会社名が主キー・skipDuplicates）。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import kuromoji from "kuromoji";
import { PrismaClient } from "../src/generated/client/index.js";
import { isBlankMark } from "../src/lib/blank.ts";
import { isValidReading, readingFromTokens, stripCorporateForm } from "../src/lib/agencyReading.ts";
import { buildCsv } from "../src/lib/csv.ts";

const args = process.argv.slice(2);
const outDir = args[0] && !args[0].startsWith("--") ? args[0] : undefined;
const execute = args.includes("--execute");
const expectIndex = args.indexOf("--expect");
const expected = expectIndex >= 0 ? Number(args[expectIndex + 1]) : null;
if (!outDir) {
  console.error("使い方: node --experimental-strip-types scripts/estimate-agency-readings.mjs <控えの保存先フォルダ> [--execute --expect <件数>]");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("環境変数 DATABASE_URL が読めません（set -a; . ./.env.renoel-renewal; set +a を先に）");
  process.exit(1);
}

const tokenizer = await new Promise((resolve, reject) =>
  kuromoji
    .builder({ dicPath: new URL("../node_modules/kuromoji/dict/", import.meta.url).pathname })
    .build((err, built) => (err ? reject(err) : resolve(built)))
);

const prisma = new PrismaClient();
try {
  // ---------- 1. 数える ----------
  const agencies = await prisma.property.groupBy({ by: ["agencyName"] });
  const registered = new Set((await prisma.agencyReading.findMany({ select: { agencyName: true } })).map((r) => r.agencyName));
  const names = [
    ...new Set(agencies.map((a) => (a.agencyName ?? "").trim()).filter((n) => n !== "" && !isBlankMark(n))),
  ].filter((n) => !registered.has(n));

  const rows = names.map((agencyName) => {
    const reading = readingFromTokens(tokenizer.tokenize(stripCorporateForm(agencyName)));
    return { agencyName, reading, ok: reading !== "" && isValidReading(reading) };
  });
  const estimated = rows.filter((r) => r.ok);
  const failed = rows.filter((r) => !r.ok);

  mkdirSync(outDir, { recursive: true });
  const csvPath = join(outDir, "読みの推定.csv");
  writeFileSync(
    csvPath,
    "\uFEFF" +
      buildCsv(
        ["取扱会社名", "推定した読み", "入れるか"],
        rows.map((r) => [r.agencyName, r.reading, r.ok ? "入れる" : "入れない（辞書に無い字が残った）"])
      ) +
      "\r\n"
  );
  console.log(`登録済みの会社：${registered.size}社`);
  console.log(`読みが未登録の会社：${rows.length}社（推定できた ${estimated.length}社・できなかった ${failed.length}社）`);
  console.log(`一覧：${csvPath}`);
  for (const r of failed) console.log(`  入れない：${r.agencyName} → ${r.reading}`);

  if (!execute) {
    console.log(`\n入れるときは --execute --expect ${estimated.length} を付けて再実行してください。`);
  } else if (expected !== estimated.length) {
    console.error(`\n--expect（${expected}）が推定できた数（${estimated.length}）と合わないため、入れませんでした。`);
    process.exitCode = 1;
  } else {
    // ---------- 2. 入れる（既存の行は skipDuplicates で触らない） ----------
    const result = await prisma.agencyReading.createMany({
      data: estimated.map((r) => ({ agencyName: r.agencyName, reading: r.reading, estimated: true })),
      skipDuplicates: true,
    });
    console.log(`\n${result.count}社の読みを推定の印付きで入れました。管理画面「取扱会社の読み」の「推定のまま」で確かめてください。`);
  }
} finally {
  await prisma.$disconnect();
}
