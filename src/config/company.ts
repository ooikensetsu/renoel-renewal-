/**
 * D-19：会社に関する決めごとはこのファイルだけに書く。
 * 電話番号・住所・差出人アドレスなどを変えるときは、ここ1箇所を直せば全画面とメールに反映される。
 * このファイルは D-10 の行数上限の対象外。
 *
 * 秘密情報（パスワード・APIキー・SMTPの認証情報）はここに書かないこと（D-08 / S-01）。
 * それらは .env から process.env 経由で読む。
 */

export const COMPANY = {
  /** ブランド名（サイト表記） */
  brandName: "リノベーションスタジオ RENOEL",
  /** 短縮ブランド名（メール件名の【】内など） */
  shortName: "RENOEL",
  /** 運営法人名 */
  legalName: "大井建設工業株式会社",
  /** 郵便番号 */
  zip: "385-0029",
  /** 所在地 */
  address: "長野県佐久市佐久平駅南9-1",
  /** 問い合わせ電話番号（表示用） */
  tel: "0120-556-119",
  /** 問い合わせ電話番号（tel: リンク用。ハイフンなし） */
  telLink: "tel:0120556119",
  /** 営業時間・定休日 */
  businessHours: "10:00〜18:00（定休日：火曜・祝日）",
  /** コーポレートサイトURL */
  siteUrl: "https://usedrenovation.ooi-kensetsu.co.jp/",
} as const;

/**
 * 物件確認依頼書（Excel）の返信先。取扱会社がFAXで返す宛先として、様式の L3〜L6 に書く。
 * 様式はモリシタ版から移植したもので、返信先にモリシタハウスの社名・住所・電話・FAXが入っていた。
 * 【要確認】FAX番号は未入手。電話を問い合わせ用のフリーダイヤルのままにするかも未確認。
 */
export const CONFIRMATION_REPLY_TO = {
  name: COMPANY.legalName,
  address: `〒${COMPANY.zip}　${COMPANY.address}`,
  tel: COMPANY.tel,
  fax: "【要確認】",
} as const;

/**
 * メール差出人。
 * 【要確認】noreply@renoel.example.com は create 時のプレースホルダのまま本番に残っていた。
 * 実在する送信ドメインへ差し替えること（example.com 宛は到達しない／なりすまし判定される）。
 */
export const MAIL_FROM = {
  name: "RENOEL リノベーションスタジオ",
  address: process.env.MAIL_FROM_ADDRESS || "noreply@renoel.example.com",
} as const;

/**
 * メール本文や画面に載せる自サイトのURL。
 * M-08：以前はメール本文に http://localhost:3000 が直書きされており、
 * 本番から送ると受信者が開けないリンクになっていた。環境変数を正とする。
 */
export const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_ORIGIN ||
  process.env.NEXTAUTH_URL ||
  "http://localhost:3000";

/** メール署名（登録完了・問い合わせ控えで共通利用） */
export const MAIL_SIGNATURE = `--------------------------------------------------
${COMPANY.brandName}
${COMPANY.legalName}
〒${COMPANY.zip} ${COMPANY.address}
TEL: ${COMPANY.tel}
URL: ${COMPANY.siteUrl}
--------------------------------------------------`;

/**
 * 管理者への通知メールの宛先（問い合わせ着信・新規入会）。
 * 未設定なら通知は送らず、その事実を MailLog に SKIPPED として残す。
 * D-03：宛先を推測で埋めない（「たぶん info@ だろう」で送ると誤送信になる）。
 */
export const MAIL_ADMIN_ADDRESS = (process.env.MAIL_ADMIN_ADDRESS || "").trim();
