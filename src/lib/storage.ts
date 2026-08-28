/**
 * 画像の保管。Supabase Storage の REST API を fetch で直接呼ぶ。
 *
 * 【この構成にした理由】
 * Vercel はサーバーレスでファイルシステムが永続しないため、アップロードした画像を
 * リポジトリや実行環境に置くことはできない。DBと同じ Supabase に寄せることで、
 * 契約先も管理画面も増やさずに済む。@supabase/supabase-js は入れていない（S-05）。
 *
 * S-01：SUPABASE_SERVICE_ROLE_KEY はサーバーからしか読まない。
 * NEXT_PUBLIC_ を付けないこと。付けるとブラウザに配信され、DBを全操作できる鍵が漏れる。
 */

import { STORAGE_BUCKET, CONTENT_TYPES, SIGNED_URL_TTL_SECONDS } from "@/config/images";

function config() {
  const url = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return { url, key };
}

/**
 * 設定値そのものの誤りを先に見つける。
 * 実際に多いのは、ダッシュボードのURLやDBの接続文字列を入れてしまう取り違え。
 * S-01：キーの中身は返さない。長さと先頭の形だけ見る。
 */
export function describeConfigProblem(): string | null {
  const { url, key } = config();
  if (url === "") return "SUPABASE_URL が未設定です";
  if (key === "") return "SUPABASE_SERVICE_ROLE_KEY が未設定です";

  if (!/^https:\/\//.test(url)) {
    return `SUPABASE_URL が https:// で始まっていません（いまの値の先頭: ${url.slice(0, 12)}…）`;
  }
  if (url.includes("/dashboard/") || url.includes("supabase.com")) {
    return "SUPABASE_URL がダッシュボードのURLになっています。Project Settings → API の Project URL（https://xxxx.supabase.co）を設定してください";
  }
  if (url.startsWith("https://db.")) {
    return "SUPABASE_URL がDBのホスト名になっています。Project Settings → API の Project URL（https://xxxx.supabase.co）を設定してください";
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(url)) {
    return `SUPABASE_URL の形が想定と違います（https://xxxx.supabase.co の形にしてください）。いまの値: ${url}`;
  }
  if (key.length < 40) {
    return `SUPABASE_SERVICE_ROLE_KEY が短すぎます（${key.length}文字）。anon キーではなく service_role キーを設定してください`;
  }
  return null;
}

/** 例外を、原因の分かる1行にする。ネットワーク層の失敗は cause に理由が入る。 */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return "原因不明のエラー";
  if (error.name === "TimeoutError") return "応答がありませんでした（タイムアウト）";

  const cause = (error as { cause?: unknown }).cause;
  const causeText =
    cause instanceof Error
      ? `${(cause as { code?: string }).code ?? cause.name}: ${cause.message}`
      : typeof cause === "string"
        ? cause
        : "";

  return `${error.name}: ${error.message}${causeText ? `（${causeText}）` : ""}`;
}

/** 設定が揃っているか。画面に「まだ使えません」と出すために使う。 */
export function isStorageConfigured(): boolean {
  const { url, key } = config();
  return url !== "" && key !== "";
}

/**
 * 過去の公開URL形式。S-07 でバケットを非公開にしたため新規には使わないが、
 * すでにこの形式で保存済みの PropertyImage.path を解釈するために残す。
 */
export function publicUrl(path: string): string {
  const { url } = config();
  return `${url}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
}

/**
 * DBの PropertyImage.path から Storage 上のパス（例: 6991580385/001.jpg）を得る。
 * 新しい行はパスをそのまま持つ。過去の行は公開URLを丸ごと持っているので変換する。
 */
export function toStoragePath(stored: string): string {
  return pathFromPublicUrl(stored) ?? stored.replace(/^\/+/, "");
}

export type StorageResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * 1枚アップロードする。同じパスがあれば上書きする（同じ物件の同じ連番を差し替えられる）。
 * 例外は投げず、理由を返す。呼び出し側が1件ずつ結果を画面に出せるようにするため。
 */
export async function uploadImage(path: string, file: File, ext: string): Promise<StorageResult> {
  const problem = describeConfigProblem();
  if (problem) return { ok: false, reason: problem };
  const { url, key } = config();

  try {
    const res = await fetch(`${url}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        // 同名があれば置き換える
        "x-upsert": "true",
        "Cache-Control": "public, max-age=31536000",
      },
      body: file,
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      let detail = "";
      try {
        const body = (await res.json()) as { message?: string; error?: string };
        detail = body.message || body.error || "";
      } catch {
        // JSON でない応答もある
      }
      return {
        ok: false,
        reason: `保管先が受け付けませんでした（HTTP ${res.status}${detail ? `: ${detail}` : ""}）`,
      };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, reason: `保管先へ接続できませんでした（${describeError(error)}）` };
  }
}

/**
 * 1枚消す。DBの行を消したあとに呼ぶ。
 * 消えなくてもDB側は消えている（孤児ファイルが残るだけ）ので、失敗しても処理は止めない。
 */
export async function deleteImage(path: string): Promise<StorageResult> {
  const { url, key } = config();
  if (url === "" || key === "") {
    return { ok: false, reason: "保管先の設定がありません" };
  }

  try {
    const res = await fetch(`${url}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { ok: false, reason: `削除できませんでした（HTTP ${res.status}）` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: `保管先へ接続できませんでした（${describeError(error)}）` };
  }
}

/** 過去の公開URLから Storage 上のパスを取り出す。toStoragePath 経由で使う。 */
export function pathFromPublicUrl(fileUrl: string): string | null {
  const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
  const i = fileUrl.indexOf(marker);
  if (i === -1) return null;
  return fileUrl.slice(i + marker.length);
}

/**
 * S-07：会員限定物件の画像が URL 推測だけで見えないよう、バケットは非公開にし、
 * 画面表示のたびに短時間だけ有効な署名付きURLを作る。
 *
 * 入力の各要素（PropertyImage.path）をキーに、表示用URLを値に持つ Map を返す。
 * 署名に失敗したものはキーごと結果に含めない（呼び出し側で除外できる）。
 * 会員限定物件の秘匿判定を通したうえで渡すこと（この関数は認可を見ない）。
 */
export async function signedImageUrls(
  storedPaths: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const { url, key } = config();
  if (url === "" || key === "" || storedPaths.length === 0) return result;

  // 重複を除いて1回で署名する（一覧では同じ画像が複数回並びうる）。
  // Storage パス → DBに入っている元の値、の対応表。応答を元の値へ戻すために使う。
  const originalByStoragePath = new Map<string, string>();
  for (const stored of storedPaths) originalByStoragePath.set(toStoragePath(stored), stored);
  const paths = [...originalByStoragePath.keys()];

  try {
    const res = await fetch(`${url}/storage/v1/object/sign/${STORAGE_BUCKET}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS, paths }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error(`画像URLの署名に失敗しました（HTTP ${res.status}）`);
      return result;
    }

    const rows = (await res.json()) as {
      path?: string | null;
      signedURL?: string | null;
      error?: string | null;
    }[];

    rows.forEach((row, i) => {
      if (!row.signedURL) return;
      // 応答の path で元の値へ戻す。path が合わなければ入力順で対応づける
      // （Supabase は paths と同じ順で返す）。
      const original =
        (row.path ? originalByStoragePath.get(row.path) : undefined) ??
        originalByStoragePath.get(paths[i] ?? "");
      if (original) result.set(original, `${url}/storage/v1${row.signedURL}`);
    });
    return result;
  } catch (error) {
    console.error("画像URLの署名でエラー:", describeError(error));
    return result;
  }
}

/**
 * PropertyImage.path の配列を、画面に出せるURL配列へ変換する。
 * 署名に失敗したものは落とす（壊れた <img> を出さない）。
 */
export async function toDisplayUrls(storedPaths: string[]): Promise<string[]> {
  const signed = await signedImageUrls(storedPaths);
  return storedPaths.map((p) => signed.get(p)).filter((u): u is string => !!u);
}

/**
 * 保管先へ実際に1往復して、設定が正しいかを確かめる。
 * バケットの情報を取得するだけで、何も書き込まない。
 */
export async function checkStorage(): Promise<{ ok: boolean; message: string }> {
  const problem = describeConfigProblem();
  if (problem) return { ok: false, message: problem };

  const { url, key } = config();

  try {
    const res = await fetch(`${url}/storage/v1/bucket/${STORAGE_BUCKET}`, {
      headers: { Authorization: `Bearer ${key}`, apikey: key },
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 404) {
      return {
        ok: false,
        message: `バケット「${STORAGE_BUCKET}」が見つかりません。Supabase の Storage で同じ名前のバケットを作ってください。`,
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        message: "キーが受け付けられませんでした。anon キーではなく service_role キーを設定してください。",
      };
    }
    if (!res.ok) {
      return { ok: false, message: `保管先が HTTP ${res.status} を返しました。` };
    }

    const body = (await res.json()) as { name?: string; public?: boolean };
    if (body.public === true) {
      // S-07：公開バケットだと、会員限定物件の画像も直リンクで誰でも見られる。
      return {
        ok: false,
        message: `バケット「${STORAGE_BUCKET}」が「公開」設定です。会員限定物件の画像が直リンクで閲覧できてしまうため、Supabase の Storage で Public を無効（非公開）にしてください。画像は署名付きURLで配信します。`,
      };
    }
    return {
      ok: true,
      message: `バケット「${body.name ?? STORAGE_BUCKET}」（非公開）に接続できました。`,
    };
  } catch (error) {
    return { ok: false, message: `接続できませんでした（${describeError(error)}）` };
  }
}
