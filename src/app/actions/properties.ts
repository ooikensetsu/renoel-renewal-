"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireAdmin, requireUser, authErrorMessage } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import {
  DISCLOSURE_LEVEL,
  DISCLOSURE_LEVEL_LABEL,
  SITE_VISIBLE_WHERE,
  isDisclosureLevel,
} from "@/config/security";
import { signedImageUrls, toDisplayUrls } from "@/lib/storage";
import { parseJapaneseDate } from "@/lib/dates";
import { toJsonSafe } from "@/lib/json";
import { blankToNull } from "@/lib/blank";
import { buildBulkInsert, buildBulkUpdateById } from "@/lib/propertyBulkUpsert";
import { importKey, planImportMatches } from "@/lib/importMatch";
import { PROPERTY_FIELDS } from "@/config/propertyFields";
import {
  PREF_CODE,
  DEFAULT_CITY_CODE,
  DEFAULT_PROPERTY_TYPE,
  DEFAULT_SYUMOKU,
  areaName,
  isSupportedArea,
  isValidPropertyType,
  PROPERTY_TYPE_LABEL,
} from "@/config/property";

/** 任意の文字列列。athome の「値なし」表記（「－」「－ / －」など）は null にする。 */
function text(value: string | undefined): string | null {
  return blankToNull(value);
}

/** 任意の整数列。読めなければ null。 */
function int(value: string | undefined): number | null {
  const t = (value ?? "").replace(/[,，\s]/g, "").trim();
  if (t === "") return null;
  const n = parseInt(t, 10);
  return Number.isInteger(n) ? n : null;
}

/** 任意の小数列。読めなければ null。 */
function float(value: string | undefined): number | null {
  const t = (value ?? "").replace(/[,，\s]/g, "").trim();
  if (t === "") return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * 物件管理番号を読む。athome / ATBB の番号は10桁あり Number では扱えないため BigInt にする。
 * 数字以外が混ざっている行は取り込まない（null を返す）。
 */
function parseObjMngNo(value: string | undefined): bigint | null {
  const trimmed = (value ?? "").trim();
  if (!/^\d+$/.test(trimmed)) return null;
  try {
    return BigInt(trimmed);
  } catch {
    return null;
  }
}

/** CSVの1行。取込元の列名に合わせた文字列で受け取る。 */
export type IncomingProperty = {
  objMngNo?: string;
  syubetu?: string;
  syumoku?: string;
  title?: string;
  priceMan?: string;
  madori?: string;
  landMen?: string;
  bldMen?: string;
  bldStructure?: string;
  bldY?: string;
  bldM?: string;
  address?: string;
  prefCd?: string;
  cityCd?: string;
  disclosureLevel?: string;
  /** 現況（例: 空家 / 所有者居住中）。既存の Property.currentState に入る。 */
  currentState?: string;

  // 物件概要（athome の表示項目）。全て任意。
  trafficNote?: string;
  trafficLine?: string;
  trafficStation?: string;
  walkMinutes?: string;
  leaseTermRent?: string;
  keyMoney?: string;
  depositGuarantee?: string;
  maintenanceCost?: string;
  otherLumpSum?: string;
  floorsInfo?: string;
  parking?: string;
  landRight?: string;
  deliveryTiming?: string;
  transactionType?: string;
  listingCompanyNo?: string;
  publishedOn?: string;
  nextUpdateOn?: string;

  // マンション固有
  mgmtFeeYen?: string;
  repairFundYen?: string;
  totalUnits?: string;
  floorNo?: string;
  direction?: string;
  balconyMen?: string;
  mgmtForm?: string;

  // 土地固有
  buildingCoverage?: string;
  floorAreaRatio?: string;
  zoning?: string;
  landCategory?: string;
  cityPlanning?: string;
  roadAccess?: string;
  privateRoad?: string;

  // 取扱店
  agencyName?: string;
  agencyAddress?: string;
  agencyTel?: string;
  agencyLicense?: string;
};

/** DBへ書き込む直前の、検証済みの1件分。 */
type PropertyRow = {
  objMngNo: bigint;
  syubetu: number;
  syumoku: string;
  title: string;
  priceMan: number;
  madori: string;
  landMen: number | null;
  bldMen: number | null;
  bldStructure: string;
  bldY: number | null;
  bldM: number | null;
  address: string;
  prefCd: string;
  cityCd: string;
  disclosureLevel: number;
  currentState: string | null;

  // 物件概要。CSVに列が無ければ null が入る。
  trafficNote: string | null;
  trafficLine: string | null;
  trafficStation: string | null;
  walkMinutes: number | null;
  leaseTermRent: string | null;
  keyMoney: string | null;
  depositGuarantee: string | null;
  maintenanceCost: string | null;
  otherLumpSum: string | null;
  floorsInfo: string | null;
  parking: string | null;
  landRight: string | null;
  deliveryTiming: string | null;
  transactionType: string | null;
  listingCompanyNo: string | null;
  publishedOn: Date | null;
  nextUpdateOn: Date | null;
  mgmtFeeYen: number | null;
  repairFundYen: number | null;
  totalUnits: number | null;
  floorNo: number | null;
  direction: string | null;
  balconyMen: number | null;
  mgmtForm: string | null;
  buildingCoverage: number | null;
  floorAreaRatio: number | null;
  zoning: string | null;
  landCategory: string | null;
  cityPlanning: string | null;
  roadAccess: string | null;
  privateRoad: string | null;
  agencyName: string | null;
  agencyAddress: string | null;
  agencyTel: string | null;
  agencyLicense: string | null;
};

export type DiffResult = {
  /** skip は取り込まない行（掲載会社管理番号が空など）。理由は skipReason */
  type: "new" | "update" | "no_change" | "skip";
  /** objMngNo は BigInt のままだと画面へ渡せないため文字列で返す。 */
  current?: { objMngNo: string; title: string; priceMan: number } | null;
  incoming: IncomingProperty;
  changes?: string[];
  skipReason?: string;
};

/** 取り込まない理由。null なら取り込める。判定は取込前の確認と取込本体の両方がここを通る（D-09）。 */
function skipReasonOf(item: IncomingProperty): string | null {
  if (importKey(item.agencyName, item.listingCompanyNo) === null) {
    return "掲載会社管理番号が空";
  }
  if (parseObjMngNo(item.objMngNo) === null) return "物件管理番号が数値でない";
  return null;
}

/**
 * 取込行を既存物件と突き合わせる（取込前の確認と取込本体で共用。D-09）。
 * 突合キーは「取扱不動産会社名＋掲載会社管理番号」。判定は src/lib/importMatch.ts。
 *
 * @param items skipReasonOf が null の行だけを渡す
 * @returns 行ごとに、上書きする既存物件（新規なら null）
 */
async function matchWithExisting(items: IncomingProperty[]) {
  const incoming = items.map((item, i) => ({
    key: importKey(item.agencyName, item.listingCompanyNo) as string,
    objMngNo: parseObjMngNo(item.objMngNo) as bigint,
    label: `${i + 1}件目 掲載会社管理番号 ${item.listingCompanyNo?.trim() ?? ""}`,
  }));
  // 同じ番号を持つ物件と、同じ物件管理番号を持つ物件をまとめて1回で引く。
  // 会社名の一致は importKey で判定する（表記の前後空白を同じ規則でそろえるため）。
  const listingNos = [...new Set(items.map((item) => (item.listingCompanyNo ?? "").trim()))];
  const existingRows = await prisma.property.findMany({
    where: {
      OR: [
        { listingCompanyNo: { in: listingNos } },
        { objMngNo: { in: incoming.map((row) => row.objMngNo) } },
      ],
    },
  });
  const plan = planImportMatches(incoming, existingRows);
  if (!plan.ok) return plan;
  const byId = new Map(existingRows.map((row) => [row.id, row]));
  return {
    ok: true as const,
    matches: plan.matchedIds.map((id) => (id === null ? null : (byId.get(id) ?? null))),
  };
}

/**
 * 一般公開用の物件一覧。
 * C-03 / S-07：会員限定物件の価格・所在地はサーバー側で落としてから返す。
 * 以前はクライアントコンポーネントが全物件データを保持しており、
 * 「価格非公開」と表示していても開発者ツールから価格が読めていた。
 */
/**
 * 一般公開用の物件一覧。
 *
 * @param cityCd  指定すると、その市区町村の物件だけを返す。掲載対象外のコードは無視する
 * @param limit   返す件数の上限。トップページのエリア別表示（6件）で使う
 * @param options onlyTop=true で「トップ掲載」にチェックした物件だけを返す
 */
export async function getPublicProperties(
  cityCd?: string,
  limit?: number,
  options: { onlyTop?: boolean } = {}
) {
  const auth = await requireUser();
  const isMember = auth.ok;

  try {
    // 掲載対象のエリアでなければ絞り込まない（推測でコードを通さない）
    const where = cityCd && isSupportedArea(cityCd) ? { cityCd } : {};

    const properties = await prisma.property.findMany({
      // 非表示の物件はサイトに出さない。条件の中身は src/config/security.ts の1箇所。
      where: { ...where, ...SITE_VISIBLE_WHERE, ...(options.onlyTop ? { showOnTop: true } : {}) },
      orderBy: { updatedAt: "desc" },
      include: { images: { orderBy: { sortOrder: "asc" } } },
      ...(Number.isInteger(limit) && (limit as number) > 0 ? { take: limit } : {}),
    });

    // 表示できる物件の画像だけまとめて署名する（鍵つき物件の画像URLは作らない。S-07）。
    const signed = await signedImageUrls(
      properties.flatMap((p) =>
        p.disclosureLevel === DISCLOSURE_LEVEL.MEMBERS && !isMember
          ? []
          : p.images.map((img) => img.path)
      )
    );

    return {
      success: true as const,
      data: properties.map((p) => {
        const isMemberOnly = p.disclosureLevel === DISCLOSURE_LEVEL.MEMBERS;
        const locked = isMemberOnly && !isMember;

        // 鍵のかかった物件では、秘匿する項目をそもそも返さない。
        return {
          id: p.id,
          title: locked ? "詳細は会員限定" : p.title,
          syumoku: p.syumoku,
          // エリア名の表示に使う。会員限定でも所在地そのものではないので返してよい
          cityCd: p.cityCd,
          madori: locked ? null : p.madori,
          priceMan: locked ? null : p.priceMan,
          address: locked ? null : p.address,
          landMen: locked ? null : p.landMen,
          bldMen: locked ? null : p.bldMen,
          images: locked
            ? []
            : p.images.map((img) => signed.get(img.path)).filter((u): u is string => !!u),
          isMemberOnly,
          locked,
        };
      }),
    };
  } catch (error) {
    return reportError("getPublicProperties", error, "物件を取得できませんでした。");
  }
}

/**
 * トップページの「新着物件」。管理画面で「トップ掲載」にチェックした物件を全件、更新の新しい順に返す。
 * 非表示の物件はチェックが入っていても出さない（getPublicProperties の SITE_VISIBLE_WHERE）。
 */
export async function getTopProperties() {
  return getPublicProperties(undefined, undefined, { onlyTop: true });
}

/**
 * 「トップ掲載」の切り替え（管理者のみ）。管理画面の物件一覧のチェックボックスから呼ぶ。
 */
export async function setShowOnTop(id: number, showOnTop: boolean) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false as const, error: authErrorMessage(auth.reason) };
  }
  if (!Number.isInteger(id) || id <= 0 || typeof showOnTop !== "boolean") {
    return { success: false as const, error: "指定が正しくありません。" };
  }
  try {
    await prisma.property.update({ where: { id }, data: { showOnTop } });
    revalidatePath("/");
    revalidatePath("/admin/properties");
    return { success: true as const };
  } catch (error) {
    return reportError("setShowOnTop", error, "トップ掲載を変更できませんでした。");
  }
}

/** 一般公開用の物件詳細。会員限定物件は未ログインなら中身を返さない。 */
export async function getPublicPropertyById(id: number) {
  const auth = await requireUser();
  const isMember = auth.ok;

  if (!Number.isInteger(id) || id <= 0) {
    return { success: false as const, error: "物件が見つかりません。" };
  }

  try {
    // 非表示の物件は「存在しない」と同じ扱いにする（URLを知っていても見られない）。
    const p = await prisma.property.findFirst({
      where: { id, ...SITE_VISIBLE_WHERE },
      include: { images: { orderBy: { sortOrder: "asc" } } },
    });
    if (!p) {
      return { success: false as const, error: "物件が見つかりません。" };
    }

    const isMemberOnly = p.disclosureLevel === DISCLOSURE_LEVEL.MEMBERS;
    if (isMemberOnly && !isMember) {
      // 会員限定物件は、未ログインには存在と種別だけ返す。価格も所在地も渡さない。
      return {
        success: true as const,
        data: { id: p.id, syumoku: p.syumoku, isMemberOnly: true, locked: true as const },
      };
    }

    return {
      success: true as const,
      data: {
        id: p.id,
        title: p.title,
        syumoku: p.syumoku,
        madori: p.madori,
        priceMan: p.priceMan,
        address: p.address,
        landMen: p.landMen,
        bldMen: p.bldMen,
        bldStructure: p.bldStructure,
        bldY: p.bldY,
        bldM: p.bldM,
        currentState: p.currentState,
        images: await toDisplayUrls(p.images.map((img) => img.path)),

        // 物件概要。取扱店（agency*）も返す（大野の指示：管理画面と同じ情報をお客様も見られるように）。
        agencyName: p.agencyName,
        agencyAddress: p.agencyAddress,
        agencyTel: p.agencyTel,
        agencyLicense: p.agencyLicense,
        trafficNote: p.trafficNote,
        trafficLine: p.trafficLine,
        trafficStation: p.trafficStation,
        walkMinutes: p.walkMinutes,
        listingCompanyNo: p.listingCompanyNo,
        floorsInfo: p.floorsInfo,
        parking: p.parking,
        landRight: p.landRight,
        leaseTermRent: p.leaseTermRent,
        keyMoney: p.keyMoney,
        depositGuarantee: p.depositGuarantee,
        maintenanceCost: p.maintenanceCost,
        otherLumpSum: p.otherLumpSum,
        deliveryTiming: p.deliveryTiming,
        transactionType: p.transactionType,
        mgmtFeeYen: p.mgmtFeeYen,
        repairFundYen: p.repairFundYen,
        totalUnits: p.totalUnits,
        floorNo: p.floorNo,
        direction: p.direction,
        balconyMen: p.balconyMen,
        mgmtForm: p.mgmtForm,
        buildingCoverage: p.buildingCoverage,
        floorAreaRatio: p.floorAreaRatio,
        zoning: p.zoning,
        landCategory: p.landCategory,
        cityPlanning: p.cityPlanning,
        roadAccess: p.roadAccess,
        privateRoad: p.privateRoad,
        publishedOn: p.publishedOn,
        nextUpdateOn: p.nextUpdateOn,

        isMemberOnly,
        locked: false as const,
      },
    };
  } catch (error) {
    return reportError("getPublicPropertyById", error, "物件を取得できませんでした。");
  }
}

/** 管理用の物件一覧（管理者のみ）。 */
export async function getProperties() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false as const, error: authErrorMessage(auth.reason) };
  }

  try {
    const properties = await prisma.property.findMany({
      orderBy: { updatedAt: "desc" },
      include: { images: { orderBy: { sortOrder: "asc" } } },
    });

    // 一覧のサムネイル（各物件の1枚目）を署名付きURLにする。S-07。
    const signed = await signedImageUrls(
      properties.flatMap((p) => (p.images[0] ? [p.images[0].path] : []))
    );

    // objMngNo は BigInt。クライアントコンポーネントへ渡すため文字列にする。
    // あわせてエリア名を添える（画面側で対応表を持たせないため）。
    return {
      success: true as const,
      data: properties.map((p) => ({
        ...p,
        objMngNo: p.objMngNo.toString(),
        areaName: areaName(p.cityCd),
        // 一覧のサムネイル用。実際に登録された1枚目の署名付きURL。
        imageUrl: p.images[0] ? signed.get(p.images[0].path) ?? null : null,
        imageCount: p.images.length,
      })),
    };
  } catch (error) {
    return reportError("getProperties", error, "物件を取得できませんでした。");
  }
}

/**
 * D-17 手順1「数える」：取込前のドライラン。
 * 何件が新規・何件が更新・何件が変更なしかを先に出す。実際の書き込みは行わない。
 */
export async function compareCSVData(csvData: IncomingProperty[]) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false as const, error: authErrorMessage(auth.reason) };
  }

  try {
    // 取り込めない行は先に分け、画面に理由つきで出す（黙って捨てない）。
    const importable = csvData.filter((item) => skipReasonOf(item) === null);
    // 突合対象は1回の問い合わせでまとめて引く。
    // 以前は1行ごとに findUnique していたため、959行のCSVで959往復していた。
    const matched = importable.length > 0 ? await matchWithExisting(importable) : { ok: true as const, matches: [] };
    if (!matched.ok) {
      return { success: false as const, error: matched.error };
    }
    const matchOf = new Map(importable.map((item, i) => [item, matched.matches[i]]));

    const results: DiffResult[] = csvData.map((item) => {
      const skipReason = skipReasonOf(item);
      if (skipReason !== null) return { type: "skip", incoming: item, skipReason };

      const existing = matchOf.get(item);
      if (!existing) return { type: "new", incoming: item };

      const changes: string[] = [];
      if (existing.objMngNo !== parseObjMngNo(item.objMngNo)) changes.push("物件管理番号");
      if (existing.title !== item.title) changes.push("物件名");
      if (existing.priceMan !== parseInt(item.priceMan ?? "")) changes.push("価格");
      if (existing.address !== item.address) changes.push("所在地");
      if (existing.madori !== item.madori) changes.push("間取り");
      if (existing.disclosureLevel !== parseInt(item.disclosureLevel ?? ""))
        changes.push("公開レベル");

      return {
        type: changes.length > 0 ? "update" : "no_change",
        current: {
          objMngNo: existing.objMngNo.toString(),
          title: existing.title,
          priceMan: existing.priceMan,
        },
        incoming: item,
        changes,
      };
    });

    return {
      success: true as const,
      data: results,
      // 画面に出して人間に確認してもらうための件数（D-17 手順3）
      summary: {
        total: results.length,
        new: results.filter((r) => r.type === "new").length,
        update: results.filter((r) => r.type === "update").length,
        noChange: results.filter((r) => r.type === "no_change").length,
        skipped: results.filter((r) => r.type === "skip").length,
      },
    };
  } catch (error) {
    return reportError("compareCSVData", error, "取込内容を確認できませんでした。");
  }
}

/**
 * 物件の一括取込（管理者のみ）。
 *
 * D-17：一括更新は「数えてから」実行する。
 *   1. 数える  … compareCSVData で件数を出す
 *   2. 控えを取る … 上書き前の既存レコードを PropertyImportBackup へ日時つきで退避
 *   3. 確認する … 呼び出し側が expectedCount を宣言し、一致しなければ中止
 *
 * D-18：全体を1つのトランザクションで実行する。途中で落ちても中途半端なデータを残さない。
 *       突合キーは「取扱不動産会社名＋掲載会社管理番号」（src/lib/importMatch.ts）。
 *       同じ入力で再実行すると、2回目は全行が既存物件の上書きになる（冪等）。
 *
 * @param approvedItems 人間が承認した取込対象
 * @param expectedCount 画面で確認した想定件数。approvedItems の件数と一致しなければ中止する。
 */
export async function importProperties(
  approvedItems: IncomingProperty[],
  expectedCount: number
) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false as const, error: authErrorMessage(auth.reason) };
  }

  // D-17 手順3：想定件数の宣言なしに一括処理を走らせない
  if (!Number.isInteger(expectedCount)) {
    return {
      success: false as const,
      error: "想定件数が指定されていないため、取込を中止しました。",
    };
  }
  if (approvedItems.length !== expectedCount) {
    return {
      success: false as const,
      error: `想定件数（${expectedCount}件）と実際の対象件数（${approvedItems.length}件）が一致しないため、取込を中止しました。`,
    };
  }
  if (approvedItems.length === 0) {
    return { success: false as const, error: "取込対象がありません。" };
  }

  // 取込データを先に検証する。1件でも壊れていれば、1件も書き込まない。
  const rows: PropertyRow[] = [];
  // 同じ物件管理番号が1つのCSVに2行あると、どちらが正か決められない。
  // まとめて書き込む文では PostgreSQL 自身が拒否するため、ここで先に止める。
  const seenObjMngNos = new Set<string>();
  for (const item of approvedItems) {
    // 掲載会社管理番号が空の行は取り込まない（2026-10-06 大野の指示）。
    // 確認画面では選べないようにしているが、直接呼ばれた場合に備えてここでも止める。
    if (importKey(item.agencyName, item.listingCompanyNo) === null) {
      return {
        success: false as const,
        error: `掲載会社管理番号が空の行があるため、取込を中止しました（物件名: ${item.title ?? "不明"}）。`,
      };
    }
    const objMngNo = parseObjMngNo(item.objMngNo);
    const priceMan = parseInt(item.priceMan ?? "");
    if (objMngNo === null || !Number.isInteger(priceMan)) {
      return {
        success: false as const,
        error: `物件管理番号または価格が数値として読めない行があるため、取込を中止しました（対象: ${
          item.objMngNo ?? "不明"
        }）。`,
      };
    }
    if (seenObjMngNos.has(objMngNo.toString())) {
      return {
        success: false as const,
        error: `物件管理番号が重複している行があるため、取込を中止しました（対象: ${objMngNo}）。`,
      };
    }
    seenObjMngNos.add(objMngNo.toString());

    if (!item.title || !item.address || !item.madori) {
      return {
        success: false as const,
        error: `物件名・所在地・間取りのいずれかが空の行があるため、取込を中止しました（対象: ${objMngNo}）。`,
      };
    }

    // 対象エリアの外は取り込まない。エリアを増やすときは src/config/property.ts の AREAS に足す。
    const cityCd = item.cityCd?.trim() || DEFAULT_CITY_CODE;
    if (!isSupportedArea(cityCd)) {
      return {
        success: false as const,
        error: `掲載対象のエリアではない市区町村コードがあるため、取込を中止しました（対象: ${objMngNo} / cityCd: ${cityCd}）。エリアを増やす場合は src/config/property.ts の AREAS に追加してください。`,
      };
    }

    // 種別は土地・一戸建て・マンションのみ。
    const syubetu = parseInt(item.syubetu ?? "") || DEFAULT_PROPERTY_TYPE;
    if (!isValidPropertyType(syubetu)) {
      const valid = Object.entries(PROPERTY_TYPE_LABEL)
        .map(([code, label]) => `${code}=${label}`)
        .join(" / ");
      return {
        success: false as const,
        error: `物件種別の番号が正しくない行があるため、取込を中止しました（対象: ${objMngNo} / syubetu: ${syubetu}）。使える値は ${valid} です。`,
      };
    }

    // 公開レベルは DISCLOSURE_LEVEL に定義した値のみ。空欄は 0（公開）扱い。
    // 想定外の値をそのまま入れると「会員限定のつもりが公開されていた」事故になる。
    const disclosureRaw = (item.disclosureLevel ?? "").trim();
    const disclosureLevel = disclosureRaw === "" ? DISCLOSURE_LEVEL.PUBLIC : Number(disclosureRaw);
    if (!isDisclosureLevel(disclosureLevel)) {
      const valid = Object.entries(DISCLOSURE_LEVEL_LABEL)
        .map(([code, label]) => `${code}=${label}`)
        .join(" / ");
      return {
        success: false as const,
        error: `公開レベルが正しくない行があるため、取込を中止しました（対象: ${objMngNo} / disclosureLevel: ${disclosureRaw}）。使える値は ${valid} です。`,
      };
    }

    rows.push({
      objMngNo,
      syubetu,
      syumoku: item.syumoku || DEFAULT_SYUMOKU,
      title: item.title,
      priceMan,
      madori: item.madori,
      landMen: parseFloat(item.landMen ?? "") || null,
      bldMen: parseFloat(item.bldMen ?? "") || null,
      bldStructure: item.bldStructure || "",
      bldY: parseInt(item.bldY ?? "") || null,
      bldM: parseInt(item.bldM ?? "") || null,
      address: item.address,
      prefCd: item.prefCd?.trim() || PREF_CODE,
      cityCd,
      disclosureLevel,
      currentState: text(item.currentState),

      trafficNote: text(item.trafficNote),
      trafficLine: text(item.trafficLine),
      trafficStation: text(item.trafficStation),
      walkMinutes: int(item.walkMinutes),
      leaseTermRent: text(item.leaseTermRent),
      keyMoney: text(item.keyMoney),
      depositGuarantee: text(item.depositGuarantee),
      maintenanceCost: text(item.maintenanceCost),
      otherLumpSum: text(item.otherLumpSum),
      floorsInfo: text(item.floorsInfo),
      parking: text(item.parking),
      landRight: text(item.landRight),
      deliveryTiming: text(item.deliveryTiming),
      transactionType: text(item.transactionType),
      listingCompanyNo: text(item.listingCompanyNo),
      publishedOn: parseJapaneseDate(item.publishedOn),
      nextUpdateOn: parseJapaneseDate(item.nextUpdateOn),

      mgmtFeeYen: int(item.mgmtFeeYen),
      repairFundYen: int(item.repairFundYen),
      totalUnits: int(item.totalUnits),
      floorNo: int(item.floorNo),
      direction: text(item.direction),
      balconyMen: float(item.balconyMen),
      mgmtForm: text(item.mgmtForm),

      buildingCoverage: int(item.buildingCoverage),
      floorAreaRatio: int(item.floorAreaRatio),
      zoning: text(item.zoning),
      landCategory: text(item.landCategory),
      cityPlanning: text(item.cityPlanning),
      roadAccess: text(item.roadAccess),
      privateRoad: text(item.privateRoad),

      agencyName: text(item.agencyName),
      agencyAddress: text(item.agencyAddress),
      agencyTel: text(item.agencyTel),
      agencyLicense: text(item.agencyLicense),
    });
  }

  try {
    // 突合：どの行がどの既存物件を上書きするか。判断できない行があれば全体を中止する。
    const matched = await matchWithExisting(approvedItems);
    if (!matched.ok) {
      return { success: false as const, error: `${matched.error}取込を中止しました。` };
    }
    const updateRows: PropertyRow[] = [];
    const updateIds: number[] = [];
    const insertRows: PropertyRow[] = [];
    rows.forEach((row, i) => {
      const existing = matched.matches[i];
      if (existing) {
        updateRows.push(row);
        updateIds.push(existing.id);
      } else {
        insertRows.push(row);
      }
    });

    // D-17 手順2：上書きされる既存レコードの控え。突合で引いた行をそのまま使う。
    const before = matched.matches.filter((row): row is NonNullable<typeof row> => row !== null);

    /**
     * D-18：控えの作成と全行の書き込みを1つのトランザクションで実行する。
     *
     * 【なぜ文の数を最小にするのか】
     * 行数分の upsert を送る形は、書き方を変えても本番では終わらなかった。
     *   - 対話型トランザクションは、プーラー（6543番・pgbouncer=true）が接続を
     *     トランザクション単位で使い回すため維持できず、約16秒で
     *     P2028「Transaction not found」になった
     *   - $transaction(配列) に変えると P2028 は出なくなったが、959文の往復が
     *     終わらず 300 秒で Vercel の関数が打ち切られた
     * 全行を JSON 1個にまとめ、更新1文＋新規1文で流し込む
     * （組み立ては src/lib/propertyBulkUpsert.ts）。
     *
     * 配列を渡す $transaction は1回の要求としてまとめて送られ、サーバー側で
     * 1つのトランザクションとして実行される。物件管理番号の一意制約に触れた場合も
     * 全体が巻き戻る。
     */
    const writes = [];
    if (updateRows.length > 0) {
      const update = buildBulkUpdateById(updateRows, updateIds);
      writes.push(prisma.$executeRawUnsafe(update.sql, ...update.values));
    }
    if (insertRows.length > 0) {
      const insert = buildBulkInsert(insertRows);
      writes.push(prisma.$executeRawUnsafe(insert.sql, ...insert.values));
    }
    const [backup] = await prisma.$transaction([
      prisma.propertyImportBackup.create({
        data: {
          importedBy: auth.email,
          itemCount: rows.length,
          // objMngNo は BigInt。素の JSON.stringify では落ちるため toJsonSafe を通す。
          before: toJsonSafe(before) as object,
        },
      }),
      // 値は全て引数として渡す（SQL文に入力は混ざらない）。
      ...writes,
    ]);
    const result = { backupId: backup.id, overwritten: before.length };

    revalidatePath("/admin/properties");
    revalidatePath("/properties");

    return {
      success: true as const,
      count: rows.length,
      overwritten: result.overwritten,
      created: rows.length - result.overwritten,
      backupId: result.backupId,
    };
  } catch (error) {
    // トランザクションなので、ここへ来た時点で書き込みは1件も残っていない。
    return reportError("importProperties", error, "取込に失敗しました。");
  }
}

/**
 * 管理画面の物件詳細（管理者のみ）。
 * 以前この画面は仙台の架空物件を直書きしており、URLの物件IDを見ていなかった。
 *
 * 統計は実データから数える。お気に入りは保持する仕組みが無いため出さない。
 * 閲覧数は ActivityLog に残る「ログイン会員の閲覧」だけで、未ログインの閲覧は含まれない。
 */
export async function getPropertyForAdmin(id: number) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false as const, error: authErrorMessage(auth.reason) };
  }

  try {
    const property = await prisma.property.findUnique({
      where: { id },
      include: { images: { orderBy: { sortOrder: "asc" } } },
    });
    if (!property) {
      return { success: false as const, error: "指定された物件が見つかりません。" };
    }

    const [memberViews, inquiries, signed] = await Promise.all([
      // logPropertyView が `物件ID: 12 (物件名)` の形で書いている。
      // 末尾の " (" まで含めて照合しないと、物件ID 1 が 12 にも当たる。
      prisma.activityLog.count({
        where: { action: "VIEW_PROPERTY", details: { startsWith: `物件ID: ${id} (` } },
      }),
      prisma.inquiry.count({ where: { propertyId: id } }),
      signedImageUrls(property.images.map((img) => img.path)),
    ]);

    return {
      success: true as const,
      data: {
        ...property,
        objMngNo: property.objMngNo.toString(),
        areaName: areaName(property.cityCd),
        // 画像は署名付きURLに差し替える（path はもう Storage 上のパス）。S-07。
        images: property.images.map((img) => ({
          id: img.id,
          sortOrder: img.sortOrder,
          path: signed.get(img.path) ?? "",
        })),
        stats: { memberViews, inquiries },
      },
    };
  } catch (error) {
    return reportError("getPropertyForAdmin", error, "物件を取得できませんでした。");
  }
}

type PropertyFormData = Record<string, string | number | Date | null>;

/**
 * 管理画面の物件フォームを読み、保存できる形に検証する（新規登録と更新で共用。D-09）。
 *
 * 編集できる項目は src/config/propertyFields.ts の定義がすべて。
 * フォームに無い項目は data に入れない（更新時に他の値を消さないため）。
 * 区分（エリア・種別・公開レベル）は取込と同じ検証を通す。
 */
function readPropertyForm(
  formData: FormData
): { ok: true; data: PropertyFormData } | { ok: false; error: string } {
  const data: PropertyFormData = {};

  for (const field of PROPERTY_FIELDS) {
    const raw = formData.get(field.key)?.toString();
    if (raw === undefined) continue;

    if (field.required && raw.trim() === "") {
      return { ok: false, error: `${field.label}は空にできません。` };
    }

    switch (field.type) {
      case "int": {
        const v = int(raw);
        if (raw.trim() !== "" && v === null) {
          return { ok: false, error: `${field.label}は数値で入力してください。` };
        }
        data[field.key] = v;
        break;
      }
      case "decimal": {
        const v = float(raw);
        if (raw.trim() !== "" && v === null) {
          return { ok: false, error: `${field.label}は数値で入力してください。` };
        }
        data[field.key] = v;
        break;
      }
      case "date": {
        const v = parseJapaneseDate(raw);
        if (raw.trim() !== "" && v === null) {
          return { ok: false, error: `${field.label}は日付として読めません（例: 2026-08-19）。` };
        }
        data[field.key] = v;
        break;
      }
      default:
        data[field.key] = text(raw);
    }
  }

  // 価格は必須かつ数値。required の判定だけでは 0 や空を通すため個別に確認する。
  if (typeof data.priceMan !== "number" || !Number.isInteger(data.priceMan)) {
    return { ok: false, error: "価格は万円単位の整数で入力してください。" };
  }

  const cityCd = formData.get("cityCd")?.toString()?.trim();
  if (cityCd !== undefined && cityCd !== "") {
    if (!isSupportedArea(cityCd)) {
      return { ok: false, error: "掲載対象のエリアではありません。" };
    }
    data.cityCd = cityCd;
    data.prefCd = PREF_CODE;
  }

  const syubetu = parseInt(formData.get("syubetu")?.toString() ?? "");
  if (Number.isInteger(syubetu)) {
    if (!isValidPropertyType(syubetu)) {
      return { ok: false, error: "物件種別が正しくありません。" };
    }
    data.syubetu = syubetu;
  }

  const disclosureLevel = parseInt(formData.get("disclosureLevel")?.toString() ?? "");
  if (Number.isInteger(disclosureLevel)) {
    if (!isDisclosureLevel(disclosureLevel)) {
      return { ok: false, error: "公開レベルが正しくありません。" };
    }
    data.disclosureLevel = disclosureLevel;
  }

  return { ok: true, data };
}

/** 物件を保存した後に、一覧・詳細の表示を作り直す。 */
function revalidatePropertyPages(id: number) {
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${id}`);
  revalidatePath("/properties");
  revalidatePath(`/property/${id}`);
}

/**
 * 物件情報の更新（管理者のみ）。
 *
 * objMngNo（取込の突合キー）は変更させない。ここを書き換えると、次のCSV取込で
 * 別の物件として重複登録される。
 */
export async function updateProperty(id: number, formData: FormData) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false as const, error: authErrorMessage(auth.reason) };
  }

  if (!Number.isInteger(id) || id <= 0) {
    return { success: false as const, error: "物件が指定されていません。" };
  }

  const form = readPropertyForm(formData);
  if (!form.ok) return { success: false as const, error: form.error };

  try {
    await prisma.property.update({ where: { id }, data: form.data });
    revalidatePropertyPages(id);
    return { success: true as const };
  } catch (error) {
    return reportError("updateProperty", error, "保存できませんでした。");
  }
}

/**
 * 物件の手動登録（管理者のみ。2026-10-08 大野の指示）。
 *
 * 物件管理番号は必ず手で入力する（大野の決定。自動採番はしない）。
 * CSV取込と同じく、物件管理番号の重複と「取扱店＋掲載会社管理番号」の重複は登録しない
 * （登録すると、次のCSV取込でどの物件を上書きするか決められなくなる）。
 */
export async function createProperty(formData: FormData) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false as const, error: authErrorMessage(auth.reason) };
  }

  const objMngNo = parseObjMngNo(formData.get("objMngNo")?.toString());
  if (objMngNo === null) {
    return { success: false as const, error: "物件管理番号を数字で入力してください。" };
  }

  const form = readPropertyForm(formData);
  if (!form.ok) return { success: false as const, error: form.error };
  const data = form.data;

  for (const field of PROPERTY_FIELDS) {
    if (field.required && (data[field.key] === undefined || data[field.key] === null)) {
      return { success: false as const, error: `${field.label}を入力してください。` };
    }
  }
  if (typeof data.cityCd !== "string") {
    return { success: false as const, error: "エリアを選んでください。" };
  }
  if (typeof data.syubetu !== "number") {
    return { success: false as const, error: "物件種別を選んでください。" };
  }

  try {
    const sameNo = await prisma.property.findUnique({ where: { objMngNo }, select: { id: true } });
    if (sameNo) {
      return {
        success: false as const,
        error: `物件管理番号 ${objMngNo} は、登録済みの物件（ID ${sameNo.id}）が使っています。`,
      };
    }
    const key = importKey(data.agencyName as string | null, data.listingCompanyNo as string | null);
    if (key !== null) {
      // 取込の突合（matchWithExisting）と同じく、番号で引いてから会社名を importKey で比べる
      const candidates = await prisma.property.findMany({
        where: { listingCompanyNo: (data.listingCompanyNo as string).trim() },
        select: { id: true, agencyName: true, listingCompanyNo: true },
      });
      const sameKey = candidates.find((p) => importKey(p.agencyName, p.listingCompanyNo) === key);
      if (sameKey) {
        return {
          success: false as const,
          error: `取扱店と掲載会社管理番号が同じ物件（ID ${sameKey.id}）が登録済みです。`,
        };
      }
    }

    const address = data.address as string;
    const created = await prisma.property.create({
      data: {
        ...data,
        objMngNo,
        syubetu: data.syubetu,
        syumoku: (data.syumoku as string | null) || DEFAULT_SYUMOKU,
        title: data.title as string,
        priceMan: data.priceMan as number,
        madori: data.madori as string,
        address,
        prefCd: PREF_CODE,
        cityCd: data.cityCd,
      },
      select: { id: true },
    });
    revalidatePropertyPages(created.id);
    return { success: true as const, id: created.id };
  } catch (error) {
    return reportError("createProperty", error, "登録できませんでした。");
  }
}

/**
 * 掲載対象エリアごとの物件件数。トップページの地図に出す。
 * 会員限定の物件も件数には含める（存在すること自体は隠していない）。非表示は含めない。
 */
export async function getAreaPropertyCounts() {
  try {
    const grouped = await prisma.property.groupBy({
      by: ["cityCd"],
      // 非表示の物件は数えない。
      where: SITE_VISIBLE_WHERE,
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    for (const row of grouped) {
      if (isSupportedArea(row.cityCd)) counts[row.cityCd] = row._count._all;
    }
    return { success: true as const, data: counts };
  } catch (error) {
    return reportError("getAreaPropertyCounts", error, "件数を取得できませんでした。");
  }
}
