/**
 * 取扱会社の「会社情報の保存」「統合」を、控え（PropertyImportBackup）から戻す（2026-10-22）。
 *
 * 控え番号は画面の完了メッセージ（「控え番号 N」）に出る。
 * 操作のあとに人が直した物件は上書きせず飛ばす（判定は src/lib/agencyRestore.ts）。
 * 本番DBに書き込むので、本番ではAIは実行しない（CLAUDE.md D-15）。大野が実行する。
 *
 * 使い方（リポジトリ直下で）:
 *   set -a; . ./.env.renoel-renewal; set +a
 *   node --experimental-strip-types scripts/restore-agency-backup.mjs <控え番号>                         → 数えるだけ
 *   node --experimental-strip-types scripts/restore-agency-backup.mjs <控え番号> --execute --expect <件数> → 戻す
 *
 * 戻したあとに同じ控えでもう一度実行しても、物件は「操作の直後の値」ではなくなっているので書き換えない（冪等）。
 */
import { PrismaClient } from "../src/generated/client/index.js";
import { planAgencyRestore } from "../src/lib/agencyRestore.ts";

const args = process.argv.slice(2);
const backupId = Number(args[0]);
const execute = args.includes("--execute");
const expectIndex = args.indexOf("--expect");
const expected = expectIndex >= 0 ? Number(args[expectIndex + 1]) : null;
if (!Number.isInteger(backupId) || backupId <= 0 || (execute && !Number.isInteger(expected))) {
  console.error("使い方: node --experimental-strip-types scripts/restore-agency-backup.mjs <控え番号> [--execute --expect <件数>]");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const record = await prisma.propertyImportBackup.findUnique({ where: { id: backupId } });
  const backup = record?.before;
  if (!backup || (backup.kind !== "agencySave" && backup.kind !== "agencyMerge")) {
    console.error(`控え ${backupId} は取扱会社の保存・統合の控えではありません。`);
    process.exit(1);
  }

  const written = backup.kind === "agencySave" ? backup.written : { agencyName: backup.target };
  const current = await prisma.property.findMany({
    where: { id: { in: backup.rows.map((r) => r.id) } },
    select: { id: true, agencyName: true, agencyAddress: true, agencyTel: true, agencyLicense: true },
  });
  const plan = planAgencyRestore(backup.rows, written, current);

  console.log(`控え ${backupId}（${backup.kind === "agencySave" ? `会社情報の保存：${backup.agencyName}` : `統合：${backup.sources.join("、")} → ${backup.target}`}）`);
  console.log(`  作成 ${record.importedAt.toISOString()} / 実行者 ${record.importedBy}`);
  console.log(`  戻す物件：${plan.restore.length}件`);
  console.log(`  操作のあとに値が変わっているため飛ばす物件：${plan.changedSince.length}件 ${plan.changedSince.join(",")}`);
  console.log(`  削除されていて戻せない物件：${plan.missing.length}件 ${plan.missing.join(",")}`);
  if (backup.kind === "agencySave") {
    console.log(`  会社情報：${backup.agencyBefore ? "保存前の内容に戻す" : "保存前は未登録だったので消す"}`);
  } else {
    console.log(`  旧表記・読み・会社情報：統合前の状態に戻す（統合元${backup.sources.length}社）`);
  }

  if (!execute) {
    console.log(`\n数えただけです。戻すときは --execute --expect ${plan.restore.length} を付けて実行してください。`);
    process.exit(0);
  }
  if (expected !== plan.restore.length) {
    console.error(`想定件数 ${expected} と戻す物件 ${plan.restore.length}件が一致しないため、中止しました。`);
    process.exit(1);
  }

  await prisma.$transaction(async (tx) => {
    for (const row of plan.restore) {
      const { id, ...cols } = row;
      await tx.property.update({ where: { id }, data: cols });
    }
    if (backup.kind === "agencySave") await restoreAgencySave(tx, backup);
    else await restoreAgencyMerge(tx, backup);
  }, { timeout: 60_000 });
  console.log(`戻しました（物件${plan.restore.length}件）。`);
} finally {
  await prisma.$disconnect();
}

/** 会社情報を保存前に戻す。保存前に未登録だった会社は台帳から消す。 */
async function restoreAgencySave(tx, backup) {
  if (!backup.agencyBefore) {
    await tx.agency.deleteMany({ where: { name: backup.agencyName } });
    return;
  }
  const { name, createdAt, updatedAt, ...info } = backup.agencyBefore;
  await tx.agency.upsert({ where: { name }, create: { name, createdAt, updatedAt, ...info }, update: info });
}

/** 旧表記・読み・会社情報を統合前に戻す（統合先が引き継いだ読み・会社情報は外す）。 */
async function restoreAgencyMerge(tx, backup) {
  await tx.agencyAlias.deleteMany({ where: { alias: { in: backup.sources } } });
  for (const a of backup.aliases) {
    await tx.agencyAlias.upsert({
      where: { alias: a.alias },
      create: { alias: a.alias, agencyName: a.agencyName, createdAt: a.createdAt },
      update: { agencyName: a.agencyName },
    });
  }
  if (!backup.targetHadReading && backup.readings.length > 0) {
    await tx.agencyReading.deleteMany({ where: { agencyName: backup.target } });
  }
  await tx.agencyReading.createMany({ data: backup.readings, skipDuplicates: true });
  if (!backup.targetHadAgency && backup.agencies.length > 0) {
    await tx.agency.deleteMany({ where: { name: backup.target } });
  }
  await tx.agency.createMany({ data: backup.agencies, skipDuplicates: true });
}
