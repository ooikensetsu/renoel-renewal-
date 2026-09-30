/**
 * D-19：認証・認可のしきい値はこのファイルだけに書く。
 * S-12（認証の最低ライン）が要求する「試行回数の制限」「セッションの有効期限」の値もここ。
 */

/** 権限区分。role カラムに入る値はこの2つだけ。 */
export const ROLE = {
  USER: "USER",
  ADMIN: "ADMIN",
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];

/** 会員の状態。 */
export const USER_STATUS = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
} as const;

/** 問い合わせの対応状況。Inquiry.status に入る値はこの2つだけ。 */
export const INQUIRY_STATUS = {
  UNREAD: "UNREAD",
  REPLIED: "REPLIED",
} as const;

/** S-12：この回数だけ連続で失敗したらアカウントを一時ロックする。 */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;

/** S-12：ロックする時間（分）。 */
export const LOGIN_LOCK_MINUTES = 15;

/** S-12：セッションの有効期限（秒）。既定は8時間。 */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

/**
 * S-12：パスワードハッシュのコスト係数。
 * 上げるほど総当たりに強くなるが1回の計算が遅くなる（12 で概ね 0.2〜0.3 秒）。
 * bcrypt はハッシュ文字列内にコストを持つため、これを上げても
 * 既存の低コストのハッシュはそのまま照合できる（作り直しは不要）。
 */
export const BCRYPT_ROUNDS = 12;

/**
 * S-08：未認証で叩ける公開フォーム（"use server"）の呼び出し回数を絞る。
 * 踏み台送信・連投の抑止。カウンタは RateLimit テーブル（DB）で持つ。
 * key に個人情報は載せない（メール等はハッシュにする。S-09）。
 */
export const RATE_LIMITS = {
  /** 物件問い合わせ：送信元IP単位。 */
  inquiryByIp: { limit: 5, windowSeconds: 10 * 60 },
  /** 物件問い合わせ：宛先メール単位（同じ相手を狙った爆撃の抑止）。 */
  inquiryByRecipient: { limit: 3, windowSeconds: 60 * 60 },
  /** 会員登録：送信元IP単位。 */
  registrationByIp: { limit: 5, windowSeconds: 60 * 60 },
  /**
   * S-12：ログイン試行：送信元IP単位。
   *
   * アカウント単位のロック（MAX_FAILED_LOGIN_ATTEMPTS）だけでは次の2つが残る。
   *   1. 1アカウントにつき1回ずつ試す総当たり（パスワードスプレー）は
   *      ロックに一度も触れずに実行できる
   *   2. 逆に、メールアドレスを知っていれば任意の会員を故意にロックできる
   * IP単位で上限を設けて、どちらも試行回数の側で止める。
   *
   * 正規の利用者が打ち間違える回数（数回）より十分に大きく、
   * 総当たりには足りない値にする。
   */
  loginByIp: { limit: 20, windowSeconds: 10 * 60 },
} as const;

/**
 * 物件の公開レベル。
 * PUBLIC   … 誰でも全情報を見られる
 * MEMBERS  … 未ログインには価格・所在地・画像を返さない（サーバー側で落とす。S-07）
 */
export const DISCLOSURE_LEVEL = {
  PUBLIC: 0,
  MEMBERS: 1,
} as const;

/** 会員の状態として受け付けてよい値か（画面・APIから来た文字列の検証用）。 */
export function isValidUserStatus(
  value: string
): value is (typeof USER_STATUS)[keyof typeof USER_STATUS] {
  return value === USER_STATUS.ACTIVE || value === USER_STATUS.SUSPENDED;
}

/** 問い合わせの対応状況として受け付けてよい値か。 */
export function isValidInquiryStatus(
  value: string
): value is (typeof INQUIRY_STATUS)[keyof typeof INQUIRY_STATUS] {
  return value === INQUIRY_STATUS.UNREAD || value === INQUIRY_STATUS.REPLIED;
}

/**
 * 公開レベルとして受け付けてよい値か。
 * 「1（会員限定）以外は公開扱い」という判定に落ちるため、2 以上の値を
 * 素通しさせない（会員限定のつもりが公開される事故を防ぐ）。
 */
export function isValidDisclosureLevel(
  value: number
): value is (typeof DISCLOSURE_LEVEL)[keyof typeof DISCLOSURE_LEVEL] {
  return value === DISCLOSURE_LEVEL.PUBLIC || value === DISCLOSURE_LEVEL.MEMBERS;
}
