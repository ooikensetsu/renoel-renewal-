/**
 * D-19：物件の編集項目はこのファイルだけに書く。
 * 管理画面のフォームと、保存処理（updateProperty）の両方がこの定義を読む。
 * 列を足したときに「DBには入るがフォームに出ない」が起きないようにするため。
 *
 * ここに無い列は編集できない。objMngNo（取込の突合キー）と id は意図的に含めていない。
 */

export type FieldType = "text" | "textarea" | "int" | "decimal" | "date" | "select";

export type FieldDef = {
  /** Property のカラム名。formData の name にもなる */
  key: string;
  label: string;
  type: FieldType;
  /** select のときの選択肢 */
  options?: { value: string; label: string }[];
  /** 入力欄の右に出す単位 */
  unit?: string;
  /** 空を許さない項目 */
  required?: boolean;
  /** 手動の新規登録でだけ必須にする項目（既存物件の編集では空のままでも保存できる） */
  requiredOnCreate?: boolean;
};

export type FieldGroup = {
  title: string;
  /** 種別に関係なく出すか、特定種別のときだけ出すか（表示の目安。保存はどの種別でも行う） */
  note?: string;
  fields: FieldDef[];
};

export const PROPERTY_FIELD_GROUPS: FieldGroup[] = [
  {
    title: "基本情報",
    fields: [
      { key: "title", label: "物件名", type: "text", required: true },
      { key: "priceMan", label: "価格", type: "int", unit: "万円", required: true },
      { key: "madori", label: "間取り", type: "text", required: true },
      { key: "address", label: "所在地", type: "text", required: true },
      { key: "syumoku", label: "物件種目", type: "text" },
    ],
  },
  {
    title: "面積・建物",
    fields: [
      { key: "landMen", label: "土地面積", type: "decimal", unit: "㎡" },
      { key: "bldMen", label: "建物面積", type: "decimal", unit: "㎡" },
      { key: "bldStructure", label: "建物構造", type: "text" },
      { key: "bldY", label: "築年", type: "int", unit: "年" },
      { key: "bldM", label: "築月", type: "int", unit: "月" },
      { key: "floorsInfo", label: "階建/階", type: "text" },
      { key: "parking", label: "駐車場", type: "text" },
    ],
  },
  {
    title: "交通",
    fields: [
      { key: "trafficNote", label: "交通（表示用の全文）", type: "text" },
      { key: "trafficLine", label: "沿線名", type: "text" },
      { key: "trafficStation", label: "駅名", type: "text" },
      { key: "walkMinutes", label: "駅から徒歩", type: "int", unit: "分" },
    ],
  },
  {
    title: "費用・条件",
    fields: [
      { key: "leaseTermRent", label: "借地期間・地代", type: "text" },
      { key: "keyMoney", label: "権利金", type: "text" },
      { key: "depositGuarantee", label: "敷金・保証金", type: "text" },
      { key: "maintenanceCost", label: "維持費等", type: "textarea" },
      { key: "otherLumpSum", label: "その他一時金", type: "text" },
      { key: "landRight", label: "土地権利", type: "text" },
      { key: "currentState", label: "現況", type: "text" },
      { key: "deliveryTiming", label: "引渡可能時期", type: "text" },
      { key: "transactionType", label: "取引態様", type: "text" },
    ],
  },
  {
    title: "マンション固有",
    note: "一戸建て・土地では空のままで構いません",
    fields: [
      { key: "mgmtFeeYen", label: "管理費", type: "int", unit: "円/月" },
      { key: "repairFundYen", label: "修繕積立金", type: "int", unit: "円/月" },
      { key: "totalUnits", label: "総戸数", type: "int", unit: "戸" },
      { key: "floorNo", label: "所在階", type: "int", unit: "階" },
      { key: "direction", label: "向き", type: "text" },
      { key: "balconyMen", label: "バルコニー面積", type: "decimal", unit: "㎡" },
      { key: "mgmtForm", label: "管理形態", type: "text" },
    ],
  },
  {
    title: "土地固有",
    note: "マンションでは空のままで構いません",
    fields: [
      { key: "buildingCoverage", label: "建ぺい率", type: "int", unit: "%" },
      { key: "floorAreaRatio", label: "容積率", type: "int", unit: "%" },
      { key: "zoning", label: "用途地域", type: "text" },
      { key: "landCategory", label: "地目", type: "text" },
      { key: "cityPlanning", label: "都市計画", type: "text" },
      { key: "roadAccess", label: "接道状況", type: "text" },
      { key: "privateRoad", label: "私道負担", type: "text" },
    ],
  },
  {
    title: "取扱店",
    note: "宅建業法の広告表示に関わります。画面に出すかは未決定です",
    fields: [
      { key: "agencyName", label: "取扱不動産会社名", type: "text" },
      { key: "agencyAddress", label: "所在地", type: "text" },
      { key: "agencyTel", label: "電話番号", type: "text" },
      { key: "agencyLicense", label: "免許番号", type: "text" },
    ],
  },
  {
    title: "掲載情報",
    fields: [
      // 手動登録では必須（2026-10-08 大野の指示）。CSV取込の突合キー（取扱店＋この番号）になるため
      { key: "listingCompanyNo", label: "掲載会社管理番号", type: "text", requiredOnCreate: true },
      { key: "publishedOn", label: "情報公開日", type: "date" },
      { key: "nextUpdateOn", label: "次回更新予定日", type: "date" },
    ],
  },
];

/** 全項目を平らに並べたもの。保存処理はこれを回す。 */
export const PROPERTY_FIELDS: FieldDef[] = PROPERTY_FIELD_GROUPS.flatMap((g) => g.fields);
