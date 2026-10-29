/**
 * 取扱会社の読み（AgencyReading）を CSV からまとめて入れる（2026-10-26）。判定は src/lib/agencyReadingImport.ts。
 *
 * 入力CSVの列：取扱会社名（または agencyName）と 読み（または reading）。ほかの列は読まない。
 * 未登録の会社には入れ、推定のままの読みは置き換える。人が管理画面で直した読みは上書きしない。
 * 入れた読みは推定の印（estimated）を付けたままにする。管理画面「推定のまま」で確かめて直す。
 * 本番DBに書き込むので、本番ではAIは実行しない（CLAUDE.md D-15）。大野が実行する。
 *
 * 使い方（リポジトリ直下で）:
 *   set -a; . ./.env.renoel-renewal; set +a
 *   node --experimental-strip-types scripts/import-agency-readings.mjs <CSV>                          → 数えるだけ
 *   node --experimental-strip-types scripts/import-agency-readings.mjs <CSV> --execute --expect <件数> → 書く（控えをCSVの隣に保存）
 *   node --experimental-strip-types scripts/import-agency-readings.mjs --restore <控え.json>            → 書く前に戻す
 *
 * 件数は「新しく入れる」と「置き換える」の合計。同じCSVで再実行しても、2回目は「同じ読み」になり何も書かない（冪等）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PrismaClient } from "../src/generated/client/index.js";
import { parseCsv } from "../src/lib/csv.ts";
import { planReadingImport } from "../src/lib/agencyReadingImport.ts";

const args = process.argv.slice(2);
const prisma = new PrismaClient();
try {
  if (args[0] === "--restore") await restore(args[1]);
  else await importReadings(args);
} finally {
  await prisma.$disconnect();
}

async function importReadings(argv) {
  const [csvPath] = argv;
  const execute = argv.includes("--execute");
  const expectIndex = argv.indexOf("--expect");
  const expected = expectIndex >= 0 ? Number(argv[expectIndex + 1]) : null;
  if (!csvPath || (execute && !Number.isInteger(expected))) {
    console.error("使い方: node --experimental-strip-types scripts/import-agency-readings.mjs <CSV> [--execute --expect <件数>]");
    process.exit(1);
  }

  const rows = parseCsv(readFileSync(csvPath, "utf8").replace(/^﻿/, ""));
  const [groups, readings] = await Promise.all([
    prisma.property.groupBy({ by: ["agencyName"] }),
    prisma.agencyReading.findMany(),
  ]);
  const plan = planReadingImport(rows, {
    knownNames: new Set(groups.map((g) => (g.agencyName ?? "").trim()).filter(Boolean)),
    current: new Map(readings.map((r) => [r.agencyName, { reading: r.reading, estimated: r.estimated }])),
  });
  const total = plan.create.length + plan.replace.length;

  console.log(`CSV ${rows.length}行`);
  console.log(`  新しく入れる：${plan.create.length}社`);
  for (const c of plan.create) console.log(`    ${c.agencyName} → ${c.reading}`);
  console.log(`  推定のままの読みを置き換える：${plan.replace.length}社`);
  for (const r of plan.replace) console.log(`    ${r.agencyName}：${r.before} → ${r.reading}`);
  console.log(`  同じ読みが入っている：${plan.same.length}社`);
  console.log(`  人が直した読みと違う（書かない）：${plan.confirmedDiffers.length}社`);
  for (const d of plan.confirmedDiffers) console.log(`    ${d.agencyName}：今 ${d.current} / CSV ${d.incoming}`);
  console.log(`  物件に無い会社名（書かない）：${plan.unknown.length}社 ${plan.unknown.join("、")}`);
  console.log(`  読みとして受け付けない（書かない）：${plan.invalid.length}行`);
  for (const i of plan.invalid) console.log(`    ${i.agencyName}：${i.reading}`);

  if (!execute) {
    console.log(`\n数えただけです。書くときは --execute --expect ${total} を付けて実行してください。`);
    return;
  }
  if (expected !== total) {
    console.error(`想定件数 ${expected} と書く件数 ${total}社が一致しないため、中止しました。`);
    process.exit(1);
  }

  const backupPath = join(dirname(csvPath), `_読み登録_控え_${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}.json`);
  writeFileSync(backupPath, JSON.stringify({ created: plan.create, replaced: plan.replace }, null, 2));
  await prisma.$transaction(async (tx) => {
    await tx.agencyReading.createMany({
      data: plan.create.map((c) => ({ agencyName: c.agencyName, reading: c.reading, estimated: true })),
      skipDuplicates: true,
    });
    for (const r of plan.replace) {
      // 確認のあとで人が直していたら上書きしない（推定のまま・確認時の読みのときだけ書く）
      await tx.agencyReading.updateMany({
        where: { agencyName: r.agencyName, reading: r.before, estimated: true },
        data: { reading: r.reading },
      });
    }
  }, { timeout: 120_000 });
  console.log(`書きました（${total}社）。戻すときは --restore ${backupPath}`);
}

/** 控えに従って戻す。書いたときの読みのまま（推定の印付き）の行だけを戻す。そのあと人が直した読みは触らない。 */
async function restore(backupPath) {
  const { created, replaced } = JSON.parse(readFileSync(backupPath, "utf8"));
  let removed = 0;
  let reverted = 0;
  await prisma.$transaction(async (tx) => {
    for (const c of created) {
      removed += (await tx.agencyReading.deleteMany({ where: { agencyName: c.agencyName, reading: c.reading, estimated: true } })).count;
    }
    for (const r of replaced) {
      reverted += (
        await tx.agencyReading.updateMany({
          where: { agencyName: r.agencyName, reading: r.reading, estimated: true },
          data: { reading: r.before },
        })
      ).count;
    }
  }, { timeout: 120_000 });
  console.log(`戻しました：入れた読みを消す ${removed}社・置き換えた読みを戻す ${reverted}社（控え ${created.length + replaced.length}社のうち、書いたときの値のままのものだけ）`);
}
