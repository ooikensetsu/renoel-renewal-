"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireAdmin, authErrorMessage } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { parseImageFileName, storagePathFor } from "@/lib/imageName";
import {
  uploadImage,
  deleteImage,
  toStoragePath,
  isStorageConfigured,
  checkStorage,
} from "@/lib/storage";
import {
  MAX_FILE_BYTES,
  MAX_FILE_LABEL,
  MAX_IMAGES_PER_PROPERTY,
  ALLOWED_EXTENSIONS,
} from "@/config/images";

/** 1ファイルごとの結果。画面で「どれが入ってどれが入らなかったか」を出すために使う。 */
export type ImageUploadResult = {
  fileName: string;
  ok: boolean;
  message: string;
};

/** 画面に出す前の共通チェック。 */
function checkFile(file: File): string | null {
  if (file.size === 0) return "中身が空です";
  if (file.size > MAX_FILE_BYTES) {
    return `${MAX_FILE_LABEL} を超えています（${(file.size / 1024 / 1024).toFixed(1)}MB）`;
  }
  return null;
}

/**
 * 1枚を保管先へ入れ、DBに行を作る（無ければ）。
 * 同じ物件・同じ並び順があれば、そのURLだけ差し替える（重複行を増やさない）。
 */
async function saveOne(
  propertyId: number,
  objMngNo: string,
  order: number,
  ext: string,
  file: File
): Promise<{ ok: boolean; message: string }> {
  // DBには Storage 上のパスを保存する（公開URLではない。表示時に署名付きURLを作る。S-07）。
  const path = storagePathFor(objMngNo, order, ext);
  const uploaded = await uploadImage(path, file, ext);
  if (!uploaded.ok) return { ok: false, message: uploaded.reason };

  const existing = await prisma.propertyImage.findFirst({
    where: { propertyId, sortOrder: order },
  });

  if (existing) {
    await prisma.propertyImage.update({
      where: { id: existing.id },
      data: { path },
    });
    return { ok: true, message: `${order}枚目を差し替えました` };
  }

  const count = await prisma.propertyImage.count({ where: { propertyId } });
  if (count >= MAX_IMAGES_PER_PROPERTY) {
    return { ok: false, message: `1物件 ${MAX_IMAGES_PER_PROPERTY} 枚までです` };
  }

  await prisma.propertyImage.create({
    data: { propertyId, path, sortOrder: order },
  });
  return { ok: true, message: `${order}枚目として登録しました` };
}

/**
 * ファイル名で物件に紐づける一括アップロード（管理者のみ）。
 *
 * ファイル名は「物件管理番号_連番.拡張子」（例: 6991580385_2.jpg）。
 * 番号がDBの物件と一致しないファイルは**取り込まずに理由を返す**。
 * D-17 と同じ考え方で、1件ずつ結果を出して人が確認できるようにする。
 */
export async function uploadImagesByFileName(formData: FormData): Promise<
  | { success: true; results: ImageUploadResult[] }
  | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: authErrorMessage(auth.reason) };

  if (!isStorageConfigured()) {
    return {
      success: false,
      error:
        "画像の保管先が未設定です。Vercel の環境変数に SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください。",
    };
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return { success: false, error: "ファイルが選択されていません。" };

  try {
    const results: ImageUploadResult[] = [];

    for (const file of files) {
      const sizeError = checkFile(file);
      if (sizeError) {
        results.push({ fileName: file.name, ok: false, message: sizeError });
        continue;
      }

      const parsed = parseImageFileName(file.name);
      if (!parsed.ok) {
        results.push({ fileName: file.name, ok: false, message: parsed.reason });
        continue;
      }

      const property = await prisma.property.findUnique({
        where: { objMngNo: BigInt(parsed.objMngNo) },
        select: { id: true, title: true },
      });
      if (!property) {
        results.push({
          fileName: file.name,
          ok: false,
          message: `物件管理番号 ${parsed.objMngNo} の物件が見つかりません`,
        });
        continue;
      }

      const saved = await saveOne(property.id, parsed.objMngNo, parsed.order, parsed.ext, file);
      results.push({
        fileName: file.name,
        ok: saved.ok,
        message: `${property.title}：${saved.message}`,
      });
    }

    revalidatePath("/admin/properties");
    revalidatePath("/properties");
    return { success: true, results };
  } catch (error) {
    const r = reportError("uploadImagesByFileName", error, "画像を登録できませんでした。");
    return { success: false, error: r.error };
  }
}

/** 物件を指定してのアップロード（管理者のみ）。物件詳細から使う。 */
export async function uploadImagesForProperty(
  propertyId: number,
  formData: FormData
): Promise<
  | { success: true; results: ImageUploadResult[] }
  | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: authErrorMessage(auth.reason) };

  if (!isStorageConfigured()) {
    return {
      success: false,
      error:
        "画像の保管先が未設定です。Vercel の環境変数に SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください。",
    };
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return { success: false, error: "ファイルが選択されていません。" };

  try {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, objMngNo: true },
    });
    if (!property) return { success: false, error: "指定された物件が見つかりません。" };

    const objMngNo = property.objMngNo.toString();
    // 既にある最大の並び順の次から採番する
    const last = await prisma.propertyImage.findFirst({
      where: { propertyId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    let nextOrder = (last?.sortOrder ?? 0) + 1;

    const results: ImageUploadResult[] = [];
    for (const file of files) {
      const sizeError = checkFile(file);
      if (sizeError) {
        results.push({ fileName: file.name, ok: false, message: sizeError });
        continue;
      }

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
        results.push({
          fileName: file.name,
          ok: false,
          message: `対応していない形式です（${ALLOWED_EXTENSIONS.join(" / ")} のみ）`,
        });
        continue;
      }

      const saved = await saveOne(property.id, objMngNo, nextOrder, ext, file);
      results.push({ fileName: file.name, ok: saved.ok, message: saved.message });
      if (saved.ok) nextOrder++;
    }

    revalidatePath("/admin/properties");
    revalidatePath(`/admin/properties/${propertyId}`);
    revalidatePath("/properties");
    revalidatePath(`/property/${propertyId}`);
    return { success: true, results };
  } catch (error) {
    const r = reportError("uploadImagesForProperty", error, "画像を登録できませんでした。");
    return { success: false, error: r.error };
  }
}

/** 画像を1枚削除する（管理者のみ）。DBの行を消し、保管先のファイルも消す。 */
export async function deletePropertyImage(imageId: number) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: authErrorMessage(auth.reason) };

  try {
    const image = await prisma.propertyImage.findUnique({ where: { id: imageId } });
    if (!image) return { success: false as const, error: "画像が見つかりません。" };

    await prisma.propertyImage.delete({ where: { id: imageId } });

    // 保管先の削除は失敗しても処理を止めない（DBからは消えており、孤児ファイルが残るだけ）
    const removed = await deleteImage(toStoragePath(image.path));
    if (!removed.ok) {
      console.error(`保管先の画像を消せませんでした（image ${imageId}）: ${removed.reason}`);
    }

    revalidatePath("/admin/properties");
    revalidatePath(`/admin/properties/${image.propertyId}`);
    revalidatePath("/properties");
    revalidatePath(`/property/${image.propertyId}`);
    return { success: true as const };
  } catch (error) {
    return reportError("deletePropertyImage", error, "画像を削除できませんでした。");
  }
}

/**
 * 画像の保管先が設定済みかどうか（管理者のみ）。
 * クライアントコンポーネントは process.env を読めないため、サーバー側で判定して返す。
 * S-01：設定の有無だけを返し、URLもキーも返さない。
 */
export async function isStorageReady() {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: authErrorMessage(auth.reason) };
  return { success: true as const, ready: isStorageConfigured() };
}

/**
 * 保管先へ実際に接続して確かめる（管理者のみ）。アップロードせずに設定の誤りを切り分ける。
 * S-01：URLもキーも返さない。判定結果の文言だけ返す。
 */
export async function testStorage() {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: authErrorMessage(auth.reason) };
  const result = await checkStorage();
  return { success: true as const, ...result };
}
