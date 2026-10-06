"use client";

import { useState, useRef, useEffect, useMemo, useId } from "react";
import { parseCsv, decodeCsvBuffer, buildCsv } from "@/lib/csv";
import { blankToNull } from "@/lib/blank";
import BulkImageUpload from "./BulkImageUpload";
import BulkDisclosureBar from "./BulkDisclosureBar";
import DisclosureBadge from "@/components/DisclosureBadge";
import {
  Search, Pencil, ImageOff,
  Upload, Download, X, Check, AlertCircle, Info
} from "lucide-react";
import Link from "next/link";
import { DISCLOSURE_LEVEL_LABEL } from "@/config/security";
import { PROPERTY_TYPE_LABEL, PROPERTY_TYPE_TAB_ORDER } from "@/config/property";
import {
  matchesAdminFilter,
  agencyOptions,
  type AdminPropertyFilter,
} from "@/lib/adminPropertyFilter";
import {
  compareCSVData,
  importProperties,
  getProperties,
  type DiffResult,
  type IncomingProperty,
} from "@/app/actions/properties";

type PropertyRow = {
  id: number;
  /** 物件管理番号。DBは BigInt だがサーバーアクションが文字列にして返す。CSV出力でだけ使う。 */
  objMngNo: string;
  /** 掲載会社管理番号。一覧にはこちらを出す（2026-10-06 大野の指示） */
  listingCompanyNo: string | null;
  /** 物件種別（src/config/property.ts の PROPERTY_TYPE） */
  syubetu: number;
  /** 取扱不動産会社名・電話番号 */
  agencyName: string | null;
  agencyTel: string | null;
  title: string;
  priceMan: number;
  madori: string | null;
  address: string | null;
  disclosureLevel: number;
  /** 市区町村コードから引いたエリア名。対象外なら null。 */
  areaName?: string | null;
  /** 登録画像の1枚目の公開URL。1枚も無ければ null。 */
  imageUrl?: string | null;
  /** 登録画像の枚数。0枚の物件を見つけられるようにする。 */
  imageCount?: number;
};

export default function PropertyManagement() {
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importStatus, setImportStatus] = useState<"idle" | "parsing" | "preview" | "importing" | "success" | "error">("idle");
  const [diffResults, setDiffResults] = useState<DiffResult[]>([]);
  const [approvedIndices, setApprovedItems] = useState<Set<number>>(new Set());
  const [errorMessage, setErrorMessage] = useState("");
  // 読み取ったCSVの文字コード。化けたときの切り分けに使う。
  const [detectedEncoding, setDetectedEncoding] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    count: number;
    created: number;
    overwritten: number;
    backupId: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 一覧の絞り込み。判定は src/lib/adminPropertyFilter.ts に集約している。
  const NO_FILTER: AdminPropertyFilter = { keyword: "", syubetu: "all", level: "all", agency: "all" };
  const [filter, setFilter] = useState<AdminPropertyFilter>(NO_FILTER);
  // 一括編集の対象。絞り込みを変えたら選択は解く（見えていない物件を書き換えないため）。
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [notice, setNotice] = useState("");
  const searchId = useId();
  const levelId = useId();
  const agencyId = useId();

  const updateFilter = (patch: Partial<AdminPropertyFilter>) => {
    setFilter((prev) => ({ ...prev, ...patch }));
    setSelectedIds(new Set());
  };

  // 取得だけを行う（useEffect の同期本体で setState しないため分けている）
  const fetchProperties = async () => {
    const res = await getProperties();
    if (res.success) {
      setProperties(res.data as PropertyRow[]);
    } else {
      setErrorMessage(res.error);
    }
  };

  const loadProperties = async () => {
    setIsLoading(true);
    setErrorMessage("");
    await fetchProperties();
    setIsLoading(false);
  };

  useEffect(() => {
    // isLoading の初期値が true なので、ここで立て直さない
    void (async () => {
      await fetchProperties();
      setIsLoading(false);
    })();
  }, []);

  const handleExport = () => {
    const headers = ["objMngNo", "title", "priceMan", "madori", "address", "disclosureLevel"];
    const rows = properties.map(p => [p.objMngNo, p.title, p.priceMan, p.madori || "", p.address || "", p.disclosureLevel || 0]);
    // buildCsv で引用符処理を通す。以前は join(",") で連結していたため、
    // 物件名や住所にカンマが1つ入るだけで列がずれ、書き出したCSVを
    // 取り込み直すと壊れていた（読み取り側の splitCsvLine とだけ食い違っていた）。
    const csvContent = buildCsv(headers, rows);
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `properties_${new Date().getTime()}.csv`;
    link.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus("parsing");
    setErrorMessage("");
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        // Excel の「CSV形式で保存」は既定で Shift-JIS。UTF-8 決め打ちだと日本語が全て化けるため、
        // バイト列で受け取って文字コードを判定する。
        const buffer = event.target?.result as ArrayBuffer;
        const { text, encoding } = decodeCsvBuffer(buffer);
        setDetectedEncoding(encoding);
        // 引用符に対応した分解。値の中のカンマで列がずれない。
        const data = parseCsv(text) as IncomingProperty[];
        if (data.length === 0) {
          setErrorMessage("データ行がありません。1行目がヘッダー、2行目以降がデータになっているかご確認ください。");
          setImportStatus("error");
          return;
        }

        // D-17 手順1：まず数える。この時点ではまだ1件も書き込まれていない。
        const res = await compareCSVData(data);
        if (!res.success) {
          setErrorMessage(res.error);
          setImportStatus("error");
          return;
        }
        setDiffResults(res.data);
        // 取り込まない行（掲載会社管理番号が空など）は最初から外し、選べないようにする。
        setApprovedItems(new Set(res.data.flatMap((d, i) => (d.type === "skip" ? [] : [i]))));
        setImportStatus("preview");
      } catch (err) {
        console.error("CSVの解析に失敗:", err);
        setErrorMessage("CSVを読み取れませんでした。文字コードと列名をご確認ください。");
        setImportStatus("error");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImportExecute = async () => {
    const itemsToImport = diffResults
      .filter((_, i) => approvedIndices.has(i))
      .map(d => d.incoming);

    // D-17 手順3：画面に出ている件数を、そのまま想定件数としてサーバーへ渡す。
    // サーバー側で実際の対象件数と突き合わせ、ずれていれば書き込まずに中止する。
    const expectedCount = itemsToImport.length;

    if (!window.confirm(
      `${expectedCount}件を取り込みます。\n` +
      `うち ${diffResults.filter((d, i) => approvedIndices.has(i) && d.type === "update").length}件は既存データを上書きします。\n\n` +
      `上書き前のデータは控えとして保存されますが、実行してよろしいですか？`
    )) {
      return;
    }

    setImportStatus("importing");
    setErrorMessage("");
    const res = await importProperties(itemsToImport, expectedCount);
    if (!res.success) {
      setErrorMessage(res.error);
      setImportStatus("error");
      return;
    }
    setImportResult({
      count: res.count,
      created: res.created,
      overwritten: res.overwritten,
      backupId: res.backupId,
    });
    setImportStatus("success");
    loadProperties();
  };

  const visibleProperties = useMemo(
    () => properties.filter((p) => matchesAdminFilter(p, filter)),
    [properties, filter]
  );
  const agencyChoices = useMemo(() => agencyOptions(properties), [properties]);
  // 種別タブの件数。種別以外の絞り込みは効かせたまま数える。
  const countBySyubetu = (code: "all" | number) =>
    properties.filter((p) => matchesAdminFilter(p, { ...filter, syubetu: code })).length;

  const isFiltered =
    filter.keyword.trim() !== "" || filter.syubetu !== "all" || filter.level !== "all" || filter.agency !== "all";

  const allVisibleSelected =
    visibleProperties.length > 0 && visibleProperties.every((p) => selectedIds.has(p.id));
  const toggleAllVisible = () => {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(visibleProperties.map((p) => p.id)));
  };
  const toggleSelected = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };
  const handleBulkDone = (message: string) => {
    setNotice(message);
    setSelectedIds(new Set());
    loadProperties();
  };

  const toggleApproval = (index: number) => {
    if (diffResults[index]?.type === "skip") return;
    const newSet = new Set(approvedIndices);
    if (newSet.has(index)) newSet.delete(index);
    else newSet.add(index);
    setApprovedItems(newSet);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <h1 className="text-2xl font-mincho font-bold text-ink mb-2">物件管理</h1>
          <p className="text-sm text-reno-mute-dark">
            掲載中の物件の登録・編集・CSVでの一括入出力を行います。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="bg-white border border-reno-line px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold text-ink hover:bg-reno-bg transition-colors"
          >
            <Upload size={18} /> 一括入力 (CSV)
          </button>
          <button
            onClick={handleExport}
            className="bg-white border border-reno-line px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold text-ink hover:bg-reno-bg transition-colors"
          >
            <Download size={18} /> 一括出力 (CSV)
          </button>
          <BulkImageUpload />
          {/* 「物件登録」ボタンがあったが、リンク先 /admin/properties/new の画面が存在せず
              404 になっていたため撤去した。新規登録はいまのところ CSV の一括入力で行う。 */}
        </div>
      </div>

      {errorMessage && !isImportModalOpen && (
        <p
          role="alert"
          className="bg-red-50 border border-red-200 text-red-800 rounded-2xl px-6 py-4 text-sm font-bold"
        >
          {errorMessage}
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="bg-teal/5 border border-teal/30 text-ink rounded-2xl px-6 py-4 text-sm font-bold"
        >
          {notice}
        </p>
      )}

      <div className="bg-white rounded-2xl border border-reno-line overflow-hidden">
        {/* ------------ 物件種別の切り替え ------------ */}
        <div role="tablist" aria-label="物件種別" className="flex flex-wrap gap-2 px-4 pt-4 bg-reno-bg/60">
          {(["all", ...PROPERTY_TYPE_TAB_ORDER] as ("all" | number)[]).map((code) => {
            const active = filter.syubetu === code;
            return (
              <button
                key={code}
                role="tab"
                aria-selected={active}
                onClick={() => updateFilter({ syubetu: code })}
                className={`px-4 py-2 rounded-t-xl text-sm font-bold border border-b-0 transition-colors ${
                  active
                    ? "bg-white border-reno-line text-ink"
                    : "bg-transparent border-transparent text-reno-mute-dark hover:text-ink"
                }`}
              >
                {code === "all" ? "すべて" : PROPERTY_TYPE_LABEL[code]}
                <span className="ml-1.5 text-xs">({countBySyubetu(code)})</span>
              </button>
            );
          })}
        </div>

        {/* ------------ 絞り込み ------------ */}
        <div className="p-4 border-b border-reno-line flex flex-wrap justify-between items-center gap-4 bg-reno-bg/60">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative">
              <label htmlFor={searchId} className="sr-only">物件名・掲載会社管理番号・所在地で検索</label>
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-reno-mute-dark pointer-events-none"
                size={18}
              />
              <input
                id={searchId}
                type="search"
                value={filter.keyword}
                onChange={(e) => updateFilter({ keyword: e.target.value })}
                placeholder="物件名・掲載会社管理番号・所在地で検索"
                className="pl-11 pr-4 py-2.5 rounded-xl border border-reno-line bg-white text-sm w-96 outline-none focus:border-teal"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor={levelId} className="text-sm font-bold text-reno-mute-dark">
                公開レベル
              </label>
              <select
                id={levelId}
                value={String(filter.level)}
                onChange={(e) =>
                  updateFilter({ level: e.target.value === "all" ? "all" : Number(e.target.value) })
                }
                className="px-3 py-2.5 rounded-xl border border-reno-line bg-white text-sm font-bold text-ink outline-none focus:border-teal"
              >
                <option value="all">すべて</option>
                {Object.entries(DISCLOSURE_LEVEL_LABEL).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor={agencyId} className="text-sm font-bold text-reno-mute-dark">
                取扱店
              </label>
              <select
                id={agencyId}
                value={filter.agency}
                onChange={(e) => updateFilter({ agency: e.target.value })}
                className="px-3 py-2.5 rounded-xl border border-reno-line bg-white text-sm font-bold text-ink outline-none focus:border-teal max-w-64"
              >
                <option value="all">すべて</option>
                {agencyChoices.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}（{o.count}件）
                  </option>
                ))}
              </select>
            </div>
            {isFiltered && (
              <button
                onClick={() => updateFilter(NO_FILTER)}
                className="text-sm font-bold text-teal hover:underline"
              >
                絞り込みを解除
              </button>
            )}
          </div>
          <p className="text-sm font-bold text-reno-mute-dark">
            {isFiltered
              ? `${visibleProperties.length} 件 / 全 ${properties.length} 件`
              : `全 ${properties.length} 件`}
          </p>
        </div>

        {/* ------------ 一括編集 ------------ */}
        <BulkDisclosureBar
          selectedIds={[...selectedIds]}
          onClear={() => setSelectedIds(new Set())}
          onDone={handleBulkDone}
        />

        {/* ------------ 一覧 ------------ */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <p className="p-16 text-center text-sm font-bold text-reno-mute-dark">
              データを読み込み中です…
            </p>
          ) : properties.length === 0 ? (
            <p className="p-16 text-center text-sm font-bold text-reno-mute-dark">
              物件が登録されていません。「一括入力 (CSV)」から取り込んでください。
            </p>
          ) : visibleProperties.length === 0 ? (
            <p className="p-16 text-center text-sm font-bold text-reno-mute-dark">
              条件に合う物件がありません。検索語や絞り込みを変えてお試しください。
            </p>
          ) : (
            <table className="w-full min-w-[940px] text-left">
              <thead>
                <tr className="bg-reno-bg text-sm font-bold text-reno-mute-dark border-b border-reno-line whitespace-nowrap">
                  <th scope="col" className="pl-4 pr-1 py-3 w-[4%]">
                    <input
                      type="checkbox"
                      aria-label="表示中の物件をすべて選択"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      className="w-4 h-4 accent-teal"
                    />
                  </th>
                  <th scope="col" className="px-4 py-3 w-[30%]">物件情報</th>
                  <th scope="col" className="px-4 py-3 w-[18%]">取扱店</th>
                  <th scope="col" className="px-4 py-3 w-[22%]">所在地 / 間取り</th>
                  <th scope="col" className="px-4 py-3 text-right w-[10%]">価格</th>
                  <th scope="col" className="px-4 py-3 w-[8%]">公開レベル</th>
                  <th scope="col" className="px-4 py-3 text-right w-[8%]">操作</th>
                </tr>
              </thead>
              <tbody className="text-sm text-ink divide-y divide-reno-line">
                {visibleProperties.map((prop) => (
                  <tr
                    key={prop.id}
                    className={`transition-colors ${selectedIds.has(prop.id) ? "bg-teal/5" : "hover:bg-reno-bg/60"}`}
                  >
                    <td className="pl-4 pr-1 py-4">
                      <input
                        type="checkbox"
                        aria-label={`${prop.title} を選択`}
                        checked={selectedIds.has(prop.id)}
                        onChange={() => toggleSelected(prop.id)}
                        className="w-4 h-4 accent-teal"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        {/* 以前は全物件に Unsplash の同じ写真を出しており、
                            管理画面上でどの物件かを取り違える原因になっていた。 */}
                        {prop.imageUrl ? (
                          <img
                            src={prop.imageUrl}
                            alt=""
                            className="w-12 h-12 rounded-lg object-cover bg-reno-bg shrink-0"
                          />
                        ) : (
                          <span
                            className="w-12 h-12 rounded-lg bg-reno-bg text-reno-mute-dark flex flex-col items-center justify-center gap-0.5 shrink-0"
                            title="画像が登録されていません"
                          >
                            <ImageOff size={18} />
                            <span className="text-xs font-bold">画像なし</span>
                          </span>
                        )}
                        <div className="min-w-0">
                          <Link
                            href={`/admin/properties/${prop.id}`}
                            className="font-bold text-ink hover:text-teal transition-colors line-clamp-2"
                          >
                            {prop.title}
                          </Link>
                          <p className="text-xs text-reno-mute-dark mt-1">
                            掲載会社管理番号 {blankToNull(prop.listingCompanyNo) ?? "未登録"}
                            {typeof prop.imageCount === "number" && ` ／ 画像 ${prop.imageCount}枚`}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-ink">{blankToNull(prop.agencyName) ?? "—"}</p>
                      <p className="text-xs text-reno-mute-dark mt-1 whitespace-nowrap">
                        {blankToNull(prop.agencyTel) ?? "電話番号未登録"}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-ink">{prop.address || "—"}</p>
                      <p className="text-xs text-reno-mute-dark mt-1">
                        {PROPERTY_TYPE_LABEL[prop.syubetu] ?? "種別不明"}
                        {` ／ ${prop.madori || "間取り未登録"}`}
                        {prop.areaName && ` ／ ${prop.areaName}`}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-right whitespace-nowrap">
                      <span className="font-bold text-ink text-base">
                        {prop.priceMan.toLocaleString("ja-JP")}
                        <span className="text-sm font-bold text-reno-mute-dark ml-0.5">万円</span>
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <DisclosureBadge level={prop.disclosureLevel} />
                    </td>
                    <td className="px-4 py-4">
                      {/* 以前ここに、押しても何も起きない鉛筆ボタンが置かれていた。
                          公開サイトでの見え方の確認は物件詳細に導線があるため、
                          一覧は「編集」だけにして横幅を空けている。 */}
                      <div className="flex justify-end">
                        <Link
                          href={`/admin/properties/${prop.id}`}
                          className="px-3 py-2 rounded-lg border border-reno-line text-ink hover:bg-reno-bg transition-colors flex items-center gap-1.5 text-sm font-bold whitespace-nowrap"
                        >
                          <Pencil size={16} />
                          編集
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm">
          <div className={`bg-white w-full ${importStatus === 'preview' ? 'max-w-5xl' : 'max-w-lg'} rounded-2xl shadow-2xl overflow-hidden transition-all duration-300`}>
            <div className="p-8 border-b border-reno-line flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-ink">CSV一括登録</h2>
                <p className="text-xs font-bold text-reno-mute-dark">差分検知と承認プレビュー</p>
              </div>
              <button onClick={() => { setIsImportModalOpen(false); setImportStatus("idle"); }} className="p-2 hover:bg-reno-bg rounded-full text-reno-mute-dark">
                <X size={24} />
              </button>
            </div>

            <div className="p-8 max-h-[70vh] overflow-y-auto">
              {importStatus === "idle" && (
                <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-reno-line rounded-2xl p-12 text-center hover:bg-reno-bg cursor-pointer">
                  <Upload size={32} className="mx-auto mb-4 text-teal" />
                  <p className="text-sm font-bold">CSVファイルを選択</p>
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" />
                </div>
              )}

              {importStatus === "parsing" && <div className="text-center py-12"><div className="animate-spin w-10 h-10 border-4 border-ink border-t-transparent rounded-full mx-auto mb-4" />解析中...</div>}

              {importStatus === "preview" && (
                <div className="space-y-6">
                  {/* D-17 手順3：実行前に、想定件数を人間が目で確認する */}
                  <div className="bg-teal/5 p-4 rounded-2xl flex items-start gap-3">
                    <Info className="text-teal mt-0.5" size={18} />
                    <div className="text-xs font-bold text-ink leading-relaxed">
                      <p className="mb-2">
                        データベースとの照合が完了しました。件数をご確認のうえ「取り込みを実行」を押してください。
                      </p>
                      <ul className="space-y-0.5">
                        <li>読み取った行数：{diffResults.length}件</li>
                        <li>新規登録：{diffResults.filter(d => d.type === "new").length}件</li>
                        <li className="text-pink">
                          上書き（既存データが変わります）：
                          {diffResults.filter(d => d.type === "update").length}件
                        </li>
                        <li>変更なし：{diffResults.filter(d => d.type === "no_change").length}件</li>
                        <li>
                          取り込まない（掲載会社管理番号が空など）：
                          {diffResults.filter(d => d.type === "skip").length}件
                        </li>
                        <li className="pt-1">現在チェックが入っている取込対象：{approvedIndices.size}件</li>
                      </ul>
                      <p className="mt-2 text-ink">
                        上書き前のデータは自動で控えを取ります。想定と件数が違う場合は実行しないでください。
                      </p>
                      {detectedEncoding && (
                        <p className="mt-2 text-ink">
                          読み取った文字コード：<strong>{detectedEncoding}</strong>
                          {detectedEncoding === "Shift_JIS" &&
                            "（Excelで保存したCSVです。下の物件名が化けていないかご確認ください）"}
                        </p>
                      )}
                    </div>
                  </div>

                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-reno-bg text-reno-mute-dark font-bold border-b border-reno-line">
                        <th className="p-3 w-10"></th>
                        <th className="p-3">状態</th>
                        <th className="p-3">掲載会社管理番号</th>
                        <th className="p-3">取扱店</th>
                        <th className="p-3">物件名</th>
                        <th className="p-3">価格</th>
                        <th className="p-3">変更箇所</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-reno-line font-bold text-ink">
                      {diffResults.map((diff, i) => (
                        <tr key={i} className={`${approvedIndices.has(i) ? 'bg-white' : 'bg-reno-bg opacity-60'}`}>
                          <td className="p-3 text-center">
                            <input type="checkbox" checked={approvedIndices.has(i)} disabled={diff.type === 'skip'} onChange={() => toggleApproval(i)} className="w-4 h-4 rounded border-reno-line text-teal accent-teal" />
                          </td>
                          <td className="p-3">
                            {diff.type === 'new' && <span className="text-teal bg-teal/5 px-2 py-1 rounded">新規</span>}
                            {diff.type === 'update' && <span className="text-pink bg-pink/5 px-2 py-1 rounded">変更あり</span>}
                            {diff.type === 'no_change' && <span className="text-reno-mute-dark bg-reno-bg px-2 py-1 rounded">変更なし</span>}
                            {diff.type === 'skip' && <span className="text-red-800 bg-red-50 px-2 py-1 rounded whitespace-nowrap">取込対象外</span>}
                          </td>
                          <td className="p-3">{diff.incoming.listingCompanyNo || "（空）"}</td>
                          <td className="p-3">{diff.incoming.agencyName || "—"}</td>
                          <td className={`p-3 ${diff.changes?.includes('物件名') ? 'text-pink' : ''}`}>{diff.incoming.title}</td>
                          <td className={`p-3 ${diff.changes?.includes('価格') ? 'text-pink' : ''}`}>{diff.incoming.priceMan}万円</td>
                          <td className="p-3 text-reno-mute-dark">{diff.skipReason ?? (diff.changes?.join(', ') || '-')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="flex justify-end gap-3 pt-6 border-t border-reno-line">
                    <button onClick={() => setImportStatus("idle")} className="px-6 py-3 rounded-xl font-bold text-reno-mute-dark hover:bg-reno-bg">キャンセル</button>
                    <button onClick={handleImportExecute} className="bg-ink text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-teal flex items-center gap-2">
                      <Check size={18} /> {approvedIndices.size}件の取り込みを実行
                    </button>
                  </div>
                </div>
              )}

              {importStatus === "importing" && <div className="text-center py-12">取り込み中...</div>}

              {importStatus === "success" && (
                <div className="text-center py-12">
                  <Check size={48} className="mx-auto mb-4 text-teal" />
                  <p className="font-bold mb-4">インポートが完了しました</p>
                  {importResult && (
                    <div className="text-xs font-bold text-reno-mute-dark space-y-1">
                      <p>取り込み：{importResult.count}件</p>
                      <p>新規登録：{importResult.created}件 ／ 上書き：{importResult.overwritten}件</p>
                      {/* 戻すときに使う控えの番号を必ず画面に出す（D-17・O-03） */}
                      <p className="text-reno-mute-dark">
                        上書き前データの控え番号：#{importResult.backupId}
                      </p>
                    </div>
                  )}
                  <button onClick={() => { setIsImportModalOpen(false); setImportStatus("idle"); setImportResult(null); }} className="mt-6 bg-ink text-white px-8 py-2 rounded-xl">閉じる</button>
                </div>
              )}

              {importStatus === "error" && (
                <div className="text-center py-12">
                  <AlertCircle size={48} className="mx-auto mb-4 text-red-600" />
                  <p className="font-bold mb-2">取り込みを中止しました</p>
                  {/* D-07：内部情報ではなく、対処できる文言だけを出す */}
                  <p className="text-xs font-bold text-reno-mute-dark max-w-md mx-auto leading-relaxed">
                    {errorMessage || "取り込みに失敗しました。"}
                  </p>
                  <button onClick={() => { setImportStatus("idle"); setErrorMessage(""); }} className="mt-6 bg-reno-bg text-ink px-8 py-2 rounded-xl font-bold">戻る</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
