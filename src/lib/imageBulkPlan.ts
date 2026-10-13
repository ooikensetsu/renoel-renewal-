/**
 * athome 取得フォルダの画像を一括登録するときの計画づくり（scripts/upload-athome-images.mjs 用）。
 * DBにもファイルにも触らない純関数にして、imageBulkPlan.test.ts で件数を固定している（D-06）。
 *
 * 物件との対応は「画像ファイル名_対応表_*.csv」の物件管理番号で取る。
 * 改名後のファイル名（掲載会社管理番号_連番）は「/」などを「-」に置き換えているため、
 * 掲載会社管理番号での照合は使わない。物件管理番号は一意なので取り違えが起きない。
 */

import { storagePathFor } from "./imageName.ts";

/** 対応表の1行。 */
export type MappingRow = { oldName: string; objMngNo: string; newPath: string };

/** 計画に使う登録済み物件。imagePaths は登録済み画像の Storage 上のパス。 */
export type TargetProperty = { id: number; objMngNo: string; imagePaths: string[] };

export type PlannedUpload = {
  propertyId: number;
  objMngNo: string;
  order: number;
  /** 取得フォルダからの相対パス */
  sourcePath: string;
  /** Storage 上のパス（縮小後は必ず jpg） */
  storagePath: string;
};

export type ImagePlan = {
  uploads: PlannedUpload[];
  /** DBに物件が無い物件管理番号（取込対象外だった物件など） */
  noProperty: string[];
  /** この仕組み以外で画像が登録済みの物件。上書きしないよう丸ごと除く */
  alreadyHasOtherImages: string[];
  /** 上限を超えたため登録しない枚数 */
  droppedOverLimit: number;
  /** ファイル名から連番を読めなかった行 */
  unreadable: string[];
};

export function planImageUploads(
  rows: readonly MappingRow[],
  properties: readonly TargetProperty[],
  maxPerProperty: number
): ImagePlan {
  const byNo = new Map<string, { order: number; sourcePath: string }[]>();
  const unreadable: string[] = [];
  for (const row of rows) {
    const m = row.oldName.match(/^(\d+)_(\d{1,4})\.[A-Za-z]+$/);
    if (!m || m[1] !== row.objMngNo || row.newPath.trim() === "") {
      unreadable.push(row.oldName);
      continue;
    }
    const list = byNo.get(row.objMngNo) ?? [];
    list.push({ order: Number(m[2]), sourcePath: row.newPath });
    byNo.set(row.objMngNo, list);
  }

  const propertyByNo = new Map(properties.map((p) => [p.objMngNo, p]));
  const uploads: PlannedUpload[] = [];
  const noProperty: string[] = [];
  const alreadyHasOtherImages: string[] = [];
  let droppedOverLimit = 0;

  for (const [objMngNo, images] of byNo) {
    const property = propertyByNo.get(objMngNo);
    if (!property) {
      noProperty.push(objMngNo);
      continue;
    }
    images.sort((a, b) => a.order - b.order);
    const kept = images.slice(0, maxPerProperty);
    droppedOverLimit += images.length - kept.length;

    const planned = kept.map((img) => ({
      propertyId: property.id,
      objMngNo,
      order: img.order,
      sourcePath: img.sourcePath,
      storagePath: storagePathFor(objMngNo, img.order, "jpg"),
    }));
    // 途中で止めて再実行したときは、自分が登録した分（同じパス）だけが入っている。
    // それ以外の画像があれば、人が管理画面で入れたものなので触らない。
    const plannedPaths = new Set(planned.map((p) => p.storagePath));
    if (property.imagePaths.some((path) => !plannedPaths.has(path))) {
      alreadyHasOtherImages.push(objMngNo);
      continue;
    }
    uploads.push(...planned);
  }

  return { uploads, noProperty, alreadyHasOtherImages, droppedOverLimit, unreadable };
}
