-- Indexes that cover the composite (child_id, organization_id) foreign keys,
-- flagged by the Supabase performance advisor. They replace the earlier
-- single-column indexes on the same child columns.

drop index if exists public.decisions_project_id_idx;
drop index if exists public.decisions_version_id_idx;
drop index if exists public.line_items_version_id_idx;
drop index if exists public.projects_client_id_idx;
drop index if exists public.quotes_rfq_id_idx;
drop index if exists public.prices_supplier_id_idx;
drop index if exists public.prices_quote_id_idx;
drop index if exists public.rfq_line_items_line_item_id_idx;
drop index if exists public.rfqs_project_id_idx;
drop index if exists public.rfqs_supplier_id_idx;
drop index if exists public.site_visits_project_id_idx;
drop index if exists public.offers_version_id_idx;

create index decisions_project_org_idx       on public.decisions (project_id, organization_id);
create index decisions_version_org_idx       on public.decisions (version_id, organization_id);
create index line_items_version_org_idx      on public.line_items (version_id, organization_id);
create index offers_project_org_idx          on public.offers (project_id, organization_id);
create index offers_version_org_idx          on public.offers (version_id, organization_id);
create index prices_quote_org_idx            on public.prices (quote_id, organization_id);
create index prices_supplier_org_idx         on public.prices (supplier_id, organization_id);
create index prices_region_id_idx            on public.prices (region_id);
create index projects_client_org_idx         on public.projects (client_id, organization_id);
create index quotes_rfq_org_idx              on public.quotes (rfq_id, organization_id);
create index quotes_reviewed_by_idx          on public.quotes (reviewed_by);
create index rfq_line_items_line_org_idx     on public.rfq_line_items (line_item_id, organization_id);
create index rfq_line_items_rfq_org_idx      on public.rfq_line_items (rfq_id, organization_id);
create index rfqs_approved_by_idx            on public.rfqs (approved_by);
create index rfqs_project_org_idx            on public.rfqs (project_id, organization_id);
create index rfqs_supplier_org_idx           on public.rfqs (supplier_id, organization_id);
create index site_visits_project_org_idx     on public.site_visits (project_id, organization_id);
create index supplier_trades_supplier_org_idx on public.supplier_trades (supplier_id, organization_id);
create index versions_project_org_idx        on public.versions (project_id, organization_id);
