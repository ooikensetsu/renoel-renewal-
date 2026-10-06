# 物件CSVの形式

管理画面 `/admin/properties` の「一括入力 (CSV)」で読み込むCSVの列。

- 1行目がヘッダー。列の順番は問わない。**列名が一致しない列は無視される**（エラーにならない）
- 文字コードは UTF-8 と Shift-JIS の両方を受ける（Excel保存でも可）。判定結果は取込画面に表示される
- 値にカンマを含む場合は `"` で囲む（例: `"3LDK（和 8･6　洋 12）"`）
- 値がない項目は空欄でも `－` でもよい。どちらも「値なし」として扱う
- **実データのCSVはリポジトリに置かない**（`.gitignore` の `*.csv` で除外している）

## 必須の列

| 列名 | 内容 | 備考 |
| :--- | :--- | :--- |
| `objMngNo` | 物件管理番号 | 必須・一意。athome の10桁番号がそのまま入る。突合キーではない（2026-10-06 から）。一致した物件ではCSVの値で書き換わる |
| `title` | 物件名 | |
| `priceMan` | 価格 | **万円単位の整数**。`400` = 400万円 |
| `address` | 所在地 | |
| `madori` | 間取り | |

## 区分の列（値を誤ると取込が中止される）

| 列名 | 内容 | 既定値 |
| :--- | :--- | :--- |
| `cityCd` | 市区町村コード（5桁） | `20217`（佐久市） |
| `prefCd` | 都道府県コード | `20`（長野県） |
| `syubetu` | 物件種別 | `2` |
| `disclosureLevel` | 公開レベル | `0` |

**`cityCd` に使える値**（`src/config/property.ts` の `AREAS`）

| コード | 市区町村 | コード | 市区町村 |
| :--- | :--- | :--- | :--- |
| 20217 | 佐久市 | 20321 | 軽井沢町 |
| 20208 | 小諸市 | 20323 | 御代田町 |
| 20219 | 東御市 | 20324 | 立科町 |
| 20309 | 佐久穂町 | | |

これ以外のコードがあると**1件も取り込まずに中止**する。エリアを増やすときは `AREAS` に追加する。

**`syubetu` に使える値**：`1`=土地 / `2`=一戸建て / `3`=マンション
**`disclosureLevel`**：`0`=一般公開 / `1`=会員限定（未ログインには価格・所在地・間取り・画像を返さない）

## 物件概要の列（すべて任意）

| 列名 | athome の項目 |
| :--- | :--- |
| `syumoku` | 物件種目（例: 中古一戸建て） |
| `trafficNote` | 交通（表示用の全文） |
| `trafficLine` / `trafficStation` | 沿線名 / 駅名 |
| `walkMinutes` | 駅からの徒歩（分） |
| `leaseTermRent` | 借地期間・地代 |
| `keyMoney` | 権利金 |
| `depositGuarantee` | 敷金・保証金 |
| `maintenanceCost` | 維持費等 |
| `otherLumpSum` | その他一時金 |
| `landMen` / `bldMen` | 土地面積 / 建物面積（㎡） |
| `bldY` / `bldM` | 築年 / 築月 |
| `floorsInfo` | 階建/階 |
| `parking` | 駐車場 |
| `bldStructure` | 建物構造 |
| `landRight` | 土地権利 |
| `currentState` | 現況 |
| `deliveryTiming` | 引渡可能時期 |
| `transactionType` | 取引態様 |
| `listingCompanyNo` | 掲載会社管理番号。**`agencyName` と組で突合キー。空（「－」「-」を含む）の行は取り込まない** |
| `publishedOn` | 情報公開日 |
| `nextUpdateOn` | 次回更新予定日 |

日付は `2026年8月18日` `2026/8/18` `2026-08-18` のいずれでも読める。
読めない書式はその列だけ空になる（取込は止まらない）ので、取込後に画面で確認すること。

## マンション固有（任意）

`mgmtFeeYen`（管理費 円/月） / `repairFundYen`（修繕積立金 円/月） / `totalUnits`（総戸数） /
`floorNo`（所在階） / `direction`（向き） / `balconyMen`（バルコニー面積 ㎡） / `mgmtForm`（管理形態）

## 土地固有（任意）

`buildingCoverage`（建ぺい率 %） / `floorAreaRatio`（容積率 %） / `zoning`（用途地域） /
`landCategory`（地目） / `cityPlanning`（都市計画） / `roadAccess`（接道状況） / `privateRoad`（私道負担）

## 取扱店（任意）

`agencyName` / `agencyAddress` / `agencyTel` / `agencyLicense`

宅建業法の広告表示に関わる。列としては保持するが、**画面に出すかは未決定**。

## 【要確認】

- `syubetu` の 1/2/3 は**当システムの独自定義**。athome / ATBB のエクスポートCSVが別の番号体系を
  使っている場合は、取込前に変換するか、この表を向こうに合わせる必要がある。
- 上の列名も当システムの命名。**実際のエクスポートCSVのヘッダーと突き合わせていない。**
  ヘッダー行が手に入り次第、対応表を作るか列名を寄せること。
