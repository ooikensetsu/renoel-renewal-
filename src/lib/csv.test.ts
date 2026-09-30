import { test } from "node:test";
import assert from "node:assert/strict";
import { splitCsvLine, parseCsv, toCsvValue, buildCsv } from "./csv.ts";

/**
 * D-06：取込は「間違った値が静かに入る」形で壊れるため、機械で確かめる。
 */

test("引用符の中のカンマで列がずれない", () => {
  assert.deepEqual(
    splitCsvLine('6991837899,"佐久市 前山","3LDK（和 8･6　洋 12）",480'),
    ["6991837899", "佐久市 前山", "3LDK（和 8･6　洋 12）", "480"]
  );
});

test("引用符なしの通常行も従来どおり読める", () => {
  assert.deepEqual(splitCsvLine("1,2,3"), ["1", "2", "3"]);
});

test("空の列は空文字になる（列がずれない）", () => {
  assert.deepEqual(splitCsvLine("1,,3"), ["1", "", "3"]);
});

test('連続した引用符 "" は引用符1つとして読む', () => {
  assert.deepEqual(splitCsvLine('"a""b",c'), ['a"b', "c"]);
});

test("ヘッダー付きの本文を連想配列にできる", () => {
  const rows = parseCsv('objMngNo,title,priceMan\r\n6991580385,"佐久市 内山",400\r\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].objMngNo, "6991580385");
  assert.equal(rows[0].title, "佐久市 内山");
  assert.equal(rows[0].priceMan, "400");
});

test("BOM付きでもヘッダー名が壊れない", () => {
  const rows = parseCsv("﻿objMngNo,title\n123,あ\n");
  assert.equal(rows[0].objMngNo, "123");
});

test("値の数がヘッダーより少なくても落ちない", () => {
  const rows = parseCsv("a,b,c\n1,2\n");
  assert.equal(rows[0].c, "");
});

test("書き出しでカンマを含む値は引用符で囲まれる", () => {
  assert.equal(toCsvValue("3LDK（和 8･6　洋 12）,南向き"), '"3LDK（和 8･6　洋 12）,南向き"');
});

test("書き出しの引用符は二重にして囲まれる", () => {
  assert.equal(toCsvValue('佐久市 "前山"'), '"佐久市 ""前山"""');
});

test("書き出しで囲む必要がない値はそのまま", () => {
  assert.equal(toCsvValue("佐久市前山"), "佐久市前山");
});

test("数式として実行される先頭文字は無効化される", () => {
  assert.equal(toCsvValue("=1+1"), "'=1+1");
  assert.equal(toCsvValue("@SUM(A1)"), "'@SUM(A1)");
});

test("null と undefined は空文字になる", () => {
  assert.equal(toCsvValue(null), "");
  assert.equal(toCsvValue(undefined), "");
});

test("書き出した CSV を読み直すと元の値に戻る（往復で壊れない）", () => {
  const csv = buildCsv(
    ["objMngNo", "title", "address"],
    [["6991837899", "3LDK（和 8･6　洋 12）,南向き", '佐久市 "前山" 1-2']]
  );
  const parsed = parseCsv(csv);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].title, "3LDK（和 8･6　洋 12）,南向き");
  assert.equal(parsed[0].address, '佐久市 "前山" 1-2');
});
