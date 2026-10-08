import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchesAdminFilter,
  agencyOptions,
  NO_AGENCY,
  type AdminPropertyFilter,
  type FilterableProperty,
} from "./adminPropertyFilter.ts";

/** テスト用の物件。値は架空（画面には出ない）。 */
function prop(overrides: Partial<FilterableProperty> = {}): FilterableProperty {
  return {
    title: "テスト物件",
    syubetu: 2,
    disclosureLevel: 0,
    listingCompanyNo: "A-100",
    agencyName: "テスト不動産",
    address: "姫路市テスト町1",
    madori: "3LDK",
    areaName: "姫路市",
    showOnTop: false,
    ...overrides,
  };
}

const ALL: AdminPropertyFilter = { keyword: "", syubetu: "all", level: "all", agency: "all", top: "all" };

test("指定なしなら全件通る", () => {
  assert.equal(matchesAdminFilter(prop(), ALL), true);
});

test("物件種別・公開レベルで絞れる（非表示も選べる）", () => {
  assert.equal(matchesAdminFilter(prop({ syubetu: 3 }), { ...ALL, syubetu: 2 }), false);
  assert.equal(matchesAdminFilter(prop({ syubetu: 3 }), { ...ALL, syubetu: 3 }), true);
  assert.equal(matchesAdminFilter(prop({ disclosureLevel: 2 }), { ...ALL, level: 2 }), true);
  assert.equal(matchesAdminFilter(prop({ disclosureLevel: 0 }), { ...ALL, level: 2 }), false);
});

test("取扱店で絞れる。空欄・null は「未登録」として選べる", () => {
  assert.equal(matchesAdminFilter(prop(), { ...ALL, agency: "テスト不動産" }), true);
  assert.equal(matchesAdminFilter(prop(), { ...ALL, agency: "別の会社" }), false);
  assert.equal(matchesAdminFilter(prop({ agencyName: null }), { ...ALL, agency: NO_AGENCY }), true);
  assert.equal(matchesAdminFilter(prop({ agencyName: "  " }), { ...ALL, agency: NO_AGENCY }), true);
});

test("検索語は掲載会社管理番号に当たり、物件管理番号には当てない", () => {
  assert.equal(matchesAdminFilter(prop(), { ...ALL, keyword: "a-100" }), true);
  // FilterableProperty に objMngNo が無い＝検索対象に入れようがない、を型で保証している。
  assert.equal(matchesAdminFilter(prop(), { ...ALL, keyword: "9999999999" }), false);
});

test("取扱店の選択肢は件数の多い順で、未登録は最後", () => {
  const options = agencyOptions([
    { agencyName: "B社" },
    { agencyName: null },
    { agencyName: "A社" },
    { agencyName: "B社" },
  ]);
  assert.deepEqual(
    options.map((o) => [o.label, o.count]),
    [["B社", 2], ["A社", 1], ["未登録", 1]]
  );
});

test("トップ掲載で絞れる（掲載中だけ・掲載していないものだけ）", () => {
  assert.equal(matchesAdminFilter(prop({ showOnTop: true }), { ...ALL, top: "on" }), true);
  assert.equal(matchesAdminFilter(prop({ showOnTop: false }), { ...ALL, top: "on" }), false);
  assert.equal(matchesAdminFilter(prop({ showOnTop: false }), { ...ALL, top: "off" }), true);
  assert.equal(matchesAdminFilter(prop({ showOnTop: true }), { ...ALL, top: "off" }), false);
  assert.equal(matchesAdminFilter(prop({ showOnTop: true }), ALL), true);
});
