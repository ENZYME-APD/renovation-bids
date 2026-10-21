-- Import with matching: lines can name the catalogue partida chosen in the review (partida_id) or ask
-- for a new studio partida with a standard code in its chapter (new_partida). The file's own code is
-- kept on the line as source_ref, so the two documents can still be compared.

-- Next free standard code in a chapter: DEM-130 after DEM-120 (studio and standard codes counted).
create or replace function private.next_partida_code(p_org uuid, p_region text, p_trade uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_code text;
  v_max  integer;
begin
  select upper(code) into v_code from public.trades where id = p_trade;
  select coalesce(max(substring(p.code from '-(\d+)$')::integer), 0) into v_max
  from public.partidas p
  where p.region_id = p_region and (p.organization_id is null or p.organization_id = p_org)
    and upper(p.code) ~ ('^' || v_code || '-\d+$');
  return v_code || '-' || lpad((((v_max / 10) + 1) * 10)::text, 3, '0');
end;
$$;
revoke all on function private.next_partida_code(uuid, text, uuid) from public;
grant execute on function private.next_partida_code(uuid, text, uuid) to authenticated;

-- Studio partidas outside the standard scheme, or missing what a budget needs, for review.
create or replace view public.catalogue_issues with (security_invoker = true) as
select p.id, p.organization_id, p.code, p.short_description,
       array_remove(array[
         case when p.code !~ '^[A-Z]{3}-\d{3}$' then 'code outside the scheme' end,
         case when coalesce(p.long_description, '') = '' then 'no description' end,
         case when t.code is not null and p.code !~ ('^' || t.code || '-') then 'code from another chapter' end
       ], null) as issues
from public.partidas p
left join public.trades t on t.id = p.trade_id
where p.organization_id is not null and p.active
  and (p.code !~ '^[A-Z]{3}-\d{3}$' or coalesce(p.long_description, '') = '' or (t.code is not null and p.code !~ ('^' || t.code || '-')));
grant select on public.catalogue_issues to authenticated;

create or replace function public.import_budget(
  p_version uuid, p_lines jsonb, p_delete_missing boolean default false, p_general_notes text default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_org     uuid;
  v_region  text;
  e         jsonb;
  v_partida uuid;
  v_trade   uuid;
  v_line    uuid;
  v_price   numeric;
  v_ids     uuid[] := '{}';
  v_ins int := 0; v_upd int := 0; v_del int := 0; v_new_partidas int := 0; v_meas int := 0;
  v_row int := 0;
  m jsonb;
  v_seq int;
begin
  select v.organization_id, o.region_id into v_org, v_region
  from public.versions v join public.organizations o on o.id = v.organization_id where v.id = p_version;
  if v_org is null then raise exception 'version not found'; end if;
  if jsonb_typeof(p_lines) <> 'array' then raise exception 'lines must be a list'; end if;

  for e in select * from jsonb_array_elements(p_lines) loop
    v_row := v_row + 1;
    v_line := nullif(e ->> 'id', '')::uuid;
    if v_line is not null and not exists (select 1 from public.line_items where id = v_line and version_id = p_version) then
      v_line := null;  -- an id from another version: treat the row as new
    end if;

    -- Partida: one chosen in the review (partida_id), a new studio partida with a standard code in its
    -- chapter (new_partida), the catalogue code, or a new studio partida under the file's code.
    v_partida := null;
    if nullif(e ->> 'partida_id', '') is not null then
      select id into v_partida from public.partidas
      where id = (e ->> 'partida_id')::uuid and region_id = v_region and (organization_id is null or organization_id = v_org);
      if v_partida is null then raise exception 'Row %: the chosen partida is not in your catalogue.', v_row; end if;
      v_partida := coalesce(public.studio_partida(v_org, v_partida), v_partida);
    elsif coalesce((e ->> 'new_partida')::boolean, false) then
      select id into v_trade from public.trades
      where (organization_id is null or organization_id = v_org) and upper(code) = upper(coalesce(e ->> 'chapter', ''))
      order by organization_id nulls last limit 1;
      if v_trade is null then raise exception 'Row %: a new partida needs a chapter (%).', v_row, coalesce(e ->> 'chapter', 'empty'); end if;
      if coalesce(e ->> 'title', '') = '' then raise exception 'Row %: a new partida needs a title.', v_row; end if;
      -- The same new item twice in one file (one per room) is one partida
      select id into v_partida from public.partidas
      where region_id = v_region and organization_id = v_org and trade_id = v_trade and active
        and lower(short_description) = lower(e ->> 'title') and unit = coalesce(nullif(e ->> 'unit', ''), 'ud')::public.unit
      limit 1;
      if v_partida is null then
        insert into public.partidas (region_id, organization_id, code, short_description, long_description, unit, trade_id)
        values (v_region, v_org, private.next_partida_code(v_org, v_region, v_trade), e ->> 'title', nullif(e ->> 'long_description', ''),
                coalesce(nullif(e ->> 'unit', ''), 'ud')::public.unit, v_trade)
        returning id into v_partida;
        v_new_partidas := v_new_partidas + 1;
      end if;
    elsif coalesce(e ->> 'code', '') <> '' then
      select id into v_partida from public.partidas
      where region_id = v_region and organization_id = v_org and upper(code) = upper(e ->> 'code') and active limit 1;
      if v_partida is null then
        select coalesce(public.studio_partida(v_org, id), id) into v_partida from public.partidas
        where region_id = v_region and organization_id is null and upper(code) = upper(e ->> 'code') limit 1;
      end if;
      if v_partida is null then
        select id into v_trade from public.trades
        where (organization_id is null or organization_id = v_org) and upper(code) = upper(coalesce(e ->> 'chapter', ''))
        order by organization_id nulls last limit 1;
        if v_trade is null then
          raise exception 'Row %: % is not in the catalogue and has no known chapter (%).', v_row, e ->> 'code', coalesce(e ->> 'chapter', 'empty');
        end if;
        if coalesce(e ->> 'title', '') = '' then
          raise exception 'Row %: % is new and needs a title.', v_row, e ->> 'code';
        end if;
        insert into public.partidas (region_id, organization_id, code, short_description, long_description, unit, trade_id)
        values (v_region, v_org, upper(e ->> 'code'), e ->> 'title', nullif(e ->> 'long_description', ''),
                coalesce(nullif(e ->> 'unit', ''), 'ud')::public.unit, v_trade)
        returning id into v_partida;
        v_new_partidas := v_new_partidas + 1;
      end if;
    elsif v_line is null then
      raise exception 'Row %: a new line needs a partida.', v_row;
    end if;

    v_price := case when e ? 'unit_price' then nullif(e ->> 'unit_price', '')::numeric end;

    if v_line is null then
      insert into public.line_items
        (organization_id, version_id, partida_id, quantity, unit_price, confidence, state, room,
         source, source_ref, supplied_by, description, client_note, measurement_note, notes, reference_price, reference_source)
      values
        (v_org, p_version, v_partida, greatest(coalesce(nullif(e ->> 'quantity', '')::numeric, 0), 0), v_price,
         case when v_price is null then null else coalesce(nullif(e ->> 'confidence', ''), 'medium')::public.confidence end,
         case when e ->> 'state' in ('needs_rfq', 'quoted') then (e ->> 'state')::public.line_state
              when v_price is null then 'unpriced'::public.line_state else 'priced'::public.line_state end,
         nullif(e ->> 'room', ''), 'import', coalesce(nullif(e ->> 'source_ref', ''), e ->> 'code'),
         coalesce(nullif(e ->> 'supplied_by', ''), 'contractor')::public.supplied_by,
         nullif(e ->> 'description', ''), nullif(e ->> 'client_note', ''), nullif(e ->> 'measurement_note', ''),
         nullif(e ->> 'notes', ''), nullif(e ->> 'reference_price', '')::numeric, nullif(e ->> 'reference_source', ''))
      returning id into v_line;
      v_ins := v_ins + 1;
    else
      update public.line_items l set
        partida_id       = coalesce(v_partida, l.partida_id),
        quantity         = case when e ? 'quantity' and not (e ? 'measurements') then greatest(coalesce(nullif(e ->> 'quantity', '')::numeric, 0), 0) else l.quantity end,
        unit_price       = case when e ? 'unit_price' then v_price else l.unit_price end,
        price_id         = case when e ? 'unit_price' and v_price is distinct from l.unit_price then null else l.price_id end,
        confidence       = case when e ? 'confidence' then nullif(e ->> 'confidence', '')::public.confidence
                                when e ? 'unit_price' and v_price is not null and l.confidence is null then 'medium' else l.confidence end,
        state            = case when e ->> 'state' in ('needs_rfq', 'quoted') then (e ->> 'state')::public.line_state
                                when (case when e ? 'unit_price' then v_price else l.unit_price end) is null then 'unpriced'::public.line_state
                                when l.state = 'unpriced' or e ? 'state' then 'priced'::public.line_state
                                else l.state end,
        room             = case when e ? 'room' then nullif(e ->> 'room', '') else l.room end,
        supplied_by      = case when e ? 'supplied_by' then coalesce(nullif(e ->> 'supplied_by', ''), 'contractor')::public.supplied_by else l.supplied_by end,
        description      = case when e ? 'description' then nullif(e ->> 'description', '') else l.description end,
        client_note      = case when e ? 'client_note' then nullif(e ->> 'client_note', '') else l.client_note end,
        measurement_note = case when e ? 'measurement_note' then nullif(e ->> 'measurement_note', '') else l.measurement_note end,
        notes            = case when e ? 'notes' then nullif(e ->> 'notes', '') else l.notes end,
        reference_price  = case when e ? 'reference_price' then nullif(e ->> 'reference_price', '')::numeric else l.reference_price end,
        reference_source = case when e ? 'reference_source' then nullif(e ->> 'reference_source', '') else l.reference_source end
      where l.id = v_line;
      v_upd := v_upd + 1;
    end if;
    v_ids := v_ids || v_line;
    -- A description equal to the partida's own adds nothing: keep the line pointing at the catalogue text
    update public.line_items l set description = null
    from public.partidas p where l.id = v_line and p.id = l.partida_id and l.description = p.long_description;

    -- Measurements given: they replace the line's and set its quantity
    if jsonb_typeof(e -> 'measurements') = 'array' then
      delete from public.line_measurements where line_id = v_line;
      v_seq := 0;
      for m in select * from jsonb_array_elements(e -> 'measurements') loop
        continue when coalesce(m ->> 'count', m ->> 'length', m ->> 'width', m ->> 'height') is null;
        v_seq := v_seq + 1;
        insert into public.line_measurements (organization_id, line_id, label, count, length, width, height, source, sequence)
        values (v_org, v_line, nullif(m ->> 'label', ''), nullif(m ->> 'count', '')::numeric, nullif(m ->> 'length', '')::numeric,
                nullif(m ->> 'width', '')::numeric, nullif(m ->> 'height', '')::numeric, 'import', v_seq);
        v_meas := v_meas + 1;
      end loop;
    end if;
  end loop;

  if p_delete_missing then
    delete from public.line_items where version_id = p_version and not (id = any (v_ids));
    get diagnostics v_del = row_count;
  end if;
  if p_general_notes is not null then
    update public.versions set general_notes = nullif(p_general_notes, '') where id = p_version;
  end if;

  return jsonb_build_object('added', v_ins, 'updated', v_upd, 'deleted', v_del, 'new_partidas', v_new_partidas, 'measurements', v_meas);
end;
$$;
