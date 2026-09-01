# リリース記録

本番環境へのデプロイや設定変更の内容を記録します。

O-03：次の3つが言えない変更は本番へ出さない。
① 何を変えるか ② 問題が出たらどう気付くか ③ どうやって元に戻すか（所要時間つき）

---

## 2026-08-18 セキュリティ是正（**未リリース**）

**状態：コード修正済み・本番未適用。** 実行者欄が空のうちは本番へ出ていない。

### ① 何を変えるか

1. 認証バックドア（`user@example.com` / `password`）と固定シークレットの削除
2. 管理画面と全サーバーアクションへの認可追加（`requireAdmin` / `requireUser`）
3. 会員限定物件の秘匿をサーバー側へ移動
4. 問い合わせ送信が常に失敗するバグの修正（`updatedInquiry` 未定義）
5. 会員削除を物理削除から論理削除へ（DBスキーマ変更あり）
6. 一括取込に件数確認・控え・トランザクションを追加（DBスキーマ変更あり）
7. メール送信の停止スイッチ追加（DBスキーマ変更あり）
8. 会社情報・金利などの設定値を `src/config/` へ集約

### ①-2 Vercel向けの是正（2026-08-18 追加。Linuxコンテナでの実機検証で判明）

9. **Prismaのエンジンバイナリ問題** — `src/generated` にmacOS用バイナリ(17MB)がコミットされており、
   Linux(Vercel)では実行時に落ちる状態だった。`binaryTargets = ["native", "rhel-openssl-3.0.x"]` を追加し、
   `postinstall: prisma generate` で各環境が自前で生成する形にした。`src/generated` はGit追跡から外した。
10. **ActivityLog / Inquiry のマイグレーション欠落** — schema.prisma に定義はあるのに
    CREATE TABLE がどのマイグレーションにも無かった（過去に `prisma db push` で直接反映され履歴が残らなかったため）。
    新しいDBへ `migrate deploy` してもこの2テーブルだけ作られず、問い合わせ機能と行動履歴が動かない。
    `20260818030000_add_activitylog_and_inquiry` を追加（`IF NOT EXISTS` 付きなので既存DBへ流しても安全）。

### ② 問題が出たらどう気付くか

| 起こりうる問題 | 気付き方 |
|---|---|
| `NEXTAUTH_SECRET` 未設定 | **ビルドが失敗する**（実測済み：`Failed to collect configuration for /admin/inquiries`）。フォールバック値を消したため、未設定なら必ず落ちる。**環境変数を先に設定してからデプロイすること** |
| Prismaエンジンの不一致 | 画面が500になり、ログに `Query engine library for current platform could not be found`。`postinstall` が走っているか確認する |
| Inquiry/ActivityLog が無い | 問い合わせ管理が「取得できませんでした」。ログに `P2021 table does not exist` |
| マイグレーション未適用でDBエラー | 会員管理・物件管理の画面に「取得できませんでした（お問い合わせID: …）」が出る。サーバーログに Prisma のカラム不明エラー |
| 管理者が誰もログインできない | `User.role` が `ADMIN` の行が1件も無いと、全員が `/admin` から弾かれる。**下記の事前準備を必ず行うこと** |
| メールが届かない | `SMTP_HOST` が未設定のままだと ethereal のテスト送信になる（従来から） |

### ③ どうやって元に戻すか

| 手順 | 所要時間 |
|---|---|
| Vercel のダッシュボードから直前のデプロイへ Rollback | 約2分 |
| DBスキーマを戻す（追加した列・テーブルを削除）※下記SQL | 約5分 |
| 合計 | **約10分** |

```sql
-- 戻す場合のみ。追加した列とテーブルを落とす。
-- 論理削除された会員は、戻すと「削除されていない状態」に戻る点に注意。
DROP TABLE IF EXISTS "PropertyImportBackup";
DROP TABLE IF EXISTS "SystemSetting";
DROP INDEX IF EXISTS "User_deletedAt_idx";
ALTER TABLE "User" DROP COLUMN IF EXISTS "deletedAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "deletedBy";
ALTER TABLE "User" DROP COLUMN IF EXISTS "failedLoginCount";
ALTER TABLE "User" DROP COLUMN IF EXISTS "lockedUntil";
```

### リリース前に人間が行う作業（O-04：AIは実行しない）

順番どおりに行うこと。

1. **GitHubリポジトリを private にする**（現在 public。O-08）
2. **`NEXTAUTH_SECRET` を再発行する**（旧値 `fallback-secret-for-demo-only` は公開済み。S-02：削除より先にローテーション）
   `openssl rand -base64 32` で生成し、Vercelの環境変数に設定
3. **Supabaseの接続情報を確認・必要ならローテーション**
4. **マイグレーションを適用**：`pnpm prisma migrate deploy`
5. **管理者アカウントを1件作る**（これを忘れると誰も管理画面に入れない）
   ```sql
   UPDATE "User" SET role = 'ADMIN' WHERE email = '<管理者のメールアドレス>';
   ```
6. Vercelへデプロイ
7. 動作確認：未ログインで `/admin` が signin へ飛ぶこと、管理者でログインして会員一覧が出ること
8. **この表の「実行者」欄に自分の名前と日時を記入する**

| 日付 | 何を変えたか | 実行者 |
| :--- | :--- | :--- |
| 2026-08-19 09:40頃 | セキュリティ是正（8/18分）とResend移行を**同時に**本番へ反映。`29a6b13` | Claude（大野の指示・D-14の変更後） |


---

## 2026-08-19 メール送信を Resend へ移行（**未リリース**）

**状態：コード修正済み・本番未適用。** 実行者欄が空のうちは本番へ出ていない。
前項（2026-08-18 セキュリティ是正）も未リリースのため、**この2件はまとめて出ることになる**。

### ① 何を変えるか

1. 送信基盤を SMTP(nodemailer) から **Resend の REST API** へ変更（`src/lib/mail.ts`）。新規依存の追加は0
2. 未設定時に ethereal のテスト送信へ落ちる経路を撤去（「送ったつもり」で終わらないようにした）
3. 管理者宛の通知メールを追加（問い合わせ着信・新規入会）。`MAIL_ADMIN_ADDRESS` が未設定なら送らない
4. 送信結果を `MailLog` テーブルへ記録し、管理画面 `/admin/mail-logs` から確認できるようにした（DBスキーマ変更あり）

### ② 問題が出たらどう気付くか

| 起こりうる問題 | 気付き方 |
|---|---|
| `RESEND_API_KEY` の設定漏れ | `/admin/mail-logs` に「失敗」＋理由「RESEND_API_KEY が未設定です」が並ぶ |
| 送信ドメインが未認証 | 同画面に「失敗」＋ `HTTP 403` 系の理由（Resend が from を拒否する） |
| `MailLog` テーブルが無い | 送信自体は成功するが、サーバーログに `P2021 table does not exist`。画面は「取得できませんでした」 |
| 管理者へ通知が来ない | 同画面に「未送信」＋理由「MAIL_ADMIN_ADDRESS が未設定です」 |
| Resend の障害・遅延 | 同画面に「失敗」＋「Resend への接続が 10 秒で応答しませんでした」。10秒でタイムアウトするため画面は固まらない |

**この4件はいずれも `/admin/mail-logs` を見れば分かる。**
以前は `console.error` に出るだけで、運用側から気付く手段が無かった。

### ③ どうやって元に戻すか

| 手順 | 所要時間 |
|---|---|
| Vercel のダッシュボードから直前のデプロイへ Rollback | 約2分 |
| `DROP TABLE IF EXISTS "MailLog";`（残しておいても害はない） | 約2分 |
| 合計 | **約5分** |

戻した場合、メール送信は旧SMTP方式に戻る。`SMTP_*` がプレースホルダのままなら
**自動返信はまた届かなくなる**点に注意。

### リリース前に人間が行う作業（O-04：AIは実行しない）

前項「2026-08-18 セキュリティ是正」の作業に加えて、以下を行うこと。

1. **Resend のアカウントを作り、APIキーを発行する**（`re_` で始まる）
2. **送信ドメインを認証する**（Resend の Domains で対象ドメインを追加し、表示された
   SPF / DKIM の DNS レコードを登録する）。**ここが済むまで、お客様宛には届かない**
   - 認証前の動作確認をする場合は `MAIL_FROM_ADDRESS=onboarding@resend.dev` にすると、
     Resend アカウントの登録アドレス宛にだけ送れる
3. **Vercel に環境変数を設定する**：`RESEND_API_KEY` / `MAIL_FROM_ADDRESS` / `MAIL_ADMIN_ADDRESS`
   - あわせて `NEXT_PUBLIC_SITE_ORIGIN` も確認する。**未設定だとメール本文のリンクが
     `http://localhost:3000/mypage` になり、受信者が開けない**（検証中に実際に再現した）
4. **マイグレーションを適用**：`pnpm prisma migrate deploy`（`MailLog` テーブルが作られる）
5. デプロイ後、会員登録を1件試し、`/admin/mail-logs` が「送信済」になることを確認する
6. **この表の「実行者」欄に自分の名前と日時を記入する**

| 日付 | 何を変えたか | 実行者 |
| :--- | :--- | :--- |
| 2026-08-19 09:40頃 | セキュリティ是正（8/18分）とResend移行を**同時に**本番へ反映。`29a6b13` | Claude（大野の指示・D-14の変更後） |


---

## 補足：検証段階（ドメイン未認証）で動かすときの設定

2026-08-19 時点の方針。**Vercel で動かすが、送信ドメインの認証は行わない。**

### この状態で何が起きるか

| 相手 | 届くか | MailLog の記録 |
|---|---|---|
| 管理者（`MAIL_ADMIN_ADDRESS` = Resendアカウントの登録アドレス） | **届く** | `SENT` |
| お客様（それ以外のすべての宛先） | **届かない** | `FAILED / HTTP 403: You can only send testing emails to your own email address…` |

**お客様には自動返信が1通も届かない。**これは仕様どおりの状態であり、故障ではない。
Resend はドメイン未認証の間、アカウント登録アドレス以外への送信を拒否する。

### そのために入れた対応

会員登録の完了画面とお問い合わせの完了画面は、**実際の送信結果を見て文言を変える**
（`registerUser` / `submitInquiry` が `mailSent` を返す）。

- 送れた場合：「控えのメールを送信しました」
- 送れなかった場合：「受け付けております。ただいまシステムの都合により控えのメールをお送りできておりません。
  重ねてご送信いただく必要はございません」＋電話番号を案内

D-03。届いていないのに「送信しました」と出すと、利用者は届かないメールを待ち、
同じ内容を再送信する（過去に重複問い合わせが発生した経緯がある）。

### Vercel に設定する環境変数（検証段階）

| キー | 値 |
|---|---|
| `DATABASE_URL` / `DIRECT_URL` | Supabase の接続文字列（`.env.migrate` と同じもの） |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` で生成した新しい値 |
| `NEXTAUTH_URL` | Vercel が払い出したURL |
| `NEXT_PUBLIC_SITE_ORIGIN` | 同上。**未設定だとメール本文のリンクが localhost になる** |
| `RESEND_API_KEY` | Resend のAPIキー |
| `MAIL_FROM_ADDRESS` | `onboarding@resend.dev`（ドメイン認証までの暫定） |
| `MAIL_ADMIN_ADDRESS` | **Resendアカウントの登録アドレス**。それ以外にすると管理者通知も届かない |

### 検証段階を抜けるときにやること

1. Resend の Domains で `ooi-kensetsu.co.jp` を追加し、指示されたレコードを **Route 53** に登録
   （ネームサーバーは AWS。既存のMX・SPFはMicrosoft 365とmaildeliver.jpで運用中のため触らない。
   Resendはサブドメイン方式なので競合しない）
2. `MAIL_FROM_ADDRESS` を `noreply@ooi-kensetsu.co.jp` などに変更
3. 会員登録を1件試し、`/admin/mail-logs` が `SENT` になることを確認

**コードの変更は不要。**環境変数の差し替えだけで切り替わる。


---

## 2026-08-19 デプロイが Vercel にブロックされた件と対処

### 何が起きたか

`d42c96b` を push したがデプロイされず、`/admin/mail-logs` が 404 のままだった。
Vercel の Deployment Details に次の表示。

```
Deployment Blocked
The deployment was blocked because the commit author did not have
contributing access to the project on Vercel.
The Hobby Plan does not support collaboration for private repositories.
```

### 原因

**リポジトリを private にしたこと。**Vercel の Hobby プランは、private リポジトリの場合
プロジェクト所有者本人のコミットでないとデプロイを起動しない。
8/18 の時点では repo が public だったためこの判定が働かず、`8e9c6fd` はデプロイできていた。
全4コミットの作者が `awnoono <oono@awn.jp>` で、Vercel 側の所有者と一致していなかった。

private 化自体は 8/18 の検品（O-08）で指摘した正しい対処。その副作用として表面化した。

### 対処

コミット作者のメールアドレスを `oono.web.pd@gmail.com` に統一した（Vercel / GitHub 側も同アドレスへ）。
git の設定は**このリポジトリのみ**変更しており、グローバル設定（`oono@awn.jp`）は触っていない。

```
git config user.email "oono.web.pd@gmail.com"   # --global は付けない
```

既に push 済みのコミットは作り直していない（`git push --force` は D-15 の禁止コマンド）。
新しい作者名義のコミットを1つ積むことで、Vercel が評価する先端コミットを差し替える。

### 残っている論点：Hobby プランの商用利用

Vercel の Hobby プランは**非商用利用に限る**規約であり、本件は商用サイトである。
private 化とは無関係に、**本番公開の前に Pro（$20/月）へ切り替える必要がある**。
今回の停止はたまたま private 化で表面化しただけで、いずれ整理が必要だった。

→ docs/debt.md に起票。


---

## 2026-08-19 デプロイ実施の記録

**`29a6b13` を Production へ反映。** push から約90秒で公開。
8/18 のセキュリティ是正と 8/19 の Resend 移行が、この1回で同時に本番へ出た。

DBマイグレーションは事前に適用済み（大野が `migrate-supabase.sh` を実行）。
このデプロイでスキーマは変更していない。

### 反映後に確認したこと

| 項目 | 結果 |
|---|---|
| 未ログインでの `/admin` `/admin/mail-logs` `/admin/users` `/admin/properties` `/admin/inquiries` | 全て 307 → `/api/auth/signin` |
| 未ログインでの `/mypage` `/mypage/edit` | 307 → `/api/auth/signin` |
| 公開ページ `/` `/properties` | 200 |

### 確認できていないこと（**合格と書かないこと**）

| 項目 | 理由 |
|---|---|
| **会員限定物件の秘匿（S-07 / C-03）** | DBに物件が0件のため、HTMLに価格・所在地が無いことは何も証明していない。**物件を登録してから再確認が必要** |
| **サーバーアクションへの未認証POST** | アクションIDはビルドごとに変わり、手元のIDは本番で `Server action not found` になる。本番のIDを配信JSから取り出して再検証すること。同一コードでのローカル検証では認可が効いている |
| **メール送信の実挙動** | 管理画面へのログインが必要なため未確認 |
| **管理者がログインできること** | 未確認。`User.role='ADMIN'` は1件あるが、そのアカウントのパスワードで実際に入れるかは試していない |

### 次にやること

1. 管理者アカウントでログインし、`/admin/mail-logs` が表示されることを確認
2. 物件を1件登録し、未ログインで価格・所在地が漏れないことを確認
3. 会員登録を1件試し、MailLog が記録されることを確認
4. **Vercel を Pro へ**（Hobbyは非商用限定。docs/debt.md 起票済み）
5. **Resend の送信ドメイン認証**（済むまでお客様へは1通も届かない）

---

## 2026-08-21 ログイン後の戻り先を修正（`2622d9c`）

**症状**：`/admin` を開いてログインしても、管理画面ではなくトップページに戻る。
ログイン後に自分でURLへ `admin` と打ち直せば入れる、という状態だった。

**原因**：未ログイン時に**戻り先を渡さずに** `/api/auth/signin` へ送っていた。
NextAuth は `?callbackUrl=` が無いとログイン後にサイトのトップへ戻す
（`next-auth/core/lib/callback-url.js` の `let callbackUrl = url.origin`）。
`/mypage`・`/mypage/edit`・会員限定物件の問い合わせ画面も同じ書き方だった。

**変更**（ログイン後の行き先のみ。権限判定・DBスキーマには触れていない）

| 追加・変更 | 内容 |
|---|---|
| `src/lib/authPaths.ts`（新規） | `signInPath()` と `AFTER_LOGIN_PATH`。ログイン画面のURL組み立てはここだけ（D-09） |
| `src/app/after-login/page.tsx`（新規） | ログイン直後の中継。管理者→`/admin`、会員→`/mypage` に振り分けるだけで画面は出さない |
| `(admin)/layout.tsx` ほか4画面 | 自分自身を戻り先に指定 |
| `(home)/page.tsx` | 「ログイン」「会員ログイン」を `/after-login` 経由に |

**ローカルでの確認**（Docker の dev DB ＋ `pnpm dev`。画面を実際に操作した）

| 操作 | 結果 |
|---|---|
| 未ログインで `/admin` → 管理者でログイン | `/admin` の管理者ダッシュボードが表示された |
| トップの「ログイン」→ 管理者でログイン | `/admin` に着いた |
| トップの「ログイン」→ 一般会員でログイン | `/mypage` に着いた |
| 一般会員のまま `/admin` を開く | トップへ弾かれる（従来どおり。権限の穴は開けていない） |
| ログアウト後に `/mypage` | `…/signin?callbackUrl=%2Fmypage` へ |

**機械ゲート**：`tsc --noEmit` エラー0／`eslint .` エラー0（警告18は既存）／`node --test` 49件全通過。

**本番で確認したこと**（デプロイ後、実URLへのリクエストで確認）

| パス | 応答 |
|---|---|
| `/admin` | 307 → `…/signin?callbackUrl=%2Fadmin` |
| `/admin/properties` | 307 → `…/signin?callbackUrl=%2Fadmin` |
| `/mypage` | 307 → `…/signin?callbackUrl=%2Fmypage` |
| `/mypage/edit` | 307 → `…/signin?callbackUrl=%2Fmypage%2Fedit` |
| `/after-login` | 307 → `…/signin?callbackUrl=%2Fafter-login` |
| トップのログイン導線 | `href="/api/auth/signin?callbackUrl=%2Fafter-login"` |

**本番で確認していないこと（合格と書かない）**
本番の管理者アカウントで実際にログインし `/admin` に着地するところまでは未確認。
本番のパスワードはAIが扱わないため、大野が1回ログインして確かめること。

**この修正では直らないこと**
未ログインで `/admin/properties/5` のような深いURLを開いた場合、ログイン後は `/admin` に着く。
レイアウトからは元のパスが取れないため（直すならミドルウェアの追加が必要＝別件）。

**戻し方**：`git revert 2622d9c` して push。DBの変更が無いので戻しは1手で済む。

---

## 2026-08-24 管理画面の検品と修正（`fba91c7`）

**変更レベル L3。**着手前に3点を提示し大野の承認を得た（D-02）。詳細は `docs/作業ログ_2026-08-24.md`。

### ① 何を変えるか

1. **管理画面の寸法** — `src/app/(admin)/admin.css` を新設し、根要素 `.admin-root` にだけ
   px で書き直した Tailwind のトークンを載せる。`html { font-size: 62.5% }` の下で
   Tailwind の寸法が 62.5% に縮んでいた（`text-sm`→8.75px／`w-64`→160px／`h-16`→40px）。
   ヘッダーは `h-16` → `min-h-16` に変更（40px のヘッダーに 45.49px が入り上端が切れていた）
2. **会員データの列制限** — `getUsers` / `getUserById` / `updateUserStatus` が `select` 未指定で、
   会員全員の `password`（bcryptハッシュ）等をブラウザへ返していた。`USER_FIELDS` で明示（S-01）
3. **ダッシュボード** — 全数値・一覧が架空だったため `src/app/actions/dashboard.ts` を新設し実測値へ
4. **物件一覧のサムネイル** — 全件に Unsplash の同じ写真を出していたのを実画像／「画像なし」へ
5. **公開サイトへの影響がある唯一の変更** — `globals.css` のフォーム指定に
   `:not(.admin-root …)` を付与（詳細度で Tailwind を打ち消していたため）
6. 押しても何も起きない／404 の UI 7か所を実装または撤去。配色を RENOEL パレットへ統一

**DBのスキーマ変更なし**（`prisma migrate deploy` 不要）。**環境変数の追加なし。**

### ② 問題が出たらどう気付くか

| 見る場所 | 正常な状態 |
|---|---|
| `/admin` | 数値が本番の実数と一致する。右上のログインIDが切れていない |
| `/admin/users` | 一覧が表示される（`select` で列を絞ったため、壊れるならこの変更が原因） |
| `/properties`・`/property/[id]/contact` | 公開サイトのフォーム・検索欄が従来どおり |

### ③ どうやって元に戻すか

`git revert fba91c7` して push（Vercelの自動ビルドで約2分）。
Vercel のダッシュボードから前のデプロイへ即時ロールバックも可。
**DBに触っていないのでデータ側の後始末は不要。**

### 機械ゲート

`tsc --noEmit` エラー0／`eslint .` エラー0（警告17は全て今回触っていないファイルの既存分・**新規0**）／
`node --test` 49件全通過／`next build` 成功。

### 開発環境で確認したこと

Chrome で全画面を操作。ヘッダー 65px・IDブロック上端 y=14（切れなし）・サイドバー 256px・
サイドバー文字 14px・本文余白 40px を計算済みスタイルで実測。
一覧の検索が効くこと（「軽井沢」で 1件/全4件）、お問い合わせの対応済み切り替えで完了日時が入ることを確認。
公開サイトの素の `input[type=text]` が従来どおり 游明朝/15px/余白10px 14px/角0/#C7C7C7 で
描画されることを実測し、`globals.css` の変更が公開サイトへ影響していないことを確認。

### 本番で確認したこと（デプロイ後、実URLへのリクエストで確認）

| 対象 | 結果 |
|---|---|
| GitHub の deployment status（`fba91c7`） | `used-housing-site-m2yk` / `used-housing-site` とも **success** |
| 配信されている `globals` のCSS | `select:not(.admin-root select),…` を含む＝新コードが出ている |
| `/` `/properties` `/property/1` `/simulation` `/member` `/information` | いずれも 200 |
| `/admin` | 307 → `…/signin?callbackUrl=%2Fadmin` |
| `/mypage` | 307 → `…/signin?callbackUrl=%2Fmypage` |

### 本番で確認していないこと（合格と書かない）

**本番の管理者アカウントでログインした状態の管理画面は未確認。**
本番のパスワードはAIが扱わないため、大野が1回ログインして次を確かめること。

- 右上のログインIDが切れていないか
- ダッシュボードの数値が実際の会員数・物件数と合っているか
- 「対応が必要なこと」に出る未対応件数・送信失敗メール件数が実態と合っているか
- 会員一覧・物件一覧が表示され、検索と絞り込みが効くか

**本番DBには実会員のデータが入っているため、ダッシュボードに実在の会員の氏名とメールが
表示されるようになった**（管理者のみ閲覧可）。本番で初めて実データが載る画面である。

---

## 2026-08-28 セキュリティ検品の是正 第2弾（**リリース済み**）

| 日付 | 何を変えたか | 実行者 |
|---|---|---|
| 2026-08-28 | コミット `d55c33a` を main へ。Vercel 本番デプロイ（`used-housing-site` / `used-housing-site-m2yk` とも success）。`prisma migrate deploy` で `RateLimit` テーブル追加。 | Claude（大野の指示） |

**本番デプロイ後の確認（2026-08-28・実URLへのリクエスト）**

| 対象 | 結果 |
|---|---|
| GitHub deployment status（`d55c33a`） | 両 Vercel プロジェクトとも **success** |
| `/` `/properties` `/property/1` `/property/1/contact` | いずれも 200 |
| レスポンスヘッダ（`/`） | `x-frame-options: DENY` / `content-security-policy: frame-ancestors 'none'…` / `strict-transport-security` / `x-content-type-options: nosniff` / `referrer-policy` / `permissions-policy` すべて付与を確認 |
| `/admin` `/mypage` `/mypage/edit` | いずれも 307 → `/api/auth/signin?callbackUrl=…` |
| `/properties` の HTML 内の画像URL | すべて `…/object/sign/property-images/…?token=…`（署名付き）。`…/object/public/…` は 0 件 |
| `prisma migrate deploy` | `20260828152145_add_rate_limit` 適用済み |

**まだ残っている手動作業（人間）**

- **Supabase の Storage バケット `property-images` を Public 無効（非公開）にする。**
  2026-08-28 時点で公開のままのため、`https://lcurjpuscalweqhudusw.supabase.co/storage/v1/object/public/property-images/<番号>/001.jpg`
  へ直アクセスすると 200 で画像が返る（＝会員限定物件の写真がまだ露出している）。
  アプリはもう公開URLを出していないので、非公開にしても表示は壊れない（署名付きURLで配信）。
  非公開化後、上記の直アクセスが 400 になることを確認すること。
- **`.env.migrate` の削除とDBパスワードのローテーション。** 本番接続文字列が平文で残置している。
- 変更レベル **L3**（認証・個人情報の取り扱いに触れる）。指摘元は 2026-08-28 の脆弱性検品。

### ① 何を変えるか

| # | 変更 | 利用者から見た変化 | スキーマ変更 |
|---|---|---|---|
| 1 | 公開フォーム（問い合わせ・会員登録）にレート制限を追加（`RateLimit` テーブル／`src/lib/rateLimit.ts`／しきい値は `src/config/security.ts`） | 短時間に送信を繰り返すと「しばらくおいてから」の案内が出る。通常利用では出ない | **あり**（`RateLimit` テーブル追加。追加のみ） |
| 2 | 会員限定物件の画像を「公開URL」から「都度発行の署名付きURL（1時間）」配信へ。`PropertyImage.path` は Storage 上のパスを保存する形に変更（過去の公開URL形式の行もそのまま解釈可） | 会員限定物件の写真が、URL 推測だけで未ログインに見えることが無くなる。表示は従来どおり | なし（`path` の中身の意味が変わるだけ。移行不要） |
| 3 | 全ルートにセキュリティヘッダ（`X-Frame-Options: DENY` ほか）／CSP は `frame-ancestors 'none'` のみ | 管理画面・ログイン画面を iframe に嵌める攻撃を防ぐ。通常の見た目は不変 | なし |
| 4 | ログインのタイミング差でメール登録有無を推測されないよう、未登録でも1回ハッシュ照合する | なし（内部挙動） | なし |
| 5 | 会員登録で「退会済み」か「登録済み」かを画面で区別しない文言に統一 | 既存アドレスでの登録時のメッセージが変わる（退会済みである事実を出さない） | なし |
| 6 | `updateUserStatus` / `updateInquiryStatus` / CSV取込の公開レベルに、想定外の値を弾く検証を追加 | なし（管理者操作の堅牢化） | なし |
| 7 | `/mypage` を他画面と同じ `requireUser()` 判定に統一（停止・退会済みは弾く） | 停止された会員はマイページに入れなくなる | なし |
| 8 | パスワードハッシュのコスト係数 10 → 12。差出人が example ドメインのまま本番だと送信を失敗として記録 | なし（新規登録のパスワード保存が少し強くなる。既存ハッシュはそのまま有効） | なし |

**デプロイと別に、人間が Supabase で1手** — Storage のバケットを **Public 無効（非公開）** にする。
コードのデプロイが先でも後でもよい（署名付きURLは公開バケットでも動く）。非公開化した時点で
直リンクが 400 になり、会員限定物件の画像が守られる。管理画面 `/admin/properties/（任意の物件）`
の「保管先の接続確認」が、公開設定のままだと警告を出すようになっている。

### ② 問題が出たらどう気付くか

| 起こりうる問題 | 気付き方 |
|---|---|
| `RateLimit` マイグレーション未適用 | フォームは動く（`checkRateLimit` は読めなければ通す）。サーバーログに `P2021` / `relation "RateLimit" does not exist`。レート制限が効かないだけ |
| 署名に失敗（Storage 設定不備・障害） | 物件の画像が出ない（壊れた画像ではなく非表示）。サーバーログに「画像URLの署名に失敗しました（HTTP …）」 |
| バケットを非公開にしたのにコードが旧版 | 全物件の画像が出なくなる。ログに署名エラー。→ 先にコードをデプロイする |
| ヘッダが強すぎて表示が崩れる | 目視。CSP は `frame-ancestors` のみなので通常は崩れない。崩れたら `next.config.ts` の `SECURITY_HEADERS` を1つずつ外す |
| 正規の利用者がレート制限に当たる | 「しばらくおいてから」の問い合わせが増える。`src/config/security.ts` の `RATE_LIMITS` を緩める（デプロイ要） |

### ③ どうやって元に戻すか

| 手順 | 所要時間 |
|---|---|
| Vercel のダッシュボードから直前のデプロイへ Rollback | 約2分 |
| `RateLimit` テーブルを戻す（任意。残っていても無害） | `DROP TABLE IF EXISTS "RateLimit";` / 即時 |
| Supabase バケットを公開に戻す（旧コードへ完全に戻す場合のみ） | ダッシュボードで Public 有効／即時 |

`PropertyImage.path` は移行していない（新規行のみ Storage パス形式で保存。旧形式の行も
`toStoragePath()` がそのまま解釈する）ため、**データ側の後始末は不要**。

### 機械ゲート（2026-08-28 実行）

```
$ pnpm gate
$ tsc --noEmit
（エラー0）
$ eslint .
✖ 16 problems (0 errors, 16 warnings)   ← 全て既存の <img>/未使用importの警告。新規0
$ node --test
# tests 52
# pass 52
# fail 0
```

### 未確認・未対応で残した点

- **本番での実挙動は未確認**（バケット非公開化・署名付きURL表示・レート制限の発火）。デプロイ後に大野が確認。
- **指摘C（同意なしの計測タグ 6種）は未対応**。GA4/UA/Google Ads/Yahoo/Clarity/Meta Pixel が
  Cookie 同意と連動していない（`src/app/(public)/layout.tsx`）。計測IDの帰属確認が必要なため
  今回は記録のみ（`docs/debt.md`）。
- **会員登録の完全な非開示は未対応**。今回は「退会済み」の開示だけ塞いだ。既存アドレスか否かは
  なお推測可能。完全にはメール確認フローが必要（`docs/debt.md`）。
- `getProperties`（管理物件一覧）の戻り値に、まだ生の Storage パス配列（`images`）が含まれる。
  管理者専用・パスのみで機微でないため今回は据え置き。

---

## 2026-09-01 CSV一括取込の失敗を修正（**リリース済み**）

| 日付 | 何を変えたか | 実行者 |
|---|---|---|
| 2026-09-01 | コミット `14a3ddd` を main へ。Vercel 本番デプロイ（`used-housing-site` / `used-housing-site-m2yk` とも READY）。DBスキーマの変更なし（`prisma migrate deploy` は不要） | Claude（大野の指示） |

**何が変わったか（利用者から見て）**

90件規模のCSV一括取込が「取込に失敗しました（お問い合わせID: …）」で必ず失敗していたのが、
通るようになった。取込前の差分照合も約23秒から1秒未満に短縮した。画面の見た目は変わらない。

**原因**

1件ずつ `upsert` を投げており、DBとの往復が件数分だけ積み上がっていた。
本番はアプリの関数が iad1（米バージニア）、DBが東京にあり1往復に約0.15秒かかるため、
90件では Prisma の対話型トランザクションの既定上限5秒を超え、P2028 で1件も書き込めずに終わっていた。
数件の取込では上限内に収まるため、件数が増えて初めて表面化した。

**本番デプロイ後の確認（2026-09-01・実URLへのリクエスト）**

| 対象 | 結果 |
|---|---|
| Vercel デプロイ（`14a3ddd`） | 両プロジェクトとも **READY** |
| `/` `/properties` `/property/1`（m2yk） | いずれも 200 |
| `/admin` `/mypage`（m2yk） | いずれも 307 → ログインへ |

**未実施**

本番での90件取込そのものは未実行。次回の取込で結果を確認すること。

**問題が出たときの気付き方と戻し方**

取込画面で「取込に失敗しました」が再び出るか、件数が想定と合わない場合。
戻すときは Vercel で1つ前のデプロイへ Rollback（即時）。DBスキーマは変えていないため戻すSQLは不要。
取込を実行してしまった後で内容を戻す場合は `PropertyImportBackup` の該当行（上書き前の控え）を使う。
