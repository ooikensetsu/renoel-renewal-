import { test } from "node:test";
import assert from "node:assert/strict";
import {
  headerSafe,
  buildRegistrationMail,
  buildRegistrationAdminMail,
  buildInquiryMail,
  buildInquiryAdminMail,
  summarizeResendError,
  REASON_MAX_LENGTH,
} from "./mailPayload.ts";

/**
 * D-06：メールは「変えたつもりが変わっていない」「宛先を間違える」が起きやすい。
 * 実行は `pnpm test`（node の標準テストランナー。新しい依存は足していない → S-05）。
 */

test("会員登録の完了メールは本人宛に送られ、パスワードを含まない", () => {
  const mail = buildRegistrationMail({
    name: "佐久 太郎",
    email: "taro@example.com",
    tel: "090-0000-0000",
  });
  assert.deepEqual(mail.to, ["taro@example.com"]);
  assert.ok(mail.subject.includes("無料会員登録"));
  assert.ok(mail.text.includes("佐久 太郎 様"));
  // S-07：パスワードは控えメールに載せない
  assert.ok(!/パスワード:/.test(mail.text));
});

test("電話番号が空でも本文が壊れず「未登録」と出る", () => {
  const mail = buildRegistrationMail({ name: "名無し", email: "a@example.com", tel: "" });
  assert.ok(mail.text.includes("お電話番号: 未登録"));
});

test("管理者宛の入会通知は管理者アドレスへ送られ、返信先が入会者になる", () => {
  const mail = buildRegistrationAdminMail({
    name: "佐久 太郎",
    email: "taro@example.com",
    tel: "090-0000-0000",
    adminAddress: "admin@example.co.jp",
  });
  assert.deepEqual(mail.to, ["admin@example.co.jp"]);
  assert.equal(mail.reply_to, "taro@example.com");
});

test("問い合わせの控えは本人宛、通知は管理者宛と、宛先が入れ替わらない", () => {
  const input = {
    name: "佐久 花子",
    email: "hanako@example.com",
    tel: "",
    message: "内見を希望します",
    propertyTitle: "佐久平の中古戸建",
  };
  const toUser = buildInquiryMail(input);
  const toAdmin = buildInquiryAdminMail({
    ...input,
    inquiryId: 42,
    adminAddress: "admin@example.co.jp",
  });

  assert.deepEqual(toUser.to, ["hanako@example.com"]);
  assert.deepEqual(toAdmin.to, ["admin@example.co.jp"]);
  assert.equal(toAdmin.reply_to, "hanako@example.com");
  // 管理者宛には受付番号を載せ、管理画面と突き合わせられるようにする
  assert.ok(toAdmin.text.includes("42"));
  // 本人宛の控えに受付番号や管理画面URLを混ぜない
  assert.ok(!toUser.text.includes("/admin"));
});

test("管理者宛の通知に物件管理番号が載る", () => {
  const mail = buildInquiryAdminMail({
    name: "佐久 花子",
    email: "hanako@example.com",
    tel: "",
    message: "内見を希望します",
    propertyTitle: "佐久平の中古戸建",
    inquiryId: 42,
    adminAddress: "admin@example.co.jp",
    propertyObjMngNo: "6991837899",
  });
  assert.ok(mail.text.includes("【物件管理番号】 6991837899"));
});

test("一般の問い合わせでは物件管理番号の行を出さない", () => {
  const mail = buildInquiryAdminMail({
    name: "佐久 花子",
    email: "hanako@example.com",
    tel: "",
    message: "資料がほしい",
    propertyTitle: "指定なし",
    inquiryId: 43,
    adminAddress: "admin@example.co.jp",
    propertyObjMngNo: null,
  });
  assert.ok(!mail.text.includes("物件管理番号"));
});

test("問い合わせ本文と物件名は両方のメールにそのまま載る", () => {
  const input = {
    name: "佐久 花子",
    email: "hanako@example.com",
    tel: "0267-00-0000",
    message: "内見を希望します",
    propertyTitle: "佐久平の中古戸建",
  };
  const toUser = buildInquiryMail(input);
  assert.ok(toUser.text.includes("内見を希望します"));
  assert.ok(toUser.text.includes("佐久平の中古戸建"));
});

test("Resend のエラー応答は1行に要約され、上限文字数に収まる", () => {
  assert.equal(
    summarizeResendError(422, { statusCode: 422, name: "validation_error", message: "Invalid `from` field." }),
    "HTTP 422: Invalid `from` field."
  );
  // 改行を含む長文でも1行に潰れ、上限を超えない
  const long = summarizeResendError(500, "a\nb".repeat(500));
  assert.ok(!long.includes("\n"));
  assert.ok(long.length <= REASON_MAX_LENGTH);
});

test("JSONでない応答でもステータスだけは残る", () => {
  assert.equal(summarizeResendError(502, null), "HTTP 502");
});

/**
 * IPA 8-(iii)：外部からの入力の全てについて、改行コードを削除する。
 * docs/inspections.md 2026-09-03 の指摘5。件名・宛先・返信先に改行を残さない。
 */

test("headerSafe は CR / LF / CRLF を落とし、前後の空白を詰める", () => {
  assert.equal(headerSafe("山田\r\nBcc: attacker@example.invalid"), "山田 Bcc: attacker@example.invalid");
  assert.equal(headerSafe("改行\nだけ"), "改行 だけ");
  assert.equal(headerSafe("復帰\rだけ"), "復帰 だけ");
  assert.equal(headerSafe("  前後  "), "前後");
  // 通常の値は変えない
  assert.equal(headerSafe("佐久 太郎"), "佐久 太郎");
});

test("入会通知の件名に、氏名の改行が持ち込まれない", () => {
  const mail = buildRegistrationAdminMail({
    name: "山田\r\nBcc: attacker@example.invalid",
    email: "taro@example.com",
    tel: "",
    adminAddress: "admin@example.co.jp",
  });
  assert.ok(!/[\r\n]/.test(mail.subject), `件名に改行が残っている: ${JSON.stringify(mail.subject)}`);
  assert.ok(mail.subject.includes("山田"));
});

test("問い合わせ通知の件名に、物件名の改行が持ち込まれない", () => {
  const mail = buildInquiryAdminMail({
    name: "佐久 太郎",
    email: "taro@example.com",
    tel: "",
    message: "内見を希望します",
    propertyTitle: "佐久平の戸建\r\nX-Injected: 1",
    inquiryId: 1,
    adminAddress: "admin@example.co.jp",
  });
  assert.ok(!/[\r\n]/.test(mail.subject), `件名に改行が残っている: ${JSON.stringify(mail.subject)}`);
});

test("宛先と返信先にも改行が残らない", () => {
  const mail = buildInquiryAdminMail({
    name: "名無し",
    email: "taro@example.com\r\nBcc: attacker@example.invalid",
    tel: "",
    message: "本文",
    propertyTitle: "物件",
    inquiryId: 2,
    adminAddress: "admin@example.co.jp\r\nX: 1",
  });
  assert.ok(!/[\r\n]/.test(mail.to[0]!));
  assert.ok(!/[\r\n]/.test(mail.reply_to!));
  // 本人宛の控えも同じ
  const toUser = buildInquiryMail({
    name: "名無し",
    email: "taro@example.com\r\nBcc: attacker@example.invalid",
    tel: "",
    message: "本文",
    propertyTitle: "物件",
  });
  assert.ok(!/[\r\n]/.test(toUser.to[0]!));
});

test("問い合わせ本文の改行は保つ（本文はヘッダではない）", () => {
  const mail = buildInquiryMail({
    name: "佐久 太郎",
    email: "taro@example.com",
    tel: "",
    message: "1行目\n2行目",
    propertyTitle: "物件",
  });
  assert.ok(mail.text.includes("1行目\n2行目"));
});
