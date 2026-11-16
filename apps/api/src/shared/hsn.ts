// HSN codes for GST invoices (owner decision 2026-11-16: the supplier bills the buyer).
// Suggested 4-digit headings per Sthiva catalogue item (the catalogue id, which is also the
// CatalogItem slug). Only headings we are confident of are listed; items left out have no
// suggestion and the seller enters the code. Sellers can always change it on their listing.
// 4 digits is enough for businesses up to Rs 5 crore turnover; larger ones use 6 digits.
// Same data as packages/web-core/src/catalog/hsn.ts: keep the two in step.

export const HSN_RE = /^(\d{4}|\d{6}|\d{8})$/;

export const SUGGESTED_HSN: Record<string, string> = {
  // Cement and concrete
  'opc-53-cement': '2523', 'opc-43-cement': '2523', 'ppc-cement': '2523', 'psc-cement': '2523', 'white-cement': '2523',
  'ready-mix-concrete': '3824',
  // Bricks and blocks
  'red-clay-bricks': '6904', 'aac-blocks': '6810', 'solid-concrete-blocks': '6810', 'hollow-concrete-blocks': '6810',
  'paver-blocks': '6810', 'clay-roof-tiles': '6905',
  // Sand, jelly and stone
  'river-sand': '2505', 'jelly-aggregate': '2517', 'stone-dust': '2517', 'gsb-wmm': '2517',
  // Steel
  'tmt-bars': '7214', 'binding-wire': '7217', 'structural-steel': '7216', 'ms-hollow-sections': '7306',
  'steel-safety-doors': '7308', 'aluminium-windows': '7610', 'upvc-windows': '3925', 'polycarbonate-sheets': '3920',
  // Plumbing and sanitary
  'cpvc-pipes': '3917', 'upvc-pipes': '3917', 'swr-pipes': '3917', 'column-pipes': '3917', 'pipe-fittings': '3917',
  'valves': '8481', 'bath-fittings': '8481', 'sanitaryware': '6910', 'water-tanks': '3925', 'water-pumps': '8413',
  'water-heaters': '8516', 'kitchen-sinks': '7324',
  // Electricals
  'house-wires': '8544', 'modular-switches': '8536', 'mcb-db': '8536', 'conduits': '3917', 'led-lighting': '9405',
  'ceiling-fans': '8414', 'stabilizers-inverters': '8504', 'kitchen-chimneys': '8414',
  // Paints and textures
  'interior-emulsion': '3209', 'exterior-emulsion': '3209', 'enamel-paint': '3208', 'wall-putty': '3214',
  'pop': '2520', 'wallpaper': '4814',
  // Plywood and wood
  'mr-plywood': '4412', 'bwr-bwp-plywood': '4412', 'flush-doors': '4418', 'main-doors': '4418', 'sawn-timber': '4407',
  'laminate-flooring': '4411',
  // Tiles and flooring
  'vitrified-tiles': '6907', 'ceramic-wall-tiles': '6907', 'floor-outdoor-tiles': '6907', 'granite': '6802',
  'marble-kota-shahabad': '6802', 'tile-adhesive-grout': '3214', 'vinyl-spc-flooring': '3918',
  // Interiors
  'modular-kitchen': '9403', 'wardrobes': '9403', 'tv-units': '9403', 'storage-beds': '9403', 'study-units': '9403',
  'crockery-shoe-units': '9403', 'gypsum-false-ceiling': '6809',
  // Hardware
  'cabinet-hinges': '8302', 'drawer-channels': '8302', 'handles-knobs': '8302', 'wardrobe-fittings': '8302',
  'door-hardware': '8302', 'door-locks': '8301', 'screws-fasteners': '7318', 'adhesives-sealants': '3506',
  // Glass
  'glass': '7005', 'mirrors': '7009',
  // Tools and machines
  'power-tools': '8467', 'hand-tools': '8205', 'scaffolding': '7308',
  // Furnishing
  'curtains-blinds': '6303', 'cushions': '9404',
};
