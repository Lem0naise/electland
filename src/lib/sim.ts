import { Delaunay } from 'd3-delaunay'

import {
  VALUE_KEYS,
  type ActionResult,
  type CampaignAction,
  type Constituency,
  type ConstituencyResult,
  type CustomPartyDraft,
  type FictionalBloc,
  type GeographicCurrent,
  type GovernanceDecision,
  type Landmass,
  type PartyDefinition,
  type PartyPerformance,
  type PoliticalValueKey,
  type PoliticalValues,
  type PopulationTile,
  type SettlementCenter,
  type TilePreferenceEstimate,
  type TilePartyPreference,
  type TownStats,
  type VoteHistoryEntry,
  type WardCandidate,
  type WeeklyEvent,
  type World,
  type WorldOptions,
} from '../types/sim'

const MAP_WIDTH = 920
const MAP_HEIGHT = 640
const GRID_STEP = 18

const defaultSalience: PoliticalValues = { change: 1, growth: 1, services: 1 }

// ─── Issue currents pool ────────────────────────────────────────────────────
const issueCurrents: Array<{
  id: string
  label: string
  description: string
  tags: string[]
  effect: Partial<PoliticalValues>
  popularityEffect: { target: 'major' | 'minor' | 'all'; amount: number }
}> = [
  {
    id: 'pothole-panic',
    label: 'Pothole Panic',
    description: 'Residents are furious about the roads.',
    tags: ['hill', 'suburban', 'market'],
    effect: { services: 12 },
    popularityEffect: { target: 'all', amount: 0.05 },
  },
  {
    id: 'market-festival',
    label: 'Market Festival Buzz',
    description: 'A town festival rewards upbeat civic parties.',
    tags: ['market', 'center', 'oldtown'],
    effect: { growth: 10 },
    popularityEffect: { target: 'major', amount: 0.08 },
  },
  {
    id: 'park-campaign',
    label: 'Park Cleanup Drive',
    description: 'Residents push for greener public space.',
    tags: ['river', 'pond', 'green'],
    effect: { change: 10, services: 8 },
    popularityEffect: { target: 'minor', amount: 0.07 },
  },
  {
    id: 'budget-row',
    label: 'Budget Row',
    description: 'A heated argument over town-hall spending.',
    tags: ['industrial', 'market', 'south'],
    effect: { growth: 8, services: -8 },
    popularityEffect: { target: 'all', amount: -0.04 },
  },
  {
    id: 'youth-petition',
    label: 'Youth Petition',
    description: 'Young residents want bolder, newer ideas.',
    tags: ['school', 'south', 'metro'],
    effect: { change: 14 },
    popularityEffect: { target: 'minor', amount: 0.09 },
  },
  {
    id: 'parking-war',
    label: 'Parking Wars',
    description: 'The car park debate splits the high street.',
    tags: ['market', 'suburban', 'center'],
    effect: { services: 8, growth: -4 },
    popularityEffect: { target: 'all', amount: 0.03 },
  },
  {
    id: 'flood-scare',
    label: 'Flood Scare',
    description: 'Heavy rain threatens low-lying streets.',
    tags: ['river', 'pond', 'north'],
    effect: { services: 14, change: 6 },
    popularityEffect: { target: 'minor', amount: 0.06 },
  },
  {
    id: 'school-places',
    label: 'School Places Crisis',
    description: 'Parents demand more primary school spots.',
    tags: ['school', 'suburban', 'east'],
    effect: { services: 10, change: 8 },
    popularityEffect: { target: 'all', amount: 0.04 },
  },
]

// ─── Weekly events pool ─────────────────────────────────────────────────────
const weeklyEventPool: Array<Omit<WeeklyEvent, 'resolved' | 'chosenIndex'>> = [
  {
    id: 'evt-bin-collection',
    headline: 'Bin Collection Chaos',
    description: 'Missed bin collections across three wards have residents fuming. The council is blamed.',
    tags: ['suburban', 'industrial'],
    choices: [
      {
        label: 'Launch emergency review',
        description: 'Promise a full review and extra collections. Costs credibility if nothing changes.',
        effect: { tags: ['suburban', 'industrial'], valueDrift: { services: 8 }, playerBoost: 0.04, opponentBoost: 0 },
      },
      {
        label: 'Blame contractor publicly',
        description: 'Deflect by naming the contractor. Risky — may look opportunistic.',
        effect: { tags: ['suburban'], valueDrift: { services: 4 }, playerBoost: 0.02, opponentBoost: 0.02 },
      },
    ],
  },
  {
    id: 'evt-community-centre',
    headline: 'Community Centre Closure Threat',
    description: 'Budget pressures mean the beloved Millpond Community Centre may close.',
    tags: ['pond', 'center', 'suburban'],
    choices: [
      {
        label: 'Pledge to save it',
        description: 'Promise to find the budget. Boosts support in central wards significantly.',
        effect: { tags: ['pond', 'center'], valueDrift: { services: 10 }, playerBoost: 0.05, opponentBoost: 0 },
      },
      {
        label: 'Propose managed transition',
        description: 'Honest but unpopular — suggest a community takeover instead.',
        effect: { tags: ['center'], valueDrift: { change: 5 }, playerBoost: 0.01, opponentBoost: 0.03 },
      },
    ],
  },
  {
    id: 'evt-new-development',
    headline: 'New Development Approved',
    description: 'A controversial housing development in the north has been approved. Residents are divided.',
    tags: ['north', 'rural', 'hill'],
    choices: [
      {
        label: 'Champion affordable housing',
        description: 'Support the development, framing it as housing for local families.',
        effect: { tags: ['north', 'suburban'], valueDrift: { change: 8, growth: 4 }, playerBoost: 0.04, opponentBoost: 0.01 },
      },
      {
        label: 'Side with residents',
        description: 'Oppose the development to please existing homeowners in the area.',
        effect: { tags: ['hill', 'rural'], valueDrift: { change: -6 }, playerBoost: 0.04, opponentBoost: 0.01 },
      },
    ],
  },
  {
    id: 'evt-market-fire',
    headline: 'Fire at the Market',
    description: 'A small fire damaged three market stalls. No injuries, but traders want compensation.',
    tags: ['market', 'center'],
    choices: [
      {
        label: 'Push for fast compensation',
        description: 'Back the traders and pressure the council to act quickly.',
        effect: { tags: ['market', 'center'], valueDrift: { services: 8 }, playerBoost: 0.05, opponentBoost: 0 },
      },
      {
        label: 'Call for a safety audit',
        description: 'Slower, more cautious — focus on preventing future incidents.',
        effect: { tags: ['market'], valueDrift: { services: 5, change: 3 }, playerBoost: 0.02, opponentBoost: 0.01 },
      },
    ],
  },
  {
    id: 'evt-speeding',
    headline: 'Speeding Problem on Mill Road',
    description: 'A petition of 300 signatures calls for speed cameras near the school.',
    tags: ['school', 'suburban', 'south'],
    choices: [
      {
        label: 'Back the petition loudly',
        description: 'Champion the campaign — strong boost in school-area wards.',
        effect: { tags: ['school', 'suburban'], valueDrift: { services: 6 }, playerBoost: 0.05, opponentBoost: 0 },
      },
      {
        label: 'Suggest traffic calming instead',
        description: 'A softer approach — cheaper but less decisive.',
        effect: { tags: ['suburban', 'south'], valueDrift: { services: 4 }, playerBoost: 0.02, opponentBoost: 0.02 },
      },
    ],
  },
  {
    id: 'evt-allotments',
    headline: 'Council Wants to Sell Allotments',
    description: 'Rumours that the council will sell allotment land for housing have leaked.',
    tags: ['green', 'river', 'north'],
    choices: [
      {
        label: 'Lead the opposition',
        description: 'Stand against the sale — very popular with green-leaning voters.',
        effect: { tags: ['green', 'river'], valueDrift: { services: 8, change: 6 }, playerBoost: 0.06, opponentBoost: 0 },
      },
      {
        label: 'Seek compromise',
        description: 'Propose partial development with community green space preserved.',
        effect: { tags: ['north', 'green'], valueDrift: { change: 4 }, playerBoost: 0.03, opponentBoost: 0.01 },
      },
    ],
  },
]

// ─── Governance decisions pool ───────────────────────────────────────────────
const governanceDecisionPool: Array<Omit<GovernanceDecision, 'resolved' | 'chosenIndex'>> = [
  {
    id: 'gov-library',
    headline: 'Library Opening Hours',
    description: 'The budget committee proposes cutting library hours to save money.',
    choices: [
      {
        label: 'Protect library hours',
        description: 'Spend the budget. Popular with families and older residents.',
        effect: { blocEffects: { old_town_loyalists: 0.04, workshop_crews: 0.03 }, playerUtilityDelta: 0.04 },
      },
      {
        label: 'Accept the cuts',
        description: 'Take the savings. Unpopular but fiscally responsible.',
        effect: { blocEffects: { old_town_loyalists: -0.03, market_regulars: 0.02 }, playerUtilityDelta: -0.02 },
      },
    ],
  },
  {
    id: 'gov-cycle-lanes',
    headline: 'Cycle Lane Proposal',
    description: 'A proposal to add cycle lanes to the high street — removing some parking spaces.',
    choices: [
      {
        label: 'Back the cycle lanes',
        description: 'Win support from younger, greener voters. Upset some drivers.',
        effect: { blocEffects: { river_walkers: 0.06, college_corner: 0.04, market_regulars: -0.02 }, playerUtilityDelta: 0.02 },
      },
      {
        label: 'Prioritise parking',
        description: 'Protect business parking. Less popular with progressive blocs.',
        effect: { blocEffects: { market_regulars: 0.04, hill_street_households: 0.03, river_walkers: -0.04 }, playerUtilityDelta: 0.01 },
      },
    ],
  },
  {
    id: 'gov-events-budget',
    headline: 'Town Events Budget',
    description: 'How to spend the new town events budget — big splash or spread it out?',
    choices: [
      {
        label: 'One big summer festival',
        description: 'Exciting and visible, concentrates impact on market area.',
        effect: { blocEffects: { market_regulars: 0.05, old_town_loyalists: 0.03 }, playerUtilityDelta: 0.03 },
      },
      {
        label: 'Small events in every ward',
        description: 'Less headline-grabbing but more broadly popular.',
        effect: { blocEffects: { workshop_crews: 0.03, pondside_peacemakers: 0.03, river_walkers: 0.02 }, playerUtilityDelta: 0.03 },
      },
    ],
  },
]
// ─── Visual Identity ────────────────────────────────────────────────────────
// Expanded to include classic UK political colours (Blue, Red, Yellow/Orange, Green) 
// plus some distinct minor party colours (Purple, Teal, Magenta, Brown)
const colourPalette = [
  '#0087DC', // Tory Blue
  '#E4003B', // Labour Red
  '#FAA61A', // Lib Dem Orange
  '#02A95B', // Green
  '#70147A', // UKIP/Fringe Purple
  '#12B6CF', // Teal (Independents)
  '#D94841', // Brick Red
  '#EDAE49', // Mustard
  '#3D405B', // Navy
  '#8D5524'  // Mud/Earthy
]

// ─── Character Names ────────────────────────────────────────────────────────
// Shifted from purely whimsical to classic UK local demographics (lots of boomers and eccentric youths)
const firstNames = [
  // Older/Traditional
  'Arthur', 'Beryl', 'Clive', 'Deirdre', 'Enid', 'Frank', 'Geraldine', 'Horace', 'Ian', 'Joyce', 
  'Keith', 'Linda', 'Malcolm', 'Norma', 'Prudence', 'Stuart', 'Winifred', 'Yvonne',
  // Younger/Quirky
  'Pip', 'Juniper', 'Otis', 'Marlow', 'Dex', 'Ludo', 'Tilly', 'Barnaby', 'Cressida', 'Tarquin'
]

const lastNames = [
  // Classic Mundane
  'Smith', 'Jones', 'Davies', 'Taylor', 'Brown', 'Williams',
  // Eccentric/Village
  'Appleton', 'Braithwaite', 'Crump', 'Dingle', 'Entwistle', 'Fogg', 'Goggins', 'Higginbottom', 
  'Ironmonger', 'Jellicoe', 'Lightoller', 'Murgatroyd', 'Oglethorpe', 'Pendleton', 'Quigley', 
  'Rumbold', 'Thistlethwaite', 'Underhill', 'Wigglesworth',
  // Posh Double-Barrelled
  'Smythe-Willis', 'Finch-Hatton', 'Blythe-Smith'
]

// ─── Town & Ward Generation ─────────────────────────────────────────────────
// Added prefixes for the classic "Chipping" or "Little" English town vibe.
const townPrefixes = ['', '', '', 'Great ', 'Little ', 'Upper ', 'Lower ', 'Chipping ']
const townStarts = [
  'Brindle', 'Clover', 'Merry', 'Thistle', 'Copper', 'Willow', 'Lantern', 'Pebble', 
  'Amber', 'Barley', 'Fen', 'Grims', 'Bex', 'Slough', 'Dumble', 'Cuddle'
]
const townEnds = [
  'ford', 'market', 'hollow', 'stead', 'bridge', 'wick', 'harbour', 'cross', 
  'bottom', 'end', 'gate', 'heath', 'bury', 'ton', 'ley', 'chester', 'worth'
]

// Quirky English village ward names (Excellent original list, just added a few classics)
const wardFirstWords = [
  'Millpond', 'Copper', 'Fen', 'Shambles', 'Cobble', 'Lantern', 'Old Kiln', 'Tanner', 'Bell',
  'Rushmore', 'Cinder', 'Bramble', 'Halfpenny', 'Woolwich', 'Nettleback', 'Gravel', 'Soapstone',
  'Pickwick', 'Flint', 'Minnow', 'Oakham', 'Barley', 'Catchpenny', 'Horseshoe', 'Mudlark',
  'St. Jude', 'Vicarage', 'Market'
]
const wardSecondWords = [
  'End', 'Corner', 'Gate', 'Row', 'Bottom', 'Green', 'Cross', 'Hill', 'Moor', 'Side',
  'Lane', 'Yards', 'Close', 'Wharf', 'Square', 'Fold', 'Beck', 'Nook', 'Parade', 'Precinct'
]

// ─── Bloc templates ─────────────────────────────────────────────────────────
const fictionalBlocTemplates: Array<{
  id: string
  label: string
  summary: string
  center: PoliticalValues
  salience?: Partial<PoliticalValues>
  turnout: number
  preferredTags: string[]
  avoidedTags: string[]
  homeRole: string
  concentration: number
  weightRange: [number, number]
}> = [
  {
    id: 'market_regulars',
    label: 'Market Regulars',
    summary: 'Busy shopkeepers and stallholders who like a stable town hall.',
    center: { change: 10, growth: 35, services: 20 },
    salience: { growth: 1.5, services: 1.2 },
    turnout: 0.86,
    preferredTags: ['market', 'center', 'suburban'],
    avoidedTags: ['industrial'],
    homeRole: 'market',
    concentration: 0.48,
    weightRange: [0.18, 0.28],
  },
  {
    id: 'river_walkers',
    label: 'River Walkers',
    summary: 'Park volunteers who want visible quality of life improvements.',
    center: { change: 42, growth: -10, services: 35 },
    salience: { services: 1.7, change: 1.4 },
    turnout: 0.88,
    preferredTags: ['river', 'green', 'north'],
    avoidedTags: ['industrial'],
    homeRole: 'river',
    concentration: 0.74,
    weightRange: [0.1, 0.18],
  },
  {
    id: 'old_town_loyalists',
    label: 'Old Town Loyalists',
    summary: 'Festival lovers who prefer familiar faces and gradual fixes.',
    center: { change: -25, growth: 8, services: 28 },
    salience: { services: 1.6, change: 1.2 },
    turnout: 0.9,
    preferredTags: ['oldtown', 'heritage', 'center'],
    avoidedTags: ['school'],
    homeRole: 'oldtown',
    concentration: 0.72,
    weightRange: [0.12, 0.2],
  },
  {
    id: 'workshop_crews',
    label: 'Workshop Crews',
    summary: 'Tradespeople who care about roads, services, and practical spending.',
    center: { change: 0, growth: 15, services: 50 },
    salience: { services: 2, growth: 1.1 },
    turnout: 0.83,
    preferredTags: ['industrial', 'south', 'suburban'],
    avoidedTags: ['river'],
    homeRole: 'industrial',
    concentration: 0.58,
    weightRange: [0.12, 0.22],
  },
  {
    id: 'hill_street_households',
    label: 'Hill Street Households',
    summary: 'Outer-ward families who want order, parking, and tidy budgets.',
    center: { change: -15, growth: 28, services: 18 },
    salience: { growth: 1.4, services: 1.1 },
    turnout: 0.89,
    preferredTags: ['hill', 'west', 'rural'],
    avoidedTags: ['market'],
    homeRole: 'hill',
    concentration: 0.68,
    weightRange: [0.1, 0.18],
  },
  {
    id: 'college_corner',
    label: 'College Corner Crowd',
    summary: 'Students and creators who want bold, new ideas for the town.',
    center: { change: 55, growth: 5, services: 12 },
    salience: { change: 2, services: 1.1 },
    turnout: 0.76,
    preferredTags: ['school', 'metro', 'south'],
    avoidedTags: ['oldtown'],
    homeRole: 'school',
    concentration: 0.82,
    weightRange: [0.08, 0.15],
  },
  {
    id: 'pondside_peacemakers',
    label: 'Pondside Peacemakers',
    summary: 'Quiet residents who mostly want fewer rows and steadier leadership.',
    center: { change: 12, growth: -8, services: 26 },
    salience: { services: 1.5, change: 1.1 },
    turnout: 0.8,
    preferredTags: ['pond', 'east', 'green'],
    avoidedTags: ['industrial'],
    homeRole: 'pond',
    concentration: 0.68,
    weightRange: [0.06, 0.13],
  },
]

// ─── Utility functions ───────────────────────────────────────────────────────
function createRng(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let value = Math.imul(t ^ (t >>> 15), 1 | t)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function randomBetween(rng: () => number, min: number, max: number) {
  return min + (max - min) * rng()
}

function pickOne<T>(rng: () => number, list: T[]): T {
  return list[Math.floor(rng() * list.length)]
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function gaussian(rng: () => number, mean = 0, deviation = 1) {
  const u = Math.max(rng(), 1e-9)
  const v = Math.max(rng(), 1e-9)
  return mean + Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * deviation
}

function createValues(fill = 0): PoliticalValues {
  return { change: fill, growth: fill, services: fill }
}

function cloneValues(values: PoliticalValues): PoliticalValues {
  return { ...values }
}

function mapValues(values: PoliticalValues, iteratee: (key: PoliticalValueKey, value: number) => number): PoliticalValues {
  const next = createValues(0)
  for (const key of VALUE_KEYS) {
    next[key] = iteratee(key, values[key])
  }
  return next
}

function addValues(base: PoliticalValues, delta: Partial<PoliticalValues>, factor = 1) {
  return mapValues(base, (key, value) => clamp(value + (delta[key] ?? 0) * factor, -100, 100))
}

function mixValues(a: PoliticalValues, b: PoliticalValues, weight: number) {
  return mapValues(a, (key, value) => clamp(lerp(value, b[key], weight), -100, 100))
}

function weightedAverageValues(items: Array<{ values: PoliticalValues; weight: number }>, fallback: PoliticalValues) {
  const total = items.reduce((sum, item) => sum + item.weight, 0)
  if (total <= 0) return cloneValues(fallback)
  const next = createValues(0)
  for (const key of VALUE_KEYS) {
    next[key] = clamp(items.reduce((sum, item) => sum + item.values[key] * item.weight, 0) / total, -100, 100)
  }
  return next
}

function weightedAverageSalience(items: Array<{ salience: Partial<PoliticalValues> | undefined; weight: number }>) {
  const total = items.reduce((sum, item) => sum + item.weight, 0)
  if (total <= 0) return cloneValues(defaultSalience)
  const next = createValues(1)
  for (const key of VALUE_KEYS) {
    next[key] = clamp(items.reduce((sum, item) => sum + (item.salience?.[key] ?? 1) * item.weight, 0) / total, 0.35, 3)
  }
  return next
}

function distanceSq(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

function valueDistance(a: PoliticalValues, b: PoliticalValues, salience: PoliticalValues) {
  let total = 0
  for (const key of VALUE_KEYS) {
    const diff = a[key] - b[key]
    total += diff * diff * salience[key]
  }
  return total
}

function pointInPolygon(x: number, y: number, polygon: Array<[number, number]>) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.00001) + xi
    if (hit) inside = !inside
  }
  return inside
}

function distanceToSegment(point: { x: number; y: number }, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  if (dx === 0 && dy === 0) return Math.sqrt(distanceSq(point, { x: a[0], y: a[1] }))
  const t = clamp(((point.x - a[0]) * dx + (point.y - a[1]) * dy) / (dx * dx + dy * dy), 0, 1)
  return Math.sqrt(distanceSq(point, { x: a[0] + t * dx, y: a[1] + t * dy }))
}

function distanceToPolygonEdge(point: { x: number; y: number }, polygon: Array<[number, number]>) {
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < polygon.length; i += 1) {
    best = Math.min(best, distanceToSegment(point, polygon[i], polygon[(i + 1) % polygon.length]))
  }
  return best
}

function polygonToPath(points: Array<[number, number]>) {
  if (points.length === 0) return ''
  return `${points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')} Z`
}

function titleCaseBloc(id: string) {
  return id.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function createTownName(rng: () => number) {
  const prefix = pickOne(rng, townPrefixes)
  return `${prefix}${pickOne(rng, townStarts)}${pickOne(rng, townEnds)}`
}

function createLeaderName(rng: () => number) {
  return `${pickOne(rng, firstNames)} ${pickOne(rng, lastNames)}`
}

// Create a ward name in the quirky English village style, no repeats
function createWardName(rng: () => number, used: Set<string>): string {
  for (let attempt = 0; attempt < 60; attempt++) {
    const name = `${pickOne(rng, wardFirstWords)} ${pickOne(rng, wardSecondWords)}`
    if (!used.has(name)) {
      used.add(name)
      return name
    }
  }
  // Fallback with a number
  const base = `${pickOne(rng, wardFirstWords)} ${pickOne(rng, wardSecondWords)}`
  const name = `${base} ${used.size + 1}`
  used.add(name)
  return name
}

// ─── World generation helpers ────────────────────────────────────────────────
function createLandmass(rng: () => number): Landmass {
  const points: Array<[number, number]> = []
  const pointCount = 60
  const centerX = MAP_WIDTH / 2
  const centerY = MAP_HEIGHT / 2
  const baseRadius = Math.min(MAP_WIDTH, MAP_HEIGHT) * 0.35
  for (let i = 0; i < pointCount; i += 1) {
    const angle = (i / pointCount) * Math.PI * 2
    const radius = baseRadius * (1 + 0.12 * Math.sin(angle * 3) + 0.08 * Math.cos(angle * 5) + gaussian(rng, 0, 0.04))
    const x = centerX + Math.cos(angle) * radius * randomBetween(rng, 0.9, 1.08)
    const y = centerY + Math.sin(angle) * radius * randomBetween(rng, 0.86, 1.1)
    points.push([clamp(x, 56, MAP_WIDTH - 56), clamp(y, 50, MAP_HEIGHT - 50)])
  }
  return { points, path: polygonToPath(points) }
}

function randomPointInLandmass(rng: () => number, polygon: Array<[number, number]>) {
  for (let tries = 0; tries < 3000; tries += 1) {
    const point = { x: randomBetween(rng, 110, MAP_WIDTH - 110), y: randomBetween(rng, 90, MAP_HEIGHT - 90) }
    if (pointInPolygon(point.x, point.y, polygon)) return point
  }
  return { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 }
}

function createSettlementCenters(rng: () => number, polygon: Array<[number, number]>, townName: string) {
  const roles = ['market', 'oldtown', 'river', 'industrial', 'school', 'pond', 'hill']
  return roles.map<SettlementCenter>((role, index) => {
    const point = randomPointInLandmass(rng, polygon)
    const urbanity = role === 'market' || role === 'oldtown'
      ? randomBetween(rng, 0.72, 0.95)
      : role === 'school' || role === 'industrial'
        ? randomBetween(rng, 0.45, 0.72)
        : randomBetween(rng, 0.18, 0.55)
    return {
      id: `center-${index + 1}`,
      x: point.x,
      y: point.y,
      strength: randomBetween(rng, 0.9, 2.2),
      urbanity,
      radius: randomBetween(rng, 50, 100),
      role,
      label: role === 'market' ? `${townName} Square` : `${role.charAt(0).toUpperCase() + role.slice(1)} Quarter`,
    }
  })
}

function terrainSignal(x: number, y: number) {
  return clamp((Math.sin(x * 0.017) + Math.cos(y * 0.013) + Math.sin((x + y) * 0.01) + 3) / 6, 0, 1)
}

function buildTileTags(point: { x: number; y: number }, urbanity: number, polygon: Array<[number, number]>, nearestRole: string) {
  const edge = clamp(1 - distanceToPolygonEdge(point, polygon) / 150, 0, 1)
  const hillness = terrainSignal(point.x, point.y)
  const tags = new Set<string>()
  if (urbanity > 0.72) tags.add('metro')
  else if (urbanity > 0.45) tags.add('suburban')
  else tags.add('rural')
  if (edge > 0.55) tags.add('edge')
  else tags.add('center')
  if (hillness > 0.58) tags.add('hill')
  if (point.x < MAP_WIDTH * 0.42) tags.add('west')
  if (point.x > MAP_WIDTH * 0.58) tags.add('east')
  if (point.y < MAP_HEIGHT * 0.45) tags.add('north')
  if (point.y > MAP_HEIGHT * 0.56) tags.add('south')
  tags.add(nearestRole)
  if (nearestRole === 'river' || nearestRole === 'pond') tags.add('green')
  if (nearestRole === 'oldtown') tags.add('heritage')
  return [...tags]
}

function generateBlocs(rng: () => number) {
  const chosen = [...fictionalBlocTemplates].sort(() => rng() - 0.5).slice(0, 5)
  const rawWeights = chosen.map((template) => randomBetween(rng, template.weightRange[0], template.weightRange[1]))
  const total = rawWeights.reduce((sum, value) => sum + value, 0)
  return chosen.map<FictionalBloc>((template, index) => ({
    id: template.id,
    label: template.label,
    summary: template.summary,
    weight: rawWeights[index] / total,
    center: cloneValues(template.center),
    salience: template.salience,
    turnout: template.turnout,
    preferredTags: template.preferredTags,
    avoidedTags: template.avoidedTags,
    homeRole: template.homeRole,
    concentration: template.concentration,
  }))
}

function blocAffinity(bloc: FictionalBloc, tags: string[], point: { x: number; y: number }, anchors: Array<{ x: number; y: number }>) {
  const tagBonus = bloc.preferredTags.reduce((sum, tag) => sum + (tags.includes(tag) ? 0.42 : 0), 0)
  const tagPenalty = bloc.avoidedTags.reduce((sum, tag) => sum + (tags.includes(tag) ? 0.24 : 0), 0)
  const minDistance = anchors.reduce((best, anchor) => Math.min(best, Math.sqrt(distanceSq(anchor, point))), Number.POSITIVE_INFINITY)
  const spread = lerp(260, 95, bloc.concentration)
  const proximity = Math.exp(-((minDistance * minDistance) / (2 * spread * spread)))
  return tagBonus - tagPenalty + proximity * (0.8 + bloc.concentration)
}

function allocateBlocMixes(
  tiles: Array<{ population: number; baselineValues: PoliticalValues; tags: string[]; x: number; y: number }>,
  blocs: FictionalBloc[],
  anchorsByBloc: Record<string, Array<{ x: number; y: number }>>,
) {
  const totalPopulation = tiles.reduce((sum, tile) => sum + tile.population, 0)
  const targets = blocs.map((bloc) => bloc.weight * totalPopulation)
  const matrix = tiles.map((tile) =>
    blocs.map((bloc) => {
      const fit = blocAffinity(bloc, tile.tags, tile, anchorsByBloc[bloc.id] ?? [])
      return Math.max(1e-6, Math.exp(fit))
    }),
  )

  for (let iteration = 0; iteration < 22; iteration += 1) {
    matrix.forEach((row, rowIndex) => {
      const rowSum = row.reduce((sum, value) => sum + value, 0) || 1
      const factor = tiles[rowIndex].population / rowSum
      row.forEach((_, colIndex) => { row[colIndex] *= factor })
    })
    blocs.forEach((_, colIndex) => {
      let colSum = 0
      matrix.forEach((row) => { colSum += row[colIndex] })
      const factor = targets[colIndex] / (colSum || 1)
      matrix.forEach((row) => { row[colIndex] *= factor })
    })
  }

  return matrix.map((row) => {
    const rowSum = row.reduce((sum, value) => sum + value, 0) || 1
    const mix: Record<string, number> = {}
    blocs.forEach((bloc, index) => { mix[bloc.id] = row[index] / rowSum })
    return mix
  })
}

function createPopulationTiles(rng: () => number, polygon: Array<[number, number]>, centers: SettlementCenter[], blocs: FictionalBloc[]) {
  const provisional: Array<{ id: string; x: number; y: number; density: number; urbanity: number; baselineValues: PoliticalValues; tags: string[] }> = []

  for (let x = GRID_STEP; x < MAP_WIDTH; x += GRID_STEP) {
    for (let y = GRID_STEP; y < MAP_HEIGHT; y += GRID_STEP) {
      if (!pointInPolygon(x, y, polygon)) continue
      const point = { x, y }
      let density = 0
      let urbanSignal = 0
      let nearest = centers[0]
      let nearestDistance = Number.POSITIVE_INFINITY
      centers.forEach((center) => {
        const dist = Math.sqrt(distanceSq(center, point))
        const influence = center.strength * Math.exp(-(dist * dist) / (2 * center.radius * center.radius))
        density += influence
        urbanSignal += influence * center.urbanity
        if (dist < nearestDistance) {
          nearest = center
          nearestDistance = dist
        }
      })
      density += 0.08 + Math.max(0, 0.2 - distanceToPolygonEdge(point, polygon) / 320)
      if (density < 0.14) continue

      const urbanity = clamp(urbanSignal / Math.max(0.001, density), 0.08, 0.98)
      const tags = buildTileTags(point, urbanity, polygon, nearest.role)
      const baselineValues = addValues(createValues(0), {
        change: nearest.role === 'school' ? 34 : nearest.role === 'oldtown' ? -18 : nearest.role === 'river' ? 12 : 0,
        growth: nearest.role === 'market' ? 28 : nearest.role === 'industrial' ? 18 : nearest.role === 'hill' ? 14 : 0,
        services: nearest.role === 'industrial' ? 30 : nearest.role === 'river' ? 18 : nearest.role === 'pond' ? 14 : nearest.role === 'oldtown' ? 22 : 10,
      })
      provisional.push({ id: `tile-${provisional.length + 1}`, x, y, density, urbanity, baselineValues, tags })
    }
  }

  const totalDensity = provisional.reduce((sum, tile) => sum + tile.density, 0)
  // SMALLER population: 600–1,600
  const totalPopulation = Math.round(randomBetween(rng, 600, 1600))
  let allocated = 0
  const withPopulation = provisional.map((tile, index) => {
    const population = index === provisional.length - 1
      ? totalPopulation - allocated
      : Math.max(1, Math.round((tile.density / totalDensity) * totalPopulation))
    allocated += population
    return { ...tile, population }
  })

  const anchorsByBloc: Record<string, Array<{ x: number; y: number }>> = {}
  blocs.forEach((bloc) => {
    const matching = centers.filter((center) => center.role === bloc.homeRole)
    const source = matching.length > 0 ? matching : centers
    anchorsByBloc[bloc.id] = [...source].sort(() => rng() - 0.5).slice(0, bloc.concentration > 0.7 ? 1 : 2).map((center) => ({ x: center.x, y: center.y }))
  })

  const mixes = allocateBlocMixes(withPopulation, blocs, anchorsByBloc)
  return withPopulation.map<PopulationTile>((tile, index) => {
    const mix = mixes[index]
    const values = addValues(
      mixValues(tile.baselineValues, weightedAverageValues(blocs.map((bloc) => ({ values: bloc.center, weight: mix[bloc.id] })), tile.baselineValues), 0.55),
      { change: gaussian(rng, 0, 3), growth: gaussian(rng, 0, 3), services: gaussian(rng, 0, 3) },
    )
    const turnoutBase = blocs.reduce((sum, bloc) => sum + (bloc.turnout ?? 0.8) * mix[bloc.id], 0)
    return {
      id: tile.id,
      x: tile.x,
      y: tile.y,
      population: tile.population,
      density: tile.density,
      urbanity: tile.urbanity,
      values,
      salience: weightedAverageSalience(blocs.map((bloc) => ({ salience: bloc.salience, weight: mix[bloc.id] * tile.population }))),
      turnout: clamp(turnoutBase + tile.urbanity * 0.05, 0.45, 0.94),
      blocMix: mix,
      tags: tile.tags,
      campaignBoosts: {},
    }
  })
}

function seedConstituencies(rng: () => number, tiles: PopulationTile[], count: number) {
  const seeds: Array<{ x: number; y: number }> = []
  while (seeds.length < count) {
    const chosen = pickOne(rng, tiles)
    const point = { x: chosen.x + gaussian(rng, 0, 6), y: chosen.y + gaussian(rng, 0, 6) }
    if (seeds.every((seed) => Math.sqrt(distanceSq(seed, point)) > 36)) seeds.push(point)
  }
  return seeds
}

function assignTilesToConstituencies(tiles: PopulationTile[], seeds: Array<{ x: number; y: number }>, targetPopulation: number) {
  const assignments = new Array<number>(tiles.length).fill(0)
  const populations = new Array<number>(seeds.length).fill(0)
  const sorted = tiles.map((_, index) => index).sort((a, b) => tiles[b].population - tiles[a].population)
  sorted.forEach((tileIndex) => {
    const tile = tiles[tileIndex]
    let bestScore = Number.POSITIVE_INFINITY
    let bestIndex = 0
    seeds.forEach((seed, seedIndex) => {
      const score = distanceSq(seed, tile) * (0.75 + populations[seedIndex] / Math.max(targetPopulation, 1))
      if (score < bestScore) {
        bestScore = score
        bestIndex = seedIndex
      }
    })
    assignments[tileIndex] = bestIndex
    populations[bestIndex] += tile.population
  })
  return assignments
}

// Generate named ward candidates (one per party per ward)
function createWardCandidates(rng: () => number, parties: PartyDefinition[]): WardCandidate[] {
  return parties.map((party) => {
    const first = pickOne(rng, firstNames)
    const last = pickOne(rng, lastNames)
    const name = `${first} ${last}`
    return {
      partyId: party.id,
      partyName: party.name,
      partyColour: party.colour,
      name,
      initials: `${first[0]}${last[0]}`,
    }
  })
}

function createConstituencies(rng: () => number, tiles: PopulationTile[], count: number, parties: PartyDefinition[]) {
  const targetPopulation = tiles.reduce((sum, tile) => sum + tile.population, 0) / count
  let seeds = seedConstituencies(rng, tiles, count)
  let assignments: number[] = []
  for (let i = 0; i < 6; i += 1) {
    assignments = assignTilesToConstituencies(tiles, seeds, targetPopulation)
    seeds = seeds.map((seed, seedIndex) => {
      const grouped = tiles.filter((_, tileIndex) => assignments[tileIndex] === seedIndex)
      const total = grouped.reduce((sum, tile) => sum + tile.population, 0)
      if (total <= 0) return seed
      return {
        x: grouped.reduce((sum, tile) => sum + tile.x * tile.population, 0) / total,
        y: grouped.reduce((sum, tile) => sum + tile.y * tile.population, 0) / total,
      }
    })
  }

  const delaunay = Delaunay.from(seeds.map((seed) => [seed.x, seed.y]))
  const voronoi = delaunay.voronoi([0, 0, MAP_WIDTH, MAP_HEIGHT])
  const usedWardNames = new Set<string>()

  return seeds.map<Constituency>((seed, seatIndex) => {
    const seatTiles = tiles.filter((_, tileIndex) => assignments[tileIndex] === seatIndex)
    seatTiles.forEach((tile) => { tile.constituencyId = `ward-${seatIndex + 1}` })
    const population = seatTiles.reduce((sum, tile) => sum + tile.population, 0)
    const blocMix: Record<string, number> = {}
    const tagWeights: Record<string, number> = {}
    seatTiles.forEach((tile) => {
      Object.entries(tile.blocMix).forEach(([blocId, share]) => {
        blocMix[blocId] = (blocMix[blocId] ?? 0) + share * tile.population
      })
      tile.tags.forEach((tag) => {
        tagWeights[tag] = (tagWeights[tag] ?? 0) + tile.population
      })
    })
    const totalBloc = Object.values(blocMix).reduce((sum, value) => sum + value, 0) || 1
    Object.keys(blocMix).forEach((blocId) => { blocMix[blocId] /= totalBloc })
    const tags = Object.entries(tagWeights).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([tag]) => tag)

    return {
      id: `ward-${seatIndex + 1}`,
      name: createWardName(rng, usedWardNames),
      seed,
      population,
      turnout: seatTiles.reduce((sum, tile) => sum + tile.turnout * tile.population, 0) / Math.max(1, population),
      urbanity: seatTiles.reduce((sum, tile) => sum + tile.urbanity * tile.population, 0) / Math.max(1, population),
      tags,
      blocMix,
      values: weightedAverageValues(seatTiles.map((tile) => ({ values: tile.values, weight: tile.population })), createValues(0)),
      cellPath: polygonToPath(((voronoi.cellPolygon(seatIndex) ?? []) as Array<[number, number]>).map(([x, y]) => [x, y])),
      results: [],
      leadingPartyId: '',
      leadingPartyName: '',
      margin: 0,
      candidates: createWardCandidates(rng, parties),
      history: [],
    }
  })
}

function strategyTagsForValues(values: PoliticalValues) {
  const tags = new Set<string>()
  if (values.change > 18) tags.add('school')
  if (values.change < -10) tags.add('oldtown')
  if (values.growth > 18) tags.add('market')
  if (values.services > 24) tags.add('industrial')
  if (values.services > 14 && values.change > 10) tags.add('river')
  if (tags.size === 0) tags.add('center')
  return [...tags].slice(0, 3)
}

function partyNameForBloc(
  rng: () => number, 
  bloc: { label: string }, 
  tier: 'major' | 'minor' | 'indie',
  localWardOrTown: string = 'Town' // Pass in a local place name for extra flavor!
) {
  // Clean the bloc label (e.g., turning "Conservative Party" into just "Conservative")
  const coreIdeology = bloc.label.replace(/\b(Party|Group|Alliance)\b/gi, '').trim() || bloc.label;

  const prefixes = tier === 'major'
    ? ['Bright', 'Forward', 'New', 'Civic', 'Traditional', 'Progressive']
    : ['True', 'Independent', 'Radical', 'Pocket', 'Grassroots', 'Local']
  
  const suffixes = tier === 'major'
    ? ['Alliance', 'Party', 'Union', 'Democrats', 'Coalition']
    : ['Action', 'Focus', 'Voice', 'List', 'Forum', 'Network', 'Movement']

  // Define patterns based on tier
  const patterns = tier === 'major' ? [
    // e.g., "Bright Conservative Alliance"
    () => `${pickOne(rng, prefixes)} ${coreIdeology} ${pickOne(rng, suffixes)}`,
    // e.g., "The Progressive Labour Party"
    () => `The ${pickOne(rng, prefixes)} ${coreIdeology} Party`,
    // e.g., "Conservatives For Brindleford"
    () => `${coreIdeology}s For ${localWardOrTown}`,
  ] : [
    // e.g., "Millpond Independent Voice"
    () => `${localWardOrTown} ${pickOne(rng, prefixes)} ${pickOne(rng, suffixes)}`,
    // e.g., "Save Our Green" (If they are a single-issue minor bloc)
    () => `Save Our ${localWardOrTown}`,
    // e.g., "Radical Green Action"
    () => `${pickOne(rng, prefixes)} ${coreIdeology} ${pickOne(rng, suffixes)}`,
    // e.g., "The Shambles Residents Association"
    () => `${localWardOrTown} Residents Association`,
  ];

  return pickOne(rng, patterns)();
}

function createGeneratedParties(rng: () => number, blocs: FictionalBloc[]) {
  const sorted = [...blocs].sort((a, b) => b.weight - a.weight)
  const majorBlocs = sorted.slice(0, Math.min(3, sorted.length))
  const minorBlocs = sorted.slice(3)
  const parties: PartyDefinition[] = []

  majorBlocs.forEach((bloc, index) => {
    const values = addValues(bloc.center, {
      change: gaussian(rng, 0, 4),
      growth: gaussian(rng, 0, 4),
      services: gaussian(rng, 0, 4),
    })
    parties.push({
      id: `party-major-${index + 1}`,
      name: partyNameForBloc(rng, bloc, 'major'),
      leader: createLeaderName(rng),
      colour: colourPalette[index % colourPalette.length],
      values,
      origin: 'generated',
      tier: 'major',
      strategyTags: strategyTagsForValues(values),
      seedBlocId: bloc.id,
      organization: clamp(0.92 + bloc.weight * 1.1, 0.9, 1.4),
      baseUtility: 0.06,
      momentum: 0,
      focusSeatIds: [],
      slogan: pickOne(rng, ['Fix the footpaths!', 'Cheer up the square!', 'More for every ward!', 'A friendlier town hall!']),
      aiActionPoints: 3,
      wardBoosts: {},
    })
  })

  minorBlocs.forEach((bloc, index) => {
    const values = addValues(bloc.center, {
      change: gaussian(rng, 0, 7),
      growth: gaussian(rng, 0, 7),
      services: gaussian(rng, 0, 7),
    })
    parties.push({
      id: `party-minor-${index + 1}`,
      name: partyNameForBloc(rng, bloc, 'minor'),
      leader: createLeaderName(rng),
      colour: colourPalette[(index + majorBlocs.length) % colourPalette.length],
      values,
      origin: 'generated',
      tier: 'minor',
      strategyTags: strategyTagsForValues(values),
      seedBlocId: bloc.id,
      organization: clamp(0.36 + bloc.weight * 0.7, 0.28, 0.72),
      baseUtility: -0.12,
      momentum: 0,
      focusSeatIds: [],
      slogan: pickOne(rng, ['One ward at a time!', 'Tiny but mighty!', 'For our corner of town!', 'A louder local voice!']),
      aiActionPoints: 2,
      wardBoosts: {},
    })
  })

  return parties
}

function convertCustomParties(customParties: CustomPartyDraft[]) {
  return customParties.map<PartyDefinition>((party, index) => ({
    id: `party-custom-${index + 1}`,
    name: party.name,
    leader: party.leader,
    colour: party.colour,
    values: cloneValues(party.values),
    origin: 'custom',
    tier: 'custom',
    strategyTags: strategyTagsForValues(party.values),
    organization: 0.55,
    baseUtility: -0.08,
    momentum: 0,
    focusSeatIds: [],
    slogan: 'A brand new idea for town hall!',
    aiActionPoints: 2,
    wardBoosts: {},
  }))
}

function assignPartyFocus(parties: PartyDefinition[], constituencies: Constituency[]) {
  return parties.map((party) => ({
    ...party,
    focusSeatIds: [...constituencies]
      .sort((a, b) => {
        const blocWeight = party.seedBlocId ? 2.2 : 0
        const aScore = party.strategyTags.reduce((sum, tag) => sum + (a.tags.includes(tag) ? 1 : 0), 0)
          + (party.seedBlocId ? (a.blocMix[party.seedBlocId] ?? 0) * blocWeight : 0)
        const bScore = party.strategyTags.reduce((sum, tag) => sum + (b.tags.includes(tag) ? 1 : 0), 0)
          + (party.seedBlocId ? (b.blocMix[party.seedBlocId] ?? 0) * blocWeight : 0)
        return bScore - aScore
      })
      .slice(0, party.tier === 'major' ? 4 : 2)
      .map((seat) => seat.id),
  }))
}

function softmax(scores: number[]) {
  const max = Math.max(...scores)
  const values = scores.map((score) => Math.exp(score - max))
  const total = values.reduce((sum, value) => sum + value, 0)
  return values.map((value) => value / total)
}

function partyEventBonus(party: PartyDefinition, current: GeographicCurrent, tileTags: string[]) {
  if (!current.tags.some((tag) => tileTags.includes(tag))) return 0
  if (!current.popularityEffect) return 0
  if (current.popularityEffect.target === 'all') return current.popularityEffect.amount
  if (current.popularityEffect.target === party.tier) return current.popularityEffect.amount
  return 0
}

function scorePartyForTile(world: World, seat: Constituency | undefined, tile: PopulationTile, party: PartyDefinition) {
  const wardFit = party.seedBlocId ? (tile.blocMix[party.seedBlocId] ?? 0) * (party.tier === 'major' ? 1.25 : 0.9) : 0.22
  const focus = seat && party.focusSeatIds.includes(seat.id) ? 0.18 : 0
  const organization = Math.log(party.organization + 1) * 0.38
  const tagBonus = party.strategyTags.reduce((sum, tag) => sum + (tile.tags.includes(tag) ? 0.12 : 0), 0)
  const issueFit = -valueDistance(tile.values, party.values, tile.salience) / 12000
  const eventBonus = world.currents.reduce((sum, current) => sum + partyEventBonus(party, current, tile.tags), 0)
  // Campaign boost from canvassing/ads/rally
  const wardBoost = seat ? (party.wardBoosts[seat.id] ?? 0) : 0
  const tileBoost = (tile.campaignBoosts?.[party.id] ?? 0)
  return wardFit + focus + organization + tagBonus + issueFit + eventBonus + party.baseUtility + party.momentum + wardBoost + tileBoost
}

export function estimateTilePreference(
  world: World,
  tile: PopulationTile,
  constituency: Constituency | undefined = world.constituencies.find((seat) => seat.id === tile.constituencyId),
): TilePreferenceEstimate {
  const scores = world.parties.map((party) => scorePartyForTile(world, constituency, tile, party))
  const turnout = clamp(tile.turnout + (Math.max(...scores) - Math.min(...scores)) * 0.01, 0.4, 0.95)
  const rankings = softmax(scores)
    .map<TilePartyPreference>((support, partyIndex) => {
      const party = world.parties[partyIndex]
      return {
        partyId: party.id,
        partyName: party.name,
        leader: party.leader,
        colour: party.colour,
        support: support * 100,
        score: scores[partyIndex],
      }
    })
    .sort((a, b) => b.support - a.support)

  return { turnout, rankings }
}

function calculateResults(world: World) {
  const partyVotes = new Map<string, number>()
  const partySeats = new Map<string, number>()
  const nextConstituencies = world.constituencies.map((seat) => ({ ...seat, results: [] as ConstituencyResult[] }))
  world.parties.forEach((party) => {
    partyVotes.set(party.id, 0)
    partySeats.set(party.id, 0)
  })

  nextConstituencies.forEach((seat) => {
    const voteTotals = new Map<string, number>()
    let totalVotes = 0
    world.tiles.filter((tile) => tile.constituencyId === seat.id).forEach((tile) => {
      const estimate = estimateTilePreference(world, tile, seat)
      const activeVotes = tile.population * estimate.turnout
      totalVotes += activeVotes
      estimate.rankings.forEach((result) => {
        const party = world.parties.find((entry) => entry.id === result.partyId)
        if (!party) return
        voteTotals.set(party.id, (voteTotals.get(party.id) ?? 0) + activeVotes * result.support / 100)
        partyVotes.set(party.id, (partyVotes.get(party.id) ?? 0) + activeVotes * result.support / 100)
      })
    })

    const results = world.parties
      .map<ConstituencyResult>((party) => ({
        partyId: party.id,
        partyName: party.name,
        colour: party.colour,
        votes: voteTotals.get(party.id) ?? 0,
        voteShare: totalVotes > 0 ? ((voteTotals.get(party.id) ?? 0) / totalVotes) * 100 : 0,
      }))
      .sort((a, b) => b.votes - a.votes)

    const winner = results[0]
    const runnerUp = results[1] ?? winner
    partySeats.set(winner.partyId, (partySeats.get(winner.partyId) ?? 0) + 1)
    seat.results = results
    seat.leadingPartyId = winner.partyId
    seat.leadingPartyName = winner.partyName
    seat.margin = winner.voteShare - runnerUp.voteShare
    seat.turnout = totalVotes / Math.max(1, seat.population)
  })

  const totalVotes = [...partyVotes.values()].reduce((sum, value) => sum + value, 0)
  return {
    constituencies: nextConstituencies,
    nationalResults: world.parties
      .map<PartyPerformance>((party) => ({
        partyId: party.id,
        partyName: party.name,
        leader: party.leader,
        colour: party.colour,
        votes: partyVotes.get(party.id) ?? 0,
        voteShare: totalVotes > 0 ? ((partyVotes.get(party.id) ?? 0) / totalVotes) * 100 : 0,
        seatsWon: partySeats.get(party.id) ?? 0,
      }))
      .sort((a, b) => b.seatsWon - a.seatsWon || b.voteShare - a.voteShare),
  }
}

function buildStats(world: Omit<World, 'stats' | 'headlines'> & { nationalResults: PartyPerformance[]; constituencies: Constituency[] }): TownStats {
  const sortedByMargin = [...world.constituencies].sort((a, b) => a.margin - b.margin)
  const leader = world.nationalResults[0]
  const battlegroundWardIds = world.constituencies
    .filter((seat) => seat.margin < 10 && seat.margin >= 0)
    .map((seat) => seat.id)
  return {
    councilMajority: Math.floor(world.constituencies.length / 2) + 1,
    averageTurnout: world.constituencies.reduce((sum, seat) => sum + seat.turnout, 0) / Math.max(1, world.constituencies.length),
    projectedMayorParty: leader?.partyName ?? 'No one yet',
    projectedMayorLeader: leader?.leader ?? 'No one yet',
    projectedMayorWards: leader?.seatsWon ?? 0,
    currentMayorParty: world.currentMayorParty,
    currentMayorLeader: world.currentMayorLeader,
    closestWardName: sortedByMargin[0]?.name ?? 'None',
    closestWardMargin: sortedByMargin[0]?.margin ?? 0,
    safestWardName: sortedByMargin[sortedByMargin.length - 1]?.name ?? 'None',
    safestWardMargin: sortedByMargin[sortedByMargin.length - 1]?.margin ?? 0,
    totalWards: world.constituencies.length,
    electionCycleWeeks: world.electionCycleWeeks,
    weeksUntilElection: world.weeksUntilElection,
    battlegroundWardIds,
  }
}

function summarizeHeadlines(world: World): string[] {
  const leader = world.nationalResults[0]
  const second = world.nationalResults[1]
  const playerParty = world.parties.find((p) => p.id === world.playerPartyId)
  const playerResult = world.nationalResults.find((r) => r.partyId === world.playerPartyId)
  const closest = world.constituencies.find((c) => c.name === world.stats.closestWardName)

  const lines: string[] = []
  if (leader) {
    lines.push(`${leader.partyName} leads with ${leader.seatsWon} ward${leader.seatsWon !== 1 ? 's' : ''} — ${leader.voteShare.toFixed(1)}% of the vote.`)
  }
  if (closest && closest.margin < 8) {
    lines.push(`${closest.name} is tonight's squeaker — only ${closest.margin.toFixed(1)} points between the top two.`)
  }
  if (world.currents[0]) {
    lines.push(`${world.currents[0].label} is the talk of the town this week.`)
  }
  if (playerParty && playerResult) {
    const seatsNeeded = world.stats.councilMajority - playerResult.seatsWon
    if (seatsNeeded <= 0) {
      lines.push(`${playerParty.name} is on course for a majority! Keep it up.`)
    } else if (seatsNeeded === 1) {
      lines.push(`${playerParty.name} needs just one more ward for a majority.`)
    } else {
      lines.push(`${playerParty.name} needs ${seatsNeeded} more wards. ${world.weeksUntilElection} weeks left.`)
    }
  } else if (second) {
    lines.push(`${second.partyName} is ${Math.max(0, leader.seatsWon - second.seatsWon)} ward${Math.abs(leader.seatsWon - second.seatsWon) !== 1 ? 's' : ''} behind with ${world.weeksUntilElection} weeks to go.`)
  }
  return lines
}

function evolveCurrents(currents: GeographicCurrent[], rng: () => number) {
  const reshuffled = [...currents].map((current) => ({
    ...current,
    intensity: clamp(current.intensity + gaussian(rng, 0, 0.08), 0.5, 1.45),
  }))
  if (rng() < 0.18) {
    // Pick a newcomer that isn't already active, to avoid duplicate ids
    const activeIds = new Set(reshuffled.map((c) => c.id))
    const candidates = issueCurrents.filter((c) => !activeIds.has(c.id))
    const pool = candidates.length > 0 ? candidates : issueCurrents
    const newcomer = pickOne(rng, pool)
    const replaceIndex = Math.floor(rng() * reshuffled.length)
    reshuffled[replaceIndex] = { ...newcomer, intensity: randomBetween(rng, 0.75, 1.3) }
  }
  return reshuffled
}

function driftTiles(world: World, rng: () => number) {
  return world.tiles.map((tile) => {
    let values = cloneValues(tile.values)
    world.currents.forEach((current) => {
      if (current.tags.some((tag) => tile.tags.includes(tag))) {
        values = addValues(values, current.effect, current.intensity * 0.14)
      }
    })
    return {
      ...tile,
      values: addValues(values, {
        change: gaussian(rng, 0, 0.8),
        growth: gaussian(rng, 0, 0.8),
        services: gaussian(rng, 0, 0.8),
      }),
    }
  })
}

function evolveParties(parties: PartyDefinition[], constituencies: Constituency[], rng: () => number, playerPartyId: string) {
  return assignPartyFocus(parties, constituencies).map((party) => {
    const isPlayer = party.id === playerPartyId
    return {
      ...party,
      baseUtility: clamp(
        party.baseUtility * 0.82 + gaussian(rng, 0, party.tier === 'major' ? 0.08 : 0.05),
        -1.2, 1.2,
      ),
      momentum: clamp(party.momentum * 0.5 + gaussian(rng, 0, 0.08), -0.7, 0.7),
      // Reset AI action points each week (players get theirs in App)
      aiActionPoints: isPlayer ? party.aiActionPoints : (party.tier === 'major' ? 3 : 2),
      // Decay ward boosts slightly each week
      wardBoosts: Object.fromEntries(
        Object.entries(party.wardBoosts).map(([k, v]) => [k, v * 0.7]),
      ),
    }
  })
}

// ─── AI campaigning ──────────────────────────────────────────────────────────
function runAICampaigns(world: World, rng: () => number): { parties: PartyDefinition[]; newsFeedLines: string[] } {
  const newsFeedLines: string[] = []
  const updatedParties = world.parties.map((party) => {
    if (party.id === world.playerPartyId) return party
    let ap = party.aiActionPoints
    const boosts = { ...party.wardBoosts }

    // AI prioritises focus seats and closest battlegrounds
    const targetWards = [...world.constituencies]
      .filter((c) => party.focusSeatIds.includes(c.id) || world.stats.battlegroundWardIds.includes(c.id))
      .sort((a) => {
        // Prefer wards where this party is close but not leading
        const isLeading = a.leadingPartyId === party.id
        return isLeading ? 1 : -1
      })

    while (ap > 0 && targetWards.length > 0) {
      const ward = pickOne(rng, targetWards.slice(0, 3))
      if (!ward) break
      // Canvass (cost 1 AP)
      boosts[ward.id] = clamp((boosts[ward.id] ?? 0) + 0.06, 0, 0.35)
      ap -= 1
      if (rng() < 0.3) {
        newsFeedLines.push(`${party.name} campaigners spotted knocking doors in ${ward.name}.`)
      }
    }

    return { ...party, aiActionPoints: ap, wardBoosts: boosts }
  })

  return { parties: updatedParties, newsFeedLines }
}

// ─── Apply player campaign action ────────────────────────────────────────────
export function applyCampaignAction(world: World, action: CampaignAction): { world: World; result: ActionResult } {
  const rng = createRng(world.seed + world.week * 999 + Date.now() % 1000)
  const playerParty = world.parties.find((p) => p.id === world.playerPartyId)
  if (!playerParty) {
    return {
      world,
      result: { action, outcome: 'neutral', description: 'No party selected.' },
    }
  }

  let updatedParties = [...world.parties]
  let updatedTiles = [...world.tiles]
  let voteShareDelta = 0
  let outcome: ActionResult['outcome'] = 'success'
  let description = ''
  let wardName: string | undefined
  let targetPartyName: string | undefined

  const targetWard = action.wardId ? world.constituencies.find((c) => c.id === action.wardId) : undefined
  wardName = targetWard?.name

  switch (action.type) {
    case 'canvass': {
      if (!targetWard) break
      // Boost player's score in that ward's tiles
      updatedParties = updatedParties.map((p) =>
        p.id === world.playerPartyId
          ? { ...p, wardBoosts: { ...p.wardBoosts, [targetWard.id]: clamp((p.wardBoosts[targetWard.id] ?? 0) + 0.10, 0, 0.45) } }
          : p,
      )
      // Calculate approximate delta
      const playerResult = targetWard.results.find((r) => r.partyId === world.playerPartyId)
      voteShareDelta = playerResult ? Math.min(5, (100 - playerResult.voteShare) * 0.08) : 3
      description = `Volunteers hit the doorsteps of ${targetWard.name}. Support is ticking upward.`
      break
    }
    case 'ads': {
      if (!targetWard) break
      updatedParties = updatedParties.map((p) =>
        p.id === world.playerPartyId
          ? { ...p, wardBoosts: { ...p.wardBoosts, [targetWard.id]: clamp((p.wardBoosts[targetWard.id] ?? 0) + 0.14, 0, 0.45) } }
          : p,
      )
      const playerResult = targetWard.results.find((r) => r.partyId === world.playerPartyId)
      voteShareDelta = playerResult ? Math.min(7, (100 - playerResult.voteShare) * 0.10) : 4
      description = `Leaflets and local ads blanketed ${targetWard.name}. Your profile is rising.`
      break
    }
    case 'rally': {
      if (!targetWard) break
      const playerResult = targetWard.results.find((r) => r.partyId === world.playerPartyId)
      const support = playerResult?.voteShare ?? 20
      // Risk/reward: higher base support = better chance of going well
      const successChance = 0.35 + support / 200
      const success = rng() < successChance
      if (success) {
        updatedParties = updatedParties.map((p) =>
          p.id === world.playerPartyId
            ? { ...p, wardBoosts: { ...p.wardBoosts, [targetWard.id]: clamp((p.wardBoosts[targetWard.id] ?? 0) + 0.22, 0, 0.55) }, momentum: clamp(p.momentum + 0.12, -0.7, 0.7) }
            : p,
        )
        voteShareDelta = Math.min(12, (100 - support) * 0.14)
        description = `The rally in ${targetWard.name} drew a big crowd. The energy is electric!`
        outcome = 'success'
      } else {
        updatedParties = updatedParties.map((p) =>
          p.id === world.playerPartyId
            ? { ...p, momentum: clamp(p.momentum - 0.08, -0.7, 0.7) }
            : p,
        )
        voteShareDelta = -2
        description = `The rally in ${targetWard.name} fell flat. A sparse crowd and an awkward speech.`
        outcome = 'backfire'
      }
      break
    }
    case 'smear': {
      if (!targetWard || !action.targetPartyId) break
      const targetParty = world.parties.find((p) => p.id === action.targetPartyId)
      targetPartyName = targetParty?.name
      const backfireChance = 0.28
      const backfired = rng() < backfireChance
      if (backfired) {
        // Smear backfires: damages player instead
        updatedParties = updatedParties.map((p) =>
          p.id === world.playerPartyId
            ? { ...p, momentum: clamp(p.momentum - 0.14, -0.7, 0.7), baseUtility: clamp(p.baseUtility - 0.08, -1.2, 1.2) }
            : p,
        )
        voteShareDelta = -3
        description = `The attack campaign on ${targetParty?.name ?? 'your opponent'} backfired badly. Voters aren't impressed.`
        outcome = 'backfire'
      } else {
        // Smear works: damages target in that ward
        updatedParties = updatedParties.map((p) =>
          p.id === action.targetPartyId
            ? { ...p, wardBoosts: { ...p.wardBoosts, [targetWard.id]: clamp((p.wardBoosts[targetWard.id] ?? 0) - 0.12, -0.35, 0.45) } }
            : p,
        )
        voteShareDelta = 2
        description = `The attack campaign dented ${targetParty?.name ?? 'their'} support in ${targetWard.name}.`
        outcome = 'success'
      }
      break
    }
    case 'respond_event': {
      if (!world.weeklyEvent || world.weeklyEvent.resolved) break
      const choiceIndex = action.eventChoiceIndex ?? 0
      const choice = world.weeklyEvent.choices[choiceIndex]
      if (!choice) break
      // Apply event effect to matching tiles
      updatedTiles = updatedTiles.map((tile) => {
        const matches = choice.effect.tags.some((tag) => tile.tags.includes(tag))
        if (!matches) return tile
        return {
          ...tile,
          values: addValues(tile.values, choice.effect.valueDrift, 0.8),
          campaignBoosts: {
            ...tile.campaignBoosts,
            [world.playerPartyId]: clamp((tile.campaignBoosts?.[world.playerPartyId] ?? 0) + choice.effect.playerBoost, 0, 0.4),
          },
        }
      })
      voteShareDelta = choice.effect.playerBoost * 80
      description = `You responded to "${world.weeklyEvent.headline}" — ${choice.label}. Voters noticed.`
      outcome = 'success'
      break
    }
    case 'policy_shift': {
      if (!action.policyAxis || !action.policyDirection) break
      updatedParties = updatedParties.map((p) => {
        if (p.id !== world.playerPartyId) return p
        const newValues = { ...p.values }
        newValues[action.policyAxis!] = clamp(newValues[action.policyAxis!] + action.policyDirection! * 18, -100, 100)
        return { ...p, values: newValues, strategyTags: strategyTagsForValues(newValues) }
      })
      voteShareDelta = 1
      const axisLabel = action.policyAxis === 'change' ? 'reform' : action.policyAxis === 'growth' ? 'growth' : 'services'
      const dirLabel = action.policyDirection === 1 ? 'more' : 'less'
      description = `Your party shifted its stance to emphasise ${dirLabel} ${axisLabel}. Some voters are paying attention.`
      break
    }
  }

  const updatedWorld: World = {
    ...world,
    parties: updatedParties,
    tiles: updatedTiles,
    playerActionPoints: world.playerActionPoints - action.apCost,
    weeklyEvent: action.type === 'respond_event' && world.weeklyEvent
      ? { ...world.weeklyEvent, resolved: true, chosenIndex: action.eventChoiceIndex }
      : world.weeklyEvent,
    policyShiftUsedThisCycle: action.type === 'policy_shift' ? true : world.policyShiftUsedThisCycle,
  }

  // Recalculate results after action
  const results = calculateResults(updatedWorld)
  const withResults = { ...updatedWorld, constituencies: results.constituencies, nationalResults: results.nationalResults }
  const stats = buildStats(withResults)
  const finalWorld = { ...withResults, stats, headlines: summarizeHeadlines({ ...withResults, stats, headlines: [] }) }

  const result: ActionResult = {
    action,
    wardName,
    targetPartyName,
    outcome,
    description,
    voteShareDelta,
    backfired: outcome === 'backfire',
  }

  const newsFeedLine = `Week ${world.week}: ${description}`
  const updatedNewsFeed = [newsFeedLine, ...finalWorld.newsFeed].slice(0, 30)

  return {
    world: { ...finalWorld, newsFeed: updatedNewsFeed, actionsThisWeek: [...finalWorld.actionsThisWeek, result] },
    result,
  }
}

// ─── Pick a weekly event ─────────────────────────────────────────────────────
function pickWeeklyEvent(rng: () => number): WeeklyEvent | undefined {
  if (rng() < 0.6) {
    const evt = pickOne(rng, weeklyEventPool)
    return { ...evt, resolved: false }
  }
  return undefined
}

// ─── Pick a governance decision ──────────────────────────────────────────────
function pickGovernanceDecision(rng: () => number): GovernanceDecision {
  const dec = pickOne(rng, governanceDecisionPool)
  return { ...dec, resolved: false }
}

// ─── Main world generation ────────────────────────────────────────────────────
export function generateWorld(options: WorldOptions): World {
  const rng = createRng(options.seed)
  const townName = createTownName(rng)
  const councilName = `${townName} Town Council`
  const landmass = createLandmass(rng)
  const centers = createSettlementCenters(rng, landmass.points, townName)
  const blocs = generateBlocs(rng)

  // Create parties first (before constituencies, since constituencies need candidates)
  let parties = [...createGeneratedParties(rng, blocs), ...convertCustomParties(options.customParties)]

  const tiles = createPopulationTiles(rng, landmass.points, centers, blocs)
  const constituencies = createConstituencies(rng, tiles, options.constituencyCount, parties)
  parties = assignPartyFocus(parties, constituencies)

  // Player is the LAST major party — starting behind as underdog
  const majorParties = parties.filter((p) => p.tier === 'major')
  const defaultPlayerPartyId = options.playerPartyId && parties.some((p) => p.id === options.playerPartyId)
    ? options.playerPartyId
    : majorParties[majorParties.length - 1]?.id ?? parties[0]?.id ?? ''

  // Give the player party slightly lower initial stats to make them underdog
  parties = parties.map((p) => {
    if (p.id === defaultPlayerPartyId) {
      return { ...p, organization: p.organization * 0.78, baseUtility: p.baseUtility - 0.04 }
    }
    return p
  })

  const electionCycleWeeks = 24
  // Start 8–20 weeks before the first election so you can campaign
  const weeksUntilElection = Math.floor(randomBetween(rng, 8, 20))
  const currents = [...issueCurrents].sort(() => rng() - 0.5).slice(0, 3).map<GeographicCurrent>((current) => ({
    ...current,
    intensity: randomBetween(rng, 0.7, 1.25),
  }))

  const incumbent = pickOne(rng, majorParties.filter((p) => p.id !== defaultPlayerPartyId))

  const baseWorld = {
    seed: options.seed,
    week: 1,
    name: townName,
    townName,
    councilName,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    totalPopulation: tiles.reduce((sum, tile) => sum + tile.population, 0),
    landmass,
    settlementCenters: centers,
    currents,
    blocs,
    parties,
    constituencies,
    nationalResults: [] as PartyPerformance[],
    tiles,
    playerPartyId: defaultPlayerPartyId,
    currentMayorParty: incumbent?.name ?? majorParties[0]?.name ?? '',
    currentMayorLeader: incumbent?.leader ?? majorParties[0]?.leader ?? '',
    electionCycleWeeks,
    weeksUntilElection,
    playerActionPoints: 5,
    maxActionPoints: 5,
    actionsThisWeek: [] as ActionResult[],
    weeklyEvent: pickWeeklyEvent(rng),
    newsFeed: [`Welcome to ${townName}. Your campaign begins now. Election in ${weeksUntilElection} weeks.`],
    voteHistory: [] as VoteHistoryEntry[],
    isGoverning: false,
    governanceDecisions: [] as GovernanceDecision[],
    electionNightActive: false,
    electionNightResults: [],
    electionNightRevealIndex: 0,
    electionsHeld: 0,
    playerWon: false,
    playerLost: false,
    policyShiftUsedThisCycle: false,
    headlines: [] as string[],
  }

  // Build a temporary stats object so calculateResults can run
  const tempStats: TownStats = {
    councilMajority: Math.floor(constituencies.length / 2) + 1,
    averageTurnout: 0,
    projectedMayorParty: '',
    projectedMayorLeader: '',
    projectedMayorWards: 0,
    currentMayorParty: baseWorld.currentMayorParty,
    currentMayorLeader: baseWorld.currentMayorLeader,
    closestWardName: '',
    closestWardMargin: 0,
    safestWardName: '',
    safestWardMargin: 0,
    totalWards: constituencies.length,
    electionCycleWeeks: baseWorld.electionCycleWeeks,
    weeksUntilElection: baseWorld.weeksUntilElection,
    battlegroundWardIds: [],
  }
  const worldForCalc = { ...baseWorld, stats: tempStats } as World
  const results = calculateResults(worldForCalc)
  const withResults = { ...baseWorld, constituencies: results.constituencies, nationalResults: results.nationalResults }
  const stats = buildStats(withResults as Parameters<typeof buildStats>[0])
  const world = { ...withResults, stats, headlines: [] as string[] }
  return { ...world, headlines: summarizeHeadlines(world as World) }
}

// ─── Week simulation ──────────────────────────────────────────────────────────
export function simulateWeek(world: World): World {
  const rng = createRng(world.seed + world.week * 1337)

  const currents = evolveCurrents(world.currents, rng)
  const tilesBeforeAI = driftTiles(world, rng)
  const partiesEvolved = evolveParties(world.parties, world.constituencies, rng, world.playerPartyId)

  // Save vote history entry before this week's changes
  const historyEntry: VoteHistoryEntry = {
    week: world.week,
    partyShares: Object.fromEntries(world.nationalResults.map((r) => [r.partyId, r.voteShare])),
    partySeats: Object.fromEntries(world.nationalResults.map((r) => [r.partyId, r.seatsWon])),
  }

  // Update ward histories
  const constituenciesWithHistory = world.constituencies.map((seat) => ({
    ...seat,
    history: [
      ...seat.history,
      { week: world.week, leadingPartyId: seat.leadingPartyId, margin: seat.margin, results: seat.results },
    ].slice(-24), // Keep last 24 weeks
  }))

  const provisional = {
    ...world,
    week: world.week + 1,
    currents,
    tiles: tilesBeforeAI,
    parties: partiesEvolved,
    constituencies: constituenciesWithHistory,
    weeksUntilElection: world.weeksUntilElection > 0 ? world.weeksUntilElection - 1 : world.electionCycleWeeks,
    // Reset player AP for new week
    playerActionPoints: world.maxActionPoints,
    actionsThisWeek: [] as ActionResult[],
    // New weekly event
    weeklyEvent: pickWeeklyEvent(rng),
    policyShiftUsedThisCycle: world.weeksUntilElection === 0 ? false : world.policyShiftUsedThisCycle,
    voteHistory: [...world.voteHistory, historyEntry].slice(-52),
  }

  // Run AI campaigns
  const { parties: partiesAfterAI, newsFeedLines: aiNews } = runAICampaigns(provisional as World, rng)
  const provisionalWithAI = { ...provisional, parties: partiesAfterAI }

  const results = calculateResults(provisionalWithAI as World)
  const seatLeader = results.nationalResults[0]

  // Check for election
  const electionHappening = world.weeksUntilElection === 0
  const playerResult = results.nationalResults.find((r) => r.partyId === world.playerPartyId)
  const majority = Math.floor(provisionalWithAI.constituencies.length / 2) + 1
  const playerWon = electionHappening && (playerResult?.seatsWon ?? 0) >= majority
  const playerLost = electionHappening && !playerWon

  // Build election night results if election is happening
  const electionNightResults = electionHappening
    ? results.constituencies.map((seat) => {
        const winner = seat.candidates.find((c) => c.partyId === seat.leadingPartyId)
        const previousHistory = seat.history[seat.history.length - 1]
        return {
          wardId: seat.id,
          wardName: seat.name,
          winner: winner ?? seat.candidates[0],
          results: seat.results,
          swingFromLastElection: previousHistory
            ? seat.margin - previousHistory.margin
            : undefined,
          wasHeld: seat.leadingPartyId !== (seat.history[0]?.leadingPartyId ?? seat.leadingPartyId),
          previousWinner: seat.history[0]?.leadingPartyId,
        }
      })
    : world.electionNightResults

  const newsFeedLines: string[] = [...aiNews]
  if (currents[0] && currents[0].id !== world.currents[0]?.id) {
    newsFeedLines.push(`New issue in town: ${currents[0].label} — ${currents[0].description}`)
  }
  if (electionHappening) {
    if (playerWon) {
      newsFeedLines.push(`ELECTION NIGHT: ${world.parties.find((p) => p.id === world.playerPartyId)?.name} wins the council majority!`)
    } else {
      newsFeedLines.push(`ELECTION NIGHT: ${seatLeader?.partyName ?? 'Unknown'} wins the council.`)
    }
  }

  // ── Ward movement news lines ──────────────────────────────────────────────
  // Compare each ward's old leader/share to the new results and emit plain-English lines
  const playerPartyName = world.parties.find((p) => p.id === world.playerPartyId)?.name ?? 'Your party'

  if (!electionHappening) {
    for (const newSeat of results.constituencies) {
      const oldSeat = world.constituencies.find((c) => c.id === newSeat.id)
      if (!oldSeat) continue

      const oldLeader = oldSeat.leadingPartyId
      const newLeader = newSeat.leadingPartyId
      const leaderChanged = oldLeader !== newLeader

      // Seat changed hands
      if (leaderChanged) {
        const gainedParty = world.parties.find((p) => p.id === newLeader)?.name ?? newLeader
        const lostParty = world.parties.find((p) => p.id === oldLeader)?.name ?? oldLeader
        if (newLeader === world.playerPartyId) {
          newsFeedLines.push(`${playerPartyName} TAKES ${newSeat.name} from ${lostParty}! Margin: ${newSeat.margin.toFixed(1)}pts.`)
        } else if (oldLeader === world.playerPartyId) {
          newsFeedLines.push(`${playerPartyName} LOSES ${newSeat.name} to ${gainedParty}. Now ${newSeat.margin.toFixed(1)}pts behind.`)
        } else {
          newsFeedLines.push(`${newSeat.name} flips: ${gainedParty} takes it from ${lostParty}.`)
        }
        continue
      }

      // No change of hands — look for significant vote share movement for the player
      const oldPlayerShare = oldSeat.results.find((r) => r.partyId === world.playerPartyId)?.voteShare ?? 0
      const newPlayerShare = newSeat.results.find((r) => r.partyId === world.playerPartyId)?.voteShare ?? 0
      const playerDelta = newPlayerShare - oldPlayerShare

      // Significant swing towards player (≥2.5pp)
      if (playerDelta >= 2.5) {
        const isLeading = newLeader === world.playerPartyId
        if (isLeading) {
          newsFeedLines.push(`${playerPartyName} strengthening in ${newSeat.name}: +${playerDelta.toFixed(1)}pp, now ${newSeat.margin.toFixed(1)}pts clear.`)
        } else {
          const gap = newSeat.results.find((r) => r.partyId === world.playerPartyId)
          const leader = newSeat.results.find((r) => r.partyId === newLeader)
          const deficit = leader && gap ? leader.voteShare - gap.voteShare : newSeat.margin
          newsFeedLines.push(`${playerPartyName} closing in ${newSeat.name}: +${playerDelta.toFixed(1)}pp, now ${deficit.toFixed(1)}pts off the lead.`)
        }
      } else if (playerDelta <= -2.5) {
        // Significant swing against player
        if (newLeader === world.playerPartyId) {
          newsFeedLines.push(`${playerPartyName} slipping in ${newSeat.name}: ${playerDelta.toFixed(1)}pp, lead now just ${newSeat.margin.toFixed(1)}pts.`)
        } else {
          newsFeedLines.push(`${playerPartyName} falling back in ${newSeat.name}: ${playerDelta.toFixed(1)}pp.`)
        }
      }

      // Battleground alert: was comfortable, now tight (or vice versa)
      const wasBattleground = oldSeat.margin < 10
      const isBattlegroundNow = newSeat.margin < 10
      if (!wasBattleground && isBattlegroundNow && newLeader !== world.playerPartyId) {
        newsFeedLines.push(`${newSeat.name} suddenly marginal — margin down to ${newSeat.margin.toFixed(1)}pts. In play?`)
      } else if (wasBattleground && !isBattlegroundNow && newLeader === world.playerPartyId) {
        newsFeedLines.push(`${playerPartyName} pulling away in ${newSeat.name}: margin up to ${newSeat.margin.toFixed(1)}pts.`)
      }
    }
  }

  const merged = {
    ...provisionalWithAI,
    constituencies: results.constituencies.map((seat) => ({
      ...seat,
      history: constituenciesWithHistory.find((c) => c.id === seat.id)?.history ?? seat.history,
    })),
    nationalResults: results.nationalResults,
    currentMayorParty: electionHappening && seatLeader ? seatLeader.partyName : world.currentMayorParty,
    currentMayorLeader: electionHappening && seatLeader ? seatLeader.leader : world.currentMayorLeader,
    electionNightActive: electionHappening,
    electionNightResults,
    electionNightRevealIndex: 0,
    electionsHeld: world.electionsHeld + (electionHappening ? 1 : 0),
    playerWon: world.playerWon || playerWon,
    playerLost: !playerWon && playerLost ? true : world.playerLost,
    isGoverning: electionHappening ? playerWon : world.isGoverning,
    governanceDecisions: electionHappening && playerWon
      ? [pickGovernanceDecision(rng), pickGovernanceDecision(rng)]
      : world.governanceDecisions,
    newsFeed: [...newsFeedLines.map((l) => `Week ${world.week + 1}: ${l}`), ...world.newsFeed].slice(0, 30),
  }

  const stats = buildStats(merged)
  return { ...merged, stats, headlines: summarizeHeadlines({ ...merged, stats, headlines: [] }) }
}

// ─── Exported helpers ─────────────────────────────────────────────────────────
export function formatPopulation(value: number) {
  return new Intl.NumberFormat('en-GB').format(Math.round(value))
}

export function topBlocEntries(blocMix: Record<string, number>, limit = 4) {
  return Object.entries(blocMix)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, value]) => ({ key, label: titleCaseBloc(key), share: value * 100 }))
}

export function describeValues(values: PoliticalValues) {
  const words: string[] = []
  if (values.change > 18) words.push('restless')
  if (values.change < -10) words.push('steady')
  if (values.growth > 18) words.push('growth-hungry')
  if (values.growth < -10) words.push('careful-spending')
  if (values.services > 20) words.push('service-focused')
  if (words.length === 0) words.push('easygoing')
  return words.slice(0, 3).join(' / ')
}

export function axisSummary(values: PoliticalValues) {
  return VALUE_KEYS.map((key) => ({ key, value: values[key] }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 3)
    .map(({ key, value }) => `${key} ${value < 0 ? 'leans low' : 'leans high'} ${Math.abs(value).toFixed(0)}`)
}

export function getAvailableActions(world: World): CampaignAction[] {
  const actions: CampaignAction[] = []
  const ap = world.playerActionPoints

  // Canvass: cost 1 AP
  if (ap >= 1) {
    world.constituencies.forEach((ward) => {
      actions.push({
        type: 'canvass',
        label: `Canvass ${ward.name}`,
        description: 'Send volunteers door-to-door. Steady, reliable boost to support.',
        apCost: 1,
        wardId: ward.id,
      })
    })
  }

  // Ads: cost 2 AP
  if (ap >= 2) {
    world.constituencies.forEach((ward) => {
      actions.push({
        type: 'ads',
        label: `Run ads in ${ward.name}`,
        description: 'Flood local social and print with targeted ads. Bigger boost than canvassing.',
        apCost: 2,
        wardId: ward.id,
      })
    })
  }

  // Rally: cost 3 AP (risk/reward)
  if (ap >= 3) {
    world.constituencies.forEach((ward) => {
      actions.push({
        type: 'rally',
        label: `Hold a rally in ${ward.name}`,
        description: 'Big public event. Can go brilliantly — or fall flat.',
        apCost: 3,
        wardId: ward.id,
      })
    })
  }

  // Smear: cost 2 AP
  if (ap >= 2) {
    const opponents = world.parties.filter((p) => p.id !== world.playerPartyId)
    world.constituencies.forEach((ward) => {
      opponents.forEach((opp) => {
        actions.push({
          type: 'smear',
          label: `Attack ${opp.name} in ${ward.name}`,
          description: 'Negative campaign targeting opponent. Risk of backfire.',
          apCost: 2,
          wardId: ward.id,
          targetPartyId: opp.id,
        })
      })
    })
  }

  // Policy shift: cost 0 AP but once per cycle
  if (!world.policyShiftUsedThisCycle) {
    const axes: Array<{ axis: 'change' | 'growth' | 'services'; label: string }> = [
      { axis: 'change', label: 'Reform' },
      { axis: 'growth', label: 'Growth' },
      { axis: 'services', label: 'Services' },
    ]
    axes.forEach(({ axis, label }) => {
      actions.push({
        type: 'policy_shift',
        label: `Shift policy: more ${label}`,
        description: `Move your party further towards ${label.toLowerCase()}. One shift allowed per cycle.`,
        apCost: 0,
        policyAxis: axis,
        policyDirection: 1,
      })
      actions.push({
        type: 'policy_shift',
        label: `Shift policy: less ${label}`,
        description: `Move your party away from ${label.toLowerCase()}.`,
        apCost: 0,
        policyAxis: axis,
        policyDirection: -1,
      })
    })
  }

  // Respond to weekly event: cost 1 AP
  if (world.weeklyEvent && !world.weeklyEvent.resolved && ap >= 1) {
    world.weeklyEvent.choices.forEach((choice, index) => {
      actions.push({
        type: 'respond_event',
        label: choice.label,
        description: choice.description,
        apCost: 1,
        eventChoiceIndex: index,
      })
    })
  }

  return actions
}
