-- actions/subscriptions.tsのcreateSubscription/updateSubscriptionから呼び出すRPC。
-- 「カードの新規作成」と「サブスクの登録／更新」はPostgREST経由だと別リクエストに
-- なり1トランザクションにできないため、Postgres関数内にまとめて真のアトミック性を
-- 持たせる（Codexレビュー指摘対応: PR #6）。
--
-- security invoker（既定）のまま実装し、auth.uid()を内部で使うことで、RLSによる
-- 多層防御を維持する（design.md 3章・AGENTS.md 11章「サーバー経由だから不要という
-- 判断はしない」）。呼び出し元からuser_idを受け取らない＝偽装できない。

create or replace function public.create_subscription_with_card(
  p_service_name text,
  p_amount integer,
  p_cycle public.subscription_cycle,
  p_cycle_days integer,
  p_next_billing_date date,
  p_billing_anchor_day integer,
  p_is_trial boolean,
  p_card_id uuid,
  p_new_card_name text,
  p_cancel_url text,
  p_memo text
)
returns public.subscriptions
language plpgsql
set search_path = ''
as $$
declare
  v_card_id uuid := p_card_id;
  v_subscription public.subscriptions;
begin
  if p_new_card_name is not null then
    insert into public.cards (user_id, name)
    values (auth.uid(), p_new_card_name)
    returning id into v_card_id;
  end if;

  insert into public.subscriptions (
    user_id, service_name, amount, cycle, cycle_days, next_billing_date,
    billing_anchor_day, is_trial, card_id, cancel_url, memo
  ) values (
    auth.uid(), p_service_name, p_amount, p_cycle, p_cycle_days, p_next_billing_date,
    p_billing_anchor_day, p_is_trial, v_card_id, p_cancel_url, p_memo
  )
  returning * into v_subscription;

  return v_subscription;
end;
$$;

-- update_subscription_with_card:
-- - 対象行が無い／RLSで見えない場合はSTRICT INTOがP0002（no_data_found）を送出する
-- - 楽観的ロック（p_expected_updated_at不一致）は40001（serialization_failure。
--   「同時更新のためシリアライズできない」を表す標準SQLSTATE）を送出する
-- - billing_anchor_dayの保持／再計算ロジックもここに集約し、読み取りと書き込みを
--   同一トランザクション内で行うことでレースコンディションを避ける
-- - next_billing_dateが過去日かどうかの判定は、ユーザーが実際に日付を変更した
--   場合のみ行う（p_todayは呼び出し側でlib/date.tsのgetTodayJST()から渡す。
--   DB側でcurrent_dateを使うとサーバーのタイムゾーンに依存してしまうため）。
--   日付が変わっていない場合は許可する。繰り越しがまだ行われておらず
--   next_billing_dateが期限超過のまま残っている状態は正当（バッチが未実行なだけ）
--   であり、それを理由に無関係な項目の編集までブロックしてはならない
create or replace function public.update_subscription_with_card(
  p_subscription_id uuid,
  p_expected_updated_at timestamptz,
  p_service_name text,
  p_amount integer,
  p_cycle public.subscription_cycle,
  p_cycle_days integer,
  p_next_billing_date date,
  p_is_trial boolean,
  p_card_id uuid,
  p_new_card_name text,
  p_cancel_url text,
  p_memo text,
  p_today date
)
returns public.subscriptions
language plpgsql
set search_path = ''
as $$
declare
  v_card_id uuid := p_card_id;
  v_current public.subscriptions;
  v_billing_anchor_day integer;
  v_subscription public.subscriptions;
begin
  select * into strict v_current
  from public.subscriptions
  where id = p_subscription_id
  for update;

  if v_current.updated_at <> p_expected_updated_at then
    raise exception 'subscription was modified concurrently'
      using errcode = '40001';
  end if;

  if p_next_billing_date <> v_current.next_billing_date
     and p_next_billing_date < p_today then
    raise exception 'next_billing_date must not be in the past'
      using errcode = 'P0005';
  end if;

  if v_current.cycle = 'monthly'
     and p_cycle = 'monthly'
     and v_current.next_billing_date = p_next_billing_date then
    v_billing_anchor_day := v_current.billing_anchor_day;
  else
    v_billing_anchor_day := extract(day from p_next_billing_date)::integer;
  end if;

  if p_new_card_name is not null then
    insert into public.cards (user_id, name)
    values (auth.uid(), p_new_card_name)
    returning id into v_card_id;
  end if;

  update public.subscriptions set
    service_name = p_service_name,
    amount = p_amount,
    cycle = p_cycle,
    cycle_days = p_cycle_days,
    next_billing_date = p_next_billing_date,
    billing_anchor_day = v_billing_anchor_day,
    is_trial = p_is_trial,
    card_id = v_card_id,
    cancel_url = p_cancel_url,
    memo = p_memo
  where id = p_subscription_id
  returning * into v_subscription;

  return v_subscription;
end;
$$;
