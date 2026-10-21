"""Generate lib/database.types.ts from a Postgres database with the migrations applied.

Same shape as `supabase gen types typescript` for the public schema, for when the CLI or the
live project isn't available (e.g. before a migration is deployed).

  PGHOST=... PGDATABASE=... python3 scripts/gen_types.py
"""
import json
import os
import subprocess
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "lib" / "database.types.ts"


def q(sql: str):
    out = subprocess.run(["psql", "-X", "-At", "-c", f"select coalesce(json_agg(t), '[]') from ({sql}) t"],
                         check=True, capture_output=True, text=True, env=os.environ).stdout
    return json.loads(out)


enums = q("""
  select t.typname as name, json_agg(e.enumlabel order by e.enumsortorder) as labels
  from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' group by t.typname order by t.typname""")
ENUMS = {e["name"] for e in enums}

columns = q("""
  select c.relname as rel, c.relkind as kind, a.attname as col, a.attnum as num,
         not a.attnotnull as nullable, a.atthasdef as has_default, a.attidentity <> '' as identity,
         a.attgenerated <> '' as generated, t.typname as type, et.typname as elem
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  join pg_type t on t.oid = a.atttypid
  left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
  where n.nspname = 'public' and c.relkind in ('r', 'v')
  order by c.relname, a.attname""")

fks = q("""
  select c.conname as name, rel.relname as rel, ref.relname as ref,
         (select json_agg(a.attname order by k.ord) from unnest(c.conkey) with ordinality k(n, ord)
            join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n) as cols,
         (select json_agg(a.attname order by k.ord) from unnest(c.confkey) with ordinality k(n, ord)
            join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.n) as refcols
  from pg_constraint c join pg_class rel on rel.oid = c.conrelid join pg_class ref on ref.oid = c.confrelid
  join pg_namespace n on n.oid = rel.relnamespace join pg_namespace rn on rn.oid = ref.relnamespace
  where c.contype = 'f' and n.nspname = 'public' and rn.nspname = 'public'
  order by rel.relname, c.conname""")

functions = q("""
  select p.proname as name, p.proretset as setof, rt.typname as rettype,
         coalesce(p.proargnames, '{}') as argnames, coalesce(p.proargmodes::text[], '{}') as argmodes,
         (select json_agg(t.typname order by k.ord) from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality k(oid, ord)
            join pg_type t on t.oid = k.oid) as argtypes,
         p.pronargdefaults as ndefaults, p.pronargs as nargs
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type rt on rt.oid = p.prorettype
  where n.nspname = 'public' and p.prokind = 'f' and rt.typname <> 'trigger'
  order by p.proname""")


def ts(typ: str, elem: str | None = None) -> str:
    if elem:
        return f"{ts(elem)}[]"
    if typ in ENUMS:
        return f'Database["public"]["Enums"]["{typ}"]'
    if typ in ("int2", "int4", "int8", "numeric", "float4", "float8"):
        return "number"
    if typ == "bool":
        return "boolean"
    if typ in ("json", "jsonb"):
        return "Json"
    if typ in ("void",):
        return "undefined"
    return "string"


def block(lines, indent):
    return "\n".join(" " * indent + l for l in lines)


rels: dict[str, dict] = {}
for c in columns:
    r = rels.setdefault(c["rel"], {"kind": c["kind"], "cols": []})
    r["cols"].append(c)

out = ["export type Json =", "  | string", "  | number", "  | boolean", "  | null",
       "  | { [key: string]: Json | undefined }", "  | Json[]", "",
       "export type Database = {",
       "  // Allows to automatically instantiate createClient with right options",
       "  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)",
       "  __InternalSupabase: {", '    PostgrestVersion: "14.18"', "  }", "  public: {", "    Tables: {"]


def relationships(rel):
    lines = ["Relationships: ["]
    for fk in [f for f in fks if f["rel"] == rel]:
        lines += ["  {", f'    foreignKeyName: "{fk["name"]}"', f'    columns: {json.dumps(fk["cols"])}',
                  "    isOneToOne: false", f'    referencedRelation: "{fk["ref"]}"',
                  f'    referencedColumns: {json.dumps(fk["refcols"])}', "  },"]
    lines.append("]")
    return lines


for name in sorted(r for r, v in rels.items() if v["kind"] == "r"):
    cols = rels[name]["cols"]
    row = [f'{c["col"]}: {ts(c["type"], c["elem"])}{" | null" if c["nullable"] else ""}' for c in cols]
    ins, upd = [], []
    for c in cols:
        t = ts(c["type"], c["elem"]) + (" | null" if c["nullable"] else "")
        if c["generated"]:
            ins.append(f'{c["col"]}?: never'); upd.append(f'{c["col"]}?: never')
            continue
        opt = c["nullable"] or c["has_default"] or c["identity"]
        ins.append(f'{c["col"]}{"?" if opt else ""}: {t}')
        upd.append(f'{c["col"]}?: {t}')
    out.append(f"      {name}: {{")
    out.append("        Row: {"); out.append(block(row, 10)); out.append("        }")
    out.append("        Insert: {"); out.append(block(ins, 10)); out.append("        }")
    out.append("        Update: {"); out.append(block(upd, 10)); out.append("        }")
    out.append(block(relationships(name), 8))
    out.append("      }")
out.append("    }")

out.append("    Views: {")
for name in sorted(r for r, v in rels.items() if v["kind"] == "v"):
    row = [f'{c["col"]}: {ts(c["type"], c["elem"])} | null' for c in rels[name]["cols"]]
    out.append(f"      {name}: {{")
    out.append("        Row: {"); out.append(block(row, 10)); out.append("        }")
    out.append("        Relationships: []")
    out.append("      }")
out.append("    }")

out.append("    Functions: {")
for f in functions:
    names, modes, types = f["argnames"], f["argmodes"], f["argtypes"] or []
    if not modes:
        modes = ["i"] * len(types)
    ins = [(n, t) for n, m, t in zip(names, modes, types) if m in ("i", "b")]
    outs = [(n, t) for n, m, t in zip(names, modes, types) if m in ("o", "b", "t")]
    first_default = len(ins) - f["ndefaults"]
    args = [f'{n}{"?" if i >= first_default else ""}: {ts(t)}' for i, (n, t) in enumerate(ins)]
    out.append(f'      {f["name"]}: {{')
    out.append(f'        Args: {{ {"; ".join(sorted(args))} }}' if args else "        Args: never")
    if outs:
        out.append("        Returns: {")
        out.append(block([f"{n}: {ts(t)}" for n, t in sorted(outs)], 10))
        out.append("        }[]")
    elif f["rettype"] in {c["rel"] for c in columns if c["kind"] == "r"}:
        # setof <table>: rows of that table, embeddable like the table itself
        out.append(f'        Returns: Database["public"]["Tables"]["{f["rettype"]}"]["Row"]{"[]" if f["setof"] else ""}')
        out.append(f'        SetofOptions: {{ from: "*"; to: "{f["rettype"]}"; isOneToOne: {"false" if f["setof"] else "true"}; isSetofReturn: {"true" if f["setof"] else "false"} }}')
    else:
        out.append(f'        Returns: {ts(f["rettype"])}{"[]" if f["setof"] else ""}')
    out.append("      }")
out.append("    }")

out.append("    Enums: {")
for e in enums:
    out.append(f'      {e["name"]}: {" | ".join(json.dumps(l) for l in e["labels"])}')
out.append("    }")
out += ["    CompositeTypes: {", "      [_ in never]: never", "    }", "  }", "}", ""]

existing = OUT.read_text()
helpers = existing[existing.index("type DatabaseWithoutInternals"):existing.index("export const Constants")]
out.append(helpers.rstrip() + "\n")
out.append("export const Constants = {\n  public: {\n    Enums: {")
for e in enums:
    out.append(f'      {e["name"]}: {json.dumps(e["labels"])},')
out.append("    },\n  },\n} as const\n")

OUT.write_text("\n".join(out))
print(OUT, len(rels), "relations", len(functions), "functions")
