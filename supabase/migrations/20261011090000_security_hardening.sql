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
  -- 下限: INSERTは今日（JST）以降（actions/subscriptions.tsと同じ。昨日を許すと
  -- 登録前の支払い履歴が繰り越しで生成されてしまう）。UPDATEは日付をまたぐ操作との
  -- 競合を許容するため1日前まで。
  -- 上限: custom_daysの最大（3650日）を含む約11年先
  if new.next_billing_date < v_today_jst - (case when tg_op = 'INSERT' then 0 else 1 end)
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
-- 並行リクエストがcountを同時に通過して上限を超えないよう、ユーザー×テーブル
-- 単位のトランザクションスコープのアドバイザリロックで直列化する。
-- 解約済み（履歴として残す。F-8）は運用上の上限(active)から除外し、
-- 総数にだけ緩い上限を設けて、履歴の蓄積で新規登録できなくなるのを防ぐ
-- ------------------------------------------------------------
create function public.check_row_limit_per_user()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_limit integer := tg_argv[0]::integer;
  v_total_limit integer := coalesce(tg_argv[1]::integer, tg_argv[0]::integer);
  v_total integer;
  v_active integer;
begin
  -- 解約済み→アクティブへの変更（REST直叩きのUPDATE）でも上限を回避できないよう検証する。
  -- それ以外のUPDATE（アクティブのままの編集など）は件数が増えないため対象外
  if tg_op = 'UPDATE' and not (old.status <> 'active' and new.status = 'active') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(tg_table_name || ':' || new.user_id::text, 0));

  if tg_table_name = 'subscriptions' then
    select count(*), count(*) filter (where status = 'active')
      into v_total, v_active
      from public.subscriptions where user_id = new.user_id;
    -- UPDATE（再有効化）では行自身が総数に含まれるため、総数の上限判定はINSERTのみ
    if (tg_op = 'INSERT' and v_total >= v_total_limit)
       or (new.status = 'active' and v_active >= v_limit) then
      raise exception 'row limit exceeded for subscriptions' using errcode = 'P0007';
    end if;
  else
    execute format('select count(*) from public.%I where user_id = $1', tg_table_name)
      into v_total using new.user_id;
    if v_total >= v_limit then
      raise exception 'row limit exceeded for %', tg_table_name using errcode = 'P0007';
    end if;
  end if;
  return new;
end;
$$;

create trigger subscriptions_row_limit
  before insert or update of status on public.subscriptions
  for each row execute procedure public.check_row_limit_per_user(500, 2000);

create trigger cards_row_limit
  before insert on public.cards
  for each row execute procedure public.check_row_limit_per_user(100);

-- ------------------------------------------------------------
-- #20: notify_daysの要素数・値の範囲（kindはnotification_logs.kindの0〜365と一致）
-- ------------------------------------------------------------
-- 既存データに不正値（この制約が無い間にREST直叩きで保存されたもの）があると
-- ADD CONSTRAINTが失敗しマイグレーション全体が適用されないため、先に無害化する。
-- notify_daysは既定値に戻し、notify_emailとcancel_urlは未設定(NULL)に戻す
update public.settings
  set notify_days = '{3,1}'
  where not (
    cardinality(notify_days) <= 20
    and array_position(notify_days, null) is null
    and 0 <= all (notify_days)
    and 365 >= all (notify_days)
  );

update public.settings
  set notify_email = null
  where notify_email is not null
    and not (
      char_length(notify_email) <= 254
      and notify_email ~ '^[^[:space:],;<>"]+@[^[:space:],;<>"@]+\.[^[:space:],;<>"@]+$'
    );

update public.subscriptions
  set cancel_url = null
  where cancel_url is not null
    and not (cancel_url ~* '^https?://[^[:space:]]+$' and char_length(cancel_url) <= 2048);

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
