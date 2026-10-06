import { test } from "node:test";
import assert from "node:assert/strict";
import { parseImageFileName, extensionOf, storagePathFor } from "./imageName.ts";

/**
 * D-06：解釈を間違えると別の物件に画像が付く。境界をテストで固定する。
 */

const ok = (listingCompanyNo: string, order: number, ext: string) => ({
  ok: true, listingCompanyNo, order, ext,
});

test("掲載会社管理番号と連番を読む", () => {
  assert.deepEqual(parseImageFileName("b01771-004624_2.jpg"), ok("b01771-004624", 2, "jpg"));
  assert.deepEqual(parseImageFileName("361720000388403_1.png"), ok("361720000388403", 1, "png"));
});

test("連番を省略すると1枚目になる", () => {
  assert.deepEqual(parseImageFileName("b01771-004624.png"), ok("b01771-004624", 1, "png"));
});

test("番号末尾の「-数字」を連番と取り違えない（区切りは _ だけ）", () => {
  assert.deepEqual(parseImageFileName("b01771-004624.jpg"), ok("b01771-004624", 1, "jpg"));
  assert.deepEqual(parseImageFileName("b01771-3.jpg"), ok("b01771-3", 1, "jpg"));
});

test("拡張子の大文字・ゼロ埋め連番・ドットを含む番号も読める", () => {
  assert.deepEqual(parseImageFileName("A-100_02.JPG"), ok("A-100", 2, "jpg"));
  assert.deepEqual(parseImageFileName("No.3098-M_3.webp"), ok("No.3098-M", 3, "webp"));
});

test("macOS の濁点分離（NFD）の名前も DB と同じ形（NFC）で読む", () => {
  const nfd = "テスト番号ガ_1.jpg".normalize("NFD");
  assert.deepEqual(parseImageFileName(nfd), ok("テスト番号ガ", 1, "jpg"));
});

test("対応していない形式は理由つきで断る", () => {
  const r = parseImageFileName("6991580385_1.gif");
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /対応していない形式/);
});

test("番号が空・「-」だけの名前は断る（番号が空の物件に付けないため）", () => {
  for (const n of ["_1.jpg", "-.jpg", "－_2.jpg", " _1.jpg"]) {
    assert.equal(parseImageFileName(n).ok, false, `${n} が通ってしまう`);
  }
});

test("拡張子が無いものは断る", () => {
  assert.equal(parseImageFileName("6991580385").ok, false);
});

test("extensionOf は小文字で返す", () => {
  assert.equal(extensionOf("a.JPEG"), "jpeg");
  assert.equal(extensionOf("noext"), "");
});

test("保存先は物件ごとのフォルダ＋ゼロ埋め連番", () => {
  assert.equal(storagePathFor("6991580385", 2, "jpg"), "6991580385/002.jpg");
});
