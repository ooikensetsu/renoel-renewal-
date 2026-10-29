/**
 * 取扱会社の台帳（Agency）へFAX番号をまとめて入れる（2026-10-22）。判定は src/lib/agencyFax.ts。
 *
 * 入力CSVの列：agencyName（または 取扱会社名）と fax（または agencyFax）。
 *   - athome 画像の文字認識で作った候補一覧（人が確かめ、違う行を消したもの）
 *   - athome 取得ツールの 物件インポート.csv（2026-10-22 から agencyFax 列が付く）
 * 人が台帳に入れたFAXは上書きしない。物件のデータには触らない（FAXは物件へ反映しない項目）。
 * 本番DBに書き込むので、本番ではAIは実行しない（CLAUDE.md D-15）。大野が実行する。
 *
 * 使い方（リポジトリ直下で）:
 *   set -a; . ./.env.renoel-renewal; set +a
 *   node --experimental-strip-types scripts/import-agency-fax.mjs <CSV>                          → 数えるだけ
 *   node --experimental-strip-types scripts/import-agency-fax.mjs <CSV> --execute --expect <件数> → 書く（控えをCSVの隣に保存）
 *   node --experimental-strip-types scripts/import-agency-fax.mjs --restore <控え.json>            → 書く前に戻す
 *
 * 同じCSVで再実行しても、2回目は「同じFAXが入っている」になり何も書かない（冪等）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PrismaClient } from "../src/generated/client/index.js";
import { parseCsv } from "../src/lib/csv.ts";
import { agencyNameOf } from "../src/lib/agencyMaster.ts";
import { planFaxImport } from "../src/lib/agencyFax.ts";

const args = process.argv.slice(2);
const prisma = new PrismaClient();
try {
  if (args[0] === "--restore") await restore(args[1]);
  else await importFax(args);
} finally {
  await prisma.$disconnect();
}

async function importFax(argv) {
  const [csvPath] = argv;
  const execute = argv.includes("--execute");
  const expectIndex = argv.indexOf("--expect");
  const expected = expectIndex >= 0 ? Number(argv[expectIndex + 1]) : null;
  if (!csvPath || (execute && !Number.isInteger(expected))) {
    console.error("使い方: node --experimental-strip-types scripts/import-agency-fax.mjs <CSV> [--execute --expect <件数>]");
    process.exit(1);
  }

  const rows = parseCsv(readFileSync(csvPath, "utf8").replace(/^﻿/, ""));
  const [groups, agencies, aliases] = await Promise.all([
    prisma.property.groupBy({ by: ["agencyName"] }),
    prisma.agency.findMany({ select: { name: true, fax: true } }),
    prisma.agencyAlias.findMany(),
  ]);
  const knownNames = new Set([...groups.map((g) => agencyNameOf(g.agencyName)).filter(Boolean), ...agencies.map((a) => a.name)]);
  const plan = planFaxImport(rows, {
    aliases: new Map(aliases.map((a) => [a.alias, a.agencyName])),
    knownNames,
    currentFax: new Map(agencies.map((a) => [a.name, a.fax])),
  });

  console.log(`CSV ${rows.length}行`);
  console.log(`  台帳へ入れる：${plan.write.length}社（うち台帳を新しく作る ${plan.write.filter((w) => w.createAgency).length}社）`);
  console.log(`  同じFAXが入っている：${plan.same.length}社`);
  console.log(`  別のFAXが入っている（書かない）：${plan.differs.length}社`);
  for (const d of plan.differs) console.log(`    ${d.agencyName}：台帳 ${d.current} / CSV ${d.incoming}`);
  console.log(`  同じ会社に違うFAXがある（書かない）：${plan.conflicting.length}社`);
  for (const c of plan.conflicting) console.log(`    ${c.agencyName}：${c.faxes.join(" / ")}`);
  console.log(`  取扱会社に見つからない：${plan.unknown.length}社 ${plan.unknown.slice(0, 20).join("、")}${plan.unknown.length > 20 ? " ほか" : ""}`);
  console.log(`  全角半角・空白の違いだけで一致：${plan.matchedLoosely.length}社（上の「台帳へ入れる」に含む）`);
  for (const m of plan.matchedLoosely) console.log(`    ${m.csvName} → ${m.agencyName}`);
  console.log(`  2社以上に当たる（書かない）：${plan.ambiguous.length}社`);
  for (const a of plan.ambiguous) console.log(`    ${a.csvName}：${a.candidates.join(" / ")}`);
  console.log(`  FAXの形が読めない：${plan.invalid.length}行`);
  for (const i of plan.invalid) console.log(`    ${i.agencyName}：${i.fax}`);

  if (!execute) {
    console.log(`\n数えただけです。書くときは --execute --expect ${plan.write.length} を付けて実行してください。`);
    return;
  }
  if (expected !== plan.write.length) {
    console.error(`想定件数 ${expected} と入れる件数 ${plan.write.length}社が一致しないため、中止しました。`);
    process.exit(1);
  }

  const backupPath = join(dirname(csvPath), `_FAX登録_控え_${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}.json`);
  writeFileSync(backupPath, JSON.stringify({ written: plan.write }, null, 2));
  await prisma.$transaction(async (tx) => {
    for (const w of plan.write) {
      if (w.createAgency) await tx.agency.create({ data: { name: w.agencyName, fax: w.fax } });
      // 確認のあとで人が入れていたら上書きしない（fax が空のときだけ書く）
      else await tx.agency.updateMany({ where: { name: w.agencyName, fax: null }, data: { fax: w.fax } });
    }
  }, { timeout: 120_000 });
  console.log(`書きました（${plan.write.length}社）。戻すときは --restore ${backupPath}`);
}

/**
 * 控えに従って戻す。書いたときのFAXのままの台帳だけを戻す（そのあと人が直したFAXは触らない）。
 * 新しく作った台帳は、FAX以外が空のままなら消す。それ以外はFAXを空に戻す。
 */
async function restore(backupPath) {
  const { written } = JSON.parse(readFileSync(backupPath, "utf8"));
  let removed = 0;
  let cleared = 0;
  await prisma.$transaction(async (tx) => {
    for (const w of written) {
      const blankOtherwise = { address: null, tel: null, license: null, contactName: null, contactEmail: null, memo: null };
      if (w.createAgency) {
        removed += (await tx.agency.deleteMany({ where: { name: w.agencyName, fax: w.fax, ...blankOtherwise } })).count;
      }
      cleared += (await tx.agency.updateMany({ where: { name: w.agencyName, fax: w.fax }, data: { fax: null } })).count;
    }
  }, { timeout: 120_000 });
  console.log(`戻しました：作った台帳を消す ${removed}社・FAXを空に戻す ${cleared}社（控え ${written.length}社のうち、書いたときの値のままのものだけ）`);
}
