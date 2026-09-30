"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireAdmin, requireUser, authErrorMessage } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { isValidUserStatus } from "@/config/security";
// S-08：長さの上限は config/inputLimits.ts に集約している（D-19）。
import { INPUT_LIMITS, withinLimit } from "@/config/inputLimits";

/**
 * S-07：ここにある関数は "use server"、つまり公開されたHTTPエンドポイントである。
 * 画面に管理メニューを出さないことは権限制御にならないため、
 * データを返す関数・変える関数の冒頭で必ず requireAdmin() / requireUser() を呼ぶ。
 */

/**
 * 画面へ返してよい列だけを明示する。
 *
 * S-01：これが無いと Prisma は User の全列を返す。User には password（bcryptハッシュ）、
 * failedLoginCount、lockedUntil、deletedBy が含まれ、"use server" の戻り値は
 * そのままブラウザへ配信されるため、会員全員のパスワードハッシュが
 * 管理画面のレスポンスに載っていた。列を足すときはここに足す。
 */
const USER_FIELDS = {
  id: true,
  email: true,
  name: true,
  tel: true,
  zip: true,
  address: true,
  role: true,
  status: true,
  memberType: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** 会員一覧（管理者のみ）。退会済みは既定で除く。 */
export async function getUsers() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false, error: authErrorMessage(auth.reason) };
  }

  try {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: USER_FIELDS,
    });
    return { success: true, data: users };
  } catch (error) {
    // D-07：例外の中身をそのまま返さない。ログにだけ残す。
    return reportError("getUsers", error, "会員データを取得できませんでした。");
  }
}

/** 会員詳細（管理者のみ）。 */
export async function getUserById(id: number) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false as const, error: authErrorMessage(auth.reason) };
  }

  try {
    const user = await prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...USER_FIELDS,
        activityLogs: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!user) {
      return { success: false as const, error: "会員が見つかりません。" };
    }
    return { success: true as const, data: user };
  } catch (error) {
    return reportError("getUserById", error, "会員データを取得できませんでした。");
  }
}

/** 会員の状態変更（管理者のみ）。 */
export async function updateUserStatus(id: number, status: string) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false as const, error: authErrorMessage(auth.reason) };
  }

  // 画面が送ってくる値を信用しない。想定外のステータスは書き込まない。
  if (!isValidUserStatus(status)) {
    return { success: false as const, error: "指定された状態は使用できません。" };
  }

  try {
    // S-13：退会済み（deletedAt あり）の会員は対象にしない。
    const target = await prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!target) {
      return { success: false as const, error: "会員が見つかりません。" };
    }

    const user = await prisma.user.update({
      where: { id },
      data: { status },
      select: {
        ...USER_FIELDS,
        activityLogs: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    revalidatePath("/admin/users");
    return { success: true as const, data: user };
  } catch (error) {
    return reportError("updateUserStatus", error, "状態を変更できませんでした。");
  }
}

/**
 * 会員の削除（管理者のみ）。
 * S-13：物理削除ではなく論理削除。誰がいつ消したかを残す。
 * 以前は prisma.user.delete で、ActivityLog もカスケードで消えて復旧不能だった。
 */
export async function deleteUser(id: number) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false as const, error: authErrorMessage(auth.reason) };
  }

  try {
    const target = await prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { email: true },
    });
    if (!target) {
      return { success: false as const, error: "会員が見つかりません。" };
    }
    // 自分自身を削除すると、その場で管理画面に入れなくなり戻す手段が無くなる。
    // 復旧はDBを直接触るしかないため、ここで止める。
    if (target.email === auth.email) {
      return {
        success: false as const,
        error: "ログイン中のご自身のアカウントは削除できません。",
      };
    }

    await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: auth.email },
    });
    revalidatePath("/admin/users");
    return { success: true as const };
  } catch (error) {
    return reportError("deleteUser", error, "会員を削除できませんでした。");
  }
}

/**
 * 動作確認用のテストデータ投入（管理者のみ・本番では実行しない）。
 * O-01：本番DBへ架空の個人情報を書き込まないための歯止め。
 */
export async function createTestUsers() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false as const, error: authErrorMessage(auth.reason) };
  }
  if (process.env.NODE_ENV === "production") {
    return {
      success: false as const,
      error: "本番環境ではテストデータを作成できません。",
    };
  }

  try {
    const users = [
      {
        name: "テスト 太郎",
        email: "test-taro@example.invalid",
        tel: "090-0000-0000",
        address: "テスト県テスト市",
        memberType: "FREE",
        status: "ACTIVE",
      },
      {
        name: "テスト 花子",
        email: "test-hanako@example.invalid",
        tel: "080-0000-0000",
        address: "テスト県テスト市",
        memberType: "STORE",
        status: "ACTIVE",
      },
    ];

    for (const user of users) {
      await prisma.user.upsert({
        where: { email: user.email },
        update: {},
        create: user,
      });
    }
    revalidatePath("/admin/users");
    return { success: true as const };
  } catch (error) {
    return reportError("createTestUsers", error, "テストデータを作成できませんでした。");
  }
}

/**
 * 退会（本人のみ）。
 * S-13：論理削除。誤操作からの復旧を可能にするため、レコードは残す。
 */
export async function deleteMyAccount() {
  const auth = await requireUser();
  if (!auth.ok) {
    return { success: false as const, error: authErrorMessage(auth.reason) };
  }

  try {
    await prisma.user.update({
      where: { id: auth.userId },
      data: { deletedAt: new Date(), deletedBy: "SELF" },
    });
    return { success: true as const };
  } catch (error) {
    return reportError("deleteMyAccount", error, "退会処理を完了できませんでした。");
  }
}

/** プロフィール更新（本人のみ）。 */
export async function updateMyProfile(formData: FormData) {
  const auth = await requireUser();
  if (!auth.ok) {
    return { success: false as const, error: authErrorMessage(auth.reason) };
  }

  const name = formData.get("name")?.toString()?.trim();
  const tel = formData.get("tel")?.toString()?.trim();

  if (!name) {
    return { success: false as const, error: "お名前は必須です" };
  }

  // S-08：登録時（registerUser）と同じ上限を適用する。
  // ここに上限が無かったため、同じ User.name に対して
  // 「登録時は100字・更新時は無制限」という2通りの規則が並んでいた。
  if (!withinLimit(name, INPUT_LIMITS.name) || !withinLimit(tel, INPUT_LIMITS.tel)) {
    return { success: false as const, error: "入力された文字数が上限を超えています" };
  }

  try {
    await prisma.user.update({
      where: { id: auth.userId },
      data: { name, tel: tel || null },
    });
    revalidatePath("/mypage");
    return { success: true as const };
  } catch (error) {
    return reportError("updateMyProfile", error, "情報を更新できませんでした。");
  }
}
