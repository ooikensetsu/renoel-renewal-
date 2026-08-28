/**
 * S-08：未認証で叩ける公開フォーム（"use server"）の呼び出し回数を絞る。
 *
 * カウンタは RateLimit テーブル（Postgres）で持つ。Vercel はリクエストごとに
 * 別インスタンスで動きうるため、メモリ上の計数は当てにならない。
 * しきい値は src/config/security.ts の RATE_LIMITS。
 */

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";

/**
 * 送信元IP。プロキシ（Vercel）の付ける x-forwarded-for の先頭を使う。
 * 取得できなければ "unknown"（全員が同じ枠に入る＝安全側に倒す）。
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip")?.trim() || "unknown";
}

/** メールアドレス等の個人情報を key に載せないためのハッシュ（S-09）。 */
export function hashForKey(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 32);
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * key を「windowSeconds 秒あたり limit 回」に制限する。
 *
 * 競合したときは「多めに数える」側（＝より厳しい側）に倒れることがあるが、
 * 濫用対策としては許容する。DBが読めないときは通す（フォーム全停止を避ける。
 * D-07 に従いログには残す）。
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = new Date();
  const nextExpiry = new Date(now.getTime() + windowSeconds * 1000);

  try {
    const current = await prisma.rateLimit.findUnique({ where: { key } });

    // 枠が無い／期限切れ → 新しい枠を1回分で開始する
    if (!current || current.expiresAt <= now) {
      await prisma.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, expiresAt: nextExpiry },
        update: { count: 1, expiresAt: nextExpiry },
      });
      return { ok: true };
    }

    if (current.count >= limit) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((current.expiresAt.getTime() - now.getTime()) / 1000)
        ),
      };
    }

    await prisma.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
    return { ok: true };
  } catch (error) {
    console.error("レート制限を計数できませんでした:", error);
    return { ok: true };
  }
}
