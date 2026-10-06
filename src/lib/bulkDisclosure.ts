/**
 * 公開レベルの一括変更で、書き込む前に行う検証（D-17）。
 *
 * DBに触らない純関数にして、テスト（bulkDisclosure.test.ts）で固定している。
 * サーバーアクション側は、ここが ok を返したときだけ書き込む。
 *
 * D-06：一括更新の処理なのでテストを書く。
 */

// 相対パス＋拡張子つきで書くのは、node の標準テストランナーから読めるようにするため。
import { isDisclosureLevel, type DisclosureLevel } from "../config/security.ts";

/** 1回の一括変更で受け付ける最大件数。物件の総数（約1,000件）を覆える幅にしている。 */
export const MAX_BULK_DISCLOSURE_ITEMS = 2000;

export type BulkDisclosureRequest = {
  ids: unknown;
  level: unknown;
  /** 画面で確認した件数。サーバーで数えた件数と一致しなければ中止する */
  expectedCount: unknown;
};

export type BulkDisclosurePlan =
  | { ok: true; ids: number[]; level: DisclosureLevel; expectedCount: number }
  | { ok: false; error: string };

/** 入力の形を検証する。DBで実在を数える前の段階。 */
export function planBulkDisclosure(req: BulkDisclosureRequest): BulkDisclosurePlan {
  if (!Array.isArray(req.ids) || req.ids.length === 0) {
    return { ok: false, error: "物件が1件も選ばれていません。" };
  }
  if (req.ids.length > MAX_BULK_DISCLOSURE_ITEMS) {
    return {
      ok: false,
      error: `一度に変更できるのは ${MAX_BULK_DISCLOSURE_ITEMS} 件までです。`,
    };
  }
  if (!req.ids.every((id) => Number.isInteger(id) && (id as number) > 0)) {
    return { ok: false, error: "物件の指定が正しくありません。" };
  }
  const ids = [...new Set(req.ids as number[])];
  if (ids.length !== req.ids.length) {
    return { ok: false, error: "同じ物件が重複して指定されています。" };
  }
  if (!isDisclosureLevel(req.level)) {
    return { ok: false, error: "公開レベルが正しくありません。" };
  }
  if (req.expectedCount !== ids.length) {
    return {
      ok: false,
      error: "画面の件数と送信された件数が一致しないため、変更を中止しました。",
    };
  }
  return { ok: true, ids, level: req.level, expectedCount: ids.length };
}

/**
 * DBで数えた件数と想定件数の突き合わせ。
 * 選択後に別の人が物件を消していた場合などに、黙って一部だけ書き換えないための関所。
 */
export function checkFoundCount(expectedCount: number, foundCount: number): string | null {
  if (foundCount === expectedCount) return null;
  return `変更対象 ${expectedCount} 件のうち ${foundCount} 件しか見つからないため、変更を中止しました。一覧を読み込み直してください。`;
}
