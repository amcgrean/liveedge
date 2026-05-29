// Mock route data used until we connect to the real /api/dispatch/routes endpoint.
// All screens read from this so they stay consistent.

export type StopStatus = 'pending' | 'delivered' | 'skipped' | 'inroute';

export interface OrderLine {
  qty: string;
  code: string;
  desc: string;
  wt: string;
}

export interface MockStop {
  n: string;
  so: string;
  name: string;
  addr1: string;
  addr2: string;
  status: StopStatus;
  items: number;
  eta?: string;
  // Detail extras
  poRef?: string;
  specialInstructions?: string;
  notes?: string;
  // Customer sheet extras
  primaryContact?: { name: string; phone: string };
  siteContact?: { name: string; role: string; phone: string; hours?: string; initials: string };
  siteAccess?: string;
  gateCode?: string;
  orderLines?: OrderLine[];
  totalWeight?: string;
}

export const MOCK_STOPS: MockStop[] = [
  {
    n: '01', so: '102-44918',
    name: 'Holstead Construction',
    addr1: '4220 NW 86th St', addr2: 'Urbandale, IA 50322',
    status: 'delivered', items: 12,
    primaryContact: { name: 'Mark Holstead', phone: '(515) 555-0128' },
  },
  {
    n: '02', so: '102-44922',
    name: 'Greenway Homes — Lot 14',
    addr1: '1840 Aspen Ridge Dr', addr2: 'Waukee, IA 50263',
    status: 'delivered', items: 8,
    primaryContact: { name: 'Lisa Greenway', phone: '(515) 555-0167' },
  },
  {
    n: '03', so: '102-44930',
    name: 'M&B Roofing LLC',
    addr1: '512 SE 14th St', addr2: 'Des Moines, IA 50315',
    status: 'delivered', items: 24,
    primaryContact: { name: 'Mike Brennan', phone: '(515) 555-0143' },
  },
  {
    n: '04', so: '102-44947',
    name: 'Brenneman Residence',
    addr1: '3402 Hickory Ln', addr2: 'Clive, IA 50325',
    status: 'inroute', items: 6, eta: '11:20 AM',
    poRef: 'BR-2026-0511',
    specialInstructions: 'Drop in driveway, NOT garage. Dogs in yard — gate latch sticks. Customer will be on site after 11 AM.',
    notes: 'Stack OSB on flat side of driveway, blocked under tarp.',
    primaryContact: { name: 'Tom Brenneman', phone: '(515) 555-0142' },
    siteContact: { name: 'Jake Santos', role: 'Foreman', phone: '(515) 555-0987', hours: 'on site 11 AM–4 PM', initials: 'JS' },
    siteAccess: 'Gate code [GATE] on the side fence. Truck route: enter from Cypress, exit Hickory. Avoid the cul-de-sac — tight turn.',
    gateCode: '4720#',
    orderLines: [
      { qty: '24', code: 'SPF2X4-92', desc: 'SPF 2×4 92⅝" Stud', wt: '288 lb' },
      { qty: '18', code: 'OSB-716-4X8', desc: 'OSB Sheathing 7/16" 4×8', wt: '414 lb' },
      { qty: '8',  code: 'LVL-11875', desc: 'LVL 1¾×11⅞ × 16′', wt: '512 lb' },
      { qty: '4',  code: 'TYVK-HW9', desc: 'Tyvek HomeWrap 9×100', wt: '92 lb' },
      { qty: '120', code: 'CXNAIL-16D', desc: '16d Common Nails (5lb box)', wt: '600 lb' },
      { qty: '2',  code: 'POLY-6M20', desc: '6mil Poly Sheet 20×100', wt: '54 lb' },
    ],
    totalWeight: '1,960 lb',
  },
  {
    n: '05', so: '102-44951',
    name: 'Hawkeye Framing Co.',
    addr1: '7711 University Ave', addr2: 'West Des Moines, IA',
    status: 'pending', items: 18,
    primaryContact: { name: 'Carl Hawkeye', phone: '(515) 555-0291' },
  },
  {
    n: '06', so: '102-44958',
    name: 'Stadler Lot — 22',
    addr1: '928 Cypress Dr', addr2: 'Johnston, IA 50131',
    status: 'pending', items: 4,
  },
  {
    n: '07', so: '102-44963',
    name: 'Riverbend Decks',
    addr1: '210 NW 70th Ave', addr2: 'Ankeny, IA 50023',
    status: 'skipped', items: 9,
  },
  {
    n: '08', so: '102-44970',
    name: 'Cardinal Carpentry',
    addr1: '1500 30th St NW', addr2: 'Bondurant, IA 50035',
    status: 'pending', items: 15,
  },
];

export function findStop(so: string): MockStop | undefined {
  return MOCK_STOPS.find((s) => s.so === so);
}

export function stopIndex(so: string): number {
  return MOCK_STOPS.findIndex((s) => s.so === so);
}
