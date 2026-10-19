"""Enzyme standard partida catalogue for residential renovation in Spain.

Single source of truth. `build.py` turns this into:
  - catalogue/out/Enzyme_catalogo_partidas_ES.xlsx
  - a Supabase migration (shared Spain catalogue + room templates)
  - an Enzyme price import (prices are Enzyme's own, not shared)

Rules
  * Chapters follow the CYPE "Generador de Precios — Rehabilitación" chapter
    letters (cype); Enzyme chapters split them by trade (gremio).
  * One code = one unit-price item. Codes never change meaning; a new spec gets
    a new code. Steps of 10 leave room to insert.
  * Bid stage: every item is all-in (supply + fit) at the Enzyme standard spec.
    Owner-supplied items are handled by quantity/notes, not by options.
  * Prices: € excl. IVA, from the Ortega y Gasset 47 pre-contract estimate
    (P26018, REV 2) where one exists. `basis` shows how. None = to be priced.
"""

OG47 = "OG47"  # Ortega y Gasset 47 · P26018 · REV 2 (pre-contract estimate)

CHAPTERS = [
    # code, name, CYPE chapter letter, sequence
    ("PRE", "Actuaciones previas y medios auxiliares", "0", 10),
    ("DEM", "Demoliciones y desmontajes", "D", 20),
    ("TAB", "Tabiquería y trasdosados", "F", 30),
    ("TEC", "Falsos techos y molduras", "R", 40),
    ("IMP", "Aislamientos e impermeabilizaciones", "N", 50),
    ("REV", "Revestimientos de paredes", "R", 60),
    ("PAV", "Pavimentos y rodapiés", "R", 70),
    ("CEX", "Carpintería exterior y protecciones solares", "L", 80),
    ("CIN", "Carpintería interior y mobiliario a medida", "L", 90),
    ("FON", "Fontanería y saneamiento", "I", 100),
    ("SAN", "Sanitarios, grifería y equipamiento de baño", "I", 110),
    ("COC", "Cocina", "S", 120),
    ("ELE", "Electricidad y telecomunicaciones", "I", 130),
    ("ILU", "Iluminación", "I", 140),
    ("CLI", "Climatización, calefacción y ventilación", "I", 150),
    ("PIN", "Pintura", "R", 160),
    ("AYU", "Remates y ayudas", "H", 170),
    ("RES", "Gestión de residuos", "G", 180),
    ("SYS", "Seguridad y salud", "Y", 190),
    ("LIM", "Limpieza y entrega", "H", 200),
]

# code, unit, short description, specification (Enzyme standard), price, basis
P = lambda code, unit, short, spec, price=None, basis="": dict(  # noqa: E731
    code=code, unit=unit, short=short, spec=spec, price=price, basis=basis
)

PARTIDAS = [
    # ── PRE ──────────────────────────────────────────────────────────────
    P("PRE-010", "pa", "Protección de zonas comunes y elementos que se conservan",
      "Protección de portal, ascensor, rellanos, carpinterías y pavimentos que se conservan durante toda la obra, con retirada al final.",
      None, f"{OG47} LFO1 la incluye junto a la limpieza final (ver LIM-010)"),
    P("PRE-020", "pa", "Comunicación a la comunidad y gestión de ascensor/montacargas",
      "Aviso a la comunidad de propietarios, horarios de obra, reserva y protección de ascensor o montacargas para acopios."),
    P("PRE-030", "pa", "Medios de elevación para carpintería exterior",
      "Plataforma elevadora, grúa o medio equivalente para subida de carpinterías y vidrios que no caben por escalera o ascensor, incluso permisos de vía pública."),
    P("PRE-040", "pa", "Gestión de licencia o declaración responsable",
      "Tramitación ante el ayuntamiento de la licencia o declaración responsable que corresponda. Tasas e ICIO a cargo de la propiedad, fuera de esta partida."),

    # ── DEM ──────────────────────────────────────────────────────────────
    P("DEM-010", "pa", "Desmontaje de mobiliario existente",
      "Desmontaje de armarios, muebles de cocina y baño y estanterías, con carga y transporte a contenedor de lo no reutilizable.",
      500, f"{OG47} DMC1"),
    P("DEM-020", "ud", "Desmontaje de carpintería exterior",
      "Desmontaje de hoja y marco de ventana o balconera existente, con retirada a contenedor y hueco preparado para la nueva carpintería.",
      32, f"{OG47} DCE1"),
    P("DEM-030", "m2", "Ajuste de hueco en fachada (ampliación o reducción)",
      "Demolición puntual de fábrica para modificar un hueco, repicado, corte de jambas, recibido y enfoscado de mochetas. Medición por m² de hueco intervenido.",
      24, f"{OG47} DFHV"),
    P("DEM-040", "m2", "Demolición de tabique de placa de yeso laminado",
      "Demolición de tabique de PYL incluida perfilería y aislamiento, con carga a contenedor.",
      16, f"{OG47} (sin código)"),
    P("DEM-050", "m2", "Demolición de tabique de ladrillo",
      "Demolición de tabique de ladrillo hueco con revestimientos, con carga a contenedor."),
    P("DEM-060", "m2", "Demolición de falso techo de PYL o escayola",
      "Demolición de falso techo incluida estructura de cuelgue, con carga a contenedor.",
      10, f"{OG47} (sin código)"),
    P("DEM-070", "ud", "Desmontaje de radiador",
      "Desmontaje de radiador, vaciado y purgado del circuito y taponado de tomas.",
      60, f"{OG47} DRAD"),
    P("DEM-080", "m2", "Levantado de pavimento de madera, laminado o vinílico",
      "Levantado de tarima, parquet, laminado o vinílico con rastreles y adhesivos, con carga a contenedor.",
      18, f"{OG47} LS"),
    P("DEM-090", "m2", "Picado de alicatado y solado cerámico",
      "Picado de revestimiento cerámico en paredes y suelos hasta soporte, con carga a contenedor.",
      28, f"{OG47} LS (picado)"),
    P("DEM-100", "ud", "Desmontaje de aparato sanitario o grifería",
      "Desmontaje de inodoro, lavabo, bañera, plato o grifería, con anulación de tomas y retirada."),
    P("DEM-110", "ud", "Desmontaje de puerta interior",
      "Desmontaje de hoja, cerco y tapajuntas de puerta interior, con retirada."),
    P("DEM-120", "pa", "Levantado de instalaciones existentes",
      "Levantado de instalación eléctrica, fontanería y calefacción que se sustituyen, con retirada."),

    # ── TAB ──────────────────────────────────────────────────────────────
    P("TAB-010", "m2", "Tabique PYL 2 placas por cara con aislamiento",
      "Tabique de placa de yeso laminado sobre perfilería de 70 mm, 2 placas por cara (hidrófuga en zonas húmedas), lana mineral, juntas tratadas listo para pintar.",
      60, f"{OG47} TP2PA"),
    P("TAB-020", "m2", "Trasdosado PYL 1 placa sobre perfilería con aislamiento",
      "Trasdosado de una placa sobre perfilería autoportante con lana mineral, juntas tratadas.",
      40, f"{OG47} TA"),
    P("TAB-030", "m2", "Trasdosado PYL 1 placa directo",
      "Trasdosado directo de placa adherida al paramento con pasta de agarre, juntas tratadas.",
      30, f"{OG47} TA (pegado)"),

    # ── TEC ──────────────────────────────────────────────────────────────
    P("TEC-010", "m2", "Falso techo continuo PYL",
      "Falso techo continuo de placa de yeso laminado tipo N sobre estructura metálica, juntas tratadas listo para pintar.",
      30, f"{OG47} FTYN"),
    P("TEC-020", "m2", "Falso techo continuo PYL hidrófugo",
      "Falso techo continuo de placa hidrófuga en baños, aseos, cocina y lavandería.",
      32, f"{OG47} FTWA"),
    P("TEC-030", "m", "Candileja o foseado perimetral para LED",
      "Cajeado perimetral en falso techo para tira LED (suministro en ILU), juntas tratadas.",
      40, f"{OG47} CP1"),
    P("TEC-040", "m", "Moldura decorativa de escayola",
      "Suministro y colocación de moldura de escayola techo-pared, ingletes y juntas, lista para pintar. Modelo estándar.",
      20, f"{OG47} ESC S 10 + ESC I 10"),
    P("TEC-050", "ud", "Registro en falso techo",
      "Trampilla de registro de PYL para acceso a instalaciones."),

    # ── IMP ──────────────────────────────────────────────────────────────
    P("IMP-010", "m2", "Impermeabilización de suelo en zona húmeda",
      "Membrana impermeabilizante bajo solado en baños, aseos y lavandería, con banda perimetral y remate en encuentros."),
    P("IMP-020", "ud", "Desagüe lineal y manta impermeable para ducha de obra",
      "Canaleta de desagüe lineal y manta impermeabilizante para ducha a nivel de suelo, suministro e instalación.",
      340, f"{OG47} IDD 180 + IDD 160"),
    P("IMP-030", "m2", "Lámina anti-impacto bajo pavimento",
      "Lámina acústica de polietileno reticulado bajo recrecido o pavimento flotante."),

    # ── REV ──────────────────────────────────────────────────────────────
    P("REV-010", "m2", "Alicatado de gres porcelánico",
      "Suministro (gama estándar Enzyme) y colocación con adhesivo C2 y doble encolado, rejuntado, cortes e ingletes. Incluye 10 % de desperdicio.",
      90, f"{OG47} PCA 40 + PS 45 × 43/38,9 m² = 89,7"),
    P("REV-020", "m2", "Enlucido o alisado de paredes",
      "Regularización de paramentos tras demoliciones con guarnecido y enlucido de yeso o alisado, listo para pintar."),
    P("REV-030", "m", "Moldura de pared tipo boiserie",
      "Suministro y colocación de moldura de PVC o HDPS sobre pared lisa formando paños, lista para pintar.",
      20, f"{OG47} PM 10 + PM 10"),
    P("REV-040", "m2", "Espejo decorativo en pared",
      "Suministro y colocación de espejo con adhesivo específico y canteado de bordes.",
      80, f"{OG47} OTRO5 (espejos salón)"),
    P("REV-050", "m", "Viga decorativa imitación madera",
      "Suministro y colocación de viga decorativa imitación madera con foseado y remates.",
      95, f"{OG47} OTRO5 (vigas)"),

    # ── PAV ──────────────────────────────────────────────────────────────
    P("PAV-010", "m2", "Recrecido de mortero autonivelante",
      "Recrecido con mortero autonivelante para regularizar el soporte, espesor según obra.",
      30, f"{OG47} OTRO1"),
    P("PAV-020", "m2", "Solado de gres porcelánico",
      "Suministro (gama estándar Enzyme) y colocación con adhesivo C2, rejuntado y cortes. Incluye 10 % de desperdicio.",
      86, f"{OG47} PCS 35 + PS 45 × 12/10,5 m² = 86,4"),
    P("PAV-030", "m2", "Suelo laminado flotante",
      "Suministro (gama estándar Enzyme, AC4) y colocación flotante sobre lámina, remates y juntas de dilatación. Incluye 10 % de desperdicio.",
      78, f"{OG47} PS B 50 × 85/79 m² + PCS 24 = 77,8 (en espiga húngara)"),
    P("PAV-040", "m2", "Tarima de madera natural",
      "Suministro e instalación por instalador especializado de tarima de madera natural, acabado barnizado o aceitado.",
      120, f"{OG47} PS A"),
    P("PAV-050", "m2", "Suelo vinílico SPC",
      "Suministro y colocación de suelo vinílico SPC con sistema click.",
      54, f"{OG47} PS C 30 + PCS 24"),
    P("PAV-060", "m", "Rodapié lacado blanco 20 cm",
      "Suministro y colocación de rodapié blanco de 20 cm con adhesivo y/o clavado, juntas selladas.",
      18.75, f"{OG47} PRE 10,75 + PCR 8"),

    # ── CEX ──────────────────────────────────────────────────────────────
    P("CEX-010", "ud", "Ventana de aluminio con rotura de puente térmico",
      "Suministro y colocación de ventana de aluminio RPT, oscilobatiente, acabado blanco, doble acristalamiento bajo emisivo, herrajes, recibido y sellado. Tamaño medio de vivienda.",
      1052, f"{OG47} OTRO2 A 9.470 € / 9 ventanas"),
    P("CEX-020", "ud", "Ventana de PVC",
      "Suministro y colocación de ventana de PVC, oscilobatiente, blanco, doble acristalamiento bajo emisivo, herrajes, recibido y sellado. Tamaño medio de vivienda.",
      722, f"{OG47} OTRO2 B 6.495 € / 9 ventanas"),
    P("CEX-030", "ud", "Persiana enrollable motorizada con cajón",
      "Persiana de aluminio con cajón compacto o rehabilitación del existente, motor y mando."),
    P("CEX-040", "ud", "Puerta de entrada blindada",
      "Suministro y colocación de puerta de entrada blindada con cerradura de seguridad, acabado interior a juego con carpintería."),

    # ── CIN ──────────────────────────────────────────────────────────────
    P("CIN-010", "ud", "Puerta de paso abatible, altura estándar",
      "Suministro y colocación de puerta lacada blanca de 203 cm con precerco, cerco, tapajuntas, herrajes y manilla estándar.",
      495, f"{OG47} PIA1 A 295 + PCM1 50 + CPIA 150"),
    P("CIN-020", "ud", "Puerta de paso abatible, gran altura",
      "Como CIN-010 con hoja de 260 cm.",
      1160, f"{OG47} PIA1 B 960 + PCM1 50 + CPIA 150"),
    P("CIN-030", "ud", "Puerta corredera con casoneto",
      "Suministro y montaje de puerta corredera con casoneto empotrado en tabique, guía, herrajes, tapajuntas y manivela embutida.",
      420, f"{OG47} PCST1"),
    P("CIN-040", "m2", "Armario empotrado de suelo a techo",
      "Suministro y montaje de armario con interior de barras y cajoneras, LED interior y puertas lacadas. Medición por m² de frente.",
      450, f"{OG47} AE"),
    P("CIN-050", "m2", "Estantería o librería a medida",
      "Suministro y montaje de estantería a medida con iluminación LED. Medición por m² de frente.",
      450, f"{OG47} AE (estantería)"),
    P("CIN-060", "m2", "Mueble de lavandería",
      "Suministro y montaje de mueble torre para lavadora y secadora con accesorios. Medición por m² de frente.",
      320, f"{OG47} MA (lavandería)"),

    # ── FON ──────────────────────────────────────────────────────────────
    P("FON-010", "ud", "Punto de agua fría y caliente",
      "Red de fontanería en multicapa hasta punto de consumo, con rozas. El inodoro cuenta como medio punto.",
      120, f"{OG47} FIF1"),
    P("FON-020", "ud", "Punto de desagüe",
      "Red de saneamiento en PVC serie B desde aparato hasta bajante, con rozas y pendientes según CTE DB-HS5.",
      60, f"{OG47} FRS"),
    P("FON-030", "ud", "Bote sifónico",
      "Bote sifónico registrable empotrado, conexiones y tapa.",
      75, f"{OG47} FBS"),
    P("FON-040", "ud", "Llave de corte por estancia húmeda",
      "Llaves de corte de agua fría y caliente en cada baño, aseo y cocina."),
    P("FON-050", "pa", "Pruebas de presión y estanqueidad",
      "Pruebas de la red de fontanería y saneamiento con acta."),

    # ── SAN ──────────────────────────────────────────────────────────────
    P("SAN-010", "ud", "Plato de ducha",
      "Suministro (resina o porcelánico, gama estándar Enzyme) e instalación nivelada con conexión a desagüe.",
      640, f"{OG47} PD 550 + IPD 90 (plato 80×200)"),
    P("SAN-020", "ud", "Bañera",
      "Suministro (acrílica 160×70, gama estándar Enzyme) e instalación nivelada con conexiones.",
      850, f"{OG47} FB 700 + FIB 150"),
    P("SAN-030", "ud", "Inodoro suspendido con bastidor",
      "Suministro de inodoro suspendido (tipo Roca Meridian o similar) y bastidor con cisterna empotrada, montaje y pulsador.",
      850, f"{OG47} FIS 650 + IIS 200"),
    P("SAN-040", "ud", "Mueble de baño con lavabo",
      "Suministro de mueble de 60–80 cm con lavabo integrado (gama estándar Enzyme) y montaje.",
      420, f"{OG47} MA 300 + IMB 120"),
    P("SAN-050", "ud", "Grifería de lavabo",
      "Suministro de grifo monomando (gama estándar Enzyme) e instalación.",
      255, f"{OG47} GB 200 + IGL 55"),
    P("SAN-060", "ud", "Grifería termostática de ducha o bañera",
      "Suministro de conjunto termostático con rociador (gama estándar Enzyme) e instalación.",
      255, f"{OG47} GB 200 + IGD 55"),
    P("SAN-070", "ud", "Mampara fija de ducha",
      "Suministro de panel fijo de vidrio templado de 120–130 cm e instalación con perfilería y sellado.",
      420, f"{OG47} FM 300 + IM 120"),
    P("SAN-080", "ud", "Mampara de bañera",
      "Suministro de mampara lateral de vidrio templado para bañera e instalación.",
      320, f"{OG47} FM 200 + IM 120"),
    P("SAN-090", "m2", "Espejo de baño a medida",
      "Suministro y colocación de espejo con canteado y fijación oculta.",
      70, f"{OG47} FE"),
    P("SAN-100", "ud", "Toallero eléctrico",
      "Suministro de toallero eléctrico (gama estándar Enzyme) y conexión.",
      250, f"{OG47} ITE BS 200 + ITE 50"),
    P("SAN-110", "ud", "Toallero-radiador de agua",
      "Suministro de toallero-radiador y conexión a la calefacción (2 puntos), purgado.",
      None, f"{OG47} IRA: solo instalación 180 €"),
    P("SAN-120", "ud", "Juego de accesorios de baño",
      "Portarrollos, toallero de lavabo y percha (gama estándar Enzyme), suministro y colocación."),

    # ── COC ──────────────────────────────────────────────────────────────
    P("COC-010", "m", "Mobiliario de cocina con encimera",
      "Suministro y montaje de muebles bajos y altos (gama estándar Enzyme) con encimera de porcelánico o compacto. Medición por metro lineal de frente.",
      None, f"{OG47}: lo compró la propiedad"),
    P("COC-020", "pa", "Montaje de cocina suministrada por la propiedad",
      "Montaje de muebles, encimera y fregadero suministrados por la propiedad."),
    P("COC-030", "pa", "Conexión de electrodomésticos y fregadero",
      "Conexión de fregadero, lavavajillas, placa, horno, campana y frigorífico a sus instalaciones."),

    # ── ELE ──────────────────────────────────────────────────────────────
    P("ELE-010", "pa", "Instalación eléctrica: cuadro, circuitos y boletín",
      "Adecuación a REBT: cuadro nuevo con protecciones, circuitos independientes por usos, cableado y tubos, cajas, certificado de instalación (CIE).",
      2850, f"{OG47} E-AIE"),
    P("ELE-020", "ud", "Punto de luz sencillo",
      "Un interruptor y un punto de luz, cableado y mecanismo de gama estándar.",
      50, f"{OG47} regla 35 €/mecanismo + 15 € primer punto"),
    P("ELE-030", "ud", "Punto de luz adicional en el mismo circuito",
      "Punto de luz adicional gobernado por un mecanismo ya contado.",
      10, f"{OG47} regla 10 €/punto adicional"),
    P("ELE-040", "ud", "Punto de luz conmutado",
      "Dos conmutadores y un punto de luz.",
      85, f"{OG47} regla 35 + 35 + 15"),
    P("ELE-050", "ud", "Punto de luz de cruce",
      "Dos conmutadores, un cruzamiento y un punto de luz.",
      120, f"{OG47} regla 35 + 35 + 35 + 15"),
    P("ELE-060", "ud", "Toma de corriente",
      "Base de enchufe 16 A con cableado y mecanismo de gama estándar.",
      45, f"{OG47} E-TC"),
    P("ELE-070", "ud", "Toma de corriente con cargador USB-C",
      "Base de enchufe con cargador USB-C integrado.",
      90, f"{OG47} E-TC (USB-C)"),
    P("ELE-080", "ud", "Toma de TV o datos",
      "Toma de TV o RJ45 con canalización desde registro.",
      45, f"{OG47} E-TC (TV/datos)"),
    P("ELE-090", "ud", "Toma para electrodoméstico",
      "Toma en circuito específico para horno, placa, lavadora, lavavajillas o secadora.",
      45, f"{OG47} E-TC (electrodomésticos)"),
    P("ELE-100", "ud", "Mecanismo de persiana motorizada",
      "Interruptor de subida y bajada para motor de persiana, con cableado.",
      45, f"{OG47} E-IP"),
    P("ELE-110", "ud", "Timbre",
      "Pulsador y zumbador con cableado.",
      65, f"{OG47} E-ZT"),
    P("ELE-120", "ud", "Videoportero, terminal interior",
      "Sustitución o reubicación del terminal interior compatible con la instalación del edificio."),
    P("ELE-130", "ud", "Detector de humo autónomo",
      "Detector óptico autónomo con batería, colocado en techo."),

    # ── ILU ──────────────────────────────────────────────────────────────
    P("ILU-010", "ud", "Aplique de pared",
      "Suministro de aplique (gama estándar Enzyme) e instalación.",
      None, f"{OG47} I-IAP: solo instalación 35 €"),
    P("ILU-020", "ud", "Downlight LED empotrado",
      "Suministro de downlight LED orientable GU10 e instalación con apertura de hueco en falso techo.",
      42, f"{OG47} L-FLO 22 + I-FL 20"),
    P("ILU-030", "m", "Tira LED con perfil",
      "Suministro de tira LED con perfil de aluminio, difusor y driver, e instalación.",
      35, f"{OG47} L-L 20 + I-TL 15"),
    P("ILU-040", "ud", "Baliza empotrada de pared",
      "Suministro de baliza tipo ojo de buey e instalación.",
      50, f"{OG47} L-AP 15 + I-IAP 35"),

    # ── CLI ──────────────────────────────────────────────────────────────
    P("CLI-010", "pa", "Adaptación de calefacción por radiadores",
      "Adaptación del circuito a la nueva distribución, radiadores, purgado, prueba y puesta en marcha. Referencia 30 € por elemento de radiador.",
      4200, f"{OG47} calefacción (91 m²)"),
    P("CLI-020", "ud", "Aire acondicionado multisplit 3×1",
      "Unidad exterior y tres splits, líneas frigoríficas, condensados, conexión y puesta en marcha.",
      3400, f"{OG47} aire acondicionado"),
    P("CLI-030", "ud", "Extractor con conducto",
      "Extractor en baño, aseo, lavandería o cocina conectado a conducto, con temporizador.",
      115, f"{OG47} IEB"),
    P("CLI-040", "ud", "Conducto de campana extractora",
      "Conducto de evacuación de campana hasta shunt o fachada, con rejilla y antirretorno."),

    # ── PIN ──────────────────────────────────────────────────────────────
    P("PIN-010", "m2", "Pintura plástica lisa en paredes",
      "Lijado, plastecido y 2–3 manos de pintura plástica lisa mate (blanco o color estándar).",
      9, f"{OG47} P-PVI"),
    P("PIN-020", "m2", "Pintura plástica lisa en techos",
      "Lijado, plastecido y 2–3 manos de pintura plástica lisa mate blanca, sin marcas de juntas.",
      9, f"{OG47} P-PHI"),
    P("PIN-030", "ud", "Lacado de puerta o radiador existente",
      "Lijado, imprimación y lacado de elemento existente que se conserva."),

    # ── AYU ──────────────────────────────────────────────────────────────
    P("AYU-010", "pa", "Ayudas de albañilería a instalaciones",
      "Rozas, pasos, recibido de cajas y cercos, remates y acarreo a contenedor durante toda la obra.",
      2000, f"{OG47} AT1 (91 m²)"),

    # ── RES ──────────────────────────────────────────────────────────────
    P("RES-010", "ud", "Contenedor de escombros",
      "Suministro, cambio y retirada de contenedor de RCD a gestor autorizado.",
      254, f"{OG47} TP-CON"),
    P("RES-020", "pa", "Gestión documental de residuos",
      "Estudio de gestión de residuos y certificados del gestor, según exija la licencia."),

    # ── SYS ──────────────────────────────────────────────────────────────
    P("SYS-010", "pa", "Seguridad y salud",
      "Protecciones colectivas, EPIs, señalización y botiquín durante la obra."),

    # ── LIM ──────────────────────────────────────────────────────────────
    P("LIM-010", "pa", "Limpieza de fin de obra",
      "Limpieza general de todas las estancias y retirada de protecciones.",
      650, f"{OG47} LFO1 (incluía también las protecciones de PRE-010)"),
]

# Room templates. Quantity = factor × size + fixed.
# size is the room's floor area in m² unless size_label says otherwise.
# Factors marked OG47 are measured on that job; the rest are proposed defaults
# to calibrate on the next 2–3 jobs.
T = lambda code, name, size_label, description, lines: dict(  # noqa: E731
    code=code, name=name, size_label=size_label, description=description, lines=lines
)
L = lambda partida, factor=0.0, fixed=0.0, note="": dict(  # noqa: E731
    partida=partida, factor=factor, fixed=fixed, note=note
)

TEMPLATES = [
    T("GEN", "Partidas generales de la vivienda", "m² útiles de vivienda",
      "Una vez por obra: preliminares, cuadro eléctrico, ayudas, residuos, seguridad y limpieza.",
      [
          L("PRE-010", fixed=1), L("PRE-020", fixed=1), L("PRE-040", fixed=1),
          L("DEM-010", fixed=1), L("DEM-120", fixed=1),
          L("ELE-010", fixed=1), L("ELE-110", fixed=1), L("ELE-130", fixed=2),
          L("AYU-010", fixed=1),
          L("RES-010", factor=0.044, note="OG47: 4 contenedores / 91 m²"),
          L("RES-020", fixed=1), L("SYS-010", fixed=1), L("LIM-010", fixed=1),
      ]),
    T("DOR", "Dormitorio", "m² de suelo",
      "Suelo laminado, techo de PYL, pintura y electricidad estándar.",
      [
          L("PAV-030", factor=1.0), L("PAV-060", factor=0.9, note="OG47: 80 m / 91 m²"),
          L("TEC-010", factor=1.0), L("PIN-010", factor=2.4, note="OG47: 220 m² / 91 m²"),
          L("PIN-020", factor=1.0),
          L("ELE-040", fixed=1), L("ELE-030", fixed=1), L("ELE-020", fixed=1),
          L("ELE-060", fixed=4), L("CIN-010", fixed=1),
      ]),
    T("SAL", "Salón-comedor", "m² de suelo",
      "Suelo laminado, techo de PYL, pintura, electricidad y tomas de TV y datos.",
      [
          L("PAV-030", factor=1.0), L("PAV-060", factor=0.9), L("TEC-010", factor=1.0),
          L("PIN-010", factor=2.4), L("PIN-020", factor=1.0),
          L("ELE-050", fixed=1), L("ELE-040", fixed=2), L("ELE-030", fixed=4),
          L("ELE-060", fixed=8), L("ELE-080", fixed=2),
      ]),
    T("PAS", "Pasillo o hall", "m² de suelo",
      "Suelo laminado, techo de PYL, pintura y electricidad. Más pared por m² que una estancia.",
      [
          L("PAV-030", factor=1.0), L("PAV-060", factor=1.6), L("TEC-010", factor=1.0),
          L("PIN-010", factor=3.5), L("PIN-020", factor=1.0),
          L("ELE-040", fixed=1), L("ELE-030", fixed=1), L("ELE-060", fixed=2),
      ]),
    T("BAN", "Baño completo con ducha", "m² de suelo",
      "Ducha con plato y mampara fija, inodoro suspendido, mueble con lavabo, alicatado hasta techo.",
      [
          L("IMP-010", factor=1.0), L("PAV-020", factor=1.0),
          L("REV-010", factor=3.7, note="OG47: 38,9 m² alicatado / 10,5 m² suelo húmedo"),
          L("TEC-020", factor=1.0), L("PIN-020", factor=1.0),
          L("FON-010", fixed=4.5, note="lavabo 2 + ducha 2 + inodoro 0,5"),
          L("FON-020", fixed=3), L("FON-030", fixed=1), L("FON-040", fixed=1),
          L("SAN-010", fixed=1), L("SAN-030", fixed=1), L("SAN-040", fixed=1),
          L("SAN-050", fixed=1), L("SAN-060", fixed=1), L("SAN-070", fixed=1),
          L("SAN-090", fixed=0.8), L("SAN-100", fixed=1), L("SAN-120", fixed=1),
          L("ELE-020", fixed=1), L("ELE-030", fixed=1), L("ELE-060", fixed=2),
          L("CLI-030", fixed=1), L("CIN-010", fixed=1),
      ]),
    T("ASE", "Aseo", "m² de suelo",
      "Inodoro suspendido y mueble con lavabo, alicatado hasta techo.",
      [
          L("IMP-010", factor=1.0), L("PAV-020", factor=1.0), L("REV-010", factor=3.7),
          L("TEC-020", factor=1.0), L("PIN-020", factor=1.0),
          L("FON-010", fixed=2.5), L("FON-020", fixed=2), L("FON-040", fixed=1),
          L("SAN-030", fixed=1), L("SAN-040", fixed=1), L("SAN-050", fixed=1),
          L("SAN-090", fixed=0.5), L("SAN-120", fixed=1),
          L("ELE-020", fixed=1), L("ELE-060", fixed=1), L("CLI-030", fixed=1),
          L("CIN-010", fixed=1),
      ]),
    T("COC", "Cocina", "m² de suelo",
      "Solado porcelánico, frente alicatado, instalaciones y conexiones. Muebles por metro lineal aparte (COC-010).",
      [
          L("PAV-020", factor=1.0), L("REV-010", factor=0.6), L("TEC-020", factor=1.0),
          L("PIN-010", factor=1.6), L("PIN-020", factor=1.0),
          L("FON-010", fixed=3), L("FON-020", fixed=2), L("FON-040", fixed=1),
          L("ELE-090", fixed=5), L("ELE-060", fixed=4), L("ELE-040", fixed=1), L("ELE-030", fixed=2),
          L("CLI-040", fixed=1), L("COC-030", fixed=1),
      ]),
    T("LAV", "Lavandería", "m² de suelo",
      "Solado porcelánico, tomas de lavadora y secadora, extracción.",
      [
          L("IMP-010", factor=1.0), L("PAV-020", factor=1.0), L("TEC-020", factor=1.0),
          L("PIN-010", factor=2.4), L("PIN-020", factor=1.0),
          L("FON-010", fixed=2), L("FON-020", fixed=1),
          L("ELE-020", fixed=1), L("ELE-090", fixed=2), L("ELE-060", fixed=1), L("CLI-030", fixed=1),
          L("CIN-030", fixed=1),
      ]),
    T("VEN", "Sustitución de ventanas", "número de ventanas",
      "Desmontaje y ventana nueva de aluminio RPT por unidad, con medio de elevación.",
      [
          L("DEM-020", factor=1.0), L("CEX-010", factor=1.0), L("PRE-030", fixed=1),
      ]),
    T("DBA", "Demolición de baño o cocina existente", "m² de suelo",
      "Picado de paredes y suelo cerámico y desmontaje de aparatos.",
      [
          L("DEM-090", factor=4.7, note="paredes (≈3,7×) + suelo (1×)"),
          L("DEM-100", fixed=3),
      ]),
]

# Layout and design items are added by hand, not by templates: partitions
# (TAB), demolition of partitions and ceilings, wardrobes and bespoke joinery
# (CIN-040/050/060), heating and air conditioning (CLI-010/020), mouldings.

# Ortega y Gasset 47 lines not carried over as catalogue items, and why.
OG47_EXCLUDED = [
    ("Servicios de arquitectura + dirección de obra", "Honorarios de Enzyme: van en el Fee Calculator, no en el presupuesto de obra."),
    ("OTRO3 Mobiliario de cocina (propiedad)", "Sustituido por COC-010 (suministro Enzyme) o COC-020 (montaje de lo que aporta la propiedad)."),
    ("OTRO4 Electrodomésticos (propiedad)", "Fuera del presupuesto de obra; conexión en COC-030."),
    ("Opciones A/B/C (puertas, ventanas, suelos, toalleros)", "En fase de oferta se presupuesta solo el estándar; las alternativas quedan como partidas del catálogo para después del contrato."),
    ("Electricidad por estancia", "Las estancias pasan a la medición; las partidas son unitarias (ELE-020 a ELE-090)."),
]
