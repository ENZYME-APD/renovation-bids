-- Spain region: settings, trades in site order, and a starter set of partidas.
-- Partida codes are our own placeholders (ES-xxx-nnn). Map them to CYPE
-- reference codes in partidas.reference_code once the price base is chosen.
-- No reference prices are seeded: they come from CYPE and our own history.

insert into public.regions (id, name, currency, settings) values
('es', 'España', 'EUR', '{
  "vat_rates": [10, 21],
  "permit_routes": ["declaracion_responsable", "licencia", "none"],
  "confidence_spread": {"high": 0.05, "medium": 0.12, "low": 0.25},
  "rfq_reminder_days": 3,
  "rfq_max_reminders": 2
}'::jsonb)
on conflict (id) do nothing;

insert into public.trades (region_id, name, sequence) values
  ('es', 'Demoliciones y desescombro',        10),
  ('es', 'Albañilería',                        20),
  ('es', 'Fontanería y saneamiento',           30),
  ('es', 'Electricidad',                       40),
  ('es', 'Climatización y ventilación',        50),
  ('es', 'Carpintería exterior',               60),
  ('es', 'Falsos techos',                      70),
  ('es', 'Revestimientos y alicatados',        80),
  ('es', 'Pavimentos',                         90),
  ('es', 'Carpintería interior',              100),
  ('es', 'Cocina',                            110),
  ('es', 'Sanitarios y grifería',             120),
  ('es', 'Pintura',                           130),
  ('es', 'Gestión de residuos y seguridad',   140),
  ('es', 'Limpieza final',                    150)
on conflict do nothing;

insert into public.partidas (region_id, code, short_description, unit, trade_id)
select 'es', v.code, v.descr, v.unit::public.unit, t.id
from (values
  ('ES-DEM-001', 'Demolición de tabique de ladrillo',              'm2', 'Demoliciones y desescombro'),
  ('ES-DEM-002', 'Levantado de pavimento cerámico',                'm2', 'Demoliciones y desescombro'),
  ('ES-DEM-003', 'Picado de alicatado en paredes',                 'm2', 'Demoliciones y desescombro'),
  ('ES-ALB-001', 'Tabique de placa de yeso laminado',              'm2', 'Albañilería'),
  ('ES-ALB-002', 'Recrecido de mortero para nivelación',           'm2', 'Albañilería'),
  ('ES-FON-001', 'Instalación de fontanería completa de baño',     'ud', 'Fontanería y saneamiento'),
  ('ES-ELE-001', 'Punto de luz o enchufe',                         'ud', 'Electricidad'),
  ('ES-ELE-002', 'Cuadro eléctrico de vivienda',                   'ud', 'Electricidad'),
  ('ES-TEC-001', 'Falso techo de placa de yeso laminado',          'm2', 'Falsos techos'),
  ('ES-REV-001', 'Alicatado cerámico en paredes',                  'm2', 'Revestimientos y alicatados'),
  ('ES-PAV-001', 'Pavimento de tarima laminada',                   'm2', 'Pavimentos'),
  ('ES-PAV-002', 'Pavimento cerámico',                             'm2', 'Pavimentos'),
  ('ES-CAR-001', 'Puerta interior de paso',                        'ud', 'Carpintería interior'),
  ('ES-PIN-001', 'Pintura plástica en paredes y techos',           'm2', 'Pintura'),
  ('ES-RES-001', 'Gestión de residuos de obra',                    'pa', 'Gestión de residuos y seguridad')
) as v(code, descr, unit, trade)
join public.trades t on t.region_id = 'es' and t.organization_id is null and t.name = v.trade
on conflict do nothing;
