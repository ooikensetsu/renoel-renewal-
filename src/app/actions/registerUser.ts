"use server";

import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/errors";
import { sendRegistrationEmail, sendRegistrationAdminNotice } from "@/lib/mail";
import { ROLE, USER_STATUS, BCRYPT_ROUNDS, RATE_LIMITS } from "@/config/security";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
// S-08：長さの上限と形式の判定は config/inputLimits.ts に集約している（D-19）。
import { INPUT_LIMITS, isValidEmail, withinLimit } from "@/config/inputLimits";

/** パスワードの最低文字数。 */
const MIN_PASSWORD_LENGTH = 8;

export async function registerUser(formData: FormData) {
  const email = formData.get("email")?.toString()?.trim();
  const password = formData.get("password")?.toString();
  const passwordConfirm = formData.get("passwordConfirm")?.toString();
  const name = formData.get("name")?.toString()?.trim();
  const tel = formData.get("tel")?.toString()?.trim();
  const zip = formData.get("zip")?.toString()?.trim();
  const address = formData.get("address")?.toString()?.trim();

  if (!email || !password) {
    return { success: false as const, error: "メールアドレスとパスワードは必須です" };
  }
  if (!isValidEmail(email)) {
    return { success: false as const, error: "メールアドレスの形式が正しくありません" };
  }
  if (password !== passwordConfirm) {
    return { success: false as const, error: "パスワードが一致しません" };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      success: false as const,
      error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください`,
    };
  }
  if (
    !withinLimit(name, INPUT_LIMITS.name) ||
    !withinLimit(tel, INPUT_LIMITS.tel) ||
    !withinLimit(zip, INPUT_LIMITS.zip) ||
    !withinLimit(address, INPUT_LIMITS.address)
  ) {
    return { success: false as const, error: "入力された文字数が上限を超えています" };
  }

  // S-08：同一IPからの登録試行を絞る（総当たり・大量アカウント作成の抑止）
  const ip = await clientIp();
  const ipLimit = await checkRateLimit(
    `register:ip:${ip}`,
    RATE_LIMITS.registrationByIp.limit,
    RATE_LIMITS.registrationByIp.windowSeconds
  );
  if (!ipLimit.ok) {
    return {
      success: false as const,
      error: "短時間に登録の試行が続いています。しばらくおいてから再度お試しください。",
    };
  }

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      // S-12：アカウント列挙対策。
      // 「既に登録済み」か「過去に退会済み」かを画面で区別しない
      //   （退会済みである、という機微な事実の開示を塞ぐ）。
      // 完全な非開示にはメール確認フローが必要（docs/debt.md に TODO:未確認）。
      // ここでは active / deleted を1つの文言に統合し、レート制限（上記）で補う。
      return {
        success: false as const,
        error:
          "このメールアドレスはご利用いただけません。既にご登録済みの場合はログインをお試しください。ご不明な場合はお問い合わせ窓口までご連絡ください。",
      };
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        tel,
        zip,
        address,
        // 会員登録から管理者権限は絶対に付与しない（S-07）
        role: ROLE.USER,
        status: USER_STATUS.ACTIVE,
        memberType: "MEMBER",
      },
    });

    // メール送信が失敗しても、登録そのものは成立している。
    // 失敗は MailLog に記録され、管理画面 /admin/mail-logs から確認できる。
    const notice = { name: name || "ゲスト", email, tel: tel || "" };
    const mail = await sendRegistrationEmail(notice);
    await sendRegistrationAdminNotice(notice);

    // D-03：届いていないのに「送信しました」と画面に出さない。
    // 実際の送信結果を返し、画面側で文言を出し分ける。
    return { success: true as const, mailSent: mail.ok };
  } catch (error) {
    return reportError("registerUser", error, "登録できませんでした。");
  }
}
