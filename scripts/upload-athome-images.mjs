/**
 * athome 取得フォルダの画像を Supabase Storage へ上げ、物件に登録する（2026-10-13）。
 * モリシタ版 scripts/upload-athome-images.mjs（6be4d0c）を RENOEL 向けに移植したもの。
 *
 * 管理画面の一括アップロードは1回4MBまでで、ファイル名も掲載会社管理番号で照合するため、
 * 掲載会社管理番号が空の物件（2026-10-13 時点で279件中170件）には使えない。
 * ここでは画像のファイル名「物件管理番号_連番」で物件を引く（物件管理番号は一意なので取り違えない）。
 *
 * 本番DBと Storage に書き込むので、実行は人が行う（CLAUDE.md D-15）。
 *
 * 使い方（リポジトリ直下で）:
 *   set -a; . ./.env.renoel-renewal; set +a
 *   node --experimental-strip-types scripts/upload-athome-images.mjs <まとめフォルダ>
 *       → 数えるだけ（書き込まない）。登録予定の枚数が出る
 *   node --experimental-strip-types scripts/upload-athome-images.mjs <まとめフォルダ> --execute --expect <枚数>
 *       → 実行。--expect が数えた枚数と違えば中止する（D-17）
 *
 * <まとめフォルダ> の下を再帰的に探し、「数字_数字.拡張子」の画像を集める（athome 取得フォルダを複数入れてよい）。
 * 同じファイル名が複数のフォルダにあれば、最初に見つけた1枚だけを使う。
 * 「_」で始まるフォルダ（控え・ログの置き場）は読まない。
 *
 * D-17：実行前に、対象物件の登録済み画像の行を <まとめフォルダ>/_画像登録_控え_<日時>.json に書き出す。
 * D-18：1枚ずつ「Storage に上げる → DBに行を作る」。止まっても、もう一度同じコマンドを流せば
 *       登録済みの枚は飛ばして続きから進む（同じパスへの上書きなので重複しない）。
 *
 * 決めごと（変えるときは src/config/images.ts）:
 *   - 1物件 MAX_IMAGES_PER_PROPERTY 枚まで。連番の若い順に残す
 *   - 長辺 BULK_RESIZE_MAX_PX・JPEG画質 BULK_JPEG_QUALITY に揃える（macOS の sips。GIF・PNG も JPEG にする）
 *   - DB の path は Storage 上の相対パス（バケットは非公開で、表示時に署名付きURLを発行する）
 *   - 管理画面などで人が入れた画像がある物件は、丸ごと触らない（src/lib/imageBulkPlan.ts）
 */
import { readdirSync, statSync, readFileSync, writeFileSync, appendFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PrismaClient } from "../src/generated/client/index.js";
import { planImageUploads } from "../src/lib/imageBulkPlan.ts";
import {
  STORAGE_BUCKET,
  MAX_IMAGES_PER_PROPERTY,
  BULK_RESIZE_MAX_PX,
  BULK_JPEG_QUALITY,
} from "../src/config/images.ts";

const run = promisify(execFile);

/**
 * DBの path を Storage 上のパスにそろえる。src/lib/storage.ts の toStoragePath と同じ規則
 * （あちらは @/ の import を含み素の node から読めないため、ここに同じ判定を置く）。
 */
function toStoragePath(stored) {
  const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
  const i = stored.indexOf(marker);
  return i === -1 ? stored.replace(/^\/+/, "") : stored.slice(i + marker.length);
}
const PARALLEL = 4;
const IMAGE_NAME = /^(\d+)_(\d{1,4})\.(jpe?g|png|gif|webp)$/i;

// ---------- 引数 ----------
const args = process.argv.slice(2);
const dir = args[0] && !args[0].startsWith("--") ? args[0] : undefined;
const execute = args.includes("--execute");
const expectIndex = args.indexOf("--expect");
const expected = expectIndex >= 0 ? Number(args[expectIndex + 1]) : null;
if (!dir || !existsSync(dir)) {
  console.error("使い方: node --experimental-strip-types scripts/upload-athome-images.mjs <まとめフォルダ> [--execute --expect <枚数>]");
  process.exit(1);
}

const supabaseUrl = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!supabaseUrl || !serviceKey || !process.env.DATABASE_URL) {
  console.error("環境変数 DATABASE_URL / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が読めません（set -a; . ./.env.renoel-renewal; set +a を先に）");
  process.exit(1);
}

// ---------- 画像を集める ----------
const rows = [];
const seen = new Set();
let duplicateNames = 0;
function walk(folder) {
  for (const name of readdirSync(folder).sort()) {
    const full = join(folder, name);
    if (statSync(full).isDirectory()) {
      if (!name.startsWith("_")) walk(full);
      continue;
    }
    const m = name.match(IMAGE_NAME);
    if (!m) continue;
    if (seen.has(name)) {
      duplicateNames++;
      continue;
    }
    seen.add(name);
    rows.push({ oldName: name, objMngNo: m[1], newPath: relative(dir, full) });
  }
}
walk(dir);

// ---------- 計画 ----------
const prisma = new PrismaClient();
const objMngNos = [...new Set(rows.map((r) => r.objMngNo))];
const found = await prisma.property.findMany({
  where: { objMngNo: { in: objMngNos.map((n) => BigInt(n)) } },
  select: { id: true, objMngNo: true, images: { select: { id: true, path: true, sortOrder: true } } },
});
const properties = found.map((p) => ({
  id: p.id,
  objMngNo: p.objMngNo.toString(),
  imagePaths: p.images.map((img) => toStoragePath(img.path)),
}));
const plan = planImageUploads(rows, properties, MAX_IMAGES_PER_PROPERTY);

// 再実行のとき、登録済みの枚は飛ばす
const done = new Set(found.flatMap((p) => p.images.map((img) => `${p.id}:${img.sortOrder}`)));
const todo = plan.uploads.filter((u) => !done.has(`${u.propertyId}:${u.order}`));

console.log(`画像ファイル: ${rows.length}枚（${objMngNos.length}物件）／ 同名の重複で読まなかった枚数: ${duplicateNames}`);
console.log(`DBに見つかった物件: ${found.length} / ${objMngNos.length}`);
console.log(`  DBに無い物件（登録しない）: ${plan.noProperty.length}`);
console.log(`  既に画像がある物件（触らない）: ${plan.alreadyHasOtherImages.length}`);
console.log(`  ${MAX_IMAGES_PER_PROPERTY}枚の上限で落とす枚数: ${plan.droppedOverLimit}`);
console.log(`  ファイル名を読めない行: ${plan.unreadable.length}`);
console.log(`登録予定: ${plan.uploads.length}枚（${new Set(plan.uploads.map((u) => u.propertyId)).size}物件）`);
console.log(`  うち登録済み（飛ばす）: ${plan.uploads.length - todo.length}`);
console.log(`  今回アップロードする枚数: ${todo.length}`);

if (!execute) {
  console.log(`\n書き込みはしていません。実行するには: --execute --expect ${todo.length}`);
  await prisma.$disconnect();
  process.exit(0);
}
if (expected !== todo.length) {
  console.error(`\n--expect ${expected} が今回の枚数 ${todo.length} と一致しないため中止します（D-17）`);
  await prisma.$disconnect();
  process.exit(1);
}

// ---------- 控え ----------
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
const targetIds = new Set(plan.uploads.map((u) => u.propertyId));
const backupFile = join(dir, `_画像登録_控え_${stamp}.json`);
writeFileSync(
  backupFile,
  JSON.stringify(found.filter((p) => targetIds.has(p.id)).map((p) => ({ propertyId: p.id, objMngNo: p.objMngNo.toString(), images: p.images })), null, 1)
);
const logFile = join(dir, `_画像登録_ログ_${stamp}.txt`);
console.log(`控え: ${backupFile}\nログ: ${logFile}`);

// ---------- 実行 ----------
const work = mkdtempSync(join(tmpdir(), "athome-img-"));
let ok = 0;
const failures = [];

async function uploadOne(u) {
  const resized = join(work, `${u.propertyId}_${u.order}.jpg`);
  await run("sips", ["-Z", String(BULK_RESIZE_MAX_PX), "-s", "format", "jpeg", "-s", "formatOptions", String(BULK_JPEG_QUALITY), join(dir, u.sourcePath), "--out", resized]);
  const res = await fetch(`${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${u.storagePath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "image/jpeg",
      "x-upsert": "true",
    },
    body: readFileSync(resized),
    signal: AbortSignal.timeout(30_000),
  });
  rmSync(resized, { force: true });
  if (!res.ok) throw new Error(`Storage HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  // 同じ物件・同じ並び順の行が無いときだけ作る（再実行で重複させない）
  const exists = await prisma.propertyImage.findFirst({ where: { propertyId: u.propertyId, sortOrder: u.order }, select: { id: true } });
  if (!exists) {
    await prisma.propertyImage.create({ data: { propertyId: u.propertyId, sortOrder: u.order, path: u.storagePath } });
  }
}

let next = 0;
async function worker() {
  while (next < todo.length) {
    const u = todo[next++];
    try {
      await uploadOne(u);
      ok++;
      appendFileSync(logFile, `OK\t${u.objMngNo}\t${u.order}\t${u.sourcePath}\n`);
    } catch (error) {
      failures.push(u);
      appendFileSync(logFile, `NG\t${u.objMngNo}\t${u.order}\t${u.sourcePath}\t${error instanceof Error ? error.message : String(error)}\n`);
    }
    const n = ok + failures.length;
    if (n % 200 === 0 || n === todo.length) console.log(`  ${n} / ${todo.length}（失敗 ${failures.length}）`);
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));
rmSync(work, { recursive: true, force: true });
await prisma.$disconnect();

console.log(`\n完了: 成功 ${ok} / 失敗 ${failures.length}`);
if (failures.length) {
  console.log("失敗した枚は、同じコマンド（--expect は数え直した枚数）でもう一度流すと続きから登録します。理由はログを見てください。");
  process.exit(1);
}
