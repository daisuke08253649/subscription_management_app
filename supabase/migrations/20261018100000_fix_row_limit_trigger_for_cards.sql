-- 20261011090000の件数上限トリガー関数が、cardsテーブルにも使われるにもかかわらず
-- 存在しないstatus列（old.status）を参照しており、カードの作成が常に
-- 「record "old" has no field "status"」で失敗していた不具合の修正。
-- plpgsqlは式中のold.<列>をその行が評価される時点で解決するため、
-- tg_table_nameで分岐していても、冒頭の式がcardsで必ず失敗する。
-- statusを持たないテーブルでも安全なto_jsonb経由の参照に変更する
create or replace function public.check_row_limit_per_user()
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
  -- それ以外のUPDATE（アクティブのままの編集など）は件数が増えないため対象外。
  -- UPDATEで呼ばれるのはsubscriptions（update of status）のみ
  if tg_op = 'UPDATE'
     and not (to_jsonb(old) ->> 'status' <> 'active' and to_jsonb(new) ->> 'status' = 'active') then
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
