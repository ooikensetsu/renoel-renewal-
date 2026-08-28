import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getServerSession } from "next-auth/next";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import {
  ROLE,
  USER_STATUS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  LOGIN_LOCK_MINUTES,
  SESSION_MAX_AGE_SECONDS,
  BCRYPT_ROUNDS,
} from "@/config/security";

/**
 * S-12：メールアドレスの登録有無を「応答時間の差」で推測されないための当て馬。
 * ユーザーが見つからない場合も、これと1回 bcrypt.compare して所要時間を揃える。
 * 起動時に1回だけ生成する（コスト計算は cold start に1回のみ）。
 */
const TIMING_SAFE_DUMMY_HASH = bcrypt.hashSync("timing-safe-placeholder", BCRYPT_ROUNDS);

/**
 * S-01：シークレットにフォールバック値を置かない。
 * 以前は `process.env.NEXTAUTH_SECRET || "fallback-secret-for-demo-only"` となっており、
 * その固定値が public リポジトリに公開されていた（=誰でもセッションを偽造できる）。
 * 未設定なら起動を失敗させる。黙って弱い鍵で動くほうが危険。
 */
const secret = process.env.NEXTAUTH_SECRET;
if (!secret) {
  throw new Error(
    "NEXTAUTH_SECRET が設定されていません。.env（本番はホスティングの環境変数）に設定してください。"
  );
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    // S-12：セッションに有効期限を設ける
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        // 退会済み・停止中・パスワード未設定は認証対象にしない。
        const activeUser =
          user &&
          user.password &&
          user.deletedAt === null &&
          user.status === USER_STATUS.ACTIVE
            ? user
            : null;

        // S-12：メール未登録でも必ず1回ハッシュ照合し、応答時間を揃える
        // （タイミング差でアカウントの存在を推測させない）。
        const isValid = await bcrypt.compare(
          credentials.password,
          activeUser?.password ?? TIMING_SAFE_DUMMY_HASH
        );

        // どの理由で失敗したかは呼び出し元に伝えない（存在を推測させないため）。
        if (!activeUser) {
          return null;
        }

        // S-12：ロック中は照合結果に関わらず拒否する
        if (activeUser.lockedUntil && activeUser.lockedUntil > new Date()) {
          return null;
        }

        if (!isValid) {
          // S-12：失敗回数を数え、上限に達したら一定時間ロックする
          const failedCount = activeUser.failedLoginCount + 1;
          const shouldLock = failedCount >= MAX_FAILED_LOGIN_ATTEMPTS;
          await prisma.user.update({
            where: { id: activeUser.id },
            data: {
              failedLoginCount: shouldLock ? 0 : failedCount,
              lockedUntil: shouldLock
                ? new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000)
                : activeUser.lockedUntil,
            },
          });
          return null;
        }

        // 成功したらカウンタを戻す
        if (activeUser.failedLoginCount !== 0 || activeUser.lockedUntil !== null) {
          await prisma.user.update({
            where: { id: activeUser.id },
            data: { failedLoginCount: 0, lockedUntil: null },
          });
        }

        return {
          id: activeUser.id.toString(),
          name: activeUser.name,
          email: activeUser.email,
          role: activeUser.role,
        };
      },
    }),
  ],
  events: {
    async signIn(message) {
      try {
        const userId = parseInt(message.user.id);
        if (!isNaN(userId) && userId > 0) {
          await prisma.activityLog.create({
            data: {
              userId,
              action: "LOGIN",
              // S-09：ログインした事実だけ。個人情報は入れない
              details: "ログインしました",
            },
          });
        }
      } catch (e) {
        console.error("Failed to log activity:", e);
      }
    },
  },
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? ROLE.USER;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        (session.user as SessionUser).id = token.id as string;
        (session.user as SessionUser).role = (token.role as string) ?? ROLE.USER;
      }
      return session;
    },
  },
  secret,
};

export type SessionUser = {
  id: string;
  role: string;
  name?: string | null;
  email?: string | null;
};

/** 認可の判定結果。呼び出し元は必ず ok を見てから処理する。 */
export type AuthResult =
  | { ok: true; userId: number; role: string; email: string }
  | { ok: false; reason: "UNAUTHENTICATED" | "FORBIDDEN" };

/**
 * S-07：ログイン済みであることをサーバー側で確認する。
 * セッションのIDを信用しきらず、DBの現在の状態（退会・停止）も見る。
 */
export async function requireUser(): Promise<AuthResult> {
  const session = await getServerSession(authOptions);
  const rawId = (session?.user as SessionUser | undefined)?.id;
  if (!rawId) {
    return { ok: false, reason: "UNAUTHENTICATED" };
  }

  const userId = parseInt(rawId);
  if (isNaN(userId) || userId <= 0) {
    return { ok: false, reason: "UNAUTHENTICATED" };
  }

  // 権限やアカウント状態はセッション発行後に変わりうるので、毎回DBで確認する。
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, email: true, status: true, deletedAt: true },
  });

  if (!user || user.deletedAt !== null || user.status !== USER_STATUS.ACTIVE) {
    return { ok: false, reason: "UNAUTHENTICATED" };
  }

  return { ok: true, userId: user.id, role: user.role, email: user.email };
}

/**
 * S-07：管理者であることをサーバー側で確認する。
 * 画面にメニューを出さないことは権限制御ではない。データを返す側で毎回これを呼ぶ。
 */
export async function requireAdmin(): Promise<AuthResult> {
  const result = await requireUser();
  if (!result.ok) {
    return result;
  }
  if (result.role !== ROLE.ADMIN) {
    return { ok: false, reason: "FORBIDDEN" };
  }
  return result;
}

/** 画面に出してよい、当たり障りのないメッセージ（D-07：内部情報を見せない）。 */
export function authErrorMessage(reason: "UNAUTHENTICATED" | "FORBIDDEN"): string {
  return reason === "UNAUTHENTICATED"
    ? "ログインが必要です。"
    : "この操作を行う権限がありません。";
}

