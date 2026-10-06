import { test } from "node:test";
import assert from "node:assert/strict";

// 相対パス＋拡張子つきなのは node の標準テストランナーから読めるようにするため
// （src/lib/mailPayload.ts と同じ理由。@/ エイリアスは素の node で解決できない）。
import {
  isValidUserStatus,
  isValidInquiryStatus,
  isDisclosureLevel,
} from "./security.ts";

test("isValidUserStatus は ACTIVE / SUSPENDED だけ通す", () => {
  assert.equal(isValidUserStatus("ACTIVE"), true);
  assert.equal(isValidUserStatus("SUSPENDED"), true);
  assert.equal(isValidUserStatus("ADMIN"), false);
  assert.equal(isValidUserStatus("active"), false);
  assert.equal(isValidUserStatus(""), false);
});

test("isValidInquiryStatus は UNREAD / REPLIED だけ通す", () => {
  assert.equal(isValidInquiryStatus("UNREAD"), true);
  assert.equal(isValidInquiryStatus("REPLIED"), true);
  assert.equal(isValidInquiryStatus("DELETED"), false);
  assert.equal(isValidInquiryStatus("replied"), false);
});

test("isDisclosureLevel は 0 / 1 / 2（非表示）だけ通す（3以上を弾く）", () => {
  assert.equal(isDisclosureLevel(0), true);
  assert.equal(isDisclosureLevel(1), true);
  assert.equal(isDisclosureLevel(2), true);
  assert.equal(isDisclosureLevel(3), false);
  assert.equal(isDisclosureLevel(-1), false);
  assert.equal(isDisclosureLevel(Number.NaN), false);
  assert.equal(isDisclosureLevel("1"), false);
});
