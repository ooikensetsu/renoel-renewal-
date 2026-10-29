/**
 * D-19：物件の区分に関する決めごとはこのファイルだけに書く。
 * 対象エリアを増やす・物件種別を変えるときは、ここ1箇所を直す。
 *
 * 【出典】市区町村コードは総務省の全国地方公共団体コード。
 * 下の CHECK_DIGIT は5桁コードから検査数字を求める式で、7件すべて公表値と一致することを
 * 確認済み（2026-08-19）。コードを追加したら同じ方法で検算すること。
 */

/** 都道府県コード（長野県）。 */
export const PREF_CODE = "20";

/** 都道府県名（表示用）。 */
export const PREF_NAME = "長野県";

/**
 * 掲載対象のエリア。ここに無い市区町村コードのデータは、取込時に警告する。
 * cityCd は5桁（検査数字なし）。CSVにもこの5桁を書く。
 */
export const AREAS = [
  { cityCd: "20217", name: "佐久市" },
  { cityCd: "20208", name: "小諸市" },
  { cityCd: "20219", name: "東御市" },
  { cityCd: "20321", name: "軽井沢町" },
  { cityCd: "20323", name: "御代田町" },
  { cityCd: "20324", name: "立科町" },
  { cityCd: "20309", name: "佐久穂町" },
] as const;

export type AreaCode = (typeof AREAS)[number]["cityCd"];

/**
 * 手動登録で物件管理番号を空欄にしたときに自動で付ける番号の始まり（2026-10-08）。
 * athome の物件番号は10桁（本番の最大は 6,992,475,880）なので、11桁の 9 始まりなら重ならない。
 * この番号帯の中で最大の番号＋1を付ける。
 */
export const MANUAL_OBJ_MNG_NO_START = BigInt("90000000001");

/** 物件種目が空のときに入れる値（CSV取込・手動登録で共用）。 */
export const DEFAULT_SYUMOKU = "中古";

/** 既定のエリア。CSVで cityCd を省略した行に入る。 */
export const DEFAULT_CITY_CODE = "20217";

/**
 * 物件一覧の1ページあたりの件数。3列（PC）・2列・1列（スマホ）のどれでも割り切れる数にしている。
 * モリシタ版で全件（959件）を1ページに出し、スマホでページの長さが約21万pxになった
 * ため導入した（2026-09-28）。RENOEL へは 2026-10-13 に移植。
 */
export const PROPERTIES_PER_PAGE = 24;

/** 市区町村コードから名称を引く。未登録なら null。 */
export function areaName(cityCd: string): string | null {
  return AREAS.find((a) => a.cityCd === cityCd)?.name ?? null;
}

/** 掲載対象のエリアかどうか。 */
export function isSupportedArea(cityCd: string): boolean {
  return AREAS.some((a) => a.cityCd === cityCd);
}

/**
 * 物件種別。`Property.syubetu` に入る値。
 * 【要確認】この番号は当システムの独自定義。athome / ATBB のCSVが別の番号体系を
 * 使っている場合は、取込前に変換するか、この表を向こうに合わせる必要がある（D-03）。
 */
export const PROPERTY_TYPE = {
  /** 土地 */
  LAND: 1,
  /** 一戸建て */
  HOUSE: 2,
  /** マンション */
  MANSION: 3,
} as const;

export type PropertyTypeCode = (typeof PROPERTY_TYPE)[keyof typeof PROPERTY_TYPE];

/** 種別コード → 表示名。 */
export const PROPERTY_TYPE_LABEL: Record<number, string> = {
  [PROPERTY_TYPE.LAND]: "土地",
  [PROPERTY_TYPE.HOUSE]: "中古一戸建て",
  [PROPERTY_TYPE.MANSION]: "マンション",
};

/**
 * 管理画面の物件一覧で、種別タブを並べる順（「すべて」の後ろ）。
 * 番号順ではなく掲載件数の多い順に近い並び（2026-10-06 大野の指示）。
 */
export const PROPERTY_TYPE_TAB_ORDER: readonly PropertyTypeCode[] = [
  PROPERTY_TYPE.HOUSE,
  PROPERTY_TYPE.MANSION,
  PROPERTY_TYPE.LAND,
];

/** 既定の種別。CSVで syubetu を省略した行に入る。 */
export const DEFAULT_PROPERTY_TYPE: number = PROPERTY_TYPE.HOUSE;

/** 種別コードとして妥当か。 */
export function isValidPropertyType(code: number): boolean {
  return Object.values(PROPERTY_TYPE).includes(code as PropertyTypeCode);
}

/**
 * 5桁の市区町村コードから検査数字（6桁目）を求める。
 * 総務省の全国地方公共団体コードの算出方法。AREAS の値を検算するために置いてある。
 */
export function checkDigit(cityCd5: string): number {
  const weights = [6, 5, 4, 3, 2];
  const sum = cityCd5
    .split("")
    .reduce((acc, ch, i) => acc + Number(ch) * weights[i], 0);
  const remainder = sum % 11;
  if (remainder === 0) return 1;
  if (remainder === 1) return 0;
  return 11 - remainder;
}

/**
 * 物件確認の状況（2026-10-27 大野の指示）。取扱会社へ物件の現況を確かめた結果で、
 * 物件確認依頼書の「直近確認時の状況」に入れる。選択肢と並びは依頼書の様式の「現在の状況」と同じ。
 * 確認するたびに PropertyConfirmation へ1行ずつ残し、いちばん新しい行を「直近」とする。
 */
export const CONFIRMATION_STATUSES = ["有", "商談", "保留", "中止", "済"] as const;
export type ConfirmationStatus = (typeof CONFIRMATION_STATUSES)[number];

/** この状況を記録したら公開レベルを「非表示」にする（2026-10-27 大野の指示）。戻すときは自動で戻さない。 */
export const CONFIRMATION_STATUSES_THAT_HIDE: readonly ConfirmationStatus[] = ["中止", "済"];

export function isConfirmationStatus(value: unknown): value is ConfirmationStatus {
  return (CONFIRMATION_STATUSES as readonly unknown[]).includes(value);
}

/**
 * 取引態様の絞り込みの分類（2026-10-27 大野の指示）。DBの値は取得元の表記のまま持ち、絞り込むときだけ読み替える。
 * athome は「一般媒介」、REINS は「一般」のように表記が違うため、どちらも同じ分類に入れる。
 * どれにも当たらない値（athome の「媒介」＝種類の記載なし、「代理」、空欄）は「その他」。
 */
export const TRANSACTION_CATEGORIES = [
  { value: "general", label: "一般媒介", values: ["一般媒介", "一般"] },
  { value: "exclusive", label: "専任媒介", values: ["専任媒介", "専任"] },
  { value: "exclusiveSole", label: "専属専任媒介", values: ["専属専任媒介", "専属"] },
  { value: "seller", label: "売り主", values: ["売主", "売り主"] },
  { value: "other", label: "その他", values: [] },
] as const;
export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number]["value"];

/** 取引態様の値を分類に読み替える。前後の空白は無視する。 */
export function transactionCategory(transactionType: string | null | undefined): TransactionCategory {
  const v = (transactionType ?? "").trim();
  const hit = TRANSACTION_CATEGORIES.find((c) => (c.values as readonly string[]).includes(v));
  return hit ? hit.value : "other";
}
