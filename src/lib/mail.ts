/**
 * メール送信。送信基盤は Resend（https://resend.com）。
 *
 * 【この構成にした理由】
 * 以前は nodemailer + SMTP だったが、SMTP の値がプレースホルダのまま本番相当の分岐に入り、
 * 接続に失敗しても catch の中で console.error するだけだったため、
 * 「自動返信が一度も届いていないのに誰も気付かない」状態になっていた。
 * そこで次の3点を同時に直している。
 *   1. 送信を Resend の REST API に置き換える（新規依存は追加しない。標準の fetch のみ）
 *   2. 未設定のときにテスト送信へ落ちる経路（ethereal）を撤去し、必ず失敗として記録する
 *   3. 送信の結果を MailLog テーブルに残し、管理画面（/admin/mail-logs）から見えるようにする
 *
 * O-05 の停止スイッチ（SystemSetting / MAIL_SENDING_DISABLED）は従来どおり効く。
 * 止めた場合も「止めたから送っていない」ことを SKIPPED として記録する。
 */

import prisma from "@/lib/prisma";
import { MAIL_ADMIN_ADDRESS, MAIL_FROM } from "@/config/company";
import { isMailSendingEnabled } from "@/lib/killSwitch";
import {
  MAIL_KIND,
  buildRegistrationMail,
  buildRegistrationAdminMail,
  buildInquiryMail,
  buildInquiryAdminMail,
  summarizeResendError,
  REASON_MAX_LENGTH,
  type MailKind,
  type MailPayload,
} from "@/lib/mailPayload";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** 送信の待ち時間の上限。問い合わせ画面がここで固まらないようにする。 */
const TIMEOUT_MS = 10_000;

/** MailLog.status に入る値。 */
export const MAIL_STATUS = {
  /** Resend が受理した */
  SENT: "SENT",
  /** 送ろうとして失敗した（要対応） */
  FAILED: "FAILED",
  /** 意図的に送らなかった（停止スイッチ・宛先未設定） */
  SKIPPED: "SKIPPED",
} as const;

export type MailResult =
  | { ok: true; providerId: string | null }
  | { ok: false; status: "FAILED" | "SKIPPED"; reason: string };

/**
 * 送信の結果を記録する。
 * ここが失敗しても本来の処理（会員登録・問い合わせの受付）は止めない。
 * S-09：本文と入力値は保存しない。保存するのは宛先・件名・状態・失敗理由まで。
 */
async function recordMailLog(params: {
  kind: MailKind;
  to: string;
  subject: string;
  status: string;
  providerId?: string | null;
  reason?: string | null;
}): Promise<void> {
  try {
    await prisma.mailLog.create({
      data: {
        kind: params.kind,
        to: params.to,
        subject: params.subject,
        status: params.status,
        providerId: params.providerId ?? null,
        reason: params.reason ? params.reason.slice(0, REASON_MAX_LENGTH) : null,
      },
    });
  } catch (error) {
    // D-07：握り潰さずログには残す。記録できないこと自体で送信処理を落とさない。
    console.error("メール送信ログを記録できませんでした:", error);
  }
}

/** 記録まで含めて「送らなかった」を返す。 */
async function skip(kind: MailKind, payload: MailPayload, reason: string): Promise<MailResult> {
  await recordMailLog({
    kind,
    to: payload.to.join(", "),
    subject: payload.subject,
    status: MAIL_STATUS.SKIPPED,
    reason,
  });
  return { ok: false, status: MAIL_STATUS.SKIPPED, reason };
}

/** 記録まで含めて「失敗した」を返す。 */
async function fail(kind: MailKind, payload: MailPayload, reason: string): Promise<MailResult> {
  console.error(`メール送信に失敗しました（${kind}）: ${reason}`);
  await recordMailLog({
    kind,
    to: payload.to.join(", "),
    subject: payload.subject,
    status: MAIL_STATUS.FAILED,
    reason,
  });
  return { ok: false, status: MAIL_STATUS.FAILED, reason };
}

/**
 * 実際に1通送る。全ての送信関数はここを通る。
 * 例外は投げない。呼び出し側（会員登録・問い合わせ）は、メールが送れなくても
 * 本来の受付そのものは成功として扱うため。
 */
async function deliver(kind: MailKind, payload: MailPayload): Promise<MailResult> {
  // O-05：停止スイッチ。事故時にコードを直さず送信を止められるようにしてある。
  if (!(await isMailSendingEnabled())) {
    return skip(kind, payload, "停止スイッチが入っているため送信しませんでした");
  }

  // 差出人が create 時のプレースホルダ（例: noreply@renoel.example.com）のまま本番に
  // 出ていると、送っても受信者に届かず、なりすまし判定もされる。送らずに記録する。
  if (
    process.env.NODE_ENV === "production" &&
    /(^|\.)example\.(com|org|net|invalid)$/i.test(MAIL_FROM.address.split("@")[1] ?? "")
  ) {
    return fail(
      kind,
      payload,
      "MAIL_FROM_ADDRESS が未設定（example ドメインのプレースホルダのまま）です"
    );
  }

  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    // 開発中に本文を確認できるよう、コンソールには出す。
    // ただし「送れた」ことにはしない（これが以前の事故の原因だった）。
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `RESEND_API_KEY が未設定のため送信していません。本文は以下のとおりです。\n` +
          `To: ${payload.to.join(", ")}\nSubject: ${payload.subject}\n\n${payload.text}`
      );
    }
    return fail(kind, payload, "RESEND_API_KEY が未設定です");
  }

  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // タイムアウト・名前解決の失敗など。S-01：例外文にAPIキーは含まれない。
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? `Resend への接続が ${TIMEOUT_MS / 1000} 秒で応答しませんでした`
        : `Resend へ接続できませんでした: ${error instanceof Error ? error.name : "unknown"}`;
    return fail(kind, payload, reason);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // 応答がJSONでないこともある。その場合は本文なしとして扱う。
  }

  if (!response.ok) {
    return fail(kind, payload, summarizeResendError(response.status, body));
  }

  const providerId =
    body && typeof body === "object" && typeof (body as { id?: unknown }).id === "string"
      ? (body as { id: string }).id
      : null;

  await recordMailLog({
    kind,
    to: payload.to.join(", "),
    subject: payload.subject,
    status: MAIL_STATUS.SENT,
    providerId,
  });

  return { ok: true, providerId };
}

/** 会員登録の完了メール（本人宛）。 */
export async function sendRegistrationEmail(data: {
  name: string;
  email: string;
  tel: string;
}): Promise<MailResult> {
  return deliver(MAIL_KIND.REGISTRATION, buildRegistrationMail(data));
}

/** 新規入会の通知メール（管理者宛）。宛先が未設定なら送らない。 */
export async function sendRegistrationAdminNotice(data: {
  name: string;
  email: string;
  tel: string;
}): Promise<MailResult> {
  const payload = buildRegistrationAdminMail({ ...data, adminAddress: MAIL_ADMIN_ADDRESS });
  if (!MAIL_ADMIN_ADDRESS) {
    return skip(MAIL_KIND.REGISTRATION_ADMIN, payload, "MAIL_ADMIN_ADDRESS が未設定です");
  }
  return deliver(MAIL_KIND.REGISTRATION_ADMIN, payload);
}

/** 物件へのお問い合わせ受付メール（本人宛）。 */
export async function sendInquiryEmail(data: {
  name: string;
  email: string;
  tel: string;
  message: string;
  propertyTitle: string;
}): Promise<MailResult> {
  return deliver(MAIL_KIND.INQUIRY, buildInquiryMail(data));
}

/** 物件へのお問い合わせ着信の通知メール（管理者宛）。宛先が未設定なら送らない。 */
export async function sendInquiryAdminNotice(data: {
  name: string;
  email: string;
  tel: string;
  message: string;
  propertyTitle: string;
  inquiryId: number;
  propertyObjMngNo?: string | null;
}): Promise<MailResult> {
  const payload = buildInquiryAdminMail({ ...data, adminAddress: MAIL_ADMIN_ADDRESS });
  if (!MAIL_ADMIN_ADDRESS) {
    return skip(MAIL_KIND.INQUIRY_ADMIN, payload, "MAIL_ADMIN_ADDRESS が未設定です");
  }
  return deliver(MAIL_KIND.INQUIRY_ADMIN, payload);
}
