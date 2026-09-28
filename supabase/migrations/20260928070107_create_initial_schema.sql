-- design.md 4章のデータモデルに基づく初期スキーマ。
-- 全テーブルでRLSを有効化しデフォルト拒否、`auth.uid() = user_id` ポリシーを設定する（design.md 3章）。

create type public.subscription_cycle as enum ('monthly', 'yearly', 'weekly', 'custom_days');
create type public.subscription_status as enum ('active', 'cancelled');

-- updated_at自動更新用（design.mdに記載はないが、Server Actionsでの更新漏れを防ぐための最小実装）
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- cards
-- ============================================================
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.cards enable row level security;

create policy "cards_select_own" on public.cards
  for select using (auth.uid() = user_id);
create policy "cards_insert_own" on public.cards
  for insert with check (auth.uid() = user_id);
create policy "cards_update_own" on public.cards
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cards_delete_own" on public.cards
  for delete using (auth.uid() = user_id);

-- ============================================================
-- subscriptions
-- ============================================================
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  service_name text not null check (char_length(service_name) between 1 and 100),
  amount integer not null check (amount >= 1),
  cycle public.subscription_cycle not null,
  cycle_days integer,
  next_billing_date date not null,
  billing_anchor_day integer not null check (billing_anchor_day between 1 and 31),
  is_trial boolean not null default false,
  card_id uuid references public.cards (id) on delete set null,
  cancel_url text,
  status public.subscription_status not null default 'active',
  memo text check (char_length(memo) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- custom_daysのときのみcycle_daysが必須（design.md 12章のバリデーション仕様をDB制約でも担保）
  -- cycle_days is not nullを明示しないと、NULLとのbetween比較がNULLを返しCHECK制約が
  -- （falseではなくNULLになり）素通りしてしまうため両方の分岐で明示的にnull判定する
  constraint subscriptions_cycle_days_consistency check (
    (cycle = 'custom_days' and cycle_days is not null and cycle_days between 1 and 3650)
    or (cycle <> 'custom_days' and cycle_days is null)
  )
);

create index subscriptions_user_next_billing_date_idx
  on public.subscriptions (user_id, next_billing_date);

-- 日次バッチ（service_role、RLSバイパス）が全ユーザー分を横断走査するためのインデックス
create index subscriptions_status_next_billing_date_idx
  on public.subscriptions (status, next_billing_date);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute procedure public.set_updated_at();

alter table public.subscriptions enable row level security;

create policy "subscriptions_select_own" on public.subscriptions
  for select using (auth.uid() = user_id);
create policy "subscriptions_insert_own" on public.subscriptions
  for insert with check (auth.uid() = user_id);
create policy "subscriptions_update_own" on public.subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "subscriptions_delete_own" on public.subscriptions
  for delete using (auth.uid() = user_id);

-- ============================================================
-- payment_history（user_idカラムは持たず、subscriptionsを介してRLS判定する）
-- ============================================================
create table public.payment_history (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  billed_on date not null,
  amount integer not null check (amount >= 1),
  created_at timestamptz not null default now(),
  unique (subscription_id, billed_on)
);

alter table public.payment_history enable row level security;

-- 書き込みは日次バッチ（service_role）のみが行う。画面からは参照のみ（グラフ表示用）
create policy "payment_history_select_own" on public.payment_history
  for select using (
    exists (
      select 1 from public.subscriptions s
      where s.id = payment_history.subscription_id
        and s.user_id = auth.uid()
    )
  );

-- ============================================================
-- notification_logs（user_idカラムは持たず、subscriptionsを介してRLS判定する）
-- kindは通知タイミング（何日前か。0は当日）を表す整数。settings.notify_daysが
-- 任意の日数を許容するため固定enumにはしない
-- ============================================================
create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  target_date date not null,
  kind integer not null check (kind between 0 and 365),
  sent_at timestamptz not null default now(),
  unique (subscription_id, target_date, kind)
);

alter table public.notification_logs enable row level security;
-- 画面から参照する機能が無いため、authenticatedロール向けのポリシーは設定しない
-- （RLS有効化のみでデフォルト拒否。読み書きは日次バッチのservice_roleのみが行う）

-- ============================================================
-- settings
-- ============================================================
create table public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  notify_email text,
  notify_days integer[] not null default '{3,1}',
  updated_at timestamptz not null default now()
);

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute procedure public.set_updated_at();

alter table public.settings enable row level security;

create policy "settings_select_own" on public.settings
  for select using (auth.uid() = user_id);
create policy "settings_insert_own" on public.settings
  for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on public.settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "settings_delete_own" on public.settings
  for delete using (auth.uid() = user_id);

-- ============================================================
-- サインアップ時にnotify_daysの初期値（{3,1}）を持つsettings行を自動作成する。
-- design.mdに明記はないが、F-4「通知は何もしなくても初期値で届く」を満たすための
-- 最小実装（Supabase公式ドキュメント推奨のauth.usersトリガーパターンに従う）
-- ============================================================
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.settings (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
