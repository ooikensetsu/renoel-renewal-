/**
 * CSV取込の突合（どの既存物件を上書きするか）を決める。
 *
 * 2026-10-06 大野の指示で、突合キーを物件管理番号（objMngNo）から
 * 「取扱不動産会社名＋掲載会社管理番号」に変えた。
 * 掲載会社管理番号は会社ごとの採番なので、番号だけだと別会社の物件を上書きしうる。
 *
 * - 掲載会社管理番号が空（「－」「-」などを含む）の行は取り込まない
 * - 1件でも判断できない行があれば、取込全体を中止する（D-17。一部だけ書き込まない）
 *
 * DBに触らない純関数にして、テスト（importMatch.test.ts）で固定している（D-06）。
 */

// 相対パス＋拡張子つきで書くのは、node の標準テストランナーから読めるようにするため。
import { blankToNull } from "./blank.ts";

/**
 * 突合キー。掲載会社管理番号が空なら null（取り込まない）。
 * 会社名は空でもキーに含める（空の会社名どうしでだけ一致する）。
 */
export function importKey(
  agencyName: string | null | undefined,
  listingCompanyNo: string | null | undefined
): string | null {
  const no = blankToNull(listingCompanyNo);
  if (no === null) return null;
  return JSON.stringify([blankToNull(agencyName) ?? "", no]);
}

/** 突合に使う既存物件の列。 */
export type ExistingForMatch = {
  id: number;
  objMngNo: bigint;
  agencyName: string | null;
  listingCompanyNo: string | null;
};

/** 突合する取込行。label はエラー文に出す識別名。 */
export type IncomingForMatch = {
  key: string;
  objMngNo: bigint;
  label: string;
};

export type MatchPlan =
  | { ok: true; matchedIds: (number | null)[] }
  | { ok: false; error: string };

/**
 * 取込行ごとに、上書きする既存物件の id（新規なら null）を決める。
 *
 * @param incoming 掲載会社管理番号が空の行は、呼び出し側で除いてから渡す
 * @param existing 取込行と同じキー、または同じ物件管理番号を持つ既存物件
 */
export function planImportMatches(
  incoming: readonly IncomingForMatch[],
  existing: readonly ExistingForMatch[]
): MatchPlan {
  // 1. CSVの中での重複。どちらを正とするか決められない。
  const seenKeys = new Map<string, string>();
  const seenObjMngNos = new Map<bigint, string>();
  for (const row of incoming) {
    const dupKey = seenKeys.get(row.key);
    if (dupKey) {
      return { ok: false, error: `CSVの中に、取扱店と掲載会社管理番号が同じ行が2つあります（${dupKey} と ${row.label}）。` };
    }
    seenKeys.set(row.key, row.label);
    const dupNo = seenObjMngNos.get(row.objMngNo);
    if (dupNo) {
      return { ok: false, error: `CSVの中に、物件管理番号が同じ行が2つあります（${dupNo} と ${row.label}）。` };
    }
    seenObjMngNos.set(row.objMngNo, row.label);
  }

  // 2. DBの中での重複。どの物件を上書きすべきか決められない。
  const existingByKey = new Map<string, ExistingForMatch>();
  for (const row of existing) {
    const key = importKey(row.agencyName, row.listingCompanyNo);
    if (key === null || !seenKeys.has(key)) continue;
    if (existingByKey.has(key)) {
      return {
        ok: false,
        error: `登録済みの物件に、取扱店と掲載会社管理番号が同じものが複数あります（対象: ${seenKeys.get(key)}）。管理画面で重複を解消してから取り込んでください。`,
      };
    }
    existingByKey.set(key, row);
  }

  // 3. 物件管理番号の衝突。一意の列なので、別の物件が使っている番号は書けない。
  const existingByObjMngNo = new Map(existing.map((row) => [row.objMngNo, row]));
  const matchedIds: (number | null)[] = [];
  for (const row of incoming) {
    const match = existingByKey.get(row.key) ?? null;
    const holder = existingByObjMngNo.get(row.objMngNo);
    if (holder && holder.id !== match?.id) {
      return {
        ok: false,
        error: `物件管理番号 ${row.objMngNo} は、取扱店か掲載会社管理番号が違う別の登録済み物件が使っています（対象: ${row.label}）。`,
      };
    }
    matchedIds.push(match?.id ?? null);
  }
  return { ok: true, matchedIds };
}
