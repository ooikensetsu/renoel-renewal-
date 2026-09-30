/**
 * メール本文の組み立てと、送信失敗の要約。
 *
 * 送信そのもの（Resend API の呼び出し・停止スイッチ・送信ログ）は src/lib/mail.ts が持つ。
 * ここをDBに依存させないのは、`node --test` から本文と失敗要約を検証できるようにするため。
 * D-06：メール文面は「変えたつもりが変わっていない」が起きやすいので、機械で確かめられる形にしておく。
 */

// 相対パス＋拡張子つきで書くのは、node の標準テストランナーから読めるようにするため
// （tsconfig の allowImportingTsExtensions。src/lib/loan.test.ts と同じ理由）。
import { COMPANY, MAIL_FROM, SITE_ORIGIN, MAIL_SIGNATURE } from "../config/company.ts";

/** 送信の種類。MailLog.kind としてそのまま保存する。 */
export const MAIL_KIND = {
  /** 会員登録の完了通知（本人宛） */
  REGISTRATION: "REGISTRATION",
  /** 会員登録の入会通知（管理者宛） */
  REGISTRATION_ADMIN: "REGISTRATION_ADMIN",
  /** 問い合わせの受付控え（本人宛） */
  INQUIRY: "INQUIRY",
  /** 問い合わせの着信通知（管理者宛） */
  INQUIRY_ADMIN: "INQUIRY_ADMIN",
} as const;

export type MailKind = (typeof MAIL_KIND)[keyof typeof MAIL_KIND];

/** Resend の REST API へ渡す本体。フィールド名は API の仕様（snake_case）に合わせる。 */
export type MailPayload = {
  from: string;
  to: string[];
  subject: string;
  text: string;
  reply_to?: string;
};

/**
 * IPA 8-(iii)：ヘッダへ載る値から改行コードを取り除く。
 *
 * 【なぜ必要か】2026-09-03 の監査（docs/inspections.md 指摘5）で、
 * 会員登録の管理者宛通知の件名に、利用者が入力した氏名がそのまま入り、
 * `山田\r\nBcc: attacker@example.invalid` が件名に残ることを確認した。
 *
 * 送信は Resend の REST API へ JSON で渡すため、ヘッダの組み立ては Resend 側が行う。
 * したがって現時点で攻撃は成立しない。**それでもここで落とす。**
 * 防御が外部サービスの実装だけに依存している状態を残さないため。
 *
 * 本文（text）には適用しない。問い合わせ本文は複数行が正しい入力であり、
 * 本文はヘッダではないので改行があっても新しいヘッダにはならない。
 */
export function headerSafe(value: string): string {
  // `+` が要る。CRLF（\r\n）を1文字ずつ置換すると空白2つになる。
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** 差出人表記。表示名にダブルクオートが混ざるとヘッダが壊れるため取り除く。 */
export function formatFrom(): string {
  const safeName = MAIL_FROM.name.replace(/["\r\n]/g, "");
  return `"${safeName}" <${MAIL_FROM.address}>`;
}

/** 会員登録の完了メール（本人宛）。 */
export function buildRegistrationMail(data: {
  name: string;
  email: string;
  tel: string;
}): MailPayload {
  return {
    from: formatFrom(),
    to: [headerSafe(data.email)],
    subject: `【${COMPANY.shortName}】無料会員登録が完了しました`,
    text: `${data.name} 様

中古住宅×リノベーション RENOEL の無料会員にご登録いただき、誠にありがとうございます。
以下の内容で登録が完了いたしました。

■ 登録内容の控え
--------------------------------------------------
お名前: ${data.name} 様
ログインID(メールアドレス): ${data.email}
お電話番号: ${data.tel || "未登録"}
--------------------------------------------------

※ セキュリティの観点から、パスワードは記載しておりません。
ご自身で設定されたパスワードを用いて、以下のURLよりマイページへログインいただけます。

▼ マイページ（ログイン）
${SITE_ORIGIN}/mypage

ご希望条件に合った物件情報の提供や、会員限定の非公開物件の閲覧などをぜひご活用ください。

${MAIL_SIGNATURE}`,
  };
}

/**
 * 会員登録の通知メール（管理者宛）。
 * 返信先を入会者にしておくことで、管理者が受信箱からそのまま返信できる。
 */
export function buildRegistrationAdminMail(data: {
  name: string;
  email: string;
  tel: string;
  adminAddress: string;
}): MailPayload {
  return {
    from: formatFrom(),
    to: [headerSafe(data.adminAddress)],
    subject: `【${COMPANY.shortName}】新規会員登録がありました（${headerSafe(data.name)}）`,
    text: `新しい会員登録がありました。

■ 登録内容
--------------------------------------------------
お名前: ${data.name}
メールアドレス: ${data.email}
お電話番号: ${data.tel || "未登録"}
--------------------------------------------------

▼ 会員管理
${SITE_ORIGIN}/admin/users

このメールはシステムが自動送信しています。`,
    reply_to: headerSafe(data.email),
  };
}

/** 物件へのお問い合わせ受付メール（本人宛）。 */
export function buildInquiryMail(data: {
  name: string;
  email: string;
  tel: string;
  message: string;
  propertyTitle: string;
}): MailPayload {
  return {
    from: formatFrom(),
    to: [headerSafe(data.email)],
    subject: `【${COMPANY.shortName}】物件へのお問い合わせを承りました`,
    text: `${data.name} 様

中古住宅×リノベーション RENOEL です。
以下の内容で物件へのお問い合わせを承りました。
担当者より順次ご返信いたしますので、今しばらくお待ちください。

■ お問い合わせ内容
--------------------------------------------------
【対象物件】 ${data.propertyTitle}
【お名前】 ${data.name} 様
【メールアドレス】 ${data.email}
【お電話番号】 ${data.tel || "未記入"}

【お問い合わせ内容】
${data.message}
--------------------------------------------------

${MAIL_SIGNATURE}`,
  };
}

/** 物件へのお問い合わせ通知メール（管理者宛）。 */
export function buildInquiryAdminMail(data: {
  name: string;
  email: string;
  tel: string;
  message: string;
  propertyTitle: string;
  inquiryId: number;
  adminAddress: string;
  /** 物件管理番号（athome の番号）。一般の問い合わせでは空 */
  propertyObjMngNo?: string | null;
}): MailPayload {
  return {
    from: formatFrom(),
    to: [headerSafe(data.adminAddress)],
    subject: `【${COMPANY.shortName}】物件へのお問い合わせが届きました（${headerSafe(data.propertyTitle)}）`,
    text: `Webサイトからお問い合わせが届きました。

■ お問い合わせ内容（受付番号: ${data.inquiryId}）
--------------------------------------------------
【対象物件】 ${data.propertyTitle}${data.propertyObjMngNo ? `\n【物件管理番号】 ${data.propertyObjMngNo}` : ""}
【お名前】 ${data.name}
【メールアドレス】 ${data.email}
【お電話番号】 ${data.tel || "未記入"}

【お問い合わせ内容】
${data.message}
--------------------------------------------------

▼ お問い合わせ管理
${SITE_ORIGIN}/admin/inquiries

このメールはシステムが自動送信しています。
このまま返信すると、お問い合わせ者へ直接返信されます。`,
    reply_to: headerSafe(data.email),
  };
}

/** MailLog.reason に入れる文字数の上限。長い応答をそのまま溜め込まないため。 */
export const REASON_MAX_LENGTH = 300;

/**
 * Resend からのエラー応答を、記録用の1行に要約する。
 * S-09：ここに入れてよいのはAPIの応答だけ。宛先や本文は混ぜない。
 */
export function summarizeResendError(status: number, body: unknown): string {
  let detail = "";

  if (typeof body === "string") {
    detail = body;
  } else if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const message = record.message ?? record.error ?? record.name;
    detail = typeof message === "string" ? message : JSON.stringify(body);
  }

  const summary = `HTTP ${status}${detail ? `: ${detail}` : ""}`;
  return summary.replace(/\s+/g, " ").trim().slice(0, REASON_MAX_LENGTH);
}
