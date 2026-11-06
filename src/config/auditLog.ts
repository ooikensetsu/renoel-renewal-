/**
 * 管理画面の操作履歴の種類（2026-11-05）。DBには英字コードで入れ、画面ではこの表示名で出す。
 * 種類を足すときはここに足す。ここに無いコードは記録しない（recordAudit が拒む）。
 */
export const AUDIT_ACTIONS = {
  // 変更
  PROPERTY_CREATE: { label: "物件の登録", group: "変更" },
  PROPERTY_UPDATE: { label: "物件の編集", group: "変更" },
  PROPERTY_IMPORT: { label: "物件のCSV取込", group: "変更" },
  PROPERTY_SHOW_ON_TOP: { label: "トップ掲載の切り替え", group: "変更" },
  PROPERTY_BULK_DISCLOSURE: { label: "公開レベルの一括変更", group: "変更" },
  PROPERTY_CONFIRMATION: { label: "物件確認の記録", group: "変更" },
  IMAGE_UPLOAD: { label: "画像の登録", group: "変更" },
  IMAGE_DELETE: { label: "画像の削除", group: "変更" },
  USER_CREATE: { label: "会員の登録", group: "変更" },
  USER_STATUS: { label: "会員の状態変更", group: "変更" },
  USER_DELETE: { label: "会員の削除", group: "変更" },
  INQUIRY_STATUS: { label: "問い合わせの対応状態変更", group: "変更" },
  AGENCY_SAVE: { label: "取扱会社の会社情報の保存", group: "変更" },
  AGENCY_MERGE: { label: "取扱会社の統合", group: "変更" },
  AGENCY_ALIAS_DELETE: { label: "取扱会社の旧表記の解除", group: "変更" },
  AGENCY_READING_SAVE: { label: "取扱会社の読みの保存", group: "変更" },
  // 出力
  EXPORT_PROPERTY_CSV: { label: "物件の一括出力（CSV）", group: "出力" },
  EXPORT_CONFIRMATION_BOOK: { label: "確認依頼書の出力（一括印刷）", group: "出力" },
  EXPORT_CONFIRMATION_EACH: { label: "確認依頼書の出力（会社別）", group: "出力" },
  // 個人情報の閲覧
  VIEW_USER_LIST: { label: "会員一覧の閲覧", group: "閲覧" },
  VIEW_USER: { label: "会員詳細の閲覧", group: "閲覧" },
  VIEW_INQUIRIES: { label: "問い合わせ一覧の閲覧", group: "閲覧" },
  VIEW_MAIL_LOGS: { label: "メール送信ログの閲覧", group: "閲覧" },
  // ログイン
  ADMIN_LOGIN: { label: "管理者のログイン", group: "ログイン" },
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export const AUDIT_GROUPS = ["変更", "出力", "閲覧", "ログイン"] as const;

export function isAuditAction(value: unknown): value is AuditAction {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(AUDIT_ACTIONS, value);
}

/** 対象の種類の表示名 */
export const AUDIT_TARGET_LABEL: Record<string, string> = {
  PROPERTY: "物件",
  USER: "会員",
  INQUIRY: "問い合わせ",
  AGENCY: "取扱会社",
  IMAGE: "画像",
};

/** 画面から記録を頼める出力の種類（recordAdminExport が受け付けるのはこれだけ） */
export const EXPORT_ACTIONS = [
  "EXPORT_PROPERTY_CSV",
  "EXPORT_CONFIRMATION_BOOK",
  "EXPORT_CONFIRMATION_EACH",
] as const satisfies readonly AuditAction[];
export type ExportAction = (typeof EXPORT_ACTIONS)[number];
