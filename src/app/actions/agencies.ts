"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/client";
import prisma from "@/lib/prisma";
import { requireAdmin, authErrorMessage } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { toJsonSafe } from "@/lib/json";
import {
  agencyColumnsToWrite,
  agencyNameOf,
  planAgencyMerge,
  sameCompanyKey,
  summarizeAgencyColumns,
  type AgencyInfo,
} from "@/lib/agencyMaster";

/**
 * 取扱会社の台帳（2026-10-22）。会社ごとに会社情報と掲載物件を管理する（/admin/agencies）。
 * 判定は src/lib/agencyMaster.ts、表は Agency と AgencyAlias。
 *
 * 会社情報の保存と会社の統合は、どちらも物件を一括で書き換える。D-17 の3手順で行う。
 *   1. 数える … preview* で対象件数を出し、画面で確認してもらう
 *   2. 控え   … 変更前の物件の値を PropertyImportBackup に残す（戻すのは scripts/restore-agency-backup.mjs）
 *   3. 確認   … 画面の件数（expectedCount）とDBの件数が一致しなければ書き込まない
 * 数える・控える・書き換えるは1つのトランザクションで行う。
 *
 * D-10：400行を超えるのは、一覧・詳細・保存・統合が同じ「名前でつながる物件の引き方」を共有しているため。
 */

type Tx = Prisma.TransactionClient;

/** 物件に入っている会社名の生の値（前後の空白つき）→ 会社名。名前で物件を引くときに使う。 */
async function rawAgencyNames(db: Tx | typeof prisma, names: readonly string[]): Promise<string[]> {
  const wanted = new Set(names);
  const groups = await db.property.groupBy({ by: ["agencyName"] });
  return groups
    .map((g) => g.agencyName)
    .filter((raw): raw is string => raw !== null && wanted.has(agencyNameOf(raw) ?? ""));
}

const AGENCY_COLUMNS = { id: true, agencyName: true, agencyAddress: true, agencyTel: true, agencyLicense: true } as const;

// ───────── 一覧 ─────────

export type AgencyListRow = {
  name: string;
  reading: string | null;
  propertyCount: number;
  /** 会社情報を台帳に登録済みか */
  registered: boolean;
  /** 表記ゆれの候補（自分以外）の数 */
  variantCount: number;
  aliasCount: number;
};

/** 取扱会社の一覧（管理者のみ）。物件に出てくる会社と、台帳に登録した会社を合わせる。 */
export async function getAgencyList() {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: authErrorMessage(auth.reason) };

  try {
    const [groups, agencies, readings, aliases] = await Promise.all([
      prisma.property.groupBy({ by: ["agencyName"], _count: { _all: true } }),
      prisma.agency.findMany({ select: { name: true } }),
      prisma.agencyReading.findMany(),
      prisma.agencyAlias.findMany(),
    ]);
    const counts = new Map<string, number>();
    for (const g of groups) {
      const name = agencyNameOf(g.agencyName);
      if (name !== null) counts.set(name, (counts.get(name) ?? 0) + g._count._all);
    }
    for (const a of agencies) if (!counts.has(a.name)) counts.set(a.name, 0);

    const registered = new Set(agencies.map((a) => a.name));
    const readingOf = new Map(readings.map((r) => [r.agencyName, r.reading]));
    const keyCount = new Map<string, number>();
    for (const name of counts.keys()) {
      const key = sameCompanyKey(name);
      if (key !== "") keyCount.set(key, (keyCount.get(key) ?? 0) + 1);
    }
    const aliasCount = new Map<string, number>();
    for (const a of aliases) aliasCount.set(a.agencyName, (aliasCount.get(a.agencyName) ?? 0) + 1);

    const rows: AgencyListRow[] = [...counts].map(([name, propertyCount]) => ({
      name,
      reading: readingOf.get(name) ?? null,
      propertyCount,
      registered: registered.has(name),
      variantCount: Math.max(0, (keyCount.get(sameCompanyKey(name)) ?? 1) - 1),
      aliasCount: aliasCount.get(name) ?? 0,
    }));
    return { success: true as const, data: rows };
  } catch (error) {
    return reportError("getAgencyList", error, "取扱会社の一覧を取得できませんでした。");
  }
}

// ───────── 詳細 ─────────

export type AgencyForm = {
  address: string;
  tel: string;
  fax: string;
  license: string;
  contactName: string;
  contactEmail: string;
  memo: string;
};

/** 1社分の会社情報・掲載物件・旧表記・表記ゆれの候補（管理者のみ）。 */
export async function getAgencyDetail(name: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: authErrorMessage(auth.reason) };

  const agencyName = agencyNameOf(String(name ?? ""));
  if (agencyName === null) return { success: false as const, error: "取扱会社名がありません。" };

  try {
    const [agency, reading, aliases, groups] = await Promise.all([
      prisma.agency.findUnique({ where: { name: agencyName } }),
      prisma.agencyReading.findUnique({ where: { agencyName } }),
      prisma.agencyAlias.findMany({ where: { agencyName }, orderBy: { alias: "asc" } }),
      prisma.property.groupBy({ by: ["agencyName"], _count: { _all: true } }),
    ]);
    const raws = groups
      .map((g) => g.agencyName)
      .filter((raw): raw is string => raw !== null && agencyNameOf(raw) === agencyName);
    const properties = await prisma.property.findMany({
      where: { agencyName: { in: raws } },
      select: {
        ...AGENCY_COLUMNS,
        objMngNo: true,
        listingCompanyNo: true,
        title: true,
        syubetu: true,
        priceMan: true,
        disclosureLevel: true,
      },
      orderBy: { id: "asc" },
    });
    if (!agency && properties.length === 0) {
      return { success: false as const, error: "この取扱会社は見つかりません（統合済みの旧表記かもしれません）。" };
    }

    // 表記ゆれの候補：自分以外で、会社の種類・空白などを除くと同じ名前になる会社
    const key = sameCompanyKey(agencyName);
    const otherCounts = new Map<string, number>();
    for (const g of groups) {
      const other = agencyNameOf(g.agencyName);
      if (other === null || other === agencyName) continue;
      otherCounts.set(other, (otherCounts.get(other) ?? 0) + g._count._all);
    }
    const others = [...otherCounts].map(([n, propertyCount]) => ({ name: n, propertyCount }));
    const variants = key === "" ? [] : others.filter((o) => sameCompanyKey(o.name) === key);

    return {
      success: true as const,
      data: {
        name: agencyName,
        registered: agency !== null,
        agency,
        reading: reading?.reading ?? null,
        readingEstimated: reading?.estimated ?? false,
        aliases: aliases.map((a) => a.alias),
        fieldVariants: summarizeAgencyColumns(properties),
        properties: properties.map((p) => ({
          id: p.id,
          objMngNo: p.objMngNo.toString(),
          listingCompanyNo: p.listingCompanyNo,
          title: p.title,
          syubetu: p.syubetu,
          priceMan: p.priceMan,
          disclosureLevel: p.disclosureLevel,
        })),
        variants,
        /** 統合先の候補を人が探すための、他の全会社 */
        others,
      },
    };
  } catch (error) {
    return reportError("getAgencyDetail", error, "取扱会社の情報を取得できませんでした。");
  }
}

// ───────── 会社情報の保存 ─────────

const FIELD_MAX = 200;
const MEMO_MAX = 2000;

/** 画面の入力を検証して保存する形にする。空欄は null。 */
function readAgencyForm(
  input: AgencyForm
): { ok: true; data: Record<keyof AgencyForm, string | null> } | { ok: false; error: string } {
  const data = {} as Record<keyof AgencyForm, string | null>;
  for (const key of ["address", "tel", "fax", "license", "contactName", "contactEmail", "memo"] as const) {
    const value = String(input?.[key] ?? "").trim();
    const max = key === "memo" ? MEMO_MAX : FIELD_MAX;
    if (value.length > max) return { ok: false, error: `入力が長すぎます（${max}文字まで）。` };
    data[key] = value === "" ? null : value;
  }
  if (data.contactEmail !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contactEmail)) {
    return { ok: false, error: "担当者メールの形が正しくありません。" };
  }
  return { ok: true, data };
}

/** 保存で書き換わる物件（会社情報と値が違う物件）。 */
async function propertiesChangedBySave(db: Tx | typeof prisma, agencyName: string, info: AgencyInfo) {
  const write = agencyColumnsToWrite(info);
  const raws = await rawAgencyNames(db, [agencyName]);
  const rows = await db.property.findMany({ where: { agencyName: { in: raws } }, select: AGENCY_COLUMNS });
  return {
    write,
    rows: rows.filter((p) => Object.entries(write).some(([col, value]) => p[col as keyof typeof write] !== value)),
  };
}

/** D-17 手順1：会社情報を保存したとき、物件を何件書き換えるか（管理者のみ・書き込まない）。 */
export async function previewAgencySave(name: string, input: AgencyForm) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: authErrorMessage(auth.reason) };
  const agencyName = agencyNameOf(String(name ?? ""));
  if (agencyName === null) return { success: false as const, error: "取扱会社名がありません。" };
  const form = readAgencyForm(input);
  if (!form.ok) return { success: false as const, error: form.error };

  try {
    const { rows } = await propertiesChangedBySave(prisma, agencyName, form.data);
    return { success: true as const, data: { changeCount: rows.length } };
  } catch (error) {
    return reportError("previewAgencySave", error, "書き換える物件を数えられませんでした。");
  }
}

/**
 * 会社情報を保存し、その会社の物件の所在地・電話・免許番号へ反映する（管理者のみ）。
 * 空欄の項目は物件へ書かない。書き換える物件が expectedCount と違えば中止する。
 */
export async function saveAgency(name: string, input: AgencyForm, expectedCount: number) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: authErrorMessage(auth.reason) };
  const agencyName = agencyNameOf(String(name ?? ""));
  if (agencyName === null) return { success: false as const, error: "取扱会社名がありません。" };
  if (!Number.isInteger(expectedCount) || expectedCount < 0) {
    return { success: false as const, error: "想定件数が指定されていないため、保存を中止しました。" };
  }
  const form = readAgencyForm(input);
  if (!form.ok) return { success: false as const, error: form.error };

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const { write, rows } = await propertiesChangedBySave(tx, agencyName, form.data);
      if (rows.length !== expectedCount) {
        return {
          ok: false as const,
          error: `書き換える物件が確認時の${expectedCount}件から${rows.length}件に変わったため、保存を中止しました。もう一度保存してください。`,
        };
      }
      // 物件を書き換えない保存でも控えを取る（会社情報だけを前の状態へ戻せるように）
      const backup = await tx.propertyImportBackup.create({
        data: {
          importedBy: auth.email,
          itemCount: rows.length,
          before: toJsonSafe({
            kind: "agencySave",
            agencyName,
            written: write,
            rows,
            agencyBefore: await tx.agency.findUnique({ where: { name: agencyName } }),
          }) as object,
        },
      });
      if (rows.length > 0) {
        await tx.property.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: write });
      }
      await tx.agency.upsert({
        where: { name: agencyName },
        create: { name: agencyName, ...form.data },
        update: form.data,
      });
      return { ok: true as const, count: rows.length, backupId: backup.id };
    });
    if (!outcome.ok) return { success: false as const, error: outcome.error };

    revalidateAgencyPages();
    return { success: true as const, count: outcome.count, backupId: outcome.backupId };
  } catch (error) {
    return reportError("saveAgency", error, "会社情報を保存できませんでした。");
  }
}

// ───────── 統合 ─────────

/** 統合の入力を検証する。統合先・統合元とも空でなく、統合先が統合元に混ざっていないこと。 */
function readMergeInput(target: string, sources: string[]) {
  const targetName = agencyNameOf(String(target ?? ""));
  const sourceNames = [...new Set((Array.isArray(sources) ? sources : []).map((s) => agencyNameOf(String(s ?? ""))))];
  if (targetName === null) return { ok: false as const, error: "統合先の会社がありません。" };
  if (sourceNames.length === 0 || sourceNames.some((s) => s === null)) {
    return { ok: false as const, error: "統合する会社を選んでください。" };
  }
  if (sourceNames.includes(targetName)) return { ok: false as const, error: "統合先と同じ会社は選べません。" };
  return { ok: true as const, target: targetName, sources: sourceNames as string[] };
}

/** 統合の判定に使う物件（統合先と統合元）。 */
async function propertiesForMerge(db: Tx | typeof prisma, target: string, sources: string[]) {
  const raws = await rawAgencyNames(db, [target, ...sources]);
  return db.property.findMany({
    where: { agencyName: { in: raws } },
    select: { ...AGENCY_COLUMNS, listingCompanyNo: true, title: true },
  });
}

/** D-17 手順1：統合で書き換える物件の数と、統合できない理由（管理者のみ・書き込まない）。 */
export async function previewAgencyMerge(target: string, sources: string[]) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: authErrorMessage(auth.reason) };
  const input = readMergeInput(target, sources);
  if (!input.ok) return { success: false as const, error: input.error };

  try {
    const rows = await propertiesForMerge(prisma, input.target, input.sources);
    const plan = planAgencyMerge(input.target, input.sources, rows);
    if (!plan.ok) {
      const titleOf = new Map(rows.map((r) => [r.id, `${r.title}（${agencyNameOf(r.agencyName)}）`]));
      return {
        success: true as const,
        data: {
          ok: false as const,
          error: plan.error,
          conflicts: plan.conflicts.map((c) => ({
            listingCompanyNo: c.listingCompanyNo,
            properties: c.ids.map((id) => ({ id, label: titleOf.get(id) ?? "" })),
          })),
        },
      };
    }
    return { success: true as const, data: { ok: true as const, changeCount: plan.propertyIds.length } };
  } catch (error) {
    return reportError("previewAgencyMerge", error, "統合の対象を数えられませんでした。");
  }
}

/**
 * 統合元の会社を統合先へまとめる（管理者のみ）。
 * - 統合元の物件の会社名を統合先の名前にし、統合先に会社情報があれば物件へ反映する
 * - 統合元の名前は旧表記（AgencyAlias）に残す。以後の取込・手動登録は統合先へ読み替える
 * - 読み・会社情報は統合先のものを残す。統合先に無ければ、統合元の最初の1社のものを引き継ぐ
 */
export async function mergeAgencies(target: string, sources: string[], expectedCount: number) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: authErrorMessage(auth.reason) };
  const input = readMergeInput(target, sources);
  if (!input.ok) return { success: false as const, error: input.error };
  if (!Number.isInteger(expectedCount) || expectedCount < 0) {
    return { success: false as const, error: "想定件数が指定されていないため、統合を中止しました。" };
  }

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const rows = await propertiesForMerge(tx, input.target, input.sources);
      const plan = planAgencyMerge(input.target, input.sources, rows);
      if (!plan.ok) return { ok: false as const, error: plan.error };
      if (plan.propertyIds.length !== expectedCount) {
        return {
          ok: false as const,
          error: `書き換える物件が確認時の${expectedCount}件から${plan.propertyIds.length}件に変わったため、統合を中止しました。もう一度確認してください。`,
        };
      }
      const backup = await tx.propertyImportBackup.create({
        data: {
          importedBy: auth.email,
          itemCount: plan.propertyIds.length,
          before: toJsonSafe({
            kind: "agencyMerge",
            target: input.target,
            sources: input.sources,
            rows: rows
              .filter((r) => plan.propertyIds.includes(r.id))
              .map((r) => ({
                id: r.id,
                agencyName: r.agencyName,
                agencyAddress: r.agencyAddress,
                agencyTel: r.agencyTel,
                agencyLicense: r.agencyLicense,
              })),
            // 統合先が統合元の読み・会社情報を引き継いだかを戻すときに見分けるため、統合先の有無も残す
            targetHadAgency: (await tx.agency.count({ where: { name: input.target } })) > 0,
            targetHadReading: (await tx.agencyReading.count({ where: { agencyName: input.target } })) > 0,
            agencies: await tx.agency.findMany({ where: { name: { in: input.sources } } }),
            readings: await tx.agencyReading.findMany({ where: { agencyName: { in: input.sources } } }),
            // carryOverToTarget が付け替える・消す旧表記
            aliases: await tx.agencyAlias.findMany({
              where: { OR: [{ agencyName: { in: input.sources } }, { alias: { in: [input.target, ...input.sources] } }] },
            }),
          }) as object,
        },
      });

      await carryOverToTarget(tx, input.target, input.sources);
      const targetAgency = await tx.agency.findUnique({ where: { name: input.target } });
      await tx.property.updateMany({
        where: { id: { in: plan.propertyIds } },
        data: { agencyName: input.target, ...(targetAgency ? agencyColumnsToWrite(targetAgency) : {}) },
      });
      return { ok: true as const, count: plan.propertyIds.length, backupId: backup.id };
    });
    if (!outcome.ok) return { success: false as const, error: outcome.error };

    revalidateAgencyPages();
    return { success: true as const, count: outcome.count, backupId: outcome.backupId };
  } catch (error) {
    return reportError("mergeAgencies", error, "統合できませんでした。");
  }
}

/** 統合元の旧表記・読み・会社情報を統合先へ移し、統合元の行を消す（mergeAgencies のトランザクション内）。 */
async function carryOverToTarget(tx: Tx, target: string, sources: string[]) {
  // 旧表記：統合元を指していた旧表記も統合先へ付け替え、統合元の名前そのものを旧表記に足す
  await tx.agencyAlias.updateMany({ where: { agencyName: { in: sources } }, data: { agencyName: target } });
  await tx.agencyAlias.deleteMany({ where: { alias: { in: [target, ...sources] } } });
  await tx.agencyAlias.createMany({ data: sources.map((alias) => ({ alias, agencyName: target })) });

  // 読み：統合先に無ければ、統合元の最初の1社の読みを引き継ぐ
  const [targetReading, sourceReading] = await Promise.all([
    tx.agencyReading.findUnique({ where: { agencyName: target } }),
    tx.agencyReading.findFirst({ where: { agencyName: { in: sources } } }),
  ]);
  if (!targetReading && sourceReading) {
    await tx.agencyReading.create({
      data: { agencyName: target, reading: sourceReading.reading, estimated: sourceReading.estimated },
    });
  }
  await tx.agencyReading.deleteMany({ where: { agencyName: { in: sources } } });

  // 会社情報：統合先に無ければ、統合元の最初の1社の会社情報を引き継ぐ
  const [targetAgency, sourceAgency] = await Promise.all([
    tx.agency.findUnique({ where: { name: target } }),
    tx.agency.findFirst({ where: { name: { in: sources } } }),
  ]);
  if (!targetAgency && sourceAgency) {
    const { address, tel, fax, license, contactName, contactEmail, memo } = sourceAgency;
    await tx.agency.create({ data: { name: target, address, tel, fax, license, contactName, contactEmail, memo } });
  }
  await tx.agency.deleteMany({ where: { name: { in: sources } } });
}

/** 旧表記の記録を外す（管理者のみ）。物件は書き換えない。以後その表記の取込行は別会社として扱われる。 */
export async function deleteAgencyAlias(alias: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: authErrorMessage(auth.reason) };
  const name = agencyNameOf(String(alias ?? ""));
  if (name === null) return { success: false as const, error: "旧表記がありません。" };

  try {
    await prisma.agencyAlias.deleteMany({ where: { alias: name } });
    revalidateAgencyPages();
    return { success: true as const };
  } catch (error) {
    return reportError("deleteAgencyAlias", error, "旧表記を外せませんでした。");
  }
}

function revalidateAgencyPages() {
  revalidatePath("/admin/agencies");
  revalidatePath("/admin/agency-readings");
  revalidatePath("/admin/properties");
}
