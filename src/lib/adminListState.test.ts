import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePropertyListState, parseUserListState } from "./adminListState.ts";

const PROPERTY_STATE = {
  filter: { keyword: "佐久", syubetu: 2, level: "all", agency: "テスト不動産", top: "on" },
  page: 6,
  perPage: 50,
};
const USER_STATE = {
  filter: { keyword: "example", typeFilter: "STORE", statusFilter: "ACTIVE" },
  page: 3,
  perPage: 10,
};

test("物件：保存した絞り込み・ページ・表示件数をそのまま戻す", () => {
  assert.deepEqual(parsePropertyListState(PROPERTY_STATE), PROPERTY_STATE);
});

test("会員：保存した絞り込み・ページ・表示件数をそのまま戻す", () => {
  assert.deepEqual(parseUserListState(USER_STATE), USER_STATE);
});

test("保存が無い・形が違うときは戻さない", () => {
  for (const v of [null, undefined, "x", 6, [], {}, { page: 6, perPage: 50 }]) {
    assert.equal(parsePropertyListState(v), null);
    assert.equal(parseUserListState(v), null);
  }
});

test("ページが1未満・小数・文字のときは戻さない", () => {
  for (const page of [0, -1, 1.5, "6"]) {
    assert.equal(parsePropertyListState({ ...PROPERTY_STATE, page }), null);
    assert.equal(parseUserListState({ ...USER_STATE, page }), null);
  }
});

test("表示件数が選択肢に無いときは戻さない", () => {
  for (const perPage of [0, 20, 1000, "50"]) {
    assert.equal(parsePropertyListState({ ...PROPERTY_STATE, perPage }), null);
    assert.equal(parseUserListState({ ...USER_STATE, perPage }), null);
  }
});

test("物件：絞り込みの値が想定外なら戻さない", () => {
  const broken = [
    { keyword: 1 },
    { syubetu: "2" },
    { level: null },
    { agency: undefined },
    { top: "yes" },
  ];
  for (const patch of broken) {
    const v = { ...PROPERTY_STATE, filter: { ...PROPERTY_STATE.filter, ...patch } };
    assert.equal(parsePropertyListState(v), null, JSON.stringify(patch));
  }
});

test("会員：絞り込みの値が想定外なら戻さない", () => {
  for (const patch of [{ keyword: null }, { typeFilter: "MEMBER" }, { statusFilter: "DELETED" }]) {
    const v = { ...USER_STATE, filter: { ...USER_STATE.filter, ...patch } };
    assert.equal(parseUserListState(v), null, JSON.stringify(patch));
  }
});

test("余分な項目は持ち込まない", () => {
  const v = { ...USER_STATE, extra: 1, filter: { ...USER_STATE.filter, extra: 1 } };
  assert.deepEqual(parseUserListState(v), USER_STATE);
});
