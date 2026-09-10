# 設計書：サブスク管理アプリ

- 作成日：2026-08-01
- ステータス：**作成中**（要件定義書 v1.1 をもとに、実装着手レベルまで具体化する）
- 位置づけ：本書が正式な設計書。`design-notes.md` は検討過程の記録として残す
- 関連文書：`requirements.md`（要件定義書）

---

## 1. 技術構成

| 領域 | 選定 |
|---|---|
| フロント／サーバー | Next.js（App Router）＋ TypeScript |
| ホスティング | Vercel（Hobby） |
| DB | Supabase Postgres（無料枠） |
| メール送信 | Resend |
| 定期実行 | Vercel Cron |
| グラフ描画 | Recharts |
| 認証 | Supabase Auth（メール＋パスワード） |
| PWA | manifest.json のみ |

運用コストは月額0円で成立する構成。

---

## 2. 外部サービスの制約

- Vercel Hobby の Cron は**1日1回まで／UTCのみ／指定時刻から1時間以内のズレが許容**。失敗しても再実行されない。
  → 通知は日次バッチ1回（`0 23 * * *` UTC = JST 翌8:00頃）。時刻でなく日付単位のロジックにする。
- Resend 無料枠は 100通/日。該当分は1通に集約するため問題にならない。
- Supabase 無料プロジェクトは**7日間アクセスがないと自動停止**する。日次バッチがキープアライブを兼ねる。
- Supabase内蔵メールは無料枠2通/時のため、**ResendをカスタムSMTPとして設定**する（Auth → Email Settings）。
- タイムゾーンは JST固定。DBは `date` 型。「JSTの今日」を返す処理は1箇所に閉じ込め、ここだけテストを書く。
- App Store／Google Play のサブスクは「更新の24時間以上前」に解約が必要（Apple公式）。前日通知だけでは間に合わない可能性があるため、3日前を安全マージンとして併用する。

---

## 3. 認証と権限

| 論点 | 決定 |
|---|---|
| ログイン方式 | メールアドレス＋パスワード（Supabase Auth標準） |
| 新規登録 | Supabase Authの標準サインアップ機能をそのまま使う（`/auth/signup`）。自作の検証ロジックは持たない |
| パスワード再設定 | Supabase組み込みフロー。自作しない |
| メール確認 | 自分専用のうちはオフでよい。一般公開時にオンへ |
| パスワード強度 | Supabaseの最小文字数・漏洩パスワード検出を有効化 |
| DBアクセス | 画面からの操作はNext.jsのサーバー側（Server Actions）経由のみ |
| RLS | 全テーブルで有効化し、デフォルト拒否。ポリシーは `auth.uid() = user_id` |
| バッチの権限 | Vercel Cronは `service_role` キーで実行しRLSをバイパス |
| 通知先メール | 既定は `auth.users.email`。上書きは `settings.notify_email` |

**絶対に守ること**

- `service_role` キーに `NEXT_PUBLIC_` を付けない
- RLSは「サーバー経由だから不要」ではなく、多層防御として必ず有効化する

---

## 4. データモデル

### subscriptions

| カラム | 型 | 備考 |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | `auth.users.id` 参照。RLSの判定キー |
| service_name | text | 必須 |
| amount | int | 円。整数で保持 |
| cycle | enum | `monthly` / `yearly` / `weekly` / `custom_days` |
| cycle_days | int | `custom_days` のときのみ使用 |
| next_billing_date | date | 必須。通知と並び順の基準。バッチが自動更新 |
| billing_anchor_day | int | 1〜31。月末問題の対策 |
| is_trial | boolean | トライアル中フラグ |
| card_id | uuid | `cards.id` を参照。null許容（未設定可） |
| cancel_url | text | null許容 |
| status | enum | `active` / `cancelled` |
| memo | text | null許容 |
| created_at / updated_at | timestamptz | |

### cards

| カラム | 型 | 備考 |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | `auth.users.id` 参照。RLSの判定キー |
| name | text | カード名（例：楽天カード） |
| created_at | timestamptz | |

`(user_id, name)` にユニーク制約。同名カードの重複作成を構造的に防ぎ、表記揺れを防止する。

カードの作成・リネーム・削除は設定画面のカード管理UIから行う（登録フォーム上では既存カードから選ぶのみ）。カード削除時、参照している`subscriptions.card_id`は`ON DELETE SET NULL`で自動的にnullへ戻す（サブスク自体は削除しない）。

### payment_history

| カラム | 型 | 備考 |
|---|---|---|
| id | uuid | PK |
| subscription_id | uuid | FK |
| billed_on | date | 請求日 |
| amount | int | そのとき請求された額 |
| created_at | timestamptz | |

`(subscription_id, billed_on)` にユニーク制約。繰り越しの重複記録を構造的に防ぐ。

### notification_logs

| カラム | 型 | 備考 |
|---|---|---|
| id | uuid | PK |
| subscription_id | uuid | FK |
| target_date | date | 通知対象の請求日 |
| kind | enum | `d3` / `d1` など |
| sent_at | timestamptz | |

`(subscription_id, target_date, kind)` にユニーク制約。二重送信を構造的に防ぐ。

### settings

| カラム | 型 | 備考 |
|---|---|---|
| user_id | uuid | PK。`auth.users.id` 参照 |
| notify_email | text | 通知先。nullなら `auth.users.email` |
| notify_days | int[] | 何日前に通知するか（初期値 `{3,1}`）。`0`は当日 |
| updated_at | timestamptz | |

### 月額換算のルール

| 周期 | 月額換算 |
|---|---|
| monthly | 金額 |
| yearly | 金額 ÷ 12 |
| weekly | 金額 × 52 ÷ 12 |
| custom_days | 金額 × 365 ÷ 日数 ÷ 12 |

端数は表示時に四捨五入。DBには元の金額と周期のみ保存し、換算値は保存しない。

---

## 5. API設計

**画面からの操作はServer Actionsに統一する。** REST API層は作らない（単一クライアント・個人開発のため、API層の独立価値が薄い）。

Route Handlerは以下2用途のみに限定する。

| 用途 | パス（案） | 理由 |
|---|---|---|
| 日次バッチ | `/api/cron/daily` | Vercel Cronから叩く必要があり、Server Actionsでは呼べない |
| エクスポート | `/api/export/json`, `/api/export/csv` | ブラウザのファイルダウンロードとして扱いたく、Server Actionsのレスポンスより素直 |

### エンドポイントの保護

`/api/cron/daily`はURLを知っていれば誰でも直接叩けてしまう。VercelのCronは環境変数`CRON_SECRET`を設定すると、実行時に`Authorization: Bearer <CRON_SECRET>`ヘッダーを自動で付与する。Route Handler側でこのヘッダーの値を検証し、一致しない場合は401を返す。

```ts
const authHeader = request.headers.get('authorization');
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return new Response('Unauthorized', { status: 401 });
}
```

`/api/export/json`・`/api/export/csv`はCronと異なりブラウザから呼ばれるため、Supabaseのセッション（Cookie）を検証し、未ログイン時は401を返す。CRON_SECRETの検証対象は`/api/cron/daily`のみ。

> Vercel公式ドキュメント上も「Cronの呼び出しは稀に重複しうる（best-effort delivery）」と明記されており、§6で採用した冪等な設計（`notification_logs`のユニーク制約・繰り越しのwhileループ）は、この重複呼び出しに対する備えとしても機能する。

### Server Actions一覧（案）

| Action | 対象機能 |
|---|---|
| `createSubscription` | F-1 |
| `updateSubscription` | F-8 |
| `cancelSubscription` | F-8（statusを`cancelled`に） |
| `deleteSubscription` | F-8 |
| `updateSettings` | 通知先・通知日数の変更 |
| `createCard` | カードの新規作成 |
| `updateCard` | カード名のリネーム |
| `deleteCard` | カードの削除（設定画面のカード管理UIから） |

一覧・グラフ用のデータ取得はServer Component側で直接Supabaseクエリを呼ぶ（Server Actionsは書き込み系のみ）。

---

## 6. 日次バッチ

```
日次実行（JST 8:00頃）:
  1. 繰り越し：status='active' かつ next_billing_date < today のものを
     next_billing_date >= today になるまで周期分ずつ進める
     ├ 進めるたびに payment_history へ1行追加
     └ is_trial = true だった場合は false にする（トライアル終了＝初回請求）
  2. 通知抽出：settings.notify_days の各Nについて、
     next_billing_date − today <= N のものを取得（「ちょうどN日前」ではない）
  3. notification_logs に (subscription_id, target_date, kind=N) が無いものだけ抽出
  4. 1通のメールに集約して送信 → ログに記録
```

### 通知条件を「N日以内」にする理由

Vercel Cronは実行が失敗しても再実行されない。条件を「残り日数がちょうどN日」にすると、その日にバッチが落ちただけでその通知は永久に飛ばない。

そこで「残りN日以内で、まだ未送信のもの」を条件にする。翌日のバッチが自動的に追いつく。

- `notification_logs` のユニーク制約により、追いつき送信でも二重送信は起きない
- 請求日を過ぎた分は繰り越しで `target_date` が変わるため、手遅れの通知が今さら届くことはない

### 繰り越しの実装要件（事故が起きやすい箇所）

- **冪等**：`while (next_billing_date < today)` で条件収束させる
- **追いつける**：バッチが数日停止しても、ループで正しい期日まで復帰できる
- **月末問題**：`billing_anchor_day` に本来の請求日（例：31）を保持し、その月に存在しない日は月末に丸めるが、翌月は再びアンカー日に戻す
  - 誤：1/31 → 2/28 → 3/28　／　正：1/31 → 2/28 → **3/31**
- 繰り越しは請求日の翌日に行う（当日は「今日が請求日」と表示するため）
- `yearly` は日付演算ライブラリに任せ、365日加算で自前計算しない

### 通知日数の設定変更時の挙動

- 増やした場合、既に近いサブスクの過去分は送り直さない。次の請求サイクルから適用
- 減らした場合も、送信済みの通知は取り消さない
- 空配列（通知しない）も許可する。ただしバッチ自体は毎日走らせる（休止対策）

---

## 7. 通知メールの仕様

| 項目 | 内容 |
|---|---|
| 件名（1件） | `【サブスク】3日後に Netflix 1,490円 の請求があります` |
| 件名（複数件） | `【サブスク】3日後に2件の請求があります（計 3,480円）` |
| 本文 | サービス名／金額／請求日。解約ページへのリンク（登録があれば）とアプリへのリンク |
| 集約 | 同日に該当が複数あれば1通にまとめる |

合計金額はメールに載せない（把握したくなればアプリを開く動線を残す）。

---

## 8. グラフの実装仕様

| 項目 | 内容 |
|---|---|
| 種類 | 折れ線グラフ1本（Recharts） |
| 縦軸 | その月に実際に請求された額（`payment_history` を `billed_on` の年月で集計） |
| 横軸 | 月。使い始めた月から積み上がる |
| 配置 | 専用画面を作らず一覧画面に置く |

蓄積コストがほぼゼロなため、グラフUIの要否に関わらず記録は初回リリースから開始する。

---

## 9. 画面・コンポーネント設計

### ディレクトリ構成

```
app/
  auth/
    login/page.tsx             # ログイン画面（→ /auth/login）
    signup/page.tsx            # 新規登録画面（→ /auth/signup）
  page.tsx                     # 一覧（トップ）＝合計金額・グラフ・一覧・追加/編集モーダル
  settings/page.tsx            # 設定（通知設定・カード管理・エクスポート導線）
  api/
    cron/daily/route.ts         # 日次バッチ
    export/json/route.ts
    export/csv/route.ts
actions/
  subscriptions.ts              # createSubscription / updateSubscription / cancelSubscription / deleteSubscription
  cards.ts                      # createCard / updateCard / deleteCard
  settings.ts                   # updateSettings
lib/
  supabase/
    server.ts                   # RLS前提のサーバークライアント（Cookie経由）
    admin.ts                    # service_roleクライアント（cron専用）
  date.ts                       # 「JSTの今日」を返す処理（§2で1箇所に閉じ込めると決めた部分）
  billing.ts                    # 月額換算・周期計算・繰り越しロジック
components/
  SubscriptionList.tsx
  SubscriptionFormModal.tsx
  PaymentChart.tsx
  CardSelect.tsx
```

### フォームの表示方式

追加・編集フォームは**モーダル**とする。専用ページ（別URL）は作らない。一覧画面（トップ）のClient Componentが開閉状態と編集対象のsubscription idを保持し、`SubscriptionFormModal`を重ねて表示する。URLは変化させず、ページ遷移は発生しない。

### クライアント状態管理

**状態管理ライブラリは導入しない。** モーダルの開閉・編集対象ID・フォーム入力値は`useState`で管理する。管理対象は一覧画面（トップ）内で完結し、他画面（ログイン・設定）とまたいで共有する状態は発生しない規模のため。画面をまたぐ共有状態が実際に必要になった時点で再検討する。

---

## 10. 環境変数一覧

| 変数名 | 用途 | 公開範囲 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | SupabaseプロジェクトのURL | クライアント／サーバー共通（秘匿情報ではない） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase匿名キー。ログイン・セッション管理に使用（RLS前提） | クライアント／サーバー共通 |
| `SUPABASE_SERVICE_ROLE_KEY` | RLSをバイパスする管理者キー。日次バッチ専用 | **サーバーのみ。`NEXT_PUBLIC_`を絶対に付けない**（§3） |
| `RESEND_API_KEY` | 通知メール送信 | サーバーのみ |
| `RESEND_FROM_EMAIL` | メール送信元アドレス。Resend側で検証済みのアドレス／ドメインを使う | サーバーのみ |
| `CRON_SECRET` | `/api/cron/daily`の認証（§5）。Vercelが自動でヘッダー送信 | サーバーのみ |
| `APP_URL` | 通知メール本文のアプリ・解約ページへのリンク生成に使用する絶対URL | サーバーのみ |

`SUPABASE_SERVICE_ROLE_KEY`と`CRON_SECRET`は特に、Vercelの環境変数設定でProduction環境にのみ登録し、誤ってクライアントバンドルに含めないよう変数名に`NEXT_PUBLIC_`を付けないことを徹底する。

---

## 11. 実装順序

| 順 | 内容 | 理由 |
|---|---|---|
| 0 | Resendでテスト送信1通 | 自分のGmailに届くか確認。ここが通らないと前提が崩れる |
| 0.5 | Supabase Auth＋RLS＋カスタムSMTP設定 | `user_id` が全テーブルに絡むため、後付けは全クエリの手戻りになる |
| 1 | DB設計＋登録・一覧・編集（F-1, F-2, F-8） | これがないと何も検証できない |
| 2 | エクスポート（F-7） | 動機の核。実装が軽いうちに入れる |
| 3 | 合計金額の表示（F-3） | 換算ロジックのみ |
| 4 | 日次バッチ＝繰り越し＋通知＋履歴記録（F-4, F-5, F-9） | DB休止対策も兼ねるので実質必須 |
| 4.5 | 設定画面に通知日数と通知先メールを追加 | 4でバッチが `settings` を読むようになる直後に画面化 |
| 5 | グラフ描画（F-10） | 4の履歴テーブルが前提。ここまでで初回リリース |
| 6 | トライアル監視（F-6） | 既存の通知基盤にフラグを足すだけ |
| 7 | PWA manifest | ホーム画面に追加できるように |

---

## 12. バリデーション仕様

### 方針

Server Actionsは直接呼び出せてしまう（§5・RLSの議論と同じ構図）ため、**検証の正はサーバー側**とする。各Server Actionの冒頭でZodスキーマにより再検証する。クライアント側はHTML標準の`required`・`type="email"`・`min`などの属性で即時フィードバックのみ行い、react-hook-form等の検証ライブラリは導入しない。

### サブスク登録・編集フォーム

| 項目 | ルール |
|---|---|
| service_name | 必須。1〜100文字 |
| amount | 必須。整数。1円以上 |
| cycle | 必須。`monthly` / `yearly` / `weekly` / `custom_days` |
| cycle_days | `cycle='custom_days'`のときのみ必須。1〜3650 |
| next_billing_date | 必須。有効な日付 |
| billing_anchor_day | ユーザー入力欄なし。登録時に`next_billing_date`の「日」からサーバー側で自動算出 |
| is_trial | 任意。チェックボックス（既定false） |
| card_id | 任意。既存カードから選択、またはその場で新規作成 |
| cancel_url | 任意。入力時は`http://`または`https://`で始まるURL形式を検証 |
| memo | 任意。上限500文字 |

### 設定画面

| 項目 | ルール |
|---|---|
| notify_email | 任意。未入力時は`auth.users.email`を使用。入力時はメール形式を検証 |
| notify_days | チェックボックス（14/7/3/1/当日）＋任意の日数入力（0〜365の整数）。重複は保存時に除去 |
| カード名 | 必須。1〜50文字。同名重複はDBのユニーク制約（§4）でエラーにする |

### ログイン・新規登録画面

| 項目 | ルール |
|---|---|
| メールアドレス | 必須。メール形式 |
| パスワード | Supabase Auth側の強度チェック（最小文字数・漏洩パスワード検出、§3で設定済み）にそのまま任せる。アプリ側で独自の強度判定は行わない |

新規登録画面にパスワード確認用の再入力欄は設けない（自分専用アプリでタイプミスのリスクが小さく、間違えてもログインできなければ再登録すればよいため）。

---

## 13. エラーハンドリング方針

### 基本方針

- **ログ収集はVercelの標準ログ（Runtime Logs）のみ**とする。Sentry等の外部エラー監視サービスは導入しない（月額0円方針・過剰設計回避と合致）
- クライアントには詳細なエラー内容（スタックトレース、DBのエラーメッセージ等）を返さない。ユーザー向けには一般化したメッセージを表示し、詳細は`console.error`でサーバー側のログにのみ残す

### Server Actionsのエラー返却形式

各Server Actionは例外を投げず、`{ success: boolean, error?: string }`形式の値を返す。呼び出し側（モーダル内のフォーム）はこれを見てインラインでエラーメッセージを表示する。トースト通知等のUIライブラリは導入しない。

| エラー種別 | 扱い |
|---|---|
| バリデーションエラー（§12のZod検証） | Zodのエラーメッセージを日本語化して`error`にそのまま返す |
| DB制約違反（カード名の重複など） | 制約名から意味のあるメッセージに変換して返す（例：「同じ名前のカードが既にあります」） |
| 認可エラー（RLSによる拒否等） | 「操作できませんでした」という一般化したメッセージのみ返す。詳細はログにのみ残す |
| 想定外の例外（DB接続失敗等） | 「エラーが発生しました。時間をおいて再度お試しください」を返す。詳細はログにのみ残す |

### 日次バッチのエラー処理

- 繰り越し処理はサブスク1件ごとにtry/catchする。1件の異常データ（不正な日付など）が原因で他のサブスクの繰り越し・通知が止まらないようにする
- バッチ全体が例外で中断した場合も、**自分宛のアラートメールは送らない**。§6で設計した「N日以内・未送信」の追いつきロジックにより、翌日のバッチが自動的に取りこぼしを回収するため、単発の失敗は致命的ではない
- 障害の有無はVercelダッシュボードのCron Jobsログから随時確認する運用とし、自動通知の仕組みは持たない

### 通知メール送信失敗時の扱い

Resend側のエラーで送信が失敗した場合、`notification_logs`への記録は行わない（送信成功時のみ記録する設計は§6のまま変更なし）。これにより翌日のバッチが「未送信」として自動的に再送を試みる。

---

## 14. 要件定義書 未決定事項への対応

- **U-2（解約後の履歴の扱い）**：解決済み。「年間削減額」の表示はMVPでは作らず、`payment_history`と`status`への記録のみに留める（要件定義書§10）
- **U-3（金額改定への対応）**：解決済み。`subscriptions.amount`を単純に上書きする運用とし、追加のテーブルやカラムは不要（§4 データモデル、要件定義書§10）
- **U-4（一般公開の判断時期）**：現時点では保留。公開を判断する段階になってから検討する
