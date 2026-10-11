-- ============================================================
-- セキュリティ強化（Issue #17, #18, #20, #21）
-- 入力検証がServer Actionにしか無く、PostgREST直叩きで迂回できたため、
-- DB側でも同じ制約を強制する
-- ============================================================

-- ------------------------------------------------------------
-- #17: next_billing_dateの範囲制限
-- 過去日（例: 1900-01-01）を入れて日次バッチの繰り越しループを巨大化させる
-- 攻撃を防ぐ。CHECKはvolatileな現在日付を使えないためトリガーで検証する。
-- 日付が変更された時（とINSERT）のみ検証し、繰り越し未処理で期限超過のまま
-- 残っている行の、無関係な項目の更新は妨げない（actions/subscriptions.tsと同じ方針）
-- ------------------------------------------------------------
create function public.check_subscription_billing_date_range()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_today_jst date := (now() at time zone 'Asia/Tokyo')::date;
begin
  if tg_op = 'UPDATE' and new.next_billing_date is not distinct from old.next_billing_date then
    return new;
  end if;
  -- 下限: 今日（JST）の1日前まで（日付をまたぐ操作との競合を許容する余裕）
  -- 上限: custom_daysの最大（3650日）を含む約11年先
  if new.next_billing_date < v_today_jst - 1
     or new.next_billing_date > v_today_jst + interval '11 years' then
    raise exception 'next_billing_date is out of the allowed range' using errcode = 'P0006';
  end if;
  return new;
end;
$$;

create trigger subscriptions_check_billing_date_range
  before insert or update on public.subscriptions
  for each row execute procedure public.check_subscription_billing_date_range();

-- ------------------------------------------------------------
-- #20: ユーザーあたりの件数上限（大量作成によるストレージ・バッチ負荷の抑止）
-- ------------------------------------------------------------
create function public.check_row_limit_per_user()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_limit integer := tg_argv[0]::integer;
  v_count integer;
begin
  execute format('select count(*) from public.%I where user_id = $1', tg_table_name)
    into v_count using new.user_id;
  if v_count >= v_limit then
    raise exception 'row limit exceeded for %', tg_table_name using errcode = 'P0007';
  end if;
  return new;
end;
$$;

create trigger subscriptions_row_limit
  before insert on public.subscriptions
  for each row execute procedure public.check_row_limit_per_user(500);

create trigger cards_row_limit
  before insert on public.cards
  for each row execute procedure public.check_row_limit_per_user(100);

-- ------------------------------------------------------------
-- #20: notify_daysの要素数・値の範囲（kindはnotification_logs.kindの0〜365と一致）
-- ------------------------------------------------------------
alter table public.settings
  add constraint settings_notify_days_check check (
    cardinality(notify_days) <= 20
    and array_position(notify_days, null) is null
    and 0 <= all (notify_days)
    and 365 >= all (notify_days)
  );

-- ------------------------------------------------------------
-- #18: notify_emailの形式（空白・カンマ・改行・山括弧を含む値を拒否し、
-- 複数宛先や改行によるヘッダーインジェクションを防ぐ）
-- ------------------------------------------------------------
alter table public.settings
  add constraint settings_notify_email_check check (
    notify_email is null
    or (
      char_length(notify_email) <= 254
      and notify_email ~ '^[^[:space:],;<>"]+@[^[:space:],;<>"@]+\.[^[:space:],;<>"@]+$'
    )
  );

-- ------------------------------------------------------------
-- #21: cancel_urlはhttp(s)のみ・長さ上限
-- ------------------------------------------------------------
alter table public.subscriptions
  add constraint subscriptions_cancel_url_check check (
    cancel_url is null
    or (cancel_url ~* '^https?://[^[:space:]]+$' and char_length(cancel_url) <= 2048)
  );
