import { Delaunay } from 'd3-delaunay'

import {
  VALUE_KEYS,
  type ActionResult,
  type ActiveCampaign,
  type AlliancePact,
  type AlliancePactEntry,
  type Budget,
  type CampaignAction,
  type Constituency,
  type ConstituencyResult,
  type CouncilDecisionRecord,
  type CouncillorTenure,
  type CustomPartyDraft,
  type FictionalBloc,
  type GeographicCurrent,
  type GovernanceDecision,
  type Landmass,
  type PartyDefinition,
  type PartyArchetype,
  type PartyEdit,
  type PartyFooting,
  type PartyPerformance,
  type PoliticalValueKey,
  type PoliticalValues,
  type PopulationTile,
  type SettlementCenter,
  type TilePreferenceEstimate,
  type TilePartyPreference,
  type TownStats,
  type VoteHistoryEntry,
  type ElectionSeatHistoryEntry,
  type CareerRank,
  type GovernmentState,
  type ElectoralPact,
  type CouncilMotion,
  type CouncilMotionVote,
  type Councillor,
  type MotionCategory,
  type ActionCategory,
  type CustomMotionInput,
  type PoliticianActionMeta,
  type PoliticianActionType,
  type PoliticianModeState,
  type PoliticianState,
  type PoliticianTrait,
  type Relationship,
  type WardCandidate,
  type WeeklyEvent,
  type World,
  type WorldOptions,
} from '../types/sim'
import {
  createCaretakerGovernment,
  governmentLeadParty,
  isPlayerPartyGovernmentLead,
} from '../sim/politics/government'

const MAP_WIDTH = 920
const MAP_HEIGHT = 640
const GRID_STEP = 18

const ISSUE_FIT_SCALE = 7000
const ALLIANCE_IDEOLOGY_SCALE = 8000
const COALITION_IDEOLOGY_SCALE = 12000
const SOFTMAX_TEMP = 0.85
const STANDING_DOWN_SCORE = -999
const WARD_BOOST_DECAY = 0.78
const CAMPAIGN_BOOST_DECAY = 0.78
const PERSONAL_APPROVAL_FACTOR = 0.4

const defaultSalience: PoliticalValues = { change: 1, growth: 1, services: 1 }

// ─── Issue currents pool ────────────────────────────────────────────────────
const issueCurrents: Array<{
  id: string
  label: string
  description: string
  tags: string[]
  effect: Partial<PoliticalValues>
  popularityEffect: { target: 'established' | 'challenger' | 'fringe' | 'all'; amount: number }
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
    popularityEffect: { target: 'established', amount: 0.08 },
  },
  {
    id: 'park-campaign',
    label: 'Park Cleanup Drive',
    description: 'Residents push for greener public space.',
    tags: ['river', 'pond', 'green'],
    effect: { change: 10, services: 8 },
    popularityEffect: { target: 'challenger', amount: 0.07 },
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
    popularityEffect: { target: 'fringe', amount: 0.09 },
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
    popularityEffect: { target: 'challenger', amount: 0.06 },
  },
  {
    id: 'school-places',
    label: 'School Places Crisis',
    description: 'Parents demand more primary school spots.',
    tags: ['school', 'suburban', 'east'],
    effect: { services: 10, change: 8 },
    popularityEffect: { target: 'all', amount: 0.04 },
  },
  {
    id: 'bus-route-cuts',
    label: 'Bus Route Cuts',
    description: 'Reduced weekend buses leave peripheral wards isolated.',
    tags: ['rural', 'suburban', 'industrial'],
    effect: { services: -12, growth: -5 },
    popularityEffect: { target: 'established', amount: -0.06 },
  },
  {
    id: 'high-street-ghost-town',
    label: 'High Street Vacancies',
    description: 'Empty storefronts are making the town center look bleak.',
    tags: ['market', 'center', 'oldtown'],
    effect: { growth: -15, change: 5 },
    popularityEffect: { target: 'all', amount: -0.05 },
  },
  {
    id: 'youth-vandalism',
    label: 'Anti-Social Behavior',
    description: 'A spike in late-night vandalism has older residents worried.',
    tags: ['park', 'center', 'south'],
    effect: { services: 5, change: -10 },
    popularityEffect: { target: 'fringe', amount: -0.04 },
  },
  {
    id: 'heritage-status',
    label: 'Heritage Status Bid',
    description: 'A campaign to protect historic buildings restricts new developments.',
    tags: ['oldtown', 'hill', 'center'],
    effect: { growth: -8, change: -12 },
    popularityEffect: { target: 'established', amount: 0.05 },
  },
  {
    id: 'air-quality-alert',
    label: 'Air Quality Concerns',
    description: 'Smog from the industrial estate is triggering health complaints.',
    tags: ['industrial', 'school', 'east'],
    effect: { services: 8, change: 10 },
    popularityEffect: { target: 'challenger', amount: 0.04 },
  },
  {
    id: 'tech-hub-rumors',
    label: 'Tech Hub Rumors',
    description: 'Excitement builds over a tech firm eyeing an old warehouse.',
    tags: ['metro', 'industrial', 'south'],
    effect: { growth: 15, change: 12 },
    popularityEffect: { target: 'fringe', amount: 0.07 },
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
  {
    id: 'evt-fly-tipping',
    headline: 'Massive Fly-Tipping Incident',
    description: 'Tons of construction waste have been dumped on a rural lane overnight.',
    tags: ['rural', 'green', 'north'],
    choices: [
      {
        label: 'Install covert cameras',
        description: 'Tough on crime approach. Expensive, but popular with locals.',
        effect: { tags: ['rural', 'north'], valueDrift: { services: 6, change: -4 }, playerBoost: 0.04, opponentBoost: 0 },
      },
      {
        label: 'Organize community clear-up',
        description: 'Cheaper, fosters community spirit, but doesn’t catch the culprits.',
        effect: { tags: ['green'], valueDrift: { change: 4 }, playerBoost: 0.02, opponentBoost: 0.02 },
      },
    ],
  },
  {
    id: 'evt-factory-closure',
    headline: 'Major Employer Threatens Exit',
    description: 'The canning factory says local taxes are too high and threatens to relocate.',
    tags: ['industrial', 'east', 'suburban'],
    choices: [
      {
        label: 'Offer emergency tax breaks',
        description: 'Saves jobs, but drains council coffers and angers progressives.',
        effect: { tags: ['industrial', 'suburban'], valueDrift: { growth: 10, change: -8 }, playerBoost: 0.05, opponentBoost: 0.03 },
      },
      {
        label: 'Call their bluff',
        description: 'Refuse corporate handouts. Very risky for local employment.',
        effect: { tags: ['east'], valueDrift: { growth: -12, services: 4 }, playerBoost: -0.02, opponentBoost: 0.06 },
      },
    ],
  },
  {
    id: 'evt-winter-grit',
    headline: 'Winter Grit Shortage',
    description: 'A sudden freeze hits, and the council is running out of road salt.',
    tags: ['hill', 'rural', 'suburban'],
    choices: [
      {
        label: 'Prioritize main roads only',
        description: 'Logical, but leaves side streets and hills trapped in ice.',
        effect: { tags: ['suburban'], valueDrift: { services: -4 }, playerBoost: 0.01, opponentBoost: 0.02 },
      },
      {
        label: 'Buy emergency stock at premium',
        description: 'Fixes the problem immediately but blows a hole in the contingency budget.',
        effect: { tags: ['hill', 'rural'], valueDrift: { services: 8 }, playerBoost: 0.05, opponentBoost: 0 },
      },
    ],
  },
  {
    id: 'evt-supermarket-chain',
    headline: 'Mega-Mart Planning Application',
    description: 'A giant retail chain wants to build out of town. Independent shops are terrified.',
    tags: ['market', 'center', 'south'],
    choices: [
      {
        label: 'Block the application',
        description: 'Protect the high street. Market traders will love you; bargain hunters won\'t.',
        effect: { tags: ['market', 'center'], valueDrift: { growth: -6, change: -8 }, playerBoost: 0.04, opponentBoost: 0.02 },
      },
      {
        label: 'Welcome the investment',
        description: 'Embrace job creation and cheap goods. A massive blow to the old town charm.',
        effect: { tags: ['south', 'industrial'], valueDrift: { growth: 12, change: 10 }, playerBoost: 0.03, opponentBoost: 0.04 },
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
  {
    id: 'gov-council-tax',
    headline: 'Annual Council Tax Levy',
    description: 'Inflation has stretched the budget. Do we raise council tax or slash services?',
    choices: [
      {
        label: 'Raise the tax (3%)',
        description: 'Protects services but hits residents directly in their wallets.',
        effect: { blocEffects: { old_town_loyalists: -0.05, hill_street_households: -0.04, pondside_peacemakers: 0.03 }, playerUtilityDelta: -0.02 },
      },
      {
        label: 'Freeze the tax',
        description: 'Highly popular financially, but guarantees deep cuts to social care next quarter.',
        effect: { blocEffects: { workshop_crews: 0.05, hill_street_households: 0.04, river_walkers: -0.06 }, playerUtilityDelta: 0.03 },
      },
    ],
  },
  {
    id: 'gov-pedestrianization',
    headline: 'High Street Pedestrianization',
    description: 'A bold plan to ban cars from the town center on weekends to boost cafe culture.',
    choices: [
      {
        label: 'Implement the car ban',
        description: 'Great for pedestrians and atmosphere. Terrible for deliveries and elderly access.',
        effect: { blocEffects: { college_corner: 0.06, river_walkers: 0.05, market_regulars: -0.05 }, playerUtilityDelta: 0.02 },
      },
      {
        label: 'Keep roads open',
        description: 'Maintains the status quo. Businesses keep their drive-up traffic.',
        effect: { blocEffects: { market_regulars: 0.04, old_town_loyalists: 0.02, college_corner: -0.04 }, playerUtilityDelta: 0.01 },
      },
    ],
  },
  {
    id: 'gov-streetlights',
    headline: 'Midnight Streetlight Switch-Off',
    description: 'To save energy and money, a proposal suggests turning off streetlights from 1 AM to 5 AM.',
    choices: [
      {
        label: 'Turn them off',
        description: 'Saves a fortune and reduces light pollution. Sparks massive crime fears.',
        effect: { blocEffects: { river_walkers: 0.03, old_town_loyalists: -0.06, workshop_crews: -0.04 }, playerUtilityDelta: -0.01 },
      },
      {
        label: 'Keep the lights on',
        description: 'Reassures residents about safety, but forces budget cuts elsewhere.',
        effect: { blocEffects: { old_town_loyalists: 0.05, workshop_crews: 0.03, river_walkers: -0.02 }, playerUtilityDelta: 0.03 },
      },
    ],
  },
  {
    id: 'gov-zoning-youth',
    headline: 'Empty Lot Zoning',
    description: 'A vacant lot is owned by the council. Two different groups are lobbying for its use.',
    choices: [
      {
        label: 'Build a Youth Skatepark',
        description: 'Gives teens a place to go, reducing loitering. Upsets neighbors worried about noise.',
        effect: { blocEffects: { college_corner: 0.05, workshop_crews: 0.02, old_town_loyalists: -0.04 }, playerUtilityDelta: 0.02 },
      },
      {
        label: 'Build a Quiet Memorial Garden',
        description: 'A peaceful space. Beloved by older residents, but ignores the youth issue entirely.',
        effect: { blocEffects: { old_town_loyalists: 0.05, pondside_peacemakers: 0.04, college_corner: -0.03 }, playerUtilityDelta: 0.02 },
      },
    ],
  },
]
// ─── Visual Identity ────────────────────────────────────────────────────────
const colourPalette = [
  '#2F6B8A', '#C45C26', '#3F7D4E', '#6B4C9A', '#B33A3A',
  '#1F8A7A', '#8B5E3C', '#D4A017', '#3D405B', '#9B2D5C',
]

const ARCHETYPE_COLOURS: Record<PartyArchetype, string[]> = {
  municipal: ['#2F6B8A', '#3D405B', '#4A6FA5'],
  workers: ['#B33A3A', '#8C2F39', '#C45C26'],
  business: ['#1F6B8A', '#2A7F9E', '#D4A017'],
  green: ['#3F7D4E', '#2E8B57', '#1F8A7A'],
  independence: ['#6B4C9A', '#12B6CF', '#5C4B8A'],
  coastal: ['#1F8A7A', '#2F6B8A', '#0E7C86'],
  ratepayers: ['#8B5E3C', '#6B5335', '#A67C52'],
  single_issue: ['#C45C26', '#9B2D5C', '#D4A017'],
  faith_community: ['#6B4C9A', '#5C4033', '#4A6FA5'],
}
// ─── Character Names ────────────────────────────────────────────────────────
// Shifted from purely whimsical to classic UK local demographics (lots of boomers and eccentric youths)

const firstNames = [
  // Older/Traditional - Male
  'Albert', 'Arthur', 'Barry', 'Bernard', 'Clive', 'Colin', 'Dennis', 'Derek', 
  'Eric', 'Frank', 'Geoffrey', 'Gordon', 'Graham', 'Harold', 'Horace', 'Ian', 
  'Kenneth', 'Leonard', 'Malcolm', 'Neville', 'Nigel', 'Norman', 'Percy', 
  'Reginald', 'Rodney', 'Roy', 'Stanley', 'Stuart', 'Trevor', 'Vernon', 'Victor', 'Walter',
  
  // Older/Traditional - Female
  'Agnes', 'Audrey', 'Barbara', 'Beryl', 'Betty', 'Brenda', 'Carol', 'Deirdre', 
  'Doreen', 'Doris', 'Edna', 'Elsie', 'Enid', 'Eunice', 'Geraldine', 'Gladys', 
  'Gwendoline', 'Irene', 'Jean', 'Joan', 'Joyce', 'Linda', 'Marjorie', 'Maureen', 
  'Mildred', 'Muriel', 'Norma', 'Pamela', 'Pauline', 'Peggy', 'Phyllis', 'Prudence', 
  'Rita', 'Shirley', 'Sylvia', 'Valerie', 'Vera', 'Winifred', 'Yvonne',

  // Younger/Quirky - Male
  'Alfie', 'Archie', 'Arlo', 'Barnaby', 'Cosmo', 'Dex', 'Felix', 'Finn', 
  'Hector', 'Hugo', 'Jago', 'Jasper', 'Kit', 'Ludo', 'Marlow', 'Milo', 
  'Monty', 'Ned', 'Orson', 'Oscar', 'Otis', 'Pip', 'Rafe', 'Rex', 'Rufus', 
  'Silas', 'Tarquin', 'Toby',
  
  // Younger/Quirky - Female
  'Amelie', 'Bea', 'Cleo', 'Cora', 'Cressida', 'Daphne', 'Delilah', 'Elara', 
  'Eloise', 'Esme', 'Flora', 'Freya', 'Hazel', 'Imogen', 'Iris', 'Isla', 
  'Jemima', 'Juniper', 'Lyra', 'Mabel', 'Maeve', 'Margot', 'Nell', 'Olive', 
  'Penelope', 'Poppy', 'Posy', 'Stella', 'Thea', 'Tilly', 'Zara'
];

const lastNames = [
  // Classic Mundane
  'Brown', 'Clarke', 'Davies', 'Edwards', 'Evans', 'Green', 'Hall', 'Harris', 
  'Hughes', 'Johnson', 'Jones', 'Martin', 'Roberts', 'Robinson', 'Smith', 
  'Taylor', 'Thomas', 'Thompson', 'White', 'Williams', 'Wood', 'Wright',
  
  // Eccentric/Village (The "Midsomer Murders" special)
  'Appleton', 'Baggott', 'Bickerstaff', 'Blackwood', 'Bottomley', 'Braithwaite', 
  'Broadbent', 'Butterfill', 'Cattermole', 'Clutterbuck', 'Cockburn', 'Crump', 
  'Dingle', 'Dribble', 'Entwistle', 'Featherstonehaugh', 'Fogg', 'Fothergill', 
  'Goggins', 'Goodbody', 'Greenhalgh', 'Hardcastle', 'Hesketh', 'Higginbottom', 
  'Ironmonger', 'Jellicoe', 'Kettle', 'Lightoller', 'Longbottom', 'Machen', 
  'Mellor', 'Murgatroyd', 'Nethersole', 'Oglethorpe', 'Pendleton', 'Plackett', 
  'Postlethwaite', 'Quigley', 'Ramsbottom', 'Rumbold', 'Scargill', 'Shufflebottom', 
  'Slocombe', 'Snodgrass', 'Sparrow', 'Tarbottom', 'Thistlethwaite', 'Throckmorton', 
  'Treadwell', 'Trevithick', 'Turnbull', 'Underhill', 'Wadsworth', 'Waterhouse', 
  'Wigglesworth', 'Winterbottom', 'Wrench',

  // Posh Double-Barrelled
  'Baring-Gould', 'Blythe-Smith', 'Bowes-Lyon', 'Cavendish-Bentinck', 
  'Cholmondeley-Warner', 'Finch-Hatton', 'Fitzalan-Howard', 'Gordon-Lennox', 
  'Hamilton-Russell', 'Hepworth-Dix', 'Leveson-Gower', 'Montagu-Douglas-Scott', 
  'Pelham-Clinton', 'Percy-Wellesley', 'Smythe-Willis', 'Spencer-Churchill', 
  'Talbot-Ponsonby', 'Vane-Tempest'
];

// ─── Town & Ward Generation ─────────────────────────────────────────────────
// Added prefixes for the classic "Chipping" or "Little" English town vibe.

const townPrefixes = [
  // Empty strings to allow for towns without prefixes
  '', '', '', '', '', '', 
  // Directions
  'North ', 'South ', 'East ', 'West ', 
  // Scale & Age
  'Great ', 'Little ', 'Upper ', 'Lower ', 'Much ', 'Old ', 'New ', 
  // Eccentric/Market
  'Chipping ', 'High ', 'Long ', 'Broad ', 'Nether ', 'Over ', 
  'Market ', "Bishop's ", "King's ", "Earls "
];

const townStarts = [
  // Nature/Rural
  'Adder', 'Amber', 'Apple', 'Ash', 'Barley', 'Beck', 'Black', 'Bourne', 
  'Bram', 'Broad', 'Buck', 'Clover', 'Cold', 'Copper', 'Crow', 'Deep', 
  'Dun', 'Fen', 'Fletch', 'Hazel', 'Oak', 'Pebble', 'Plum', 'Sand', 
  'Steeple', 'Thistle', 'Water', 'Willow', 'Wood',
  // Quirky/Historic sounds
  'Aston', 'Basset', 'Bex', 'Brad', 'Brindle', 'Bur', 'Chelm', 'Chest', 
  'Crom', 'Cuddle', 'Dar', 'Dumble', 'Farn', 'Fram', 'God', 'Grims', 
  'Hales', 'Helm', 'Hem', 'Horn', 'Il', 'Ink', 'Lantern', 'Laven', 
  'Led', 'Lud', 'Mal', 'Merry', 'Min', 'Monk', 'Nettle', 'Norton', 
  'Pen', 'Ravens', 'Saffron', 'Shing', 'Ship', 'Slough', 'Stan', 
  'Stoke', 'Swin', 'Tatter', 'Thorn', 'Tiver', 'Walling', 'Walmer', 
  'Wapping', 'Weston', 'Wey', 'Whit', 'Win', 'Wob', 'Wot', 'Yax'
];

const townEnds = [
  // Topography/Landscape
  'bottom', 'bridge', 'brook', 'burn', 'camp', 'cliffe', 'combe', 'croft', 
  'dale', 'den', 'dene', 'don', 'ey', 'field', 'fleet', 'fold', 'ford', 
  'gate', 'harbour', 'head', 'heath', 'hill', 'hollow', 'holt', 'hurst', 
  'leigh', 'ley', 'moor', 'mouth', 'ness', 'pool', 'port', 'stone', 
  'tree', 'water', 'well', 'wold', 'wood',
  // Settlements/Institutions
  'bury', 'by', 'caster', 'chester', 'cote', 'cross', 'end', 'ing', 
  'market', 'minster', 'over', 'soke', 'stead', 'stoke', 'thorpe', 
  'ton', 'wick', 'worth'
];
// ─── Ward naming ────────────────────────────────────────────────────────────
// Categorised by ward character so names reflect the geography. Expanded for 
// maximum quirky English village, provincial town, and rural parish flavor.

const wardNamesByTier = {
  urban: {
    first: [
      // Civic & Royal
      'Central', 'Town', 'Crown', 'Guildhall', 'King\'s', 'Queen\'s', 'Victoria', 
      'Albert', 'Regent', 'Duke\'s', 'Jubilee', 'Civic', 'Charter', 'Grosvenor',
      // Historic & Commercial
      'Market', 'High', 'Broad', 'Corn', 'Exchange', 'Garrick', 'Brunel', 'Toll',
      // Religious & Architectural
      'Church', 'Castle', 'Abbey', 'Trinity', 'Cathedral', 'Priory', 'Bishop\'s', 
      'Minster', 'St. Mary\'s', 'St. George\'s', 'St. Peter\'s', 'St. Jude\'s', 'St. Clement\'s'
    ],
    second: [
      'Square', 'Street', 'Parade', 'Gardens', 'Place', 'Quarter', 'Precinct', 
      'Arcade', 'Walk', 'Row', 'Centre', 'Cross', 'Terrace', 'Circus', 'Boulevard', 
      'Yard', 'Court', 'Way', 'Avenue', 'Steps', 'Gate', 'Wynd', 'Alley'
    ],
  },
  suburban: {
    first: [
      // Idyllic & Quaint
      'Millpond', 'Lantern', 'Vicarage', 'Pickwick', 'Oakham', 'Bell', 'Willow', 
      'Orchard', 'Rectory', 'Meadow', 'Rose', 'Glebe', 'Foxglove', 'Chestnut', 'Elm',
      // Transitional & Light Industry
      'Copper', 'Tanner', 'Old Kiln', 'Halfpenny', 'Cobble', 'Barley', 'Brewery', 
      'Pump', 'Turnpike', 'Pound', 'Hearth', 'Gallows', 'Spinney', 'Thatch'
    ],
    second: [
      'End', 'Corner', 'Gate', 'Green', 'Close', 'Fold', 'Nook', 'Side', 'Cross', 
      'Row', 'Rise', 'View', 'Crescent', 'Drive', 'Grove', 'Copse', 'Mews', 
      'Garth', 'Mead', 'Patch', 'Croft'
    ],
  },
  rural: {
    first: [
      // Wild & Geographic
      'Fen', 'Rushmore', 'Bramble', 'Nettleback', 'Mudlark', 'Gravel', 'Soapstone', 
      'Cinder', 'Flint', 'Tarn', 'Bog', 'Bracken', 'Heather', 'Chalk', 'Clay', 'Moss',
      // Agricultural & Fauna
      'Horseshoe', 'Shambles', 'Woolwich', 'Catchpenny', 'Minnow', 'Wych', 'Toad', 
      'Crow', 'Raven', 'Cowslip', 'Fleece', 'Tithe', 'Plough', 'Hare', 'Shepherd\'s',
      // Folklore & Local Legends
      'Hangman\'s', 'Smuggler\'s', 'Barrow', 'Druid\'s', 'Goblin'
    ],
    second: [
      'Hill', 'Moor', 'Bottom', 'Lane', 'Beck', 'Wharf', 'Yards', 'Side', 'Cross', 
      'Green', 'Hollow', 'Brook', 'Wood', 'Ridge', 'Fell', 'Marsh', 'Ditch', 'Dyke', 
      'Pasture', 'Warren', 'Scrub', 'Coppice', 'Down', 'Bank', 'Grange'
    ],
  },
}

// Expanded overrides for highly specific micro-geographies within the town/village
const wardRoleOverrides = {
  river: { 
    first: ['Millpond', 'Minnow', 'Weir', 'Ferry', 'Lock', 'Ford', 'Willow'], 
    second: ['Beck', 'Wharf', 'Side', 'Bank', 'Reach', 'Wash'] 
  },
  pond: { 
    first: ['Millpond', 'Minnow', 'Duckpond', 'Lily', 'Reed'], 
    second: ['Beck', 'Side', 'Water', 'Pool'] 
  },
  industrial: { 
    first: ['Old Kiln', 'Copper', 'Tanner', 'Gravel', 'Soapstone', 'Iron', 'Coal', 'Foundry', 'Mill', 'Forge'], 
    second: ['Yards', 'Side', 'Works', 'Estate'] 
  },
  oldtown: { 
    first: ['Castle', 'Abbey', 'Vicarage', 'Priory', 'Minster', 'Tudor', 'Charter'], 
    second: ['Gate', 'Close', 'Row', 'Wynd', 'Walls', 'Steps'] 
  },
  school: { 
    first: ['Trinity', 'St. Mary\'s', 'Vicarage', 'Grammar', 'Academy', 'Collegiate', 'Old School'], 
    second: ['Gardens', 'Walk', 'Row', 'Playing Fields'] 
  },
  market: { 
    first: ['Market', 'Broad', 'Cattle', 'Corn', 'Fleece', 'Butter', 'Wool'], 
    second: ['Square', 'Parade', 'Cross', 'Shambles', 'Exchange'] 
  },
  woodland: {
    first: ['Oakham', 'Bramble', 'Spinney', 'Copse', 'Chestnut', 'Badger'],
    second: ['Wood', 'Grove', 'Thicket', 'Nook', 'Ride']
  },
  transport: {
    first: ['Station', 'Railway', 'Junction', 'Tramway', 'Brunel', 'Canal'],
    second: ['Road', 'Approach', 'Sidings', 'Yard', 'Terminus']
  }
}


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

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]]
  }
  return result
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

export function roundPoliticalValues(values: PoliticalValues): PoliticalValues {
  return mapValues(values, (_key, value) => Math.round(value))
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
function createWardName(rng: () => number, used: Set<string>, urbanity: number, nearestRole: string): string {
  // Check for a role-specific override (50% chance when the role matches)
  const roleOverride = wardRoleOverrides[nearestRole as keyof typeof wardRoleOverrides]
  const useRoleOverride = roleOverride && rng() < 0.5

  let firstPool: string[]
  let secondPool: string[]

  if (useRoleOverride) {
    firstPool = roleOverride.first
    secondPool = roleOverride.second
  } else if (urbanity > 0.55) {
    firstPool = wardNamesByTier.urban.first
    secondPool = wardNamesByTier.urban.second
  } else if (urbanity > 0.30) {
    firstPool = wardNamesByTier.suburban.first
    secondPool = wardNamesByTier.suburban.second
  } else {
    firstPool = wardNamesByTier.rural.first
    secondPool = wardNamesByTier.rural.second
  }

  for (let attempt = 0; attempt < 40; attempt++) {
    const first = pickOne(rng, firstPool)
    const second = pickOne(rng, secondPool)
    const name = `${first} ${second}`
    if (!used.has(name)) {
      used.add(name)
      return name
    }
  }

  // Fallback: try the full pool
  const allFirst = [...new Set(Object.values(wardNamesByTier).flatMap((t) => t.first))]
  const allSecond = [...new Set(Object.values(wardNamesByTier).flatMap((t) => t.second))]
  for (let attempt = 0; attempt < 40; attempt++) {
    const name = `${pickOne(rng, allFirst)} ${pickOne(rng, allSecond)}`
    if (!used.has(name)) {
      used.add(name)
      return name
    }
  }

  // Last resort
  const name = `Ward ${used.size + 1}`
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
  const chosen = shuffle(fictionalBlocTemplates, rng).slice(0, 5)
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
  // Tighter spread: concentrated blocs stay in their home territory instead of bleeding across the map
  const spread = lerp(200, 60, bloc.concentration)
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
  const totalPopulation = Math.round(randomBetween(rng, 8000, 10000)) * 2
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
    anchorsByBloc[bloc.id] = shuffle(source, rng).slice(0, bloc.concentration > 0.7 ? 1 : 2).map((center) => ({ x: center.x, y: center.y }))
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

function rotateCandidates(
  rng: () => number,
  candidates: WardCandidate[],
  incumbentPartyId: string,
  parties: PartyDefinition[],
  protectedCandidateName?: string,
  preserveProtectedCandidate = false,
): WardCandidate[] {
  return candidates.map((cand) => {
    if (cand.partyId === incumbentPartyId || (preserveProtectedCandidate && cand.name === protectedCandidateName)) return cand
    if (rng() >= 0.5) return cand
    const first = pickOne(rng, firstNames)
    const last = pickOne(rng, lastNames)
    const party = parties.find((p) => p.id === cand.partyId)
    return {
      partyId: cand.partyId,
      partyName: party?.name ?? cand.partyName,
      partyColour: party?.colour ?? cand.partyColour,
      name: `${first} ${last}`,
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
    const urbanity = seatTiles.reduce((sum, tile) => sum + tile.urbanity * tile.population, 0) / Math.max(1, population)
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

    const roleTags = ['market', 'oldtown', 'river', 'industrial', 'school', 'pond', 'hill']
    const dominantRole = roleTags.reduce((best, role) => {
      const w = tagWeights[role] ?? 0
      const bw = tagWeights[best] ?? 0
      return w > bw ? role : best
    }, roleTags[0])

    return {
      id: `ward-${seatIndex + 1}`,
      name: createWardName(rng, usedWardNames, urbanity, dominantRole),
      seed,
      population,
      turnout: seatTiles.reduce((sum, tile) => sum + tile.turnout * tile.population, 0) / Math.max(1, population),
      urbanity,
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

export function strategyTagsForValues(values: PoliticalValues) {
  const tags = new Set<string>()
  if (values.change > 18) tags.add('school')
  if (values.change < -10) tags.add('oldtown')
  if (values.growth > 18) tags.add('market')
  if (values.services > 24) tags.add('industrial')
  if (values.services > 14 && values.change > 10) tags.add('river')
  if (tags.size === 0) tags.add('center')
  return [...tags].slice(0, 3)
}

export function applyPartyEdits(world: World, edits: PartyEdit[]): World {
  if (edits.length === 0) return world
  const editsById = new Map(edits.map((edit) => [edit.id, edit]))
  const parties = world.parties.map((party) => {
    const edit = editsById.get(party.id)
    if (!edit) return party
    const values = edit.values ?? party.values
    return {
      ...party,
      name: edit.name.trim() || party.name,
      leader: edit.leader.trim() || party.leader,
      colour: edit.colour || party.colour,
      values,
      strategyTags: edit.values ? strategyTagsForValues(values) : party.strategyTags,
    }
  })
  const partyById = new Map(parties.map((party) => [party.id, party]))
  const constituencies = world.constituencies.map((constituency) => ({
    ...constituency,
    candidates: constituency.candidates.map((candidate) => {
      const party = partyById.get(candidate.partyId)
      return party
        ? { ...candidate, partyName: party.name, partyColour: party.colour }
        : candidate
    }),
  }))
  const result = calculateResults({ ...world, parties, constituencies })
  const recalculated = { ...world, parties, constituencies: result.constituencies, nationalResults: result.nationalResults }
  return { ...recalculated, stats: buildStats(recalculated) }
}

// ─── Party archetypes & generation ──────────────────────────────────────────

export function partyArchetypeLabel(archetype: PartyArchetype, issueFocus?: string): string {
  switch (archetype) {
    case 'municipal': return 'Civic municipal'
    case 'workers': return 'Workers and services'
    case 'business': return 'Business and growth'
    case 'green': return 'Green and environment'
    case 'independence': return 'Local independence'
    case 'coastal': return 'Harbour and mainland'
    case 'ratepayers': return 'Ratepayers'
    case 'single_issue': return issueFocus ? `Single-issue · ${issueFocus.replace(/_/g, ' ')}` : 'Single-issue'
    case 'faith_community': return 'Community values'
    default: return 'Local slate'
  }
}

export function footingFromLegacyTier(tier: 'major' | 'minor' | 'custom' | undefined): PartyFooting {
  if (tier === 'major') return 'established'
  if (tier === 'custom') return 'challenger'
  return 'fringe'
}

export function tierFromFooting(footing: PartyFooting, origin: 'generated' | 'custom' = 'generated'): 'major' | 'minor' | 'custom' {
  if (origin === 'custom') return 'custom'
  return footing === 'established' ? 'major' : 'minor'
}

export function normalizePartyIdentity(party: PartyDefinition): PartyDefinition {
  const footing = party.footing ?? footingFromLegacyTier(party.tier)
  const archetype = party.archetype ?? (footing === 'established' ? 'municipal' : 'independence')
  return {
    ...party,
    footing,
    archetype,
    tier: party.tier ?? tierFromFooting(footing, party.origin),
  }
}

function townLooksCoastal(townName: string) {
  return /harbour|harbor|mouth|ness|port|pool|fleet|cliffe|quay|bay|sea|haven/i.test(townName)
}

function archetypeFromBloc(bloc: FictionalBloc): PartyArchetype {
  const { change, growth, services } = bloc.center
  if (change > 20 && growth < 5) return 'green'
  if (services > 28 && growth < 25) return 'workers'
  if (growth > 22) return 'business'
  if (bloc.homeRole === 'oldtown' || bloc.id.includes('loyal')) return 'municipal'
  return 'municipal'
}

const SINGLE_ISSUE_FOCUSES = ['housing', 'transport', 'heritage', 'anti_development', 'parks', 'bins'] as const

type PartySlot = {
  archetype: PartyArchetype
  footing: PartyFooting
  bloc: FictionalBloc
  issueFocus?: string
}

function pickPartySlots(rng: () => number, blocs: FictionalBloc[], coastal: boolean): PartySlot[] {
  const sorted = [...blocs].sort((a, b) => b.weight - a.weight)
  const slots: PartySlot[] = []
  const usedBlocs = new Set<string>()

  const takeBloc = (preferred?: FictionalBloc) => {
    const candidate = preferred && !usedBlocs.has(preferred.id)
      ? preferred
      : sorted.find((bloc) => !usedBlocs.has(bloc.id)) ?? sorted[slots.length % sorted.length]
    usedBlocs.add(candidate.id)
    return candidate
  }

  const establishedCount = rng() < 0.45 ? 2 : 3
  for (let i = 0; i < establishedCount; i += 1) {
    const bloc = takeBloc(sorted[i])
    slots.push({ archetype: archetypeFromBloc(bloc), footing: 'established', bloc })
  }

  if (coastal) {
    slots.push({ archetype: 'coastal', footing: rng() < 0.55 ? 'challenger' : 'fringe', bloc: takeBloc(sorted.find((b) => b.homeRole === 'river') ?? sorted[sorted.length - 1]) })
  } else {
    slots.push({ archetype: rng() < 0.55 ? 'independence' : 'ratepayers', footing: 'challenger', bloc: takeBloc() })
  }

  while (slots.length < 5) {
    const roll = rng()
    const hasIndependence = slots.some((s) => s.archetype === 'independence')
    const hasRatepayers = slots.some((s) => s.archetype === 'ratepayers')
    if (roll < 0.34) {
      slots.push({
        archetype: 'single_issue',
        footing: 'fringe',
        bloc: takeBloc(),
        issueFocus: pickOne(rng, [...SINGLE_ISSUE_FOCUSES]),
      })
    } else if (roll < 0.55) {
      slots.push({ archetype: hasIndependence ? (hasRatepayers ? 'single_issue' : 'ratepayers') : 'independence', footing: hasIndependence ? 'fringe' : 'challenger', bloc: takeBloc(), issueFocus: hasIndependence && hasRatepayers ? pickOne(rng, [...SINGLE_ISSUE_FOCUSES]) : undefined })
    } else if (roll < 0.72) {
      slots.push({ archetype: hasRatepayers ? 'independence' : 'ratepayers', footing: 'fringe', bloc: takeBloc() })
    } else if (roll < 0.86 && coastal && !slots.some((s) => s.archetype === 'coastal' && s.footing === 'fringe')) {
      slots.push({ archetype: 'coastal', footing: 'fringe', bloc: takeBloc() })
    } else if (roll < 0.93) {
      slots.push({ archetype: 'faith_community', footing: 'fringe', bloc: takeBloc() })
    } else {
      const bloc = takeBloc()
      slots.push({ archetype: archetypeFromBloc(bloc), footing: 'challenger', bloc })
    }
  }

  return slots.slice(0, 5)
}

function colourForArchetype(rng: () => number, archetype: PartyArchetype, used: Set<string>) {
  const pool = [...(ARCHETYPE_COLOURS[archetype] ?? colourPalette), ...colourPalette]
  for (const colour of shuffle(pool, rng)) {
    if (!used.has(colour)) {
      used.add(colour)
      return colour
    }
  }
  const fallback = `#${Math.floor(rng() * 0xffffff).toString(16).padStart(6, '0')}`
  used.add(fallback)
  return fallback
}

function nameForArchetype(
  rng: () => number,
  archetype: PartyArchetype,
  townName: string,
  bloc: FictionalBloc,
  issueFocus?: string,
  allowTownPrefix = false,
): string {
  const shortTown = townName.replace(/^The\s+/i, '')
  const pick = (generic: string[], withTown: string[]) =>
    pickOne(rng, allowTownPrefix ? [...generic, ...withTown] : generic)
  switch (archetype) {
    case 'municipal':
      return pick(
        ['Civic Voice', 'Common Sense Alliance', 'Borough Alliance', 'Municipal Group', 'Town List'],
        [`${shortTown} Civic Alliance`, `${shortTown} Alliance`],
      )
    case 'workers':
      return pick(
        ['Working Families', 'Community Labour', 'Solidarity Group', 'People\'s Alliance', `${bloc.label.split(' ')[0]} Labour`],
        [`${shortTown} Labour`],
      )
    case 'business':
      return pick(
        ['Progress Alliance', 'Chamber Group', 'Enterprise Alliance', 'Traders\' Association', 'Prosperity Group'],
        [`${shortTown} Progress`, `${shortTown} Traders`],
      )
    case 'green':
      return pick(
        ['Green Alliance', 'Ecology Group', 'Green Party', 'Environment Alliance', 'River Alliance'],
        [`${shortTown} Greens`],
      )
    case 'independence':
      return pick(
        ['Independent Voice', 'Independents', 'Local Alliance', 'Parish Independents', 'Residents\' Group'],
        [`${shortTown} First`, `${shortTown} Independents`],
      )
    case 'coastal':
      return pick(
        ['Harbour Alliance', 'Coastal Group', 'Mainland Alliance', 'Harbour Independents', 'Quayside Alliance'],
        [`${shortTown} Harbour`],
      )
    case 'ratepayers':
      return pick(
        ['Ratepayers Alliance', 'Residents First', 'Ratepayers\' Association', 'Civic Conservatives', 'Residents\' Alliance'],
        [`${shortTown} Ratepayers`],
      )
    case 'faith_community':
      return pick(
        ['Parish Voice', 'Community Values', 'Faith & Community', 'Neighbourhood Alliance'],
        [`${shortTown} Community`],
      )
    case 'single_issue': {
      const focusNames: Record<string, { generic: string[]; withTown: string[] }> = {
        housing: { generic: ['Housing Alliance', 'Homes Alliance', 'Housing Group'], withTown: [`${shortTown} Homes`] },
        transport: { generic: ['Transport Alliance', 'Buses Alliance', 'Transit Group'], withTown: [`${shortTown} Transport`] },
        heritage: { generic: ['Heritage Alliance', 'High Street Group', 'Old Town Alliance'], withTown: [`${shortTown} Heritage`] },
        anti_development: { generic: ['Residents\' Defence', 'Fields Alliance', 'Neighbourhood Watch Party'], withTown: [] },
        parks: { generic: ['Parks Alliance', 'Green Space Group', 'Commons Alliance'], withTown: [`${shortTown} Parks`] },
        bins: { generic: ['Clean Streets Group', 'Services Alliance', 'Residents\' Services'], withTown: [] },
      }
      const pool = focusNames[issueFocus ?? 'housing'] ?? { generic: ['Local Action', 'Residents\' Alliance'], withTown: [`${shortTown} Action`] }
      return pick(pool.generic, pool.withTown)
    }
    default:
      return pick(['Civic Alliance', 'Local Voice'], [`${shortTown} Alliance`])
  }
}

function sloganForArchetype(rng: () => number, archetype: PartyArchetype, townName: string, issueFocus?: string): string {
  switch (archetype) {
    case 'municipal':
      return pickOne(rng, ['Putting residents first.', 'A steadier council.', 'Local priorities, properly delivered.'])
    case 'workers':
      return pickOne(rng, ['A fairer town.', 'Stronger communities.', 'For working people.'])
    case 'business':
      return pickOne(rng, ['Building a better borough.', 'Ambition for our town.', 'Progress that pays.'])
    case 'green':
      return pickOne(rng, ['A greener future.', 'Protecting our place.', 'Cleaner, fairer, local.'])
    case 'independence':
      return pickOne(rng, [`For ${townName}.`, 'Local people, local say.', 'Independent of the parties.'])
    case 'coastal':
      return pickOne(rng, ['Our harbour, our future.', 'Standing up for the coast.', 'Local links, local voice.'])
    case 'ratepayers':
      return pickOne(rng, ['Value for residents.', 'Sensible stewardship.', 'A council that listens.'])
    case 'faith_community':
      return pickOne(rng, ['Community before politics.', 'Neighbour looking after neighbour.', 'Shared values, shared town.'])
    case 'single_issue':
      return pickOne(rng, [
        issueFocus === 'housing' ? 'Homes for local people.' : 'Focused on what matters.',
        'One clear priority.',
        'Residents before rhetoric.',
      ])
    default:
      return 'For every ward.'
  }
}

function footingStats(footing: PartyFooting, blocWeight: number) {
  if (footing === 'established') {
    return {
      organization: clamp(0.92 + blocWeight * 1.1, 0.9, 1.4),
      baseUtility: 0.06,
      aiActionPoints: 3,
      jitter: 4,
    }
  }
  if (footing === 'challenger') {
    return {
      organization: clamp(0.5 + blocWeight * 0.8, 0.4, 0.9),
      baseUtility: -0.04,
      aiActionPoints: 2,
      jitter: 6,
    }
  }
  return {
    organization: clamp(0.3 + blocWeight * 0.65, 0.25, 0.7),
    baseUtility: -0.12,
    aiActionPoints: 2,
    jitter: 8,
  }
}

function strategyTagsForArchetype(archetype: PartyArchetype, values: PoliticalValues, issueFocus?: string): string[] {
  const tags = new Set(strategyTagsForValues(values))
  if (archetype === 'coastal' || archetype === 'independence') {
    tags.add('edge')
    tags.add('rural')
  }
  if (archetype === 'green') tags.add('river')
  if (archetype === 'business') tags.add('market')
  if (archetype === 'workers') tags.add('industrial')
  if (archetype === 'single_issue' && issueFocus) {
    const map: Record<string, string> = {
      housing: 'suburban',
      transport: 'industrial',
      heritage: 'oldtown',
      anti_development: 'hill',
      parks: 'pond',
      bins: 'suburban',
    }
    if (map[issueFocus]) tags.add(map[issueFocus])
  }
  return [...tags]
}

function createGeneratedParties(rng: () => number, blocs: FictionalBloc[], townName: string, coastal: boolean) {
  const slots = pickPartySlots(rng, blocs, coastal)
  const usedNames = new Set<string>()
  const usedColours = new Set<string>()
  const shortTown = townName.replace(/^The\s+/i, '')
  let townNameBudget = rng() < 0.45 ? 1 : 0

  function uniqueName(gen: () => string): string {
    for (let i = 0; i < 8; i++) {
      const name = gen()
      if (!usedNames.has(name)) {
        usedNames.add(name)
        return name
      }
    }
    const base = `${gen()} ${Math.floor(rng() * 9) + 1}`
    usedNames.add(base)
    return base
  }

  return slots.map((slot, index) => {
    const stats = footingStats(slot.footing, slot.bloc.weight)
    const leanShift =
      slot.archetype === 'coastal' ? { change: -4, growth: 6, services: 4 }
        : slot.archetype === 'independence' ? { change: 4, growth: -2, services: 2 }
          : slot.archetype === 'ratepayers' ? { change: -8, growth: 4, services: -10 }
            : slot.archetype === 'single_issue' && slot.issueFocus === 'anti_development' ? { change: -6, growth: -12, services: 4 }
              : slot.archetype === 'single_issue' && slot.issueFocus === 'housing' ? { change: 8, growth: 4, services: 10 }
                : {}
    const values = roundPoliticalValues(addValues(addValues(slot.bloc.center, {
      change: gaussian(rng, 0, stats.jitter),
      growth: gaussian(rng, 0, stats.jitter),
      services: gaussian(rng, 0, stats.jitter),
    }), leanShift))
    const allowTownPrefix = townNameBudget > 0 && rng() < 0.55
    const name = uniqueName(() => nameForArchetype(rng, slot.archetype, townName, slot.bloc, slot.issueFocus, allowTownPrefix))
    if (name.includes(shortTown)) townNameBudget = 0
    return {
      id: `party-${slot.footing}-${index + 1}`,
      name,
      leader: createLeaderName(rng),
      colour: colourForArchetype(rng, slot.archetype, usedColours),
      values,
      origin: 'generated' as const,
      footing: slot.footing,
      archetype: slot.archetype,
      issueFocus: slot.issueFocus,
      tier: tierFromFooting(slot.footing),
      strategyTags: strategyTagsForArchetype(slot.archetype, values, slot.issueFocus),
      seedBlocId: slot.bloc.id,
      organization: stats.organization,
      baseUtility: stats.baseUtility,
      momentum: 0,
      focusSeatIds: [],
      slogan: sloganForArchetype(rng, slot.archetype, townName, slot.issueFocus),
      aiActionPoints: stats.aiActionPoints,
      wardBoosts: {},
    }
  })
}

function convertCustomParties(customParties: CustomPartyDraft[]) {
  return customParties.map<PartyDefinition>((party, index) => ({
    id: `party-custom-${index + 1}`,
    name: party.name,
    leader: party.leader,
    colour: party.colour,
    values: roundPoliticalValues(cloneValues(party.values)),
    origin: 'custom',
    footing: 'challenger',
    archetype: 'municipal',
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
      .slice(0, party.footing === 'established' ? 4 : party.footing === 'challenger' ? 3 : 2)
      .map((seat) => seat.id),
  }))
}

function softmax(scores: number[]) {
  const max = Math.max(...scores)
  const values = scores.map((score) => Math.exp((score - max) / SOFTMAX_TEMP))
  const total = values.reduce((sum, value) => sum + value, 0)
  return values.map((value) => value / total)
}

export const TACTICAL_GAP_FLOOR = 5
export const TACTICAL_GAP_SCALE = 15
export const TACTICAL_LOSS_RATE = 0.15
export const TACTICAL_RACE_MARGIN_MAX = 10
export const TACTICAL_DISPLAY_INTENSITY_MIN = 0.2

export function tacticalGapIntensity(secondPlaceShare: number, partyShare: number): number {
  return clamp((secondPlaceShare - partyShare - TACTICAL_GAP_FLOOR) / TACTICAL_GAP_SCALE, 0, 1)
}

export function tacticalSqueezeLoss(partyShare: number, secondPlaceShare: number, pressure: number): number {
  return partyShare * TACTICAL_LOSS_RATE * tacticalGapIntensity(secondPlaceShare, partyShare) * pressure
}

export type TacticalVotingSummary = {
  race: string[]
  squeezed: string[]
  breakingThrough: string[]
  active: boolean
}

export function summariseTacticalVoting(constituency: Constituency): TacticalVotingSummary {
  const results = constituency.results
  if (results.length < 3) {
    return { race: [], squeezed: [], breakingThrough: [], active: false }
  }

  const secondShare = results[1]?.voteShare ?? 0
  const squeezed: string[] = []
  const breakingThrough: string[] = []

  for (const result of results.slice(2)) {
    if (result.voteShare <= 0) continue
    const pressure = constituency.tacticalPressure?.[result.partyId] ?? 1
    if (pressure <= 0.05) continue

    const intensity = tacticalGapIntensity(secondShare, result.voteShare)
    const closeToSecond = secondShare - result.voteShare <= TACTICAL_GAP_FLOOR

    if (intensity >= TACTICAL_DISPLAY_INTENSITY_MIN && pressure >= 0.5) {
      squeezed.push(result.partyName)
    } else if (pressure < 0.5 && (intensity > 0 || closeToSecond)) {
      breakingThrough.push(result.partyName)
    }
  }

  const active = squeezed.length > 0 || breakingThrough.length > 0
  const race = active && constituency.margin <= TACTICAL_RACE_MARGIN_MAX
    ? results.slice(0, 2).map((result) => result.partyName)
    : []

  return { race, squeezed, breakingThrough, active }
}

export type WardPactLine = {
  standingDownPartyName: string
  beneficiaryPartyName: string
}

export function summariseWardPacts(world: World, wardId: string): WardPactLine[] {
  const partyName = (id: string) => world.parties.find((p) => p.id === id)?.name ?? id
  const lines: WardPactLine[] = []

  for (const pact of world.alliancePacts) {
    if (pact.broken) continue
    for (const entry of pact.entries) {
      if (entry.wardA === wardId) {
        lines.push({
          standingDownPartyName: partyName(pact.partyAId),
          beneficiaryPartyName: partyName(pact.partyBId),
        })
      }
      if (entry.wardB === wardId && !entry.isUnilateral) {
        lines.push({
          standingDownPartyName: partyName(pact.partyBId),
          beneficiaryPartyName: partyName(pact.partyAId),
        })
      }
    }
  }
  return lines
}

function applyTacticalSqueeze(rankings: TilePartyPreference[], constituency?: Constituency): TilePartyPreference[] {
  if (rankings.length <= 2) return rankings

  const sorted = [...rankings].sort((a, b) => b.support - a.support)
  const secondPlaceSupport = sorted[1]?.support ?? 0
  let squeezedSupport = 0

  for (let index = 2; index < sorted.length; index += 1) {
    const party = sorted[index]
    const pressure = constituency?.tacticalPressure?.[party.partyId] ?? 1
    const loss = tacticalSqueezeLoss(party.support, secondPlaceSupport, pressure)
    sorted[index] = { ...party, support: party.support - loss }
    squeezedSupport += loss
  }

  if (squeezedSupport === 0) return sorted
  const topTwoSupport = sorted[0].support + sorted[1].support
  if (topTwoSupport <= 0) return sorted

  sorted[0] = { ...sorted[0], support: sorted[0].support + squeezedSupport * sorted[0].support / topTwoSupport }
  sorted[1] = { ...sorted[1], support: sorted[1].support + squeezedSupport * sorted[1].support / topTwoSupport }
  return sorted
}

function partyEventBonus(party: PartyDefinition, current: GeographicCurrent, tileTags: string[]) {
  if (!current.tags.some((tag) => tileTags.includes(tag))) return 0
  if (!current.popularityEffect) return 0
  if (current.popularityEffect.target === 'all') return current.popularityEffect.amount
  const target = current.popularityEffect.target
  const footing = party.footing ?? footingFromLegacyTier(party.tier)
  const match =
    (target === 'established' || target === 'major') && footing === 'established'
    || (target === 'challenger' || target === 'minor') && (footing === 'challenger' || footing === 'fringe' || party.origin === 'custom')
    || target === 'fringe' && (footing === 'fringe' || party.origin === 'custom')
  if (!match) return 0
  let amount = current.popularityEffect.amount
  if (party.archetype === 'single_issue' && party.issueFocus && current.tags.some((tag) => party.strategyTags.includes(tag))) {
    amount *= 1.25
  }
  return amount
}

function scorePartyForTile(world: World, seat: Constituency | undefined, tile: PopulationTile, party: PartyDefinition) {
  const footing = party.footing ?? footingFromLegacyTier(party.tier)
  const wardFitScale = footing === 'established' ? 1.8 : footing === 'challenger' ? 1.15 : 0.9
  let wardFit = party.seedBlocId ? (tile.blocMix[party.seedBlocId] ?? 0) * wardFitScale : 0.15
  if ((party.archetype === 'independence' || party.archetype === 'coastal') && (tile.tags.includes('edge') || tile.tags.includes('rural'))) {
    wardFit += 0.12
  }
  if (party.archetype === 'coastal' && (tile.tags.includes('river') || tile.tags.includes('pond'))) {
    wardFit += 0.06
  }
  const focus = seat && party.focusSeatIds.includes(seat.id) ? 0.18 : 0
  const organization = Math.log(party.organization + 1) * 0.55
  const tagBonus = party.strategyTags.reduce((sum, tag) => sum + (tile.tags.includes(tag) ? 0.20 : 0), 0)
  const issueFit = -valueDistance(tile.values, party.values, tile.salience) / ISSUE_FIT_SCALE
  const eventBonus = world.currents.reduce((sum, current) => sum + partyEventBonus(party, current, tile.tags), 0)
  const wardBoost = seat ? (party.wardBoosts[seat.id] ?? 0) : 0
  const tileBoost = (tile.campaignBoosts?.[party.id] ?? 0)
  let incumbencyBonus = 0
  if (seat) {
    const isCurrentLeader = seat.leadingPartyId === party.id
    if (isCurrentLeader) incumbencyBonus += 0.04
    if (world.electionsHeld >= 1) {
      const electedPartyId = world.electionNightResults.find((r) => r.wardId === seat.id)?.winner?.partyId
      if (electedPartyId === party.id) incumbencyBonus += 0.10
    }
  }
  let personalBonus = 0
  if (world.politicianMode && world.politicianMode.politician.wardId && party.id === world.playerPartyId && seat?.id === world.politicianMode.politician.wardId) {
    personalBonus = world.politicianMode.politician.personalApproval * PERSONAL_APPROVAL_FACTOR
    const personalIssueFit = -valueDistance(tile.values, world.politicianMode.politician.personalValues, tile.salience) / ISSUE_FIT_SCALE
    personalBonus += clamp((personalIssueFit - issueFit) * 0.22, -0.18, 0.18)
  }
  return wardFit + focus + organization + tagBonus + issueFit + eventBonus + party.baseUtility + party.momentum + wardBoost + tileBoost + incumbencyBonus + personalBonus
}

function allianceModifier(world: World, tile: PopulationTile, party: PartyDefinition): { standingDown: boolean; endorsementBonus: number } {
  const seat = world.constituencies.find((c) => c.id === tile.constituencyId)
  if (!seat) return { standingDown: false, endorsementBonus: 0 }

  let standingDown = false
  let endorsementBonus = 0

  for (const pact of world.alliancePacts) {
    if (pact.broken) continue

    for (const entry of pact.entries) {
      const partyAStandsDownHere = entry.wardA === seat.id || entry.wardAName === seat.name
      const partyBStandsDownHere = entry.wardB === seat.id || entry.wardBName === seat.name

      if (partyAStandsDownHere && pact.partyAId === party.id) standingDown = true
      if (partyBStandsDownHere && pact.partyBId === party.id && !entry.isUnilateral) standingDown = true

      if (partyAStandsDownHere && pact.partyBId === party.id) {
        endorsementBonus += entry.endorsementForB * 0.01
      }
      if (partyBStandsDownHere && pact.partyAId === party.id && !entry.isUnilateral) {
        endorsementBonus += entry.endorsementForA * 0.01
      }
    }
  }

  return { standingDown, endorsementBonus }
}

export function estimateTilePreference(
  world: World,
  tile: PopulationTile,
  constituency: Constituency | undefined = world.constituencies.find((seat) => seat.id === tile.constituencyId),
  useTacticalVoting = true,
): TilePreferenceEstimate {
  const scores = world.parties.map((party) => {
    const base = scorePartyForTile(world, constituency, tile, party)
    const { standingDown, endorsementBonus } = allianceModifier(world, tile, party)
    if (standingDown) return STANDING_DOWN_SCORE
    return base + endorsementBonus
  })
  const realScores = scores.filter((s) => s > STANDING_DOWN_SCORE + 1)
  const spread = realScores.length > 0 ? Math.max(...realScores) - Math.min(...realScores) : 0
  const turnout = clamp(tile.turnout + spread * 0.01, 0.4, 0.95)
  const baseRankings = softmax(scores)
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
  const rankings = useTacticalVoting ? applyTacticalSqueeze(baseRankings, constituency) : baseRankings

  return { turnout, rankings }
}

export function calculateResults(world: World, useTacticalVoting = true) {
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
      const estimate = estimateTilePreference(world, tile, seat, useTacticalVoting)
      const activeVotes = Math.round(tile.population * estimate.turnout)
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
        votes: Math.round(voteTotals.get(party.id) ?? 0),
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
    const winnerCandidate = seat.candidates.find((c) => c.partyId === winner.partyId)
    seat.currentWinner = winnerCandidate ?? seat.candidates[0]
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

function updateTacticalPressure(world: World): World {
  if (world.week % 2 !== 0) return world

  const unsqueezedResults = calculateResults(world, false)
  const constituencies = world.constituencies.map((seat) => {
    const rawSeat = unsqueezedResults.constituencies.find((entry) => entry.id === seat.id)
    if (!rawSeat) return seat
    const rawResults = rawSeat.results
    const leaderShare = rawResults[0]?.voteShare ?? 0
    const pressure = { ...seat.tacticalPressure }

    rawResults.slice(2).forEach((result) => {
      const currentPressure = pressure[result.partyId] ?? 1
      const isCompetitive = leaderShare - result.voteShare <= TACTICAL_GAP_FLOOR
      pressure[result.partyId] = clamp(currentPressure + (isCompetitive ? -0.15 : 0.05), 0, 1)
    })

    return { ...seat, tacticalPressure: pressure }
  })

  return { ...world, constituencies }
}

function buildStats(world: Omit<World, 'stats'> & { nationalResults: PartyPerformance[]; constituencies: Constituency[] }): TownStats {
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
    closestWardName: sortedByMargin[0]?.name ?? 'None',
    closestWardMargin: sortedByMargin[0]?.margin ?? 0,
    safestWardName: sortedByMargin[sortedByMargin.length - 1]?.name ?? 'None',
    safestWardMargin: sortedByMargin[sortedByMargin.length - 1]?.margin ?? 0,
    totalWards: world.constituencies.length,
    battlegroundWardIds,
  }
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
        // Subtler current effect: builds slowly over several weeks rather than slamming each week
        values = addValues(values, current.effect, current.intensity * 0.03)
      }
    })
    const decayedBoosts: Record<string, number> = {}
    for (const [pid, val] of Object.entries(tile.campaignBoosts ?? {})) {
      const decayed = val * CAMPAIGN_BOOST_DECAY
      if (decayed > 0.005) decayedBoosts[pid] = decayed
    }
    return {
      ...tile,
      values: addValues(values, {
        change: gaussian(rng, 0, 0.25),
        growth: gaussian(rng, 0, 0.25),
        services: gaussian(rng, 0, 0.25),
      }),
      campaignBoosts: decayedBoosts,
    }
  })
}

function evolveParties(parties: PartyDefinition[], constituencies: Constituency[], rng: () => number, playerPartyId: string) {
  return assignPartyFocus(parties, constituencies).map((party) => {
    const isPlayer = party.id === playerPartyId
    return {
      ...party,
      // Tiny random walk in baseUtility — barely perceptible week-to-week
      // Slow decay (0.95) keeps it near its natural long-run mean
      baseUtility: clamp(
        party.baseUtility * 0.95 + gaussian(rng, 0, (party.footing ?? footingFromLegacyTier(party.tier)) === 'established' ? 0.02 : 0.015),
        -1.2, 1.2,
      ),
      // Momentum also much calmer — only noticeable after a rally or event response
      momentum: clamp(party.momentum * 0.65 + gaussian(rng, 0, 0.03), -0.7, 0.7),
      // Reset AI action points each week (players get theirs in App)
      aiActionPoints: isPlayer ? party.aiActionPoints : ((party.footing ?? footingFromLegacyTier(party.tier)) === 'established' ? 3 : 2),
      // Decay ward boosts more slowly — canvass effect lasts ~4 weeks
      wardBoosts: Object.fromEntries(
        Object.entries(party.wardBoosts).map(([k, v]) => [k, v * WARD_BOOST_DECAY]),
      ),
    }
  })
}

// ─── AI campaigning ──────────────────────────────────────────────────────────
function partyRankInWard(ward: Constituency, partyId: string): number {
  const idx = ward.results.findIndex((r) => r.partyId === partyId)
  return idx < 0 ? 99 : idx + 1
}

/** Ward-level estimate of endorsement effect: stand-down share × 0.01 score ≈ ×0.25 pp. */
function estimateStandDownGain(
  ward: Constituency,
  standDownPartyId: string,
  beneficiaryPartyId: string,
): { gainPp: number; beforeShare: number; afterShare: number; wouldLead: boolean; flipsToBeneficiary: boolean } {
  const standDownShare = ward.results.find((r) => r.partyId === standDownPartyId)?.voteShare ?? 0
  const beforeShare = ward.results.find((r) => r.partyId === beneficiaryPartyId)?.voteShare ?? 0
  if (standDownShare <= 0 && beforeShare <= 0) {
    return { gainPp: 0, beforeShare: 0, afterShare: 0, wouldLead: false, flipsToBeneficiary: false }
  }

  const rawGain = standDownShare * 0.25
  const projected = new Map<string, number>()
  for (const r of ward.results) {
    if (r.partyId === standDownPartyId) projected.set(r.partyId, 0)
    else if (r.partyId === beneficiaryPartyId) projected.set(r.partyId, beforeShare + rawGain)
    else projected.set(r.partyId, r.voteShare)
  }
  if (!projected.has(beneficiaryPartyId)) projected.set(beneficiaryPartyId, beforeShare + rawGain)

  let total = 0
  for (const v of projected.values()) total += v
  if (total > 0) {
    for (const [id, v] of projected) projected.set(id, (v / total) * 100)
  }

  const afterShare = projected.get(beneficiaryPartyId) ?? 0
  const gainPp = afterShare - beforeShare
  let bestId = ''
  let bestShare = -1
  for (const [id, v] of projected) {
    if (v > bestShare) {
      bestShare = v
      bestId = id
    }
  }
  const wouldLead = bestId === beneficiaryPartyId
  const flipsToBeneficiary = wouldLead && ward.leadingPartyId !== beneficiaryPartyId

  return { gainPp, beforeShare, afterShare, wouldLead, flipsToBeneficiary }
}

function evaluateAllianceAcceptance(
  world: World,
  initiatorId: string,
  targetId: string,
  initiatorWardId: string,
  targetWardId: string,
): number {
  const initiatorWard = world.constituencies.find((c) => c.id === initiatorWardId)
  const targetWard = world.constituencies.find((c) => c.id === targetWardId)
  const initiatorParty = world.parties.find((p) => p.id === initiatorId)
  const targetParty = world.parties.find((p) => p.id === targetId)
  if (!initiatorWard || !targetWard || !initiatorParty || !targetParty) return 0

  for (const pact of world.alliancePacts) {
    if (pact.broken) continue
    for (const e of pact.entries) {
      if ((pact.partyAId === initiatorId && e.wardA === initiatorWardId) ||
          (pact.partyBId === initiatorId && e.wardB === initiatorWardId)) return STANDING_DOWN_SCORE
      if ((pact.partyAId === targetId && e.wardA === targetWardId) ||
          (pact.partyBId === targetId && e.wardB === targetWardId)) return STANDING_DOWN_SCORE
    }
  }

  if (targetWard.leadingPartyId === targetId && (targetWard.margin ?? 0) > 5) {
    return STANDING_DOWN_SCORE
  }

  const isIncumbent = world.electionsHeld >= 1 && world.electionNightResults.some(
    (r) => r.wardId === targetWardId && r.winner?.partyId === targetId
  )
  if (isIncumbent) return STANDING_DOWN_SCORE

  const targetShareInTarget = targetWard.results.find((r) => r.partyId === targetId)?.voteShare ?? 0
  const targetRank = partyRankInWard(targetWard, targetId)
  const allyGain = estimateStandDownGain(initiatorWard, initiatorId, targetId)
  const initiatorInTarget = estimateStandDownGain(targetWard, targetId, initiatorId)

  const valueDist = valueDistance(initiatorParty.values, targetParty.values, { change: 1, growth: 1, services: 1 })
  const ideologicalBonus = Math.max(0, 1 - valueDist / ALLIANCE_IDEOLOGY_SCALE)
  const repKey = [initiatorId, targetId].sort().join('_')
  const repPenalty = (world.allianceReputation[repKey] ?? 0) * 0.15

  const gainScore = allyGain.gainPp / 20
  const flipBonus = allyGain.flipsToBeneficiary ? 0.20 : allyGain.wouldLead && !allyGain.flipsToBeneficiary ? 0.05 : 0
  const allyCost = Math.min(1, targetShareInTarget / 25) * 0.45
  const closeSecondCost =
    targetRank === 2 && targetShareInTarget >= 10 && (targetWard.margin ?? 99) <= 12 ? 0.25 : 0
  const partnerUsefulness = Math.min(1, initiatorInTarget.afterShare / 30) * 0.15

  return gainScore
    + flipBonus
    + partnerUsefulness
    + ideologicalBonus * 0.25
    - allyCost
    - closeSecondCost
    - repPenalty
}

function acceptanceSeed(world: World, initiatorId: string, targetId: string, initiatorWardId: string, targetWardId: string): number {
  const str = `${world.seed}-${world.week}-${initiatorId}-${targetId}-${initiatorWardId}-${targetWardId}`
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return (Math.abs(hash) % 10000) / 10000
}

function deterministicAcceptance(
  world: World,
  initiatorId: string,
  targetId: string,
  initiatorWardId: string,
  targetWardId: string,
  totalSacrifice = 0,
  batchCount = 1,
): { accepted: boolean; chance: number; roll: number } {
  const baseChance = evaluateAllianceAcceptance(world, initiatorId, targetId, initiatorWardId, targetWardId)
  if (baseChance <= STANDING_DOWN_SCORE + 1) return { accepted: false, chance: 0, roll: 0 }
  const endorsementBonus = Math.min(0.50, totalSacrifice * 1.5)
  const countBonus = Math.min(0.15, Math.max(0, batchCount - 1) * 0.03)
  const multiBonus = endorsementBonus + countBonus
  const totalChance = Math.max(0, Math.min(0.85, baseChance + multiBonus))
  if (totalChance < 0.15) return { accepted: false, chance: Math.round(totalChance * 100), roll: 0 }
  const roll = acceptanceSeed(world, initiatorId, targetId, initiatorWardId, targetWardId)
  return { accepted: roll < totalChance, chance: Math.round(totalChance * 100), roll: Math.round(roll * 100) }
}

function initiatorStandDownTooStrong(ward: Constituency, partyId: string): boolean {
  const share = ward.results.find((r) => r.partyId === partyId)?.voteShare ?? 0
  if (share >= 12) return true
  if (ward.leadingPartyId === partyId && ward.margin > 8) return true
  const rank = partyRankInWard(ward, partyId)
  if (rank === 2 && share >= 10 && ward.margin <= 12) return true
  return false
}

function npcPactPairScore(initShare: number, targShare: number): number {
  const initWeakness = Math.max(0, 1 - initShare / 25)
  const targWeakness = Math.max(0, 1 - targShare / 25)
  return initWeakness * 0.5 + targWeakness * 0.5
}

function runAICampaigns(world: World, rng: () => number): { parties: PartyDefinition[]; newsFeedLines: string[]; aiPactResults: Array<{ description: string; outcome: 'success' | 'backfire' }> } {
  const newsFeedLines: string[] = []
  const aiPactResults: Array<{ description: string; outcome: 'success' | 'backfire' }> = []
  const updatedParties = world.parties.map((party) => {
    if (party.id === world.playerPartyId) return party
    let ap = party.aiActionPoints
    const boosts = { ...party.wardBoosts }

    // AI prioritises focus seats and closest battlegrounds
    const targetWards = [...world.constituencies]
      .filter((c) => party.focusSeatIds.includes(c.id) || world.stats.battlegroundWardIds.includes(c.id))
      .sort((a, b) => {
        const aLeading = a.leadingPartyId === party.id ? 1 : 0
        const bLeading = b.leadingPartyId === party.id ? 1 : 0
        return aLeading - bLeading
      })

    while (ap > 0 && targetWards.length > 0) {
      const ward = pickOne(rng, targetWards.slice(0, 3))
      if (!ward) break
      const rallying = rng() < 0.10 && ap >= 2
      if (rallying) {
        boosts[ward.id] = clamp((boosts[ward.id] ?? 0) + 0.08, 0, 0.35)
        ap -= 2
        newsFeedLines.push(`${party.name} held a campaign rally in ${ward.name}.`)
      } else {
        boosts[ward.id] = clamp((boosts[ward.id] ?? 0) + 0.04, 0, 0.35)
        ap -= 1
        if (rng() < 0.3) {
          newsFeedLines.push(`${party.name} campaigners spotted knocking doors in ${ward.name}.`)
        }
      }
    }

    // NPC pact proposal: 5% chance per week
    if (rng() < 0.05) {
      // NPC-to-NPC
      const otherParties = world.parties.filter((p) => p.id !== party.id)
      const hasActivePact = (pid: string) => world.alliancePacts.some((p) =>
        !p.broken && ((p.partyAId === party.id && p.partyBId === pid) ||
          (p.partyBId === party.id && p.partyAId === pid)))
      // Exclude player for auto-pacts; they get handled separately
      const potentialTargets = otherParties.filter((p) => !hasActivePact(p.id) && p.id !== world.playerPartyId)
      if (potentialTargets.length > 0) {
        // Pick target: prefer ideologically close
        const scoredTargets = potentialTargets.map((t) => ({
          party: t,
          score: Math.max(0, 1 - valueDistance(party.values, t.values, { change: 1, growth: 1, services: 1 }) / ALLIANCE_IDEOLOGY_SCALE),
        })).sort((a, b) => b.score - a.score)
        const target = scoredTargets[0].party

        // Find best ward pair — skip wards already in active pacts
        const initCommittedWards = new Set<string>()
        const targCommittedWards = new Set<string>()
        for (const p of world.alliancePacts) {
          if (p.broken) continue
          for (const e of p.entries) {
            if (p.partyAId === party.id) initCommittedWards.add(e.wardA)
            if (p.partyBId === party.id && !e.isUnilateral) initCommittedWards.add(e.wardB)
            if (p.partyAId === target.id) targCommittedWards.add(e.wardA)
            if (p.partyBId === target.id && !e.isUnilateral) targCommittedWards.add(e.wardB)
          }
        }

        let bestPair: { initWard: string; targWard: string } | null = null
        let bestScore = 0
        for (const initWard of world.constituencies) {
          if (initCommittedWards.has(initWard.id)) continue
          const initShare = initWard.results.find((r) => r.partyId === party.id)?.voteShare ?? 0
          if (initShare >= 12) continue
          const initClose = initShare > 0 && initWard.results[0].voteShare - initShare < 5
          if (initClose) continue
          if (initiatorStandDownTooStrong(initWard, party.id)) continue
          const initIsIncumbent = world.electionsHeld >= 1 && world.electionNightResults.some(
            (r) => r.wardId === initWard.id && r.winner?.partyId === party.id,
          )
          if (initIsIncumbent) continue
          for (const targWard of world.constituencies) {
            if (initWard.id === targWard.id) continue
            if (targCommittedWards.has(targWard.id)) continue
            const targShare = targWard.results.find((r) => r.partyId === target.id)?.voteShare ?? 0
            if (targShare >= 12) continue
            const targClose = targShare > 0 && targWard.results[0].voteShare - targShare < 5
            if (targClose) continue
            if (targWard.leadingPartyId === target.id && targWard.margin > 5) continue
            const pairScore = npcPactPairScore(initShare, targShare)
            if (pairScore > bestScore) {
              bestScore = pairScore
              bestPair = { initWard: initWard.id, targWard: targWard.id }
            }
          }
        }

        if (bestPair) {
          const chance = evaluateAllianceAcceptance(world, party.id, target.id, bestPair.initWard, bestPair.targWard)
          const clamped = Math.max(0, Math.min(0.85, chance))
          const accepted = chance > STANDING_DOWN_SCORE + 1 && clamped >= 0.15 && rng() < clamped

          if (accepted) {
            const initW = world.constituencies.find((c) => c.id === bestPair!.initWard)
            const targW = world.constituencies.find((c) => c.id === bestPair!.targWard)
            if (initW && targW) {
              const endorsementForA = targW.results.find((r) => r.partyId === target.id)?.voteShare ?? 0
              const endorsementForB = initW.results.find((r) => r.partyId === party.id)?.voteShare ?? 0
              const npcPactIdx = world.alliancePacts.length
              world.alliancePacts.push({
                id: `pact-npc-${world.seed}-${world.week}-${npcPactIdx}`,
                partyAId: party.id,
                partyBId: target.id,
                entries: [{
                  id: `pact-e-npc-${world.seed}-${world.week}-${npcPactIdx}`,
                  wardA: initW.id,
                  wardAName: initW.name,
                  wardB: targW.id,
                  wardBName: targW.name,
                  isUnilateral: false,
                  endorsementForB,
                  endorsementForA,
                }],
                createdAtWeek: world.week,
                expiresWeek: world.week + world.weeksUntilElection + 1,
              })
              newsFeedLines.push(`${party.name} and ${target.name} form a pact — ${party.name} stands down in ${initW.name}, ${target.name} in ${targW.name}.`)
              aiPactResults.push({
                description: `🤝 ${party.name} and ${target.name} form a pact — ${party.name} stands down in ${initW.name}, ${target.name} in ${targW.name}.`,
                outcome: 'success',
              })
            }
          }
        }
      }
      // NPC-to-player proposal: 5% chance
      if (!hasActivePact(world.playerPartyId) && rng() < 0.05 && !world.pendingNpcProposal) {
        const playerParty = world.parties.find((p) => p.id === world.playerPartyId)
        if (playerParty) {
          const playerCommittedWards = new Set<string>()
          const npcCommittedWards = new Set<string>()
          for (const pact of world.alliancePacts) {
            if (pact.broken) continue
            for (const e of pact.entries) {
              if (pact.partyAId === world.playerPartyId) playerCommittedWards.add(e.wardA)
              if (pact.partyBId === world.playerPartyId) playerCommittedWards.add(e.wardB)
              if (pact.partyAId === party.id) npcCommittedWards.add(e.wardA)
              if (pact.partyBId === party.id && !e.isUnilateral) npcCommittedWards.add(e.wardB)
            }
          }

          let bestPair2: { initWard: string; targWard: string } | null = null
          let bestScore2 = 0
          for (const initWard of world.constituencies) {
            if (npcCommittedWards.has(initWard.id)) continue
            const initShare = initWard.results.find((r) => r.partyId === party.id)?.voteShare ?? 0
            if (initShare >= 12) continue
            const initClose = initShare > 0 && initWard.results[0].voteShare - initShare < 5
            if (initClose) continue
            if (initiatorStandDownTooStrong(initWard, party.id)) continue
            const initIsIncumbent = world.electionsHeld >= 1 && world.electionNightResults.some(
              (r) => r.wardId === initWard.id && r.winner?.partyId === party.id,
            )
            if (initIsIncumbent) continue
            for (const targWard of world.constituencies) {
              if (initWard.id === targWard.id) continue
              if (playerCommittedWards.has(targWard.id)) continue
              const targShare = targWard.results.find((r) => r.partyId === world.playerPartyId)?.voteShare ?? 0
              if (targShare >= 12) continue
              if (initiatorStandDownTooStrong(targWard, world.playerPartyId)) continue
              if (targWard.leadingPartyId === world.playerPartyId && targWard.margin > 5) continue
              const pairScore = npcPactPairScore(initShare, targShare)
              if (pairScore > bestScore2) {
                bestScore2 = pairScore
                bestPair2 = { initWard: initWard.id, targWard: targWard.id }
              }
            }
          }
          if (bestPair2) {
            const chance2 = evaluateAllianceAcceptance(world, party.id, world.playerPartyId, bestPair2.initWard, bestPair2.targWard)
            const clamped2 = Math.max(0, Math.min(0.85, chance2))
            const accepted2 = chance2 > STANDING_DOWN_SCORE + 1 && clamped2 >= 0.15 && rng() < clamped2
          if (accepted2) {
            const initW2 = world.constituencies.find((c) => c.id === bestPair2.initWard)
            const targW2 = world.constituencies.find((c) => c.id === bestPair2.targWard)
            if (initW2 && targW2) {
              const endorsementForA = targW2.results.find((r) => r.partyId === world.playerPartyId)?.voteShare ?? 0
              const endorsementForB = initW2.results.find((r) => r.partyId === party.id)?.voteShare ?? 0
              world.pendingNpcProposal = {
                id: `pact-npc-player-${world.seed}-${world.week}`,
                partyAId: party.id,
                partyBId: world.playerPartyId,
                entries: [{
                  id: `pact-e-npc-p-${world.seed}-${world.week}`,
                  wardA: initW2.id,
                  wardAName: initW2.name,
                  wardB: targW2.id,
                  wardBName: targW2.name,
                  isUnilateral: false,
                  endorsementForB,
                  endorsementForA,
                }],
                createdAtWeek: world.week,
                expiresWeek: world.week + world.weeksUntilElection + 1,
              }
              newsFeedLines.push(`🤝 ${party.name} proposes a pact with you — they stand down in ${initW2.name}, you stand down in ${targW2.name}.`)
            }
          }
        }
      }
      }
    }

    return { ...party, aiActionPoints: ap, wardBoosts: boosts }
  })

  // Periodic NPC pact review: every 4 weeks, evaluate whether to keep pacts
  if (world.week % 4 === 0) {
    const standingDown: Record<string, Set<string>> = {}
    for (const p of world.alliancePacts) {
      if (p.broken) continue
      for (const e of p.entries) {
        if (!standingDown[e.wardA]) standingDown[e.wardA] = new Set()
        standingDown[e.wardA].add(p.partyAId)
        if (!e.isUnilateral) {
          if (!standingDown[e.wardB]) standingDown[e.wardB] = new Set()
          standingDown[e.wardB].add(p.partyBId)
        }
      }
    }

    for (const pact of world.alliancePacts) {
      if (pact.broken) continue

      let breakPact = false
      let breakReason: string | null = null
      let alreadyAnnounced = false

      for (const entry of pact.entries) {
        const wardA = world.constituencies.find((c) => c.id === entry.wardA)
        const wardB = world.constituencies.find((c) => c.id === entry.wardB)
        if (!wardA || !wardB) continue

        const sdA = standingDown[entry.wardA]
        if (sdA && sdA.has(pact.partyBId) && pact.partyAId !== world.playerPartyId) {
          const partyName = world.parties.find((p) => p.id === pact.partyAId)?.name ?? '?'
          const allyName = world.parties.find((p) => p.id === pact.partyBId)?.name ?? '?'
          breakPact = true
          breakReason = pact.partyAId
          alreadyAnnounced = true
          newsFeedLines.push(`${partyName} abandons their pact with ${allyName} — their endorsement is wasted in ${entry.wardAName}.`)
          break
        }
        const sdB = standingDown[entry.wardB]
        if (sdB && sdB.has(pact.partyAId) && pact.partyBId !== world.playerPartyId) {
          const partyName = world.parties.find((p) => p.id === pact.partyBId)?.name ?? '?'
          const allyName = world.parties.find((p) => p.id === pact.partyAId)?.name ?? '?'
          breakPact = true
          breakReason = pact.partyBId
          alreadyAnnounced = true
          newsFeedLines.push(`${partyName} abandons their pact with ${allyName} — their endorsement is wasted in ${entry.wardBName}.`)
          break
        }

        const partyANowWinning = wardA.leadingPartyId === pact.partyAId && wardA.margin > 15
        const partyBNowWinning = wardB.leadingPartyId === pact.partyBId && wardB.margin > 15

        if (partyANowWinning && pact.partyAId !== world.playerPartyId) {
          breakPact = true
          breakReason = pact.partyAId
          break
        }
        if (partyBNowWinning && pact.partyBId !== world.playerPartyId) {
          breakPact = true
          breakReason = pact.partyBId
          break
        }
      }

      if (breakPact && breakReason) {
        pact.broken = true
        if (!alreadyAnnounced) {
          const partyName = world.parties.find((p) => p.id === breakReason)?.name ?? '?'
          newsFeedLines.push(`${partyName} breaks their alliance pact — they no longer need it.`)
        }
      }
    }
    for (const pact of world.alliancePacts) {
      if (pact.broken) continue
      if (world.week > pact.expiresWeek + 24) {
        pact.broken = true
      }
    }
  }

  return { parties: updatedParties, newsFeedLines, aiPactResults }
}

// ─── Apply player campaign action ────────────────────────────────────────────
export function applyCampaignAction(world: World, action: CampaignAction): { world: World; result: ActionResult } {
  if (world.playerActionPoints < 1) {
    return { world, result: { action, outcome: 'neutral', description: 'You’ve already acted this week.' } }
  }
  const rng = createRng(world.seed + world.week * 999 + world.actionsThisWeek.length * 7)
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
  let targetPartyName: string | undefined
  let newAlliancePact: AlliancePact | undefined
  let brokenPactId: string | undefined

  const targetWard = action.wardId ? world.constituencies.find((c) => c.id === action.wardId) : undefined
  const wardName = targetWard?.name

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
      updatedTiles = updatedTiles.map((tile) => {
        const matches = choice.effect.tags.some((tag) => tile.tags.includes(tag))
        if (!matches) return tile
        const boosts = { ...tile.campaignBoosts }
        boosts[world.playerPartyId] = clamp((boosts[world.playerPartyId] ?? 0) + choice.effect.playerBoost, 0, 0.4)
        if (choice.effect.opponentBoost) {
          for (const p of world.parties) {
            if (p.id === world.playerPartyId) continue
            boosts[p.id] = clamp((boosts[p.id] ?? 0) + choice.effect.opponentBoost, 0, 0.4)
          }
        }
        return {
          ...tile,
          values: addValues(tile.values, choice.effect.valueDrift, 0.8),
          campaignBoosts: boosts,
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
    case 'fix_potholes': {
      if (!targetWard) break
      updatedParties = updatedParties.map((p) =>
        p.id === world.playerPartyId
          ? { ...p, wardBoosts: { ...p.wardBoosts, [targetWard.id]: clamp((p.wardBoosts[targetWard.id] ?? 0) + 0.09, 0, 0.45) } }
          : p,
      )
      // Services-leaning tiles get a bonus
      updatedTiles = updatedTiles.map((tile) => {
        if (tile.constituencyId !== targetWard.id) return tile
        return {
          ...tile,
          campaignBoosts: {
            ...tile.campaignBoosts,
            [world.playerPartyId]: clamp((tile.campaignBoosts?.[world.playerPartyId] ?? 0) + 0.05, 0, 0.4),
          },
        }
      })
      voteShareDelta = 4
      description = `Your team organised a pothole blitz in ${targetWard.name}. Residents actually noticed.`
      break
    }
    case 'improve_bins': {
      if (!targetWard) break
      updatedParties = updatedParties.map((p) =>
        p.id === world.playerPartyId
          ? { ...p, wardBoosts: { ...p.wardBoosts, [targetWard.id]: clamp((p.wardBoosts[targetWard.id] ?? 0) + 0.08, 0, 0.45) } }
          : p,
      )
      voteShareDelta = 3
      description = `You personally lobbied the bin lorry depot. Collections improved in ${targetWard.name}. Small win, big gratitude.`
      break
    }
    case 'ward_festival': {
      if (!targetWard) break
      // Higher risk/reward — can fall flat or be a hit
      const successChance = 0.55
      const success = createRng(world.seed + world.week * 777 + world.actionsThisWeek.length * 13)() < successChance
      if (success) {
        updatedParties = updatedParties.map((p) =>
          p.id === world.playerPartyId
            ? {
                ...p,
                wardBoosts: { ...p.wardBoosts, [targetWard.id]: clamp((p.wardBoosts[targetWard.id] ?? 0) + 0.18, 0, 0.55) },
                momentum: clamp(p.momentum + 0.1, -0.7, 0.7),
              }
            : p,
        )
        voteShareDelta = 8
        description = `The ${targetWard.name} Ward Festival was a smash hit. Your team were everywhere — and everyone noticed.`
        outcome = 'success'
      } else {
        updatedParties = updatedParties.map((p) =>
          p.id === world.playerPartyId
            ? { ...p, momentum: clamp(p.momentum - 0.06, -0.7, 0.7) }
            : p,
        )
        voteShareDelta = -1
        description = `The festival in ${targetWard.name} was a bit of a damp squib. The bunting fell down and the DJ cancelled.`
        outcome = 'backfire'
      }
      break
    }
    case 'propose_alliance': {
      if (!targetWard || !action.targetPartyId || !action.allyWardId) break
      const allyWard = world.constituencies.find((c) => c.id === action.allyWardId)
      const allyParty = world.parties.find((p) => p.id === action.targetPartyId)
      if (!allyWard || !allyParty) break

      const isUnilateral = action.wardId === action.allyWardId
      targetPartyName = allyParty.name

      const entries: AlliancePactEntry[] = []

      let entryIdx = 0
      const makeEntry = (ourWardId: string, theirWardId: string, uni: boolean): AlliancePactEntry | null => {
        const ow = world.constituencies.find((c) => c.id === ourWardId)
        const tw = world.constituencies.find((c) => c.id === theirWardId)
        if (!ow || !tw) return null
        entryIdx++
        return {
          id: `pact-e-${world.seed}-${world.week}-${entryIdx}`,
          wardA: ow.id,
          wardAName: ow.name,
          wardB: tw.id,
          wardBName: tw.name,
          isUnilateral: uni,
          endorsementForB: ow.results.find((r) => r.partyId === world.playerPartyId)?.voteShare ?? 0,
          endorsementForA: uni ? 0 : tw.results.find((r) => r.partyId === allyParty.id)?.voteShare ?? 0,
        }
      }

      const primary = makeEntry(action.wardId!, action.allyWardId!, isUnilateral)
      if (!primary) break
      entries.push(primary)

      if (action.allianceEntries) {
        for (const bw of action.allianceEntries) {
          const e = makeEntry(bw.ourWardId, bw.theirWardId, bw.isUnilateral ?? false)
          if (e) entries.push(e)
        }
      }

      const playerCommitted = new Set<string>()
      const allyCommitted = new Set<string>()
      for (const p of world.alliancePacts) {
        if (p.broken) continue
        for (const e of p.entries) {
          if (p.partyAId === world.playerPartyId) playerCommitted.add(e.wardA)
          if (p.partyBId === world.playerPartyId && !e.isUnilateral) playerCommitted.add(e.wardB)
          if (p.partyAId === allyParty.id) allyCommitted.add(e.wardA)
          if (p.partyBId === allyParty.id && !e.isUnilateral) allyCommitted.add(e.wardB)
        }
      }

      const totalSacrifice = entries.reduce((sum, e) => sum + e.endorsementForB / 100, 0)

      const acceptedEntries: AlliancePactEntry[] = []
      for (const entry of entries) {
        if (playerCommitted.has(entry.wardA) || allyCommitted.has(entry.wardB)) continue
        if (entry.isUnilateral) {
          // Unilateral still requires the player stand-down ward to be a weak sacrifice
          const uniScore = evaluateAllianceAcceptance(
            world, world.playerPartyId, action.targetPartyId, entry.wardA, entry.wardB,
          )
          if (uniScore > STANDING_DOWN_SCORE + 1 && uniScore >= 0.15) {
            acceptedEntries.push(entry)
          }
          continue
        }
        const det = deterministicAcceptance(world, world.playerPartyId, action.targetPartyId, entry.wardA, entry.wardB, totalSacrifice, entries.length)
        if (det.accepted) {
          acceptedEntries.push(entry)
        }
      }

      if (acceptedEntries.length > 0) {
        const existingPact = world.alliancePacts.find((p) =>
          !p.broken &&
          ((p.partyAId === world.playerPartyId && p.partyBId === action.targetPartyId) ||
           (p.partyBId === world.playerPartyId && p.partyAId === action.targetPartyId))
        )

        if (existingPact) {
          newAlliancePact = {
            ...existingPact,
            entries: [...existingPact.entries, ...acceptedEntries],
            expiresWeek: world.week + world.weeksUntilElection + 1,
          }
        } else {
          newAlliancePact = {
            id: `pact-${world.seed}-${world.week}-${world.alliancePacts.length}`,
            partyAId: world.playerPartyId,
            partyBId: action.targetPartyId!,
            entries: acceptedEntries,
            createdAtWeek: world.week,
            expiresWeek: world.week + world.weeksUntilElection + 1,
          }
        }

        voteShareDelta = 2
        const wardNames = acceptedEntries.map((e) => e.wardBName)
        const uniqueAllyWards = [...new Set(wardNames)]
        const partial = acceptedEntries.length < entries.length
        description = `${allyParty.name} accepted ${acceptedEntries.length} of ${entries.length} pact${entries.length !== 1 ? 's' : ''}. You stand down in ${acceptedEntries.map((e) => e.wardAName).join(', ')}; they stand down in ${uniqueAllyWards.join(', ')}.${partial ? ` ${entries.length - acceptedEntries.length} ward-pair${entries.length - acceptedEntries.length !== 1 ? 's were' : ' was'} rejected.` : ''}`
        outcome = 'success'
      } else {
        voteShareDelta = 0
        description = `${allyParty.name} rejected the alliance proposal. They weren't convinced.`
        outcome = 'backfire'
      }
      break
    }
    case 'break_alliance': {
      if (!action.wardId || !action.targetPartyId) break
      const pact = world.alliancePacts.find((p) => p.id === action.wardId)
      if (!pact) break
      brokenPactId = pact.id
      const allyName = world.parties.find((p) => p.id === action.targetPartyId)?.name ?? action.targetPartyId
      const repKey = [world.playerPartyId, action.targetPartyId].sort().join('_')
      world.allianceReputation[repKey] = (world.allianceReputation[repKey] ?? 0) + 0.3
      voteShareDelta = 0
      description = `You broke the pact with ${allyName}. They won't forget this.`
      outcome = 'neutral'
      break
    }
  }

  const updatedWorld: World = {
    ...world,
    parties: updatedParties,
    tiles: updatedTiles,
    playerActionPoints: 0,
    weeklyEvent: action.type === 'respond_event' && world.weeklyEvent
      ? { ...world.weeklyEvent, resolved: true, chosenIndex: action.eventChoiceIndex }
      : world.weeklyEvent,
    policyShiftUsedThisCycle: action.type === 'policy_shift' ? true : world.policyShiftUsedThisCycle,
    alliancePacts: newAlliancePact
      ? (world.alliancePacts.some((p) => p.id === newAlliancePact.id)
        ? world.alliancePacts.map((p) => p.id === newAlliancePact.id ? newAlliancePact : p)
        : [...world.alliancePacts, newAlliancePact])
      : brokenPactId
        ? world.alliancePacts.map((p) => p.id === brokenPactId ? { ...p, broken: true } : p)
        : world.alliancePacts,
  }

  // Recalculate results after action
  const results = calculateResults(updatedWorld)
  const withResults = { ...updatedWorld, constituencies: results.constituencies, nationalResults: results.nationalResults }
  const stats = buildStats(withResults)
  const finalWorld = { ...withResults, stats }

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

// ─── Main world generation ────────────────────────────────────────────────────
export function generateWorld(options: WorldOptions): World {
  const rng = createRng(options.seed)
  const townName = createTownName(rng)
  const councilName = `${townName} Town Council`
  const landmass = createLandmass(rng)
  const centers = createSettlementCenters(rng, landmass.points, townName)
  const blocs = generateBlocs(rng)
  const tiles = createPopulationTiles(rng, landmass.points, centers, blocs)
  const coastal = townLooksCoastal(townName) || (blocs.some((bloc) => bloc.homeRole === 'river') && rng() < 0.22)

  let parties = [...createGeneratedParties(rng, blocs, townName, coastal), ...convertCustomParties(options.customParties)]

  const generatedConstituencies = createConstituencies(rng, tiles, options.constituencyCount, parties)
  const constituencies = generatedConstituencies.map((constituency) => ({
    ...constituency,
    tacticalPressure: Object.fromEntries(parties.map((party) => [party.id, 1])),
  }))
  parties = assignPartyFocus(parties, constituencies)

  const establishedParties = parties.filter((p) => p.footing === 'established')
  const defaultPlayerPartyId = options.playerPartyId && parties.some((p) => p.id === options.playerPartyId)
    ? options.playerPartyId
    : establishedParties[establishedParties.length - 1]?.id ?? parties[0]?.id ?? ''

  parties = parties.map((p) => {
    if (p.id === defaultPlayerPartyId) {
      return { ...p, baseUtility: p.baseUtility - 0.08, organization: p.organization * 0.9 }
    }
    return p
  })

  const electionCycleWeeks = 24
  const weeksUntilElection = Math.floor(randomBetween(rng, 8, 20))
  const currents = shuffle(issueCurrents, rng).slice(0, 3).map<GeographicCurrent>((current) => ({
    ...current,
    intensity: randomBetween(rng, 0.7, 1.25),
  }))

  const incumbentPool = establishedParties.filter((p) => p.id !== defaultPlayerPartyId)
  const incumbent = pickOne(rng, incumbentPool.length > 0 ? incumbentPool : parties.filter((p) => p.id !== defaultPlayerPartyId))

  const baseWorld = {
    gameMode: 'single-politician' as const,
    seed: options.seed,
    week: 1,
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
    electoralPacts: [] as ElectoralPact[],
    pactTrust: {} as Record<string, number>,
    government: createCaretakerGovernment(
      incumbent?.id ?? establishedParties[0]?.id ?? parties[0]?.id ?? defaultPlayerPartyId,
      1,
    ),
    electionCycleWeeks,
    weeksUntilElection,
    playerActionPoints: 1,
    maxActionPoints: 1,
    activeCampaigns: [] as ActiveCampaign[],
    actionsThisWeek: [] as ActionResult[],
    weeklyEvent: pickWeeklyEvent(rng),
    newsFeed: [`Welcome to ${townName}. You are building a local political career. Election in ${weeksUntilElection} weeks.`],
    voteHistory: [] as VoteHistoryEntry[],
    electionSeatHistory: [] as ElectionSeatHistoryEntry[],
    governanceDecisions: [] as GovernanceDecision[],
    electionNightActive: false,
    electionNightResults: [],
    electionNightRevealIndex: 0,
    electionNightPreviousSeats: {},
    electionsHeld: 0,
    policyShiftUsedThisCycle: false,
    alliancePacts: [] as AlliancePact[],
    allianceReputation: {} as Record<string, number>,
    budget: getDefaultBudget(),
    councilHistory: [] as CouncilDecisionRecord[],
  }

  // Build a temporary stats object so calculateResults can run
  const tempStats: TownStats = {
    councilMajority: Math.floor(constituencies.length / 2) + 1,
    averageTurnout: 0,
    projectedMayorParty: '',
    projectedMayorLeader: '',
    projectedMayorWards: 0,
    closestWardName: '',
    closestWardMargin: 0,
    safestWardName: '',
    safestWardMargin: 0,
    totalWards: constituencies.length,
    battlegroundWardIds: [],
  }
  const worldForCalc = { ...baseWorld, stats: tempStats } as World
  const results = calculateResults(worldForCalc)
  const withResults = { ...baseWorld, constituencies: results.constituencies, nationalResults: results.nationalResults }
  const stats = buildStats(withResults as Parameters<typeof buildStats>[0])
  let finalWorld = { ...withResults, stats } as World
  if (options.partyEdits?.length) {
    finalWorld = applyPartyEdits(finalWorld, options.partyEdits)
  }

  {
    finalWorld.politicianMode = initializePoliticianMode(finalWorld, options.playerWardId ?? '', options.playerName)
    if (finalWorld.politicianMode.politician.traits.some((t) => t.id === 'fundraiser')) {
      finalWorld.politicianMode = {
        ...finalWorld.politicianMode,
        politician: {
          ...finalWorld.politicianMode.politician,
          personalFunds: finalWorld.politicianMode.politician.personalFunds + 1,
        },
      }
    }
    const polName = finalWorld.politicianMode.politician.name
    const polNameParts = polName.split(' ')
    const polInitials = polNameParts.map((n) => n[0]).join('')
    if (options.playerWardId) {
      finalWorld.constituencies = finalWorld.constituencies.map((c) => {
        if (c.id !== options.playerWardId) return c
        return {
          ...c,
          candidates: c.candidates.map((cand) =>
            cand.partyId === finalWorld.playerPartyId
              ? { ...cand, name: polName, initials: polInitials }
              : cand,
          ),
        }
      })
    }
    const wardName = finalWorld.constituencies.find((c) => c.id === options.playerWardId)?.name
    const partyName = finalWorld.parties.find((p) => p.id === finalWorld.playerPartyId)?.name ?? 'your party'
    const traitNames = finalWorld.politicianMode.politician.traits.map((t) => t.label).join(' & ')
    finalWorld.newsFeed = [
      wardName
        ? `Welcome, Cllr. ${polName}. You are ${partyName}'s candidate in ${wardName}. Election in ${finalWorld.weeksUntilElection} weeks.`
        : `Welcome, ${polName}. You have joined ${partyName}; choose a ward before the election in ${finalWorld.weeksUntilElection} weeks.`,
      traitNames ? `Your traits: ${traitNames}.` : '',
    ].filter(Boolean)
  }

  return finalWorld
}

function electionGovernmentAfterWeek(
  world: World,
  electionHappening: boolean,
  playerWon: boolean,
  seatLeader: PartyPerformance | undefined,
  majority: number,
  nationalResults: PartyPerformance[],
): GovernmentState | undefined {
  if (!electionHappening) return world.government

  const formedWeek = world.week + 1
  const electionNumber = world.electionsHeld + 1

  if (playerWon) {
    return {
      status: 'formed',
      kind: 'majority',
      leadPartyId: world.playerPartyId,
      partnerPartyIds: [],
      formedWeek,
      electionNumber,
    }
  }

  const hasMajority = nationalResults.some((r) => r.seatsWon >= majority)
  if (!hasMajority) {
    return {
      status: 'forming',
      kind: 'caretaker',
      leadPartyId: seatLeader?.partyId ?? world.playerPartyId,
      partnerPartyIds: [],
      formedWeek,
      electionNumber,
    }
  }

  return {
    status: 'formed',
    kind: 'majority',
    leadPartyId: seatLeader!.partyId,
    partnerPartyIds: [],
    formedWeek,
    electionNumber,
  }
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
    ].slice(-(3 * world.electionCycleWeeks)),
  }))

  const provisional = {
    ...world,
    week: world.week + 1,
    currents,
    tiles: tilesBeforeAI,
    parties: partiesEvolved,
    constituencies: constituenciesWithHistory,
    weeksUntilElection: world.weeksUntilElection > 0 ? world.weeksUntilElection - 1 : world.electionCycleWeeks,
    playerActionPoints: world.maxActionPoints,
    actionsThisWeek: [] as ActionResult[],
    // New weekly event
    weeklyEvent: pickWeeklyEvent(rng),
    policyShiftUsedThisCycle: world.weeksUntilElection === 0 ? false : world.policyShiftUsedThisCycle,
    voteHistory: [...world.voteHistory, historyEntry].slice(-(3 * world.electionCycleWeeks)),
  }

  // Permanent party campaigns deprecated — keep field empty
  const provisionalWithCampaigns = { ...provisional, activeCampaigns: [] as ActiveCampaign[] } as World

  // Run AI campaigns
  const aiResults = runAICampaigns(provisionalWithCampaigns, rng)
  const { parties: partiesAfterAI, newsFeedLines: aiNews } = aiResults
  const provisionalWithAI = updateTacticalPressure({ ...provisionalWithCampaigns, parties: partiesAfterAI })

  const results = calculateResults(provisionalWithAI as World)
  const seatLeader = results.nationalResults[0]

  // Check for election
  const electionHappening = world.weeksUntilElection === 0
  const playerResult = results.nationalResults.find((r) => r.partyId === world.playerPartyId)
  const majority = Math.floor(provisionalWithAI.constituencies.length / 2) + 1
  const playerWon = electionHappening && (playerResult?.seatsWon ?? 0) >= majority

  // Capture seat counts BEFORE this election for before/after comparison
  const electionNightPreviousSeats: Record<string, number> = electionHappening
    ? Object.fromEntries(world.parties.map((p) => {
        // Use the previous election's results if they exist, else current weekly poll
        const prevResult = world.electionsHeld > 0
          ? world.electionNightResults.filter((r) => r.winner?.partyId === p.id).length
          : world.nationalResults.find((r) => r.partyId === p.id)?.seatsWon ?? 0
        return [p.id, prevResult]
      }))
    : world.electionNightPreviousSeats

  // Build election night results if election is happening
  const electionNightResults = electionHappening
    ? results.constituencies.map((seat) => {
        const winner = seat.currentWinner
        // Previous election winner for this ward (from persisted electionNightResults)
        const prevElectionEntry = world.electionsHeld > 0
          ? world.electionNightResults.find((r) => r.wardId === seat.id)
          : undefined
        const prevWinnerPartyId = prevElectionEntry?.winner?.partyId
        const prevWinnerParty = prevWinnerPartyId
          ? world.parties.find((p) => p.id === prevWinnerPartyId)
          : undefined
        const prevWinnerCandidate = prevElectionEntry?.winner
        // The ward changed hands if the new winner differs from the last election winner
        const wasHeld = prevWinnerPartyId != null && seat.leadingPartyId !== prevWinnerPartyId
        // Swing = winner's vote share this election minus their vote share last election
        // Only meaningful when we have a previous election to compare against
        const prevWinnerShareLastTime = prevElectionEntry?.results.find(
          (r) => r.partyId === seat.leadingPartyId,
        )?.voteShare
        const swingFromLastElection = prevElectionEntry != null && prevWinnerShareLastTime != null
          ? seat.results.find((r) => r.partyId === seat.leadingPartyId)!.voteShare - prevWinnerShareLastTime
          : undefined
        // Previous margin: winner's lead at last election
        const previousMargin = prevElectionEntry?.results[0]
          ? prevElectionEntry.results[0].voteShare - (prevElectionEntry.results[1]?.voteShare ?? 0)
          : undefined
        return {
          wardId: seat.id,
          wardName: seat.name,
          winner: winner!,
          results: seat.results,
          candidates: seat.candidates.map((c) => ({ partyId: c.partyId, name: c.name, colour: c.partyColour })),
          turnout: seat.turnout,
          swingFromLastElection,
          wasHeld,
          previousWinnerPartyId: prevWinnerPartyId,
          previousWinnerPartyName: prevWinnerParty?.name,
          previousWinnerCandidateName: prevWinnerCandidate?.name,
          previousWinnerColour: prevWinnerParty?.colour,
          previousMargin,
        }
      })
    : world.electionNightResults

  const sortedResults = electionHappening
    ? [...electionNightResults].sort((a, b) => {
        const am = a.results[0] ? a.results[0].voteShare - (a.results[1]?.voteShare ?? 0) : 0
        const bm = b.results[0] ? b.results[0].voteShare - (b.results[1]?.voteShare ?? 0) : 0
        return bm - am
      })
    : electionNightResults

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

  // ── Cancel auto-campaigns in wards that changed hands at election time ────
  // Auto-campaigns stay active through mid-cycle polling swings — they only
  // reset when an actual election happens and the player gains/loses incumbency.
  let activeCampaignsAfterFlips = provisionalWithAI.activeCampaigns

  if (electionHappening) {
    for (const r of sortedResults) {
      const prevWinner = world.electionNightResults.find((p) => p.wardId === r.wardId)?.winner?.partyId
      if (prevWinner !== undefined && r.winner?.partyId !== prevWinner) {
        activeCampaignsAfterFlips = activeCampaignsAfterFlips.filter((c) => !c.wardId || c.wardId !== r.wardId)
        if (r.winner?.partyId === world.playerPartyId || prevWinner === world.playerPartyId) {
          const wardName = world.constituencies.find((c) => c.id === r.wardId)?.name ?? r.wardId
          newsFeedLines.push(`Auto-campaigns in ${wardName} stopped — ward changed hands.`)
        }
      }
    }
  }

  if (world.politicianMode) {
    const polWard = results.constituencies.find((c) => c.id === world.politicianMode!.politician.wardId)
    if (polWard) {
      const polResult = polWard.results.find((r) => r.partyId === world.playerPartyId)
      const leadResult = polWard.results[0]
      if (polResult && leadResult) {
        if (leadResult.partyId === world.playerPartyId) {
          newsFeedLines.push(`Your ward (${polWard.name}): You lead with ${polResult.voteShare.toFixed(1)}%.`)
        } else {
          const gap = leadResult.voteShare - polResult.voteShare
          newsFeedLines.push(`Your ward (${polWard.name}): ${gap.toFixed(1)}pts behind ${leadResult.partyName}.`)
        }
      }
    }
    if (electionHappening && world.politicianMode.politician.wardId) {
      const wonSeat = polWard?.currentWinner?.partyId === world.playerPartyId
      if (!wonSeat) {
        newsFeedLines.push(`You lost your seat in ${polWard?.name ?? 'your ward'}, but remain active in local politics for the next cycle.`)
      }
    }
  }

  const merged = {
    ...provisionalWithAI,
    activeCampaigns: activeCampaignsAfterFlips,
    constituencies: results.constituencies.map((seat) => ({
      ...seat,
      history: constituenciesWithHistory.find((c) => c.id === seat.id)?.history ?? seat.history,
      candidates: electionHappening
        ? rotateCandidates(
            rng,
            seat.candidates,
            seat.leadingPartyId,
            provisionalWithAI.parties,
            world.politicianMode?.politician.name,
            seat.id === world.politicianMode?.politician.wardId,
          )
        : seat.candidates,
    })),
    nationalResults: results.nationalResults,
    government: electionGovernmentAfterWeek(
      world,
      electionHappening,
      playerWon,
      seatLeader,
      majority,
      results.nationalResults,
    ),
    electoralPacts: world.electoralPacts ?? [],
    pactTrust: world.pactTrust ?? {},
    electionNightActive: electionHappening,
    electionNightResults: sortedResults,
    electionNightRevealIndex: 0,
    electionNightPreviousSeats,
    electionsHeld: world.electionsHeld + (electionHappening ? 1 : 0),
    governanceDecisions: electionHappening ? [] : world.governanceDecisions,
    newsFeed: [...newsFeedLines.map((l) => `Week ${world.week + 1}: ${l}`), ...world.newsFeed].slice(0, 30),
    alliancePacts: world.alliancePacts,
    electionSeatHistory: electionHappening
      ? [
          ...(world.electionSeatHistory ?? []),
          {
            week: world.week + 1,
            electionNumber: world.electionsHeld + 1,
            partySeats: Object.fromEntries(results.nationalResults.map((r) => [r.partyId, r.seatsWon])),
          },
        ].slice(-15)
      : (world.electionSeatHistory ?? []),
  }

  if (electionHappening) {
    const tenureResults = sortedResults.map((r) => ({
      wardId: r.wardId,
      wardName: r.wardName,
      winnerName: r.winner?.name ?? world.parties.find((p) => p.id === r.winner?.partyId)?.name ?? 'Unknown',
      winnerParty: r.winner?.partyName ?? '?',
      winnerColour: r.winner?.partyColour ?? '#888',
    }))
    updateCouncillorTenure(merged.seed, merged.week, tenureResults)
  }

  let politicianMode = world.politicianMode
  const politicianNews: string[] = []
  let pendingActionToast: string | undefined
  if (politicianMode) {
    const pol = politicianMode.politician
    const approvalDecay = pol.personalApproval * 0.03
    const relationshipDecay = pol.isIncumbent ? 1 : 0.5
    const decayedRelationships = pol.relationships.map((r) => {
      const sameParty = r.partyId === pol.partyId
      const decay = sameParty ? relationshipDecay * 0.5 : relationshipDecay
      return {
        ...r,
        strength: r.strength > 0 ? r.strength - decay : r.strength < 0 ? r.strength + decay : 0,
      }
    })
    const nextPol = { ...pol, personalApproval: pol.personalApproval - approvalDecay, relationships: decayedRelationships }
    politicianMode = {
      ...politicianMode,
      autoCampaigns: politicianMode.autoCampaigns.slice(0, 1),
      politician: nextPol,
    }
    // Weekly auto runs at week end only if the player did not already use their action
    const weeklyType = politicianMode.autoCampaigns[0]
    if (weeklyType && world.playerActionPoints >= 1) {
      let autoPol = politicianMode.politician
      let autoParties = merged.parties
      const autoRng = createRng(world.seed + world.week * 9991)
      if (!(weeklyType === 'hold_surgery' && !autoPol.isIncumbent)) {
        let approvalGain = 0
        let repGain = 0
        let infGain = 0
        let autoToast: string | undefined
        switch (weeklyType) {
          case 'door_knock': approvalGain = 0.05 + autoRng() * 0.04; repGain = 3 + Math.floor(autoRng() * 3); break
          case 'hold_surgery': approvalGain = 0.04 + autoRng() * 0.03; repGain = 2; break
          case 'leaflet_drop': approvalGain = 0.05 + autoRng() * 0.04; repGain = 3 + Math.floor(autoRng() * 3); break
          case 'local_media': if (autoRng() < 0.2) { approvalGain = -0.04; repGain = -3 } else { approvalGain = 0.06; repGain = 5 } break
          case 'call_party_support': {
            if (autoPol.partyLoyalty >= 40 && autoPol.wardId) {
              const wardBoostAmount = (0.08 + autoRng() * 0.04) * (autoPol.partyLoyalty / 100)
              autoParties = autoParties.map((party) => party.id === world.playerPartyId
                ? { ...party, wardBoosts: { ...party.wardBoosts, [autoPol.wardId]: clamp((party.wardBoosts[autoPol.wardId] ?? 0) + wardBoostAmount, 0, 0.45) } }
                : party)
              autoPol = { ...autoPol, partyLoyalty: clamp(autoPol.partyLoyalty - 5, 0, 100) }
            }
            break
          }
          case 'help_colleague': {
            const autoTargets = getColleagueCampaignTargets({ ...merged, parties: autoParties, politicianMode: { ...politicianMode, politician: autoPol } })
            const preferredWardId = politicianMode.autoColleagueWardId
            const preferred = preferredWardId
              ? autoTargets.find((entry) => entry.wardId === preferredWardId)
              : undefined
            const autoTarget = preferred ?? autoTargets[0]
            if (autoTarget) {
              const localRootsBonus = autoPol.traits.some((t) => t.id === 'local-roots') ? 1.2 : 1.0
              const wardBoostAmount = (0.06 + autoRng() * 0.03) * localRootsBonus
              autoParties = autoParties.map((party) => party.id === world.playerPartyId
                ? { ...party, wardBoosts: { ...party.wardBoosts, [autoTarget.wardId]: clamp((party.wardBoosts[autoTarget.wardId] ?? 0) + wardBoostAmount, 0, 0.45) } }
                : party)
              const relationships = autoPol.relationships.map((relationship) => {
                if (!autoTarget.councillorId || relationship.targetId !== autoTarget.councillorId) return relationship
                const strength = clamp(relationship.strength + 6, -100, 100)
                const type: Relationship['type'] = strength > 40 ? 'ally' : strength < -30 ? 'rival' : relationship.type === 'mentor' ? 'mentor' : 'neutral'
                return {
                  ...relationship,
                  strength,
                  type,
                  history: [...relationship.history, 'Campaigned in their ward'].slice(-8),
                }
              })
              autoPol = {
                ...autoPol,
                partyLoyalty: clamp(autoPol.partyLoyalty + 5, 0, 100),
                relationships,
              }
              autoToast = `Weekly action completed: campaigned for ${autoTarget.candidateName} in ${autoTarget.wardName}.`
            }
            break
          }
          case 'smear_opponent': if (autoRng() < 0.3) { approvalGain = -0.06 } else { approvalGain = 0.04 } break
          case 'attend_event': infGain = 1; break
          case 'shift_personal_policy': break
          default: approvalGain = 0.02; infGain = 1; break
        }
        autoPol = {
          ...autoPol,
          personalApproval: clamp(autoPol.personalApproval + approvalGain, -1, 1),
          reputation: clamp(autoPol.reputation + repGain, 0, 100),
          influence: clamp(autoPol.influence + infGain, 0, 100),
        }
        politicianMode = { ...politicianMode, politician: autoPol }
        merged.parties = autoParties
        const toast = autoToast ?? `Weekly action completed: ${weeklyType.replace(/_/g, ' ')}.`
        politicianNews.push(toast)
        pendingActionToast = toast
      }
    }
  }
  if (politicianMode && electionHappening) {
    const pol = politicianMode.politician
    const playerWardResult = sortedResults.find((r) => r.wardId === pol.wardId)
    const wonSeat = Boolean(pol.wardId && playerWardResult?.winner?.partyId === world.playerPartyId)
    const updatedPol: PoliticianState = {
      ...pol,
      isIncumbent: wonSeat,
      termsServed: wonSeat ? pol.termsServed + 1 : pol.termsServed,
      careerHistory: [
        ...pol.careerHistory,
        { week: world.week + 1, description: wonSeat ? 'Won seat' : pol.wardId ? 'Lost seat' : 'Remained without a seat', tier: pol.careerTier, rank: pol.careerRank },
      ],
    }
    const updatedCouncillors = merged.constituencies
      .filter((c) => c.id !== pol.wardId)
      .map((c) => {
        const existing = politicianMode!.councillors.find((cllr) => cllr.wardId === c.id)
        const winner = c.candidates.find((cand) => cand.partyId === c.leadingPartyId) ?? c.candidates[0]
        if (existing && existing.partyId === winner.partyId) return existing
        const party = merged.parties.find((p) => p.id === winner.partyId)
        return {
          id: existing?.id ?? `cllr_${c.id}`,
          name: winner.name,
          partyId: winner.partyId,
          partyColour: winner.partyColour,
          wardId: c.id,
          wardName: c.name,
          personalValues: party ? roundPoliticalValues(party.values) : { change: 0, growth: 0, services: 0 },
          rebellionTendency: existing?.rebellionTendency ?? rng() * 0.22,
          influence: existing?.influence ?? 10 + Math.floor(rng() * 30),
        }
      })
    const updatedRelationships = updatedPol.relationships.map((relationship) => {
      const councillor = updatedCouncillors.find((entry) => entry.id === relationship.targetId)
      if (!councillor) return relationship
      const changedRepresentative = relationship.targetName !== councillor.name || relationship.partyId !== councillor.partyId
      return {
        ...relationship,
        targetName: councillor.name,
        partyId: councillor.partyId,
        partyColour: councillor.partyColour,
        type: changedRepresentative ? 'neutral' : relationship.type,
        strength: changedRepresentative ? Math.round(relationship.strength * 0.5) : relationship.strength,
        history: changedRepresentative
          ? [...relationship.history, `${councillor.name} succeeded the previous representative in ${councillor.wardName}.`]
          : relationship.history,
      }
    })
    const firstTerm = wonSeat && !pol.isIncumbent
    if (firstTerm) {
      const firstSessionWeek = merged.week + politicianMode.councilSessionInterval
      politicianNews.push(`Your first council session is scheduled for week ${firstSessionWeek}.`)
    }
    const nextSessionWeek = wonSeat
      ? Math.max(politicianMode.nextSessionWeek, merged.week + politicianMode.councilSessionInterval)
      : politicianMode.nextSessionWeek
    const nextBudgetWeek = wonSeat && politicianMode.nextBudgetWeek <= merged.week
      ? merged.week + world.electionCycleWeeks
      : politicianMode.nextBudgetWeek
    politicianMode = {
      ...politicianMode,
      politician: { ...updatedPol, relationships: updatedRelationships },
      councillors: updatedCouncillors,
      nextSessionWeek,
      nextBudgetWeek,
    }
  }

  const stats = buildStats(merged)
  return {
    ...merged,
    stats,
    politicianMode,
    newsFeed: politicianNews.length > 0 ? [`Week ${merged.week}: ${politicianNews[0]}`, ...merged.newsFeed].slice(0, 30) : merged.newsFeed,
    playerActionPoints: world.maxActionPoints,
    maxActionPoints: 1,
    activeCampaigns: [],
    pendingActionToast,
  }
}

// ─── Redistricting / ward recalculation ────────────────────────────────────

export function recalculateWardAggregates(world: World): Constituency[] {
  return world.constituencies.map((seat) => {
    const seatTiles = world.tiles.filter((t) => t.constituencyId === seat.id)
    const population = seatTiles.reduce((s, t) => s + t.population, 0)
    if (population === 0) return {
      ...seat,
      population: 0,
      turnout: 0,
      urbanity: 0,
      blocMix: {},
      tags: [],
      values: createValues(0),
      results: [],
      leadingPartyId: '',
      leadingPartyName: '',
      margin: 0,
      cellPath: '',
    }

    const urbanity = seatTiles.reduce((s, t) => s + t.urbanity * t.population, 0) / population
    const turnout = seatTiles.reduce((s, t) => s + t.turnout * t.population, 0) / population

    const blocMix: Record<string, number> = {}
    const tagWeights: Record<string, number> = {}
    seatTiles.forEach((tile) => {
      Object.entries(tile.blocMix).forEach(([k, v]) => {
        blocMix[k] = (blocMix[k] ?? 0) + v * tile.population
      })
      tile.tags.forEach((tag) => {
        tagWeights[tag] = (tagWeights[tag] ?? 0) + tile.population
      })
    })
    const totalBloc = Object.values(blocMix).reduce((s, v) => s + v, 0) || 1
    Object.keys(blocMix).forEach((k) => { blocMix[k] /= totalBloc })

    const tags = Object.entries(tagWeights)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tag]) => tag)

    const cx = seatTiles.reduce((s, t) => s + t.x * t.population, 0) / population
    const cy = seatTiles.reduce((s, t) => s + t.y * t.population, 0) / population

    return {
      ...seat,
      population,
      turnout,
      urbanity,
      tags,
      blocMix,
      values: weightedAverageValues(
        seatTiles.map((t) => ({ values: t.values, weight: t.population })),
        createValues(0),
      ),
      seed: { x: cx, y: cy },
    }
  })
}

export function regenerateCellPaths(constituencies: Constituency[]): Constituency[] {
  const seeds = constituencies
    .filter((c) => c.population > 0)
    .map((c) => [c.seed.x, c.seed.y] as [number, number])

  if (seeds.length < 3) return constituencies

  const delaunay = Delaunay.from(seeds)
  const voronoi = delaunay.voronoi([0, 0, MAP_WIDTH, MAP_HEIGHT])

  let seedIndex = 0
  return constituencies.map((seat) => {
    if (seat.population === 0) return { ...seat, cellPath: '' }
    const cell = voronoi.cellPolygon(seedIndex) as Array<[number, number]> | null
    seedIndex++
    return {
      ...seat,
      cellPath: cell ? polygonToPath(cell) : seat.cellPath,
    }
  })
}

export function redistributeSnapshot(tiles: PopulationTile[]): Map<string, string> {
  return new Map(tiles.map((t) => [t.id, t.constituencyId ?? '']))
}

export function restoreRedistributeSnapshot(tiles: PopulationTile[], snapshot: Map<string, string>) {
  for (const tile of tiles) {
    const original = snapshot.get(tile.id)
    if (original !== undefined) tile.constituencyId = original
  }
}

// ─── Exported helpers ─────────────────────────────────────────────────────────
export function dominantBlocId(blocMix: Record<string, number>) {
  return Object.entries(blocMix).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

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
  const stances: string[] = []
  if (values.change > 25) stances.push('Reformist')
  else if (values.change < -25) stances.push('Traditional')
  if (values.growth > 25) stances.push('Pro-growth')
  else if (values.growth < -25) stances.push('Cautious')
  if (values.services > 25) stances.push('High-services')
  else if (values.services < -25) stances.push('Low-tax')
  return stances.length > 0 ? stances.join(' · ') : 'Centrist'
}

// ─── Ideology helpers (used in UI components) ─────────────────────────────────

export const IDEOLOGY_AXES = [
  { key: 'change'   as const, leftLabel: 'Tradition', rightLabel: 'Reform',     leftShort: 'Traditional', rightShort: 'Reformist'  },
  { key: 'growth'   as const, leftLabel: 'Caution',   rightLabel: 'Enterprise', leftShort: 'Cautious',    rightShort: 'Pro-growth' },
  { key: 'services' as const, leftLabel: 'Thrift',    rightLabel: 'Services',   leftShort: 'Low-tax',     rightShort: 'High-services' },
]

function axisStance(value: number, axis: typeof IDEOLOGY_AXES[number]): string | null {

  if (value > 25) return axis.rightShort
  if (value < -25) return axis.leftShort
  return null
}

export function ideologySummary(values: PoliticalValues): string {
  const stances = IDEOLOGY_AXES
    .map((ax) => axisStance(values[ax.key], ax))
    .filter(Boolean) as string[]
  return stances.length > 0 ? stances.join(' · ') : 'Centrist'
}

export function partyIdentitySummary(party: Pick<PartyDefinition, 'archetype' | 'issueFocus' | 'values' | 'slogan'>): string {
  const archetype = partyArchetypeLabel(party.archetype, party.issueFocus)
  const ideology = ideologySummary(party.values)
  return `${archetype} · ${ideology}`
}

export function wardFitSentence(
  partyValues: PoliticalValues,
  wardValues: PoliticalValues,
): { sentence: string; quality: 'good' | 'neutral' | 'poor' } {
  // Use continuous distance on each axis — same logic as the scorer
  const axisDiffs = IDEOLOGY_AXES.map((ax) => ({
    ax,
    diff: Math.abs(partyValues[ax.key] - wardValues[ax.key]),
    partyVal: partyValues[ax.key],
    wardVal: wardValues[ax.key],
  }))

  // Average absolute difference across axes (0 = perfect match, 200 = polar opposite)
  const avg = axisDiffs.reduce((sum, a) => sum + a.diff, 0) / axisDiffs.length

  // Quality thresholds calibrated to the scorer's /7000 denominator
  const quality: 'good' | 'neutral' | 'poor' = avg < 28 ? 'good' : avg > 52 ? 'poor' : 'neutral'

  // Find the closest and furthest axis
  const sorted = [...axisDiffs].sort((a, b) => a.diff - b.diff)
  const closest = sorted[0]
  const furthest = sorted[sorted.length - 1]

  // Describe ward preference on the furthest-apart axis
  const furthestWardLabel = furthest.wardVal > 25
    ? furthest.ax.rightShort
    : furthest.wardVal < -25
      ? furthest.ax.leftShort
      : `the ${furthest.ax.leftLabel}/${furthest.ax.rightLabel} middle`

  if (quality === 'good') {
    if (avg < 12) {
      return { sentence: `Strong ideological match — your values closely reflect what this ward wants.`, quality }
    }
    return { sentence: `Good match on ${closest.ax.rightLabel}/${closest.ax.leftLabel}. These voters should respond well to your campaign.`, quality }
  }

  if (quality === 'poor') {
    return {
      sentence: `Difficult territory — ward wants ${furthestWardLabel} but you diverge on ${furthest.ax.rightLabel}. Campaigning here costs more to move votes.`,
      quality,
    }
  }

  // Neutral: explain the gap clearly
  if (closest.diff < 20 && furthest.diff > 45) {
    return {
      sentence: `Mixed fit — you align on ${closest.ax.rightLabel} but the ward leans ${furthestWardLabel} where you differ. Some voters reachable, some aren't.`,
      quality,
    }
  }
  if (avg < 38) {
    return { sentence: `Moderate match — neither a natural base nor hostile ground. Campaigning here can move votes.`, quality }
  }
  return { sentence: `Lukewarm fit — this ward doesn't strongly align with your platform but isn't completely opposed either.`, quality }
}

export function axisSummary(values: PoliticalValues) {
  const lines: string[] = []
  if (values.change > 25) lines.push('Strongly favors Reform')
  else if (values.change > 10) lines.push('Leans towards Reform')
  else if (values.change < -25) lines.push('Staunchly Traditional')
  else if (values.change < -10) lines.push('Leans towards Tradition')

  if (values.growth > 25) lines.push('Hungry for Growth')
  else if (values.growth > 10) lines.push('Pro-enterprise')
  else if (values.growth < -25) lines.push('Highly Cautious')
  else if (values.growth < -10) lines.push('Leans towards Caution')

  if (values.services > 25) lines.push('Public Service Focus')
  else if (values.services > 10) lines.push('Prefers strong services')
  else if (values.services < -25) lines.push('Fiscally Conservative')
  else if (values.services < -10) lines.push('Leans towards Thrift')

  return lines.length > 0 ? lines : ['Broadly Centrist']
}

// ─── Coalition formation helpers ────────────────────────────────────────────

export function generateGovernanceDecisions(count: number): GovernanceDecision[] {
  const n = Math.min(count, governanceDecisionPool.length)
  const shuffled = [...governanceDecisionPool]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, n).map((d) => ({ ...d, resolved: false }))
}

export function coalitionCompatibility(playerValues: PoliticalValues, partnerValues: PoliticalValues): number {
  const dist = valueDistance(playerValues, partnerValues, { change: 1, growth: 1, services: 1 })
  return Math.max(0, Math.min(100, Math.round(100 - (dist / COALITION_IDEOLOGY_SCALE) * 100)))
}

export interface PactSuggestion {
  ourWardId: string
  ourWardName: string
  ourWardPlayerShare: number
  theirWardId: string
  theirWardName: string
  theirWardAllyShare: number
  allyGainPp: number
  playerGainPp: number
  score: number
  acceptanceChance: number
  acceptanceRoll: number
  multiBonus: number
  willAccept: boolean
  couldFlip: boolean
  flipDelta?: string
  breakdown?: { label: string; value: string }[]
}

export function suggestPacts(world: World, allyPartyId: string, totalSacrifice = 0, batchCount = 1): PactSuggestion[] {
  const allyParty = world.parties.find((p) => p.id === allyPartyId)
  const playerParty = world.parties.find((p) => p.id === world.playerPartyId)
  if (!allyParty || !playerParty) return []

  const suggestions: PactSuggestion[] = []

  const playerCommitted = new Set<string>()
  const allyCommitted = new Set<string>()
  for (const p of world.alliancePacts) {
    if (p.broken) continue
    for (const e of p.entries) {
      if (p.partyAId === world.playerPartyId) playerCommitted.add(e.wardA)
      if (p.partyBId === world.playerPartyId && !e.isUnilateral) playerCommitted.add(e.wardB)
      if (p.partyAId === allyPartyId) allyCommitted.add(e.wardA)
      if (p.partyBId === allyPartyId && !e.isUnilateral) allyCommitted.add(e.wardB)
    }
  }

  for (const ourWard of world.constituencies) {
    if (playerCommitted.has(ourWard.id)) continue
    const playerShare = ourWard.results.find((r) => r.partyId === world.playerPartyId)?.voteShare ?? 0

    for (const theirWard of world.constituencies) {
      if (ourWard.id === theirWard.id) continue
      if (allyCommitted.has(theirWard.id)) continue
      const allyShare = theirWard.results.find((r) => r.partyId === allyPartyId)?.voteShare ?? 0

      const allyGain = estimateStandDownGain(ourWard, world.playerPartyId, allyPartyId)
      const playerGain = estimateStandDownGain(theirWard, allyPartyId, world.playerPartyId)
      let score = allyGain.gainPp + playerGain.gainPp
      if (allyGain.flipsToBeneficiary) score += 3
      if (playerGain.flipsToBeneficiary) score += 3

      if (score <= 0.05 && allyGain.gainPp <= 0 && playerGain.gainPp <= 0) continue

      const isIncumbentHere = world.electionsHeld >= 1 && world.electionNightResults.some(
        (r) => r.wardId === theirWard.id && r.winner?.partyId === allyPartyId
      )

      const breakdown: { label: string; value: string }[] = []
      if (allyGain.gainPp > 0) {
        breakdown.push({
          label: 'Their gain if you stand down',
          value: `+${allyGain.gainPp.toFixed(1)}%${allyGain.flipsToBeneficiary ? ' (flip)' : ''}`,
        })
      }
      if (playerGain.gainPp > 0) {
        breakdown.push({
          label: 'Your gain if they stand down',
          value: `+${playerGain.gainPp.toFixed(1)}%${playerGain.flipsToBeneficiary ? ' (flip)' : ''}`,
        })
      }
      if (isIncumbentHere) {
        breakdown.push({ label: 'Incumbent — refuses outright', value: 'hard block' })
      }

      const det = deterministicAcceptance(world, world.playerPartyId, allyPartyId, ourWard.id, theirWard.id, totalSacrifice, batchCount)

      suggestions.push({
        ourWardId: ourWard.id,
        ourWardName: ourWard.name,
        ourWardPlayerShare: playerShare,
        theirWardId: theirWard.id,
        theirWardName: theirWard.name,
        theirWardAllyShare: allyShare,
        allyGainPp: allyGain.gainPp,
        playerGainPp: playerGain.gainPp,
        score,
        acceptanceChance: det.chance,
        acceptanceRoll: det.roll,
        multiBonus: Math.round(Math.min(0.50, totalSacrifice * 1.5) * 100),
        willAccept: det.accepted,
        couldFlip: playerGain.flipsToBeneficiary,
        flipDelta: playerGain.flipsToBeneficiary
          ? `+${playerGain.gainPp.toFixed(1)}% → flip to ${playerParty.name}`
          : undefined,
        breakdown,
      })
    }
  }

  return suggestions.sort((a, b) => b.score - a.score).slice(0, 50)
}

export function reciprocalWards(world: World, allyPartyId: string, allyWardId: string): PactSuggestion[] {
  const allyParty = world.parties.find((p) => p.id === allyPartyId)
  const playerParty = world.parties.find((p) => p.id === world.playerPartyId)
  if (!allyParty || !playerParty) return []

  const theirWard = world.constituencies.find((c) => c.id === allyWardId)
  if (!theirWard) return []

  const allyShare = theirWard.results.find((r) => r.partyId === allyPartyId)?.voteShare ?? 0

  const playerCommitted = new Set<string>()
  for (const p of world.alliancePacts) {
    if (p.broken) continue
    for (const e of p.entries) {
      if (p.partyAId === world.playerPartyId) playerCommitted.add(e.wardA)
      if (p.partyBId === world.playerPartyId && !e.isUnilateral) playerCommitted.add(e.wardB)
    }
  }

  const suggestions: PactSuggestion[] = []
  for (const ourWard of world.constituencies) {
    if (ourWard.id === theirWard.id) continue
    if (playerCommitted.has(ourWard.id)) continue
    const playerShare = ourWard.results.find((r) => r.partyId === world.playerPartyId)?.voteShare ?? 0

    const allyGain = estimateStandDownGain(ourWard, world.playerPartyId, allyPartyId)
    const playerGain = estimateStandDownGain(theirWard, allyPartyId, world.playerPartyId)
    let score = allyGain.gainPp + playerGain.gainPp
    if (allyGain.flipsToBeneficiary) score += 3
    if (playerGain.flipsToBeneficiary) score += 3

    if (score <= 0.02 && allyGain.gainPp <= 0 && playerGain.gainPp <= 0) continue

    const isIncumbentHere = world.electionsHeld >= 1 && world.electionNightResults.some(
      (r) => r.wardId === theirWard.id && r.winner?.partyId === allyPartyId
    )

    const breakdown: { label: string; value: string }[] = []
    if (allyGain.gainPp > 0) {
      breakdown.push({
        label: 'Their gain if you stand down',
        value: `+${allyGain.gainPp.toFixed(1)}%${allyGain.flipsToBeneficiary ? ' (flip)' : ''}`,
      })
    }
    if (playerGain.gainPp > 0) {
      breakdown.push({
        label: 'Your gain if they stand down',
        value: `+${playerGain.gainPp.toFixed(1)}%${playerGain.flipsToBeneficiary ? ' (flip)' : ''}`,
      })
    }
    if (isIncumbentHere) {
      breakdown.push({ label: 'Incumbent — refuses outright', value: 'hard block' })
    }

    const det2 = deterministicAcceptance(world, world.playerPartyId, allyPartyId, ourWard.id, theirWard.id, 0, 1)

    suggestions.push({
      ourWardId: ourWard.id,
      ourWardName: ourWard.name,
      ourWardPlayerShare: playerShare,
      theirWardId: theirWard.id,
      theirWardName: theirWard.name,
      theirWardAllyShare: allyShare,
      allyGainPp: allyGain.gainPp,
      playerGainPp: playerGain.gainPp,
      score,
      acceptanceChance: det2.chance,
      acceptanceRoll: det2.roll,
      multiBonus: 0,
      willAccept: det2.accepted,
      couldFlip: playerGain.flipsToBeneficiary,
      flipDelta: playerGain.flipsToBeneficiary
        ? `+${playerGain.gainPp.toFixed(1)}% → flip to ${playerParty.name}`
        : undefined,
      breakdown,
    })
  }

  return suggestions.sort((a, b) => b.score - a.score).slice(0, 4)
}

export interface BeneficiaryInfo {
  partyId: string
  partyName: string
  colour: string
  share: number
  ideologyMatch: number
  estimatedGain: number
  couldFlip: boolean
  flipFrom?: string
}

export function beneficiaryParties(world: World, wardId: string): BeneficiaryInfo[] {
  const ward = world.constituencies.find((c) => c.id === wardId)
  const playerParty = world.parties.find((p) => p.id === world.playerPartyId)
  if (!ward || !playerParty) return []

  const playerResult = ward.results.find((r) => r.partyId === world.playerPartyId)
  const playerShare = playerResult?.voteShare ?? 0
  if (playerShare < 1) return []

  const endorsementValue = playerShare * 0.01
  const estimatedGain = endorsementValue * 25

  const beneficiaries: BeneficiaryInfo[] = []
  for (const party of world.parties) {
    if (party.id === world.playerPartyId) continue
    const result = ward.results.find((r) => r.partyId === party.id)
    const share = result?.voteShare ?? 0
    if (share < 1) continue

    const compat = playerParty ? Math.max(0, Math.round(100 - (valueDistance(playerParty.values, party.values, { change: 1, growth: 1, services: 1 }) / COALITION_IDEOLOGY_SCALE) * 100)) : 50
    const couldFlip = ward.leadingPartyId !== party.id && share + estimatedGain > (ward.results[0]?.voteShare ?? 0)

    beneficiaries.push({
      partyId: party.id,
      partyName: party.name,
      colour: party.colour,
      share,
      ideologyMatch: compat,
      estimatedGain,
      couldFlip,
      flipFrom: couldFlip ? (ward.results[0]?.partyName ?? '?') : undefined,
    })
  }

  return beneficiaries.sort((a, b) => (b.share + b.estimatedGain) - (a.share + a.estimatedGain)).slice(0, 5)
}

export function getAvailableActions(world: World): CampaignAction[] {
  const actions: CampaignAction[] = []
  const ap = world.playerActionPoints

  // Helper: which ward did the player win at the last election?
  const playerHeldWards = new Set<string>()
  if (world.electionsHeld >= 1) {
    world.electionNightResults.forEach((r) => {
      if (r.winner?.partyId === world.playerPartyId) playerHeldWards.add(r.wardId)
    })
  }

  world.constituencies.forEach((ward) => {
    const isIncumbent = playerHeldWards.has(ward.id)

    if (isIncumbent) {
      // ── Governance / incumbent actions ────────────────────────────────────
      // Fix Potholes: cost 1 AP, can be permanent (1 AP/week drain)
      actions.push({
        type: 'fix_potholes',
        label: `Fix the potholes in ${ward.name}`,
        description: 'Get the roads sorted. Visible action that keeps residents happy.',
        apCost: 1,
        isPermanent: true,
        permanentApCost: 1,
        wardId: ward.id,
      })

      // Improve Bins: cost 1 AP, can be permanent
      actions.push({
        type: 'improve_bins',
        label: `Improve bin collections in ${ward.name}`,
        description: 'Sort out the missed collections. Dull work, but voters love a full wheelie bin.',
        apCost: 1,
        isPermanent: true,
        permanentApCost: 1,
        wardId: ward.id,
      })

      // Ward Festival: cost 3 AP, one-off (high risk/reward)
      if (ap >= 3) {
        actions.push({
          type: 'ward_festival',
          label: `Host a ward festival in ${ward.name}`,
          description: 'A community event in your own backyard. Big boost if it works — embarrassing if it flops.',
          apCost: 3,
          wardId: ward.id,
        })
      }

      // Canvass still available (cost 1 AP, permanent)
      actions.push({
        type: 'canvass',
        label: `Canvass ${ward.name}`,
        description: 'Keep the volunteers out knocking. Steady support as your ward councillor.',
        apCost: 1,
        isPermanent: true,
        permanentApCost: 1,
        wardId: ward.id,
      })
    } else {
      // ── Challenger / campaign actions ──────────────────────────────────────
      // Canvass: cost 1 AP, can be permanent
      actions.push({
        type: 'canvass',
        label: `Canvass ${ward.name}`,
        description: 'Send volunteers door-to-door. Steady, reliable boost to support.',
        apCost: 1,
        isPermanent: true,
        permanentApCost: 1,
        wardId: ward.id,
      })

      // Ads: cost 2 AP, can be permanent
      if (ap >= 2) {
        actions.push({
          type: 'ads',
          label: `Run ads in ${ward.name}`,
          description: 'Flood local social and print with targeted ads. Bigger boost than canvassing.',
          apCost: 2,
          isPermanent: true,
          permanentApCost: 2,
          wardId: ward.id,
        })
      }

      // Rally: cost 3 AP, one-off (risk/reward)
      if (ap >= 3) {
        actions.push({
          type: 'rally',
          label: `Hold a rally in ${ward.name}`,
          description: 'Big public event. Can go brilliantly — or fall flat.',
          apCost: 3,
          wardId: ward.id,
        })
      }
    }
  })

  // Smear: cost 2 AP, challenger only (or any ward)
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

// ─── Councillor tenure tracking ────────────────────────────────────────────
const COUNCILLOR_TENURE_PREFIX = 'electland_councillors_'

function tenureKey(seed: number) {
  return `${COUNCILLOR_TENURE_PREFIX}${seed}`
}

export function loadCouncillorTenure(seed: number): Record<string, CouncillorTenure> {
  try {
    const raw = localStorage.getItem(tenureKey(seed))
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function saveCouncillorTenure(seed: number, registry: Record<string, CouncillorTenure>) {
  try {
    localStorage.setItem(tenureKey(seed), JSON.stringify(registry))
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function updateCouncillorTenure(seed: number, week: number, results: Array<{ wardId: string; wardName: string; winnerName: string; winnerParty: string; winnerColour: string }>) {
  const registry = loadCouncillorTenure(seed)

  for (const r of results) {
    const existing = registry[r.wardId]
    if (existing && existing.name === r.winnerName) {
      registry[r.wardId] = {
        ...existing,
        termsServed: existing.termsServed + 1,
        lastElectedWeek: week,
        partyName: r.winnerParty,
        colour: r.winnerColour,
      }
    } else {
      const hist = existing
        ? { name: existing.name, partyName: existing.partyName, colour: existing.colour, termsServed: existing.termsServed, firstElectedWeek: existing.firstElectedWeek, lastElectedWeek: existing.lastElectedWeek }
        : null
      registry[r.wardId] = {
        wardId: r.wardId,
        wardName: r.wardName,
        name: r.winnerName,
        partyName: r.winnerParty,
        colour: r.winnerColour,
        termsServed: 1,
        firstElectedWeek: week,
        lastElectedWeek: week,
        history: hist ? [...(existing?.history ?? []), hist] : (existing?.history ?? []),
      }
    }
  }

  saveCouncillorTenure(seed, registry)
}

// ─── Budget system ──────────────────────────────────────────────────────

export function getDefaultBudget(): Budget {
  return {
    totalBudget: 200,
    categories: [
      { id: 'roads', label: 'Roads & transport', funding: 50, blocs: ['workshop_crews', 'market_regulars', 'river_walkers'] },
      { id: 'parks', label: 'Parks & environment', funding: 50, blocs: ['river_walkers', 'pondside_peacemakers', 'college_corner'] },
      { id: 'libraries', label: 'Libraries & culture', funding: 50, blocs: ['old_town_loyalists', 'college_corner', 'hill_street_households'] },
      { id: 'safety', label: 'Safety & care', funding: 50, blocs: ['pondside_peacemakers', 'hill_street_households', 'workshop_crews'] },
    ],
  }
}

export function normalizeBudget(budget: Budget | undefined | null): Budget {
  const defaults = getDefaultBudget()
  if (!budget?.categories?.length) return defaults
  const byId = Object.fromEntries(budget.categories.map((category) => [category.id, category]))
  const summedFunding = (ids: string[], fallback: number) => {
    const present = ids.map((id) => byId[id]).filter(Boolean)
    if (present.length === 0) return fallback
    return present.reduce((sum, category) => sum + category.funding, 0)
  }
  const categories = [
    { id: 'roads', label: 'Roads & transport', funding: summedFunding(['roads', 'buses'], 50), blocs: defaults.categories[0].blocs },
    { id: 'parks', label: 'Parks & environment', funding: summedFunding(['parks'], 50), blocs: defaults.categories[1].blocs },
    { id: 'libraries', label: 'Libraries & culture', funding: summedFunding(['libraries', 'bins', 'youth'], 50), blocs: defaults.categories[2].blocs },
    { id: 'safety', label: 'Safety & care', funding: summedFunding(['safety'], 50), blocs: defaults.categories[3].blocs },
  ]
  const total = categories.reduce((sum, category) => sum + category.funding, 0)
  const target = defaults.totalBudget
  if (total !== target && total > 0) {
    const scale = target / total
    let remaining = target
    for (let i = 0; i < categories.length; i += 1) {
      if (i === categories.length - 1) categories[i].funding = remaining
      else {
        categories[i].funding = Math.round(categories[i].funding * scale)
        remaining -= categories[i].funding
      }
    }
  }
  return { totalBudget: target, categories }
}

export function budgetIdeologyLean(budget: Budget): PoliticalValues {
  const avg = (ids: string[]) => {
    const values = ids.map((id) => budget.categories.find((category) => category.id === id)?.funding).filter((value): value is number => typeof value === 'number')
    if (values.length === 0) return 50
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }
  return {
    change: Math.round(avg(['parks', 'libraries']) - 50),
    growth: Math.round(avg(['roads']) - 50),
    services: Math.round(avg(['libraries', 'safety', 'parks']) - 50),
  }
}

function consecutiveBudgetFailures(history: Array<{ week: number; passed: boolean }>) {
  let count = 0
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].passed) break
    count += 1
  }
  return count
}

// ─── Single-Politician Mode ────────────────────────────────────────────

const TRAIT_POOL: PoliticianTrait[] = [
  { id: 'local-roots', label: 'Local Roots', effect: '+20% door-knock effectiveness', modifier: { approvalGain: 0.2 } },
  { id: 'media-savvy', label: 'Media Savvy', effect: 'Halved gaffe risk on media appearances', modifier: { reputationGain: 0.3 } },
  { id: 'policy-wonk', label: 'Policy Wonk', effect: '+2 influence per council session', modifier: { influenceGain: 0.25 } },
  { id: 'peoples-champion', label: "People's Champion", effect: '+30% surgery approval gains', modifier: { approvalGain: 0.3 } },
  { id: 'maverick', label: 'Maverick', effect: 'Rebellion loyalty cost reduced by 4', modifier: { rebellionCostReduction: 4 } },
  { id: 'networker', label: 'Networker', effect: 'Relationships gain +2 strength per session', modifier: { influenceGain: 0.15 } },
  { id: 'fundraiser', label: 'Fundraiser', effect: '+1 personal funds at campaign start', modifier: {} },
  { id: 'community-organiser', label: 'Community Organiser', effect: 'Better chance of building relationships when reaching out', modifier: {} },
]

export function initializePoliticianMode(world: World, wardId = '', playerName?: string): PoliticianModeState {
  const rng = createRng(world.seed + 7777)
  const playerParty = world.parties.find((p) => p.id === world.playerPartyId)!

  const shuffledTraits = shuffle([...TRAIT_POOL], rng)
  const assignedTraits = shuffledTraits.slice(0, 2)

  const politician: PoliticianState = {
    id: `pol_${world.playerPartyId}`,
    name: playerName || playerParty.leader,
    wardId,
    partyId: world.playerPartyId,
    isIncumbent: false,
    personalApproval: 0,
    personalValues: roundPoliticalValues(playerParty.values),
    personalPolicyNextWeek: world.week,
    reputation: 20,
    relationships: [],
    traits: assignedTraits,
    careerHistory: [{ week: world.week, description: wardId ? 'Selected as candidate' : 'Joined the local party', tier: 'backbencher' }],
    personalFunds: 3,
    influence: 5,
    careerRank: 'backbencher',
    careerTier: 'backbencher',
    partyLoyalty: 80,
    motionsProposed: 0,
    motionsPassed: 0,
    termsServed: 0,
    rebellions: 0,
  }

  const councillors: Councillor[] = world.constituencies
    .filter((c) => !wardId || c.id !== wardId)
    .map((c) => {
      const winnerCandidate = c.candidates.find((cand) => cand.partyId === c.leadingPartyId) ?? c.candidates[0]
      const party = world.parties.find((p) => p.id === winnerCandidate.partyId)
      return {
        id: `cllr_${c.id}`,
        name: winnerCandidate.name,
        partyId: winnerCandidate.partyId,
        partyColour: winnerCandidate.partyColour,
        wardId: c.id,
        wardName: c.name,
        personalValues: party ? roundPoliticalValues(party.values) : { change: 0, growth: 0, services: 0 },
        rebellionTendency: rng() * 0.22,
        influence: 10 + Math.floor(rng() * 30),
      }
    })

  politician.relationships = councillors.map((c) => ({
    targetId: c.id,
    targetName: c.name,
    partyId: c.partyId,
    partyColour: c.partyColour,
    wardId: c.wardId,
    type: c.partyId === world.playerPartyId ? 'ally' as const : 'neutral' as const,
    strength: c.partyId === world.playerPartyId ? 55 : 0,
    history: [],
  }))

  return {
    politician,
    councillors,
    currentSession: undefined,
    sessionHistory: [],
    nextSessionWeek: world.week + 8,
    councilSessionInterval: 8,
    nextBudgetWeek: world.week + world.electionCycleWeeks,
    budgetHistory: [],
    budgetEvents: [],
    autoCampaigns: [],
    legislationHistory: [],
    activePolicies: [],
  }
}

function candidateInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 3)
}

function createCouncillorForWard(world: World, ward: Constituency, rng: () => number): Councillor {
  const winner = ward.candidates.find((candidate) => candidate.partyId === ward.leadingPartyId) ?? ward.candidates[0]
  const party = world.parties.find((entry) => entry.id === winner.partyId)
  return {
    id: `cllr_${ward.id}`,
    name: winner.name,
    partyId: winner.partyId,
    partyColour: winner.partyColour,
    wardId: ward.id,
    wardName: ward.name,
    personalValues: party ? roundPoliticalValues(party.values) : { change: 0, growth: 0, services: 0 },
    rebellionTendency: rng() * 0.22,
    influence: 10 + Math.floor(rng() * 30),
  }
}

function addRelationshipForCouncillor(politician: PoliticianState, councillor: Councillor): PoliticianState {
  if (politician.relationships.some((relationship) => relationship.targetId === councillor.id)) return politician
  return {
    ...politician,
    relationships: [...politician.relationships, {
      targetId: councillor.id,
      targetName: councillor.name,
      partyId: councillor.partyId,
      partyColour: councillor.partyColour,
      wardId: councillor.wardId,
      type: councillor.partyId === politician.partyId ? 'ally' : 'neutral',
      strength: councillor.partyId === politician.partyId ? 55 : 0,
      history: ['Met through local politics.'],
    }],
  }
}

export function selectWard(world: World, wardId: string): World {
  const pm = world.politicianMode
  const ward = world.constituencies.find((entry) => entry.id === wardId)
  if (!pm || !ward || pm.politician.isIncumbent) return world

  const pol = pm.politician
  const rng = createRng(world.seed + world.week * 6151 + wardId.length)
  const oldWard = world.constituencies.find((entry) => entry.id === pol.wardId)
  const replacementName = createLeaderName(rng)
  const constituencies = world.constituencies.map((entry) => {
    if (entry.id === oldWard?.id) {
      return {
        ...entry,
        candidates: entry.candidates.map((candidate) => candidate.partyId === pol.partyId
          ? { ...candidate, name: replacementName, initials: candidateInitials(replacementName) }
          : candidate),
      }
    }
    if (entry.id === wardId) {
      return {
        ...entry,
        candidates: entry.candidates.map((candidate) => candidate.partyId === pol.partyId
          ? { ...candidate, name: pol.name, initials: candidateInitials(pol.name) }
          : candidate),
      }
    }
    return entry
  })
  const oldWardWithReplacement = constituencies.find((entry) => entry.id === oldWard?.id)
  const oldCouncillor = oldWardWithReplacement ? createCouncillorForWard({ ...world, constituencies }, oldWardWithReplacement, rng) : undefined
  const updatedPolitician = addRelationshipForCouncillor({
    ...pol,
    wardId,
    personalApproval: 0,
    careerHistory: [...pol.careerHistory, { week: world.week, description: `Selected to contest ${ward.name}`, tier: pol.careerTier, rank: pol.careerRank }],
  }, oldCouncillor ?? createCouncillorForWard({ ...world, constituencies }, ward, rng))
  const councillors = pm.councillors
    .filter((councillor) => councillor.wardId !== wardId)
    .concat(oldCouncillor && oldWard?.id !== wardId ? [oldCouncillor] : [])

  return {
    ...world,
    constituencies,
    politicianMode: { ...pm, politician: updatedPolitician, councillors },
    newsFeed: [`Week ${world.week}: You have been selected to contest ${ward.name}.`, ...world.newsFeed].slice(0, 30),
  }
}

export function requestWardSwitch(world: World, wardId: string): { world: World; approved: boolean; reason: string } {
  const pm = world.politicianMode
  const ward = world.constituencies.find((entry) => entry.id === wardId)
  if (!pm || !ward) return { world, approved: false, reason: 'That ward is unavailable.' }
  if (pm.politician.isIncumbent) return { world, approved: false, reason: 'Resign your seat before seeking another nomination.' }
  if (world.weeksUntilElection <= 2) return { world, approved: false, reason: 'Nominations have closed for this election.' }
  if (wardId === pm.politician.wardId) return { world, approved: false, reason: 'You are already standing in this ward.' }
  if (!pm.politician.wardId) {
    return { world: selectWard(world, wardId), approved: true, reason: `You have been selected to contest ${ward.name}.` }
  }

  const incumbent = pm.councillors.find((councillor) => councillor.wardId === wardId)
  if (ward.leadingPartyId === pm.politician.partyId && ward.margin >= 10 && incumbent && incumbent.influence > 60) {
    return { world, approved: false, reason: `${incumbent.name} is an influential sitting councillor there.` }
  }
  if (ward.leadingPartyId === pm.politician.partyId && pm.politician.partyLoyalty < 60) {
    return { world, approved: false, reason: 'Build more party loyalty before asking for a safe seat.' }
  }

  const key = `${world.seed}-${world.week}-${wardId}`
  const roll = [...key].reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0)
  const approvalChance = ward.leadingPartyId === pm.politician.partyId ? 0.7 : 1
  if ((Math.abs(roll) % 10000) / 10000 > approvalChance) {
    return { world, approved: false, reason: 'The local party selected another candidate.' }
  }
  return { world: selectWard(world, wardId), approved: true, reason: `Your party has approved your move to ${ward.name}.` }
}

export interface PoliticianAction {
  type: PoliticianActionType
  label: string
  description: string
  apCost: number
  targetCouncillorId?: string
  targetWardId?: string
  policyAxis?: PoliticalValueKey
  policyDirection?: 1 | -1
}

export interface PoliticianActionResult {
  action: PoliticianAction
  outcome: 'success' | 'backfire' | 'neutral'
  description: string
  approvalDelta?: number
  reputationDelta?: number
  influenceDelta?: number
  loyaltyDelta?: number
}

export type ColleagueCampaignTarget = {
  wardId: string
  wardName: string
  candidateName: string
  councillorId?: string
  partyShare: number
  leadingPartyName: string
  margin: number
  isBattleground: boolean
}

function partyStandingDownInWard(world: World, partyId: string, wardId: string): boolean {
  for (const pact of world.alliancePacts) {
    if (pact.broken) continue
    for (const entry of pact.entries) {
      if (entry.wardA === wardId && pact.partyAId === partyId) return true
      if (entry.wardB === wardId && pact.partyBId === partyId && !entry.isUnilateral) return true
    }
  }
  return false
}

export function getColleagueCampaignTargets(world: World): ColleagueCampaignTarget[] {
  const pm = world.politicianMode
  if (!pm) return []
  const pol = pm.politician
  if (!pol.wardId) return []
  const battlegrounds = new Set(world.stats.battlegroundWardIds)

  return world.constituencies
    .filter((ward) => {
      if (ward.id === pol.wardId) return false
      const candidate = ward.candidates.find((entry) => entry.partyId === pol.partyId)
      if (!candidate) return false
      if (partyStandingDownInWard(world, pol.partyId, ward.id)) return false
      return true
    })
    .map((ward) => {
      const candidate = ward.candidates.find((entry) => entry.partyId === pol.partyId)!
      const councillor = pm.councillors.find((entry) => entry.wardId === ward.id && entry.partyId === pol.partyId)
      const partyShare = ward.results.find((entry) => entry.partyId === pol.partyId)?.voteShare ?? 0
      return {
        wardId: ward.id,
        wardName: ward.name,
        candidateName: councillor?.name ?? candidate.name,
        councillorId: councillor?.id,
        partyShare,
        leadingPartyName: ward.leadingPartyName,
        margin: ward.margin,
        isBattleground: battlegrounds.has(ward.id),
      }
    })
    .sort((a, b) => {
      if (a.isBattleground !== b.isBattleground) return a.isBattleground ? -1 : 1
      return a.margin - b.margin
    })
}

export function getPoliticianActions(world: World): PoliticianActionMeta[] {
  if (!world.politicianMode) return []
  const pol = world.politicianMode.politician
  const usedAttendEvent = world.actionsThisWeek.some((a) => a.action.label === 'Gain influence in council' || a.action.label === 'Attend local event')
  const hasLocalRoots = pol.traits.some((t) => t.id === 'local-roots')
  const hasChampion = pol.traits.some((t) => t.id === 'peoples-champion')
  const hasMediaSavvy = pol.traits.some((t) => t.id === 'media-savvy')
  const colleagueTargets = getColleagueCampaignTargets(world)

  const actions: PoliticianActionMeta[] = [
    { type: 'door_knock', label: 'Door-knock streets', description: 'Knock on doors and distribute leaflets to build support and recognition.', apCost: 1, category: 'grassroots', expectedEffect: '+5–9% approval, +3–5 rep', traitBonus: hasLocalRoots ? 'Local Roots: +20%' : undefined },
    { type: 'local_media', label: 'Local media', description: 'Appear on local radio or newspaper.', apCost: 1, category: 'communications', expectedEffect: '+6–10% approval, +5–9 rep', riskDescription: hasMediaSavvy ? '10% gaffe risk' : '20% gaffe risk', traitBonus: hasMediaSavvy ? 'Media Savvy: halved risk' : undefined },
    { type: 'call_party_support', label: 'Call in party support', description: 'Request HQ resources for your ward. Requires loyalty ≥ 40; spends 5 loyalty.', apCost: 1, category: 'political', expectedEffect: 'Ward boost (costs 5 loyalty)', riskDescription: pol.partyLoyalty < 40 ? 'Loyalty too low' : undefined },
    { type: 'smear_opponent', label: 'Attack opponent', description: 'Attack the leading rival candidate publicly.', apCost: 1, category: 'political', expectedEffect: '+4–7% approval', riskDescription: '30% backfire risk' },
    { type: 'shift_personal_policy', label: 'Set personal position', description: 'Move your own public position without changing the party platform.', apCost: 1, category: 'political', expectedEffect: 'Personal ward fit shifts', riskDescription: world.week < pol.personalPolicyNextWeek ? `Available again in week ${pol.personalPolicyNextWeek}` : 'May reduce party loyalty if you diverge' },
  ]
  if (colleagueTargets.length > 0) {
    actions.splice(3, 0, {
      type: 'help_colleague',
      label: 'Campaign for a colleague',
      description: 'Knock doors in another ward to boost a same-party candidate. Gains loyalty.',
      apCost: 1,
      category: 'political',
      expectedEffect: 'Ward boost for colleague, +5 loyalty',
      traitBonus: hasLocalRoots ? 'Local Roots: +20%' : undefined,
    })
  }
  if (pol.isIncumbent) {
    actions.push({ type: 'hold_surgery', label: 'Hold surgery', description: 'Meet constituents face-to-face as their councillor.', apCost: 1, category: 'incumbent', expectedEffect: '+4–7% approval, +2 rep', traitBonus: hasChampion ? "People's Champion: +30%" : undefined })
    if (!usedAttendEvent) {
      actions.push({ type: 'attend_event', label: 'Gain influence in council', description: 'Attend a council function and build your political network.', apCost: 1, category: 'incumbent', expectedEffect: '+1 influence' })
    }
  }
  return actions
}

export function getPoliticianActionsByCategory(world: World): Array<{ category: ActionCategory; label: string; actions: PoliticianActionMeta[] }> {
  const all = getPoliticianActions(world)
  const groups: Array<{ category: ActionCategory; label: string; actions: PoliticianActionMeta[] }> = [
    { category: 'incumbent', label: 'Incumbent Actions', actions: all.filter((a) => a.category === 'incumbent') },
    { category: 'grassroots', label: 'Campaigning', actions: all.filter((a) => a.category === 'grassroots') },
    { category: 'communications', label: 'Communications', actions: all.filter((a) => a.category === 'communications') },
    { category: 'political', label: 'Political', actions: all.filter((a) => a.category === 'political') },
  ]
  return groups.filter((g) => g.actions.length > 0)
}

export function applyPoliticianAction(world: World, action: PoliticianAction): { world: World; result: PoliticianActionResult } {
  if (!world.politicianMode) {
    return { world, result: { action, outcome: 'neutral', description: 'Not in politician mode.' } }
  }

  const rng = createRng(world.seed + world.week * 777 + world.actionsThisWeek.length * 13)
  const pm = world.politicianMode
  const pol = pm.politician
  if (world.playerActionPoints < 1) {
    return { world, result: { action, outcome: 'neutral', description: 'You’ve already acted this week.' } }
  }
  if (action.type === 'hold_surgery' && !pol.isIncumbent) {
    return { world, result: { action, outcome: 'neutral', description: 'Only a serving councillor can hold a constituency surgery.' } }
  }
  let approvalDelta = 0
  let reputationDelta = 0
  let influenceDelta = 0
  let loyaltyDelta = 0
  let outcome: PoliticianActionResult['outcome'] = 'success'
  let description = ''

  switch (action.type) {
    case 'door_knock': {
      const localRootsBonus = pol.traits.some((t) => t.id === 'local-roots') ? 1.2 : 1.0
      approvalDelta = (0.05 + rng() * 0.04) * localRootsBonus
      reputationDelta = 3 + Math.floor(rng() * 3)
      description = `You knocked on doors and dropped leaflets across ${world.constituencies.find((c) => c.id === pol.wardId)?.name ?? 'your ward'}. Constituents appreciated the personal touch.`
      break
    }
    case 'hold_surgery': {
      const championBonus = pol.traits.some((t) => t.id === 'peoples-champion') ? 1.3 : 1.0
      approvalDelta = (0.04 + rng() * 0.03) * championBonus
      reputationDelta = 2
      description = 'You held a constituency surgery. Several residents came with issues — you listened and took notes.'
      break
    }
    case 'leaflet_drop': {
      reputationDelta = 3 + Math.floor(rng() * 3)
      approvalDelta = (0.05 + rng() * 0.04)
      description = `You knocked on doors and dropped leaflets across ${world.constituencies.find((c) => c.id === pol.wardId)?.name ?? 'your ward'}. Constituents appreciated the personal touch.`
      break
    }
    case 'local_media': {
      const gaffeRisk = pol.traits.some((t) => t.id === 'media-savvy') ? 0.1 : 0.2
      if (rng() < gaffeRisk) {
        outcome = 'backfire'
        approvalDelta = -0.04
        reputationDelta = -3
        description = 'Your media appearance went badly — you stumbled on a question about local planning. Awkward.'
      } else {
        approvalDelta = 0.06 + rng() * 0.04
        reputationDelta = 5 + Math.floor(rng() * 4)
        description = 'A confident performance on local radio. Callers responded well.'
      }
      break
    }
    case 'call_party_support': {
      if (pol.partyLoyalty < 40) {
        outcome = 'neutral'
        description = 'Party HQ declined your request. Your loyalty score is too low for them to invest resources.'
        break
      }
      const loyaltyFactor = pol.partyLoyalty / 100
      const wardBoostAmount = (0.08 + rng() * 0.04) * loyaltyFactor
      const updatedParties = world.parties.map((p) =>
        p.id === world.playerPartyId
          ? { ...p, wardBoosts: { ...p.wardBoosts, [pol.wardId]: clamp((p.wardBoosts[pol.wardId] ?? 0) + wardBoostAmount, 0, 0.45) } }
          : p,
      )
      loyaltyDelta = -5
      description = pol.partyLoyalty < 60
        ? 'Party HQ sent limited resources — your loyalty record has them cautious.'
        : 'Party HQ sent activists and resources to your ward. The campaign feels stronger.'
      const updatedWorld = { ...world, parties: updatedParties }
      const newPol = { ...pol, partyLoyalty: clamp(pol.partyLoyalty + loyaltyDelta, 0, 100) }
      return {
        world: {
          ...updatedWorld,
          playerActionPoints: 0,
          actionsThisWeek: [...world.actionsThisWeek, { action: { type: 'canvass', label: action.label, description: action.description, apCost: action.apCost, wardId: pol.wardId }, outcome, description, wardName: world.constituencies.find((c) => c.id === pol.wardId)?.name }],
          politicianMode: { ...pm, politician: newPol },
        },
        result: { action, outcome, description, loyaltyDelta },
      }
    }
    case 'help_colleague': {
      if (!action.targetWardId) {
        return { world, result: { action, outcome: 'neutral', description: 'Choose a colleague’s ward first.' } }
      }
      const target = getColleagueCampaignTargets(world).find((entry) => entry.wardId === action.targetWardId)
      if (!target) {
        return { world, result: { action, outcome: 'neutral', description: 'That ward is not eligible for colleague campaigning.' } }
      }
      const localRootsBonus = pol.traits.some((t) => t.id === 'local-roots') ? 1.2 : 1.0
      const wardBoostAmount = (0.06 + rng() * 0.03) * localRootsBonus
      const updatedParties = world.parties.map((p) =>
        p.id === world.playerPartyId
          ? { ...p, wardBoosts: { ...p.wardBoosts, [target.wardId]: clamp((p.wardBoosts[target.wardId] ?? 0) + wardBoostAmount, 0, 0.45) } }
          : p,
      )
      loyaltyDelta = 5
      const relationships = pol.relationships.map((relationship) => {
        if (!target.councillorId || relationship.targetId !== target.councillorId) return relationship
        const strength = clamp(relationship.strength + 6, -100, 100)
        const type: Relationship['type'] = strength > 40 ? 'ally' : strength < -30 ? 'rival' : relationship.type === 'mentor' ? 'mentor' : 'neutral'
        return {
          ...relationship,
          strength,
          type,
          history: [...relationship.history, 'Campaigned in their ward'].slice(-8),
        }
      })
      description = `You spent the week door-knocking for ${target.candidateName} in ${target.wardName}. The local campaign feels stronger.`
      const newPol = {
        ...pol,
        partyLoyalty: clamp(pol.partyLoyalty + loyaltyDelta, 0, 100),
        relationships,
        careerHistory: [...pol.careerHistory, { week: world.week, description: `Campaigned for ${target.candidateName} in ${target.wardName}`, tier: pol.careerTier, rank: pol.careerRank }],
      }
      return {
        world: {
          ...world,
          parties: updatedParties,
          playerActionPoints: 0,
          actionsThisWeek: [...world.actionsThisWeek, {
            action: { type: 'canvass', label: action.label, description: action.description, apCost: action.apCost, wardId: target.wardId },
            outcome,
            description,
            wardName: target.wardName,
          }],
          politicianMode: { ...pm, politician: newPol },
        },
        result: { action, outcome, description, loyaltyDelta },
      }
    }
    case 'attend_event': {
      influenceDelta = 1
      description = 'You worked the room at a council function and strengthened your political network.'
      break
    }
    case 'smear_opponent': {
      if (rng() < 0.3) {
        outcome = 'backfire'
        approvalDelta = -0.06
        description = 'Your attack on the opponent was seen as unfair. Local sentiment turned against you.'
      } else {
        approvalDelta = 0.04 + rng() * 0.03
        description = 'Damaging leaflet about your main rival circulated. Some voters are reconsidering their choice.'
      }
      break
    }
    case 'shift_personal_policy': {
      if (world.week < pol.personalPolicyNextWeek) {
        return { world, result: { action, outcome: 'neutral', description: `You can set a new personal position in week ${pol.personalPolicyNextWeek}.` } }
      }
      const axis = action.policyAxis
      const direction = action.policyDirection
      if (!axis || !direction) {
        return { world, result: { action, outcome: 'neutral', description: 'Choose an issue axis and direction first.' } }
      }
      const personalValues = { ...pol.personalValues, [axis]: clamp(pol.personalValues[axis] + direction * 10, -100, 100) }
      const partyValues = world.parties.find((party) => party.id === pol.partyId)?.values ?? pol.personalValues
      const neutralSalience = { change: 1, growth: 1, services: 1 }
      const previousDistance = valueDistance(pol.personalValues, partyValues, neutralSalience)
      const nextDistance = valueDistance(personalValues, partyValues, neutralSalience)
      loyaltyDelta = nextDistance > previousDistance ? -3 : 0
      const axisLabel = axis === 'change' ? 'reform' : axis === 'growth' ? 'business' : 'public services'
      description = `You set out a more ${direction > 0 ? 'ambitious' : 'cautious'} personal position on ${axisLabel}. Your party platform has not changed.`
      const newPol = {
        ...pol,
        personalValues,
        personalPolicyNextWeek: world.week + 4,
        partyLoyalty: clamp(pol.partyLoyalty + loyaltyDelta, 0, 100),
        careerHistory: [...pol.careerHistory, { week: world.week, description: `Set personal position on ${axisLabel}`, tier: pol.careerTier, rank: pol.careerRank }],
      }
      return {
        world: {
          ...world,
          playerActionPoints: 0,
          actionsThisWeek: [...world.actionsThisWeek, { action: { type: 'canvass', label: action.label, description: action.description, apCost: action.apCost, wardId: pol.wardId }, outcome, description, wardName: world.constituencies.find((c) => c.id === pol.wardId)?.name }],
          politicianMode: { ...pm, politician: newPol },
          newsFeed: [`Week ${world.week}: ${description}`, ...world.newsFeed].slice(0, 30),
        },
        result: { action, outcome, description, loyaltyDelta },
      }
    }
    default:
      description = 'Action not recognised.'
      outcome = 'neutral'
  }

  const newPol: PoliticianState = {
    ...pol,
    personalApproval: clamp(pol.personalApproval + approvalDelta, -1, 1),
    reputation: clamp(pol.reputation + reputationDelta, 0, 100),
    influence: clamp(pol.influence + influenceDelta, 0, 100),
    partyLoyalty: clamp(pol.partyLoyalty + loyaltyDelta, 0, 100),
  }

  const wardName = world.constituencies.find((c) => c.id === pol.wardId)?.name

  return {
    world: {
      ...world,
      playerActionPoints: 0,
      actionsThisWeek: [...world.actionsThisWeek, { action: { type: 'canvass', label: action.label, description: action.description, apCost: action.apCost, wardId: pol.wardId }, outcome, description, wardName }],
      politicianMode: { ...pm, politician: newPol },
    },
    result: { action, outcome, description, approvalDelta, reputationDelta, influenceDelta, loyaltyDelta },
  }
}

// ─── Council Chamber System ─────────────────────────────────────────────────

export const MOTION_PROPOSAL_INFLUENCE_COST = 8
export const BUDGET_AMENDMENT_INFLUENCE_COST = 10

type GeneratedMotion = Omit<CouncilMotion, 'id' | 'proposerId' | 'proposerName' | 'proposerPartyId' | 'status' | 'votes' | 'partyWhipDirection' | 'playerVote' | 'whipIssuerId' | 'whipIssuerName' | 'effects'>

const LOCATIONS = [
  'High Street', 'Market Square', 'the industrial estate', 'Riverside Path',
  'the school grounds', 'the old library site', 'Station Road', 'Church Lane',
  'the recreation ground', 'Oak Park', 'the town centre', 'Mill Lane',
  'the allotments', 'Harbour Road', 'the canal towpath', 'Victoria Gardens',
  'the bus station forecourt', 'Queensway', 'the civic quarter',
]

const POLICY_AREAS: Array<{ category: MotionCategory; interventions: string[]; subjects: string[]; mechanisms: string[]; beneficiaries: string[]; tradeOffs: string[] }> = [
  {
    category: 'planning',
    interventions: ['approve', 'refuse', 'fast-track', 'call in', 'impose conditions on'],
    subjects: ['a mixed-use housing scheme', 'warehouse expansion', 'town-centre flats', 'a care home', 'student housing', 'a drive-through', 'office conversion'],
    mechanisms: ['through the planning committee', 'via a neighbourhood plan amendment', 'with a Section 106 package', 'under temporary permission'],
    beneficiaries: ['first-time buyers', 'local traders', 'construction jobs', 'conservation groups'],
    tradeOffs: ['higher traffic', 'loss of green space', 'pressure on school places', 'heritage objections'],
  },
  {
    category: 'housing',
    interventions: ['require', 'fund', 'pause', 'accelerate', 'cap rents on'],
    subjects: ['social housing delivery', 'empty-home enforcement', 'temporary accommodation', 'shared-ownership stock', 'hostel provision'],
    mechanisms: ['with a housing company partnership', 'through council borrowing', 'via registered providers', 'with landlord licensing'],
    beneficiaries: ['waiting-list households', 'young renters', 'rough sleepers', 'key workers'],
    tradeOffs: ['higher borrowing costs', 'landlord resistance', 'delayed private schemes', 'concentrated placements'],
  },
  {
    category: 'transport',
    interventions: ['introduce', 'expand', 'cut', 'reroute', 'subsidise'],
    subjects: ['evening buses', 'controlled parking', 'cycle lanes', 'school streets', 'taxi ranks'],
    mechanisms: ['through a traffic regulation order', 'with DfT grant match-funding', 'via a bus service improvement plan', 'in a 12-month trial'],
    beneficiaries: ['commuters', 'shoppers', 'disabled passengers', 'cyclists'],
    tradeOffs: ['business disruption', 'displacement parking', 'higher fares elsewhere', 'roadworks delays'],
  },
  {
    category: 'services',
    interventions: ['increase funding for', 'reduce hours at', 'outsource', 'restore', 'merge'],
    subjects: ['libraries', 'youth clubs', 'bin collections', 'leisure centres', 'social care visits', 'community centres'],
    mechanisms: ['from reserves', 'by reallocating the neighbourhood fund', 'with a private contractor', 'under a shared-service deal'],
    beneficiaries: ['older residents', 'families', 'volunteers', 'shift workers'],
    tradeOffs: ['staff reductions', 'longer wait times', 'uneven coverage', 'higher fees'],
  },
  {
    category: 'environment',
    interventions: ['ban', 'charge for', 'plant', 'protect', 'mandate'],
    subjects: ['single-use plastics', 'idling vehicles', 'street trees', 'riverside habitats', 'solar panels on civic roofs'],
    mechanisms: ['with a borough-wide by-law', 'through a clean-air zone', 'via a community grant scheme', 'with utility partnerships'],
    beneficiaries: ['walkers', 'schools', 'wildlife groups', 'public-health advocates'],
    tradeOffs: ['business compliance costs', 'delivery disruption', 'maintenance bills', 'rural access concerns'],
  },
  {
    category: 'safety',
    interventions: ['fund', 'deploy', 'consult on', 'restrict', 'review'],
    subjects: ['CCTV coverage', 'warden patrols', 'night-time licensing', 'alley gating', 'ASB hotspot responses'],
    mechanisms: ['with police partnership money', 'through the community safety fund', 'via a public space protection order', 'in a six-month pilot'],
    beneficiaries: ['town-centre traders', 'night workers', 'residents near venues', 'young people'],
    tradeOffs: ['civil liberties concerns', 'displacement of nuisance', 'overtime costs', 'licensing disputes'],
  },
  {
    category: 'economy',
    interventions: ['create', 'waive', 'invest in', 'market', 'support'],
    subjects: ['a business rates relief scheme', 'market stall rents', 'high-street grants', 'skills apprenticeships', 'visitor events'],
    mechanisms: ['from the growth fund', 'with Chamber of Commerce co-funding', 'through a BID levy', 'via a town deal package'],
    beneficiaries: ['independent shops', 'start-ups', 'hospitality workers', 'town-centre landlords'],
    tradeOffs: ['foregone tax income', 'subsidy dependency', 'uneven ward benefit', 'event disruption'],
  },
  {
    category: 'budget',
    interventions: ['raise', 'freeze', 'sell', 'ring-fence', 'borrow for'],
    subjects: ['council tax', 'the former depot site', 'capital maintenance', 'the neighbourhood fund', 'digital transformation'],
    mechanisms: ['in the medium-term financial plan', 'through asset disposal', 'with prudential borrowing', 'by cutting discretionary grants'],
    beneficiaries: ['front-line services', 'council taxpayers', 'capital programmes', 'partner charities'],
    tradeOffs: ['service reductions', 'higher household bills', 'one-off receipts', 'future debt servicing'],
  },
  {
    category: 'governance',
    interventions: ['reform', 'livestream', 'establish', 'audit', 'open'],
    subjects: ['scrutiny committees', 'public question time', 'a citizens assembly', 'councillor allowances', 'procurement rules'],
    mechanisms: ['via standing-order changes', 'with an independent review', 'through a transparency charter', 'under a new code of conduct'],
    beneficiaries: ['engaged residents', 'opposition groups', 'whistleblowers', 'parish councils'],
    tradeOffs: ['slower decisions', 'officer workload', 'political theatre', 'legal challenge risk'],
  },
]

function pickFrom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length) % arr.length]
}

function motionLeanToValues(lean: Partial<PoliticalValues>): PoliticalValues {
  return { change: lean.change ?? 0, growth: lean.growth ?? 0, services: lean.services ?? 0 }
}

function ideologyDistanceToMotion(values: PoliticalValues, lean: Partial<PoliticalValues>) {
  return valueDistance(values, motionLeanToValues(lean), { change: 1, growth: 1, services: 1 })
}

function contestednessFromSignals(leanMagnitude: number, costSignal: number): CouncilMotion['contestedness'] {
  const score = leanMagnitude / 60 + costSignal
  if (score < 0.85) return 'broad'
  if (score < 1.35) return 'contested'
  return 'divisive'
}

function leanForArea(category: MotionCategory, intervention: string, rng: () => number): Partial<PoliticalValues> {
  const base: Partial<PoliticalValues> = {}
  const swing = () => Math.round((rng() * 36) - 10)
  if (category === 'environment' || category === 'governance') base.change = 18 + swing()
  if (category === 'planning' || category === 'economy' || category === 'housing') base.growth = 16 + swing()
  if (category === 'services' || category === 'safety' || category === 'budget') base.services = 16 + swing()
  if (intervention.includes('cut') || intervention.includes('sell') || intervention.includes('freeze') || intervention.includes('waive')) {
    base.services = (base.services ?? 0) - 28
    base.growth = (base.growth ?? 0) + 14
  }
  if (intervention.includes('raise') || intervention.includes('charge') || intervention.includes('ban') || intervention.includes('require')) {
    base.change = (base.change ?? 0) + 16
    base.growth = (base.growth ?? 0) - 14
  }
  if (rng() < 0.45) {
    const secondary = VALUE_KEYS[Math.floor(rng() * VALUE_KEYS.length)]
    base[secondary] = (base[secondary] ?? 0) + Math.round((rng() * 30) - 15)
  }
  return base
}

function blocImpactForCategory(category: MotionCategory, ideologyLean: Partial<PoliticalValues>, costSignal: number) {
  const categoryBlocMap: Record<MotionCategory, string[]> = {
    environment: ['river_walkers', 'college_corner'],
    services: ['hill_street_households', 'old_town_loyalists'],
    planning: ['workshop_crews', 'market_regulars'],
    housing: ['hill_street_households', 'college_corner'],
    transport: ['workshop_crews', 'river_walkers'],
    safety: ['pondside_peacemakers', 'market_regulars'],
    economy: ['market_regulars', 'workshop_crews'],
    budget: ['old_town_loyalists', 'market_regulars'],
    governance: ['pondside_peacemakers', 'college_corner'],
  }
  const magnitude = Math.abs(ideologyLean.change ?? 0) + Math.abs(ideologyLean.growth ?? 0) + Math.abs(ideologyLean.services ?? 0)
  const sign = (ideologyLean.services ?? 0) >= 0 ? 1 : -1
  return Object.fromEntries((categoryBlocMap[category] ?? ['pondside_peacemakers']).map((bloc, index) => [
    bloc,
    Math.round((magnitude * 0.08 + costSignal * 8) * (index === 0 ? sign : -sign * 0.6)),
  ]))
}

function generateProceduralMotion(rng: () => number, recentHeadlines: string[] = [], preferredCategory?: MotionCategory): GeneratedMotion {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const area = preferredCategory
      ? POLICY_AREAS.find((entry) => entry.category === preferredCategory) ?? pickFrom(POLICY_AREAS, rng)
      : pickFrom(POLICY_AREAS, rng)
    const intervention = pickFrom(area.interventions, rng)
    const subject = pickFrom(area.subjects, rng)
    const location = pickFrom(LOCATIONS, rng)
    const mechanism = pickFrom(area.mechanisms, rng)
    const beneficiary = pickFrom(area.beneficiaries, rng)
    const tradeOff = pickFrom(area.tradeOffs, rng)
    const costSignal = clamp(0.2 + rng() * 0.7 + (intervention.includes('raise') || intervention.includes('ban') || intervention.includes('sell') || intervention.includes('cut') ? 0.15 : 0), 0, 1)
    const ideologyLean = leanForArea(area.category, intervention, rng)
    const leanMagnitude = Math.abs(ideologyLean.change ?? 0) + Math.abs(ideologyLean.growth ?? 0) + Math.abs(ideologyLean.services ?? 0)
    const contestedness = contestednessFromSignals(leanMagnitude, costSignal)
    const headline = `${intervention[0].toUpperCase()}${intervention.slice(1)} ${subject} around ${location}`
    if (recentHeadlines.some((entry) => entry.toLowerCase() === headline.toLowerCase())) continue
    const description = `Council is asked to ${intervention} ${subject} ${mechanism}, aiming to help ${beneficiary}. Officers warn of ${tradeOff}.`
    return {
      headline,
      description,
      category: area.category,
      kind: 'ordinary',
      ideologyLean,
      blocImpact: blocImpactForCategory(area.category, ideologyLean, costSignal),
      costSignal,
      contestedness,
    }
  }
  return {
    headline: 'Review neighbourhood service standards',
    description: 'A routine review of service standards with limited fiscal impact.',
    category: 'services',
    kind: 'ordinary',
    ideologyLean: { services: 6 },
    blocImpact: { hill_street_households: 4 },
    costSignal: 0.2,
    contestedness: 'broad',
  }
}

export function listMotionPromptOptions(category: MotionCategory) {
  const area = POLICY_AREAS.find((entry) => entry.category === category) ?? POLICY_AREAS[0]
  return {
    interventions: area.interventions,
    subjects: area.subjects,
    locations: LOCATIONS,
    mechanisms: area.mechanisms,
    beneficiaries: area.beneficiaries,
    tradeOffs: area.tradeOffs,
  }
}

export function assembleMotionDraft(parts: {
  category: MotionCategory
  intervention: string
  subject: string
  location: string
  seedSalt?: number
}): CustomMotionInput & { contestedness: CouncilMotion['contestedness'] } {
  const area = POLICY_AREAS.find((entry) => entry.category === parts.category) ?? POLICY_AREAS[0]
  const rng = createRng((parts.seedSalt ?? 1) + parts.intervention.length * 17 + parts.subject.length * 31)
  const mechanism = pickFrom(area.mechanisms, rng)
  const beneficiary = pickFrom(area.beneficiaries, rng)
  const tradeOff = pickFrom(area.tradeOffs, rng)
  const ideologyLean = roundPoliticalValues(motionLeanToValues(leanForArea(parts.category, parts.intervention, rng)))
  const costSignal = clamp(0.25 + (parts.intervention.includes('raise') || parts.intervention.includes('ban') || parts.intervention.includes('cut') ? 0.2 : 0.1), 0, 1)
  const leanMagnitude = Math.abs(ideologyLean.change) + Math.abs(ideologyLean.growth) + Math.abs(ideologyLean.services)
  return {
    headline: `${parts.intervention[0].toUpperCase()}${parts.intervention.slice(1)} ${parts.subject} around ${parts.location}`.slice(0, 80),
    description: `Council is asked to ${parts.intervention} ${parts.subject} ${mechanism}, aiming to help ${beneficiary}. Officers warn of ${tradeOff}.`.slice(0, 150),
    category: parts.category,
    ideologyLean,
    kind: 'ordinary',
    costSignal,
    contestedness: contestednessFromSignals(leanMagnitude, costSignal),
  }
}

export function suggestCustomMotion(seedSalt: number, recentHeadlines: string[] = [], category?: MotionCategory): CustomMotionInput & { contestedness: CouncilMotion['contestedness'] } {
  const generated = generateProceduralMotion(createRng(seedSalt), recentHeadlines, category)
  return {
    headline: generated.headline.slice(0, 80),
    description: generated.description.slice(0, 150),
    category: generated.category,
    ideologyLean: roundPoliticalValues(motionLeanToValues(generated.ideologyLean)),
    kind: 'ordinary',
    costSignal: generated.costSignal,
    contestedness: generated.contestedness,
  }
}

export function previewMotionContestedness(ideologyLean: PoliticalValues, costSignal = 0.4): CouncilMotion['contestedness'] {
  const leanMagnitude = Math.abs(ideologyLean.change) + Math.abs(ideologyLean.growth) + Math.abs(ideologyLean.services)
  return contestednessFromSignals(leanMagnitude, costSignal)
}

function supportBand(
  values: PoliticalValues,
  motion: Pick<CouncilMotion, 'ideologyLean' | 'category' | 'costSignal' | 'contestedness'> | { ideologyLean: Partial<PoliticalValues>; category: MotionCategory; costSignal?: number; contestedness?: CouncilMotion['contestedness'] },
) {
  const technicalAllowance = motion.contestedness === 'broad' ? 400 : 0
  const costPenalty = (motion.costSignal ?? 0.4) * 4200
  const distance = Math.max(0, ideologyDistanceToMotion(values, motion.ideologyLean) - technicalAllowance + costPenalty)
  const supportCut = motion.contestedness === 'broad' ? 2200 : motion.contestedness === 'divisive' ? 900 : 1400
  const opposeCut = motion.contestedness === 'broad' ? 7000 : motion.contestedness === 'divisive' ? 3200 : 4800
  if (distance <= supportCut) return 'support' as const
  if (distance >= opposeCut) return 'oppose' as const
  return 'mixed' as const
}

function governingPartyIds(world: World): Set<string> {
  const gov = world.government
  if (!gov || gov.status !== 'formed') return new Set()
  return new Set([gov.leadPartyId, ...gov.partnerPartyIds])
}

function createCouncilSession(week: number, motions: CouncilMotion[], budgetSession: boolean) {
  return {
    week,
    motions,
    activeMotionIndex: 0,
    phase: 'voting' as const,
    resolved: false,
    budgetSession,
  }
}

function buildPartyWhips(world: World, motion: Pick<CouncilMotion, 'ideologyLean' | 'category' | 'costSignal' | 'contestedness' | 'kind'>, pm: PoliticianModeState) {
  const directions: Record<string, 'aye' | 'nay' | 'free'> = {}
  const governingIds = governingPartyIds(world)
  for (const party of world.parties) {
    const band = supportBand(party.values, motion)
    let direction: 'aye' | 'nay' | 'free' = band === 'support' ? 'aye' : band === 'oppose' ? 'nay' : 'free'
    if (motion.contestedness === 'divisive' && band === 'support' && (motion.costSignal ?? 0) > 0.7 && rngLike(world, party.id) > 0.55) {
      direction = 'free'
    }
    if (governingIds.has(party.id) && motion.kind === 'budget') direction = 'aye'
    if (world.government?.kind === 'minority' && !governingIds.has(party.id) && band === 'mixed') direction = 'free'
    directions[party.id] = direction
  }
  const playerPartyNPCs = pm.councillors.filter((councillor) => councillor.partyId === pm.politician.partyId)
  if (playerPartyNPCs.length === 0) directions[pm.politician.partyId] = 'free'
  const whipIssuer = playerPartyNPCs.length > 0
    ? playerPartyNPCs.reduce((a, b) => b.influence > a.influence ? b : a)
    : undefined
  return { directions, whipIssuer }
}

function rngLike(world: World, salt: string) {
  const key = `${world.seed}-${world.week}-${salt}`
  const roll = [...key].reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0)
  return (Math.abs(roll) % 10000) / 10000
}

function motionFromInput(input: CustomMotionInput): GeneratedMotion {
  const costSignal = input.costSignal ?? clamp((Math.abs(input.ideologyLean.change) + Math.abs(input.ideologyLean.growth) + Math.abs(input.ideologyLean.services)) / 120, 0.2, 1)
  const leanMagnitude = Math.abs(input.ideologyLean.change) + Math.abs(input.ideologyLean.growth) + Math.abs(input.ideologyLean.services)
  return {
    headline: input.headline || 'Untitled Motion',
    description: input.description || '',
    category: input.category,
    kind: input.kind ?? (input.targetMotionId ? 'repeal' : 'ordinary'),
    ideologyLean: input.ideologyLean,
    blocImpact: blocImpactForCategory(input.category, input.ideologyLean, costSignal),
    costSignal,
    contestedness: contestednessFromSignals(leanMagnitude, costSignal),
    targetMotionId: input.targetMotionId,
    budgetProposal: input.budgetProposal,
  }
}

function buildMotionRecord(world: World, pm: PoliticianModeState, generated: GeneratedMotion, proposer: { id: string; name: string; partyId?: string }, id: string, playerVote?: 'aye' | 'nay' | 'abstain'): CouncilMotion {
  const { directions, whipIssuer } = buildPartyWhips(world, generated, pm)
  const proposerPartyId = proposer.partyId
    ?? (proposer.id === pm.politician.id
      ? pm.politician.partyId
      : pm.councillors.find((councillor) => councillor.id === proposer.id)?.partyId ?? pm.politician.partyId)
  return {
    ...generated,
    id,
    proposerId: proposer.id,
    proposerName: proposer.name,
    proposerPartyId,
    effects: [],
    status: 'voting',
    votes: [],
    partyWhipDirection: directions,
    playerVote,
    whipIssuerId: whipIssuer?.id,
    whipIssuerName: whipIssuer?.name,
  }
}

export function playerPartyIsGoverning(world: World) {
  return isPlayerPartyGovernmentLead(world)
}

export function governingStatusLabel(world: World): string {
  if (world.government?.status === 'forming') return 'Hung council'
  if (isPlayerPartyGovernmentLead(world) && world.government?.kind === 'coalition') {
    const partner = world.parties.find((party) => party.id === world.government?.partnerPartyIds[0])
    return `Coalition · ${partner?.name ?? 'partner'}`
  }
  if (isPlayerPartyGovernmentLead(world) && world.government?.kind === 'minority') return 'Minority government'
  if (isPlayerPartyGovernmentLead(world)) return 'Majority government'
  const lead = governmentLeadParty(world)
  return lead ? `Opposition · ${lead.name} governing` : 'Opposition'
}

/** Party holding the elected seat in a ward; falls back to poll leader before first election. */
export function electedPartyIdForWard(world: World, wardId: string): string | null {
  if (world.electionsHeld >= 1) {
    const winner = world.electionNightResults.find((r) => r.wardId === wardId)?.winner?.partyId
    if (winner) return winner
  }
  return world.constituencies.find((c) => c.id === wardId)?.leadingPartyId ?? null
}

/** Seat counts from last election (or current poll projection if none held yet). */
export function electedSeatCounts(world: World): Record<string, number> {
  const counts: Record<string, number> = {}
  if (world.electionsHeld >= 1 && world.electionNightResults.length > 0) {
    for (const r of world.electionNightResults) {
      const id = r.winner?.partyId
      if (id) counts[id] = (counts[id] ?? 0) + 1
    }
    return counts
  }
  for (const ward of world.constituencies) {
    const id = ward.leadingPartyId
    if (id) counts[id] = (counts[id] ?? 0) + 1
  }
  return counts
}

export function generateCouncilSession(world: World): World {
  if (!world.politicianMode) return world
  const pm = world.politicianMode
  if (!pm.politician.isIncumbent) return world

  const budgetDue = world.week >= pm.nextBudgetWeek
  const ordinaryDue = world.week >= pm.nextSessionWeek
  if (budgetDue && ordinaryDue) {
    return generateCouncilSession({
      ...world,
      politicianMode: { ...pm, nextBudgetWeek: world.week + 1 },
    })
  }

  const isBudgetSession = budgetDue && !ordinaryDue
  const rng = createRng(world.seed + world.week * 3331 + (isBudgetSession ? 17 : 0))

  if (isBudgetSession) {
    const amendment = pm.queuedMotion?.kind === 'budget' && pm.queuedMotion.budgetProposal ? pm.queuedMotion : undefined
    const proposed = normalizeBudget(amendment?.budgetProposal ?? pm.proposedBudget ?? world.budget)
    const lean = budgetIdeologyLean(proposed)
    const isAmendment = Boolean(amendment)
    const generated: GeneratedMotion = {
      headline: amendment ? amendment.headline : 'Adopt the council budget',
      description: amendment
        ? amendment.description
        : 'Approve the governing administration\'s balanced service allocations for the coming year.',
      category: 'budget',
      kind: 'budget',
      ideologyLean: lean,
      blocImpact: Object.fromEntries(proposed.categories.flatMap((category) => category.blocs.map((bloc) => [bloc, Math.round((category.funding - 50) / 5)]))),
      costSignal: isAmendment ? 0.55 : 0.35,
      contestedness: isAmendment ? 'contested' : 'broad',
      budgetProposal: proposed,
    }
    const proposer = amendment || playerPartyIsGoverning(world)
      ? pm.politician
      : [...pm.councillors].sort((a, b) => b.influence - a.influence)[0] ?? pm.politician
    const motion = buildMotionRecord(world, pm, generated, proposer, `budget_${world.week}`, proposer.id === pm.politician.id ? 'aye' : undefined)
    return {
      ...world,
      politicianMode: {
        ...pm,
        queuedMotion: amendment ? undefined : pm.queuedMotion,
        proposedBudget: amendment ? proposed : pm.proposedBudget,
        currentSession: createCouncilSession(world.week, [motion], true),
      },
    }
  }

  const queuedMotion = pm.queuedMotion
  const recent = pm.legislationHistory.map((motion) => motion.headline)
  const generated = queuedMotion ? motionFromInput(queuedMotion) : generateProceduralMotion(rng, recent)
  const { directions } = buildPartyWhips(world, generated, pm)
  const ayePartyIds = new Set(Object.entries(directions).filter(([, d]) => d === 'aye').map(([id]) => id))
  const ayeCouncillors = pm.councillors.filter((c) => ayePartyIds.has(c.partyId))
  let proposer: { id: string; name: string }
  if (queuedMotion) {
    proposer = pm.politician
  } else if (ayeCouncillors.length > 0) {
    proposer = pickFrom(ayeCouncillors, rng)
  } else {
    proposer = [...pm.councillors].sort((a, b) => ideologyDistanceToMotion(a.personalValues, generated.ideologyLean) - ideologyDistanceToMotion(b.personalValues, generated.ideologyLean))[0] ?? pm.politician
  }
  const motion = buildMotionRecord(world, pm, generated, proposer, `motion_${world.week}_0`, queuedMotion ? 'aye' : undefined)
  if (!ayePartyIds.has(proposer.id === pm.politician.id ? pm.politician.partyId : (pm.councillors.find((c) => c.id === proposer.id)?.partyId ?? '')) && proposer.id !== pm.politician.id) {
    const partyId = pm.councillors.find((c) => c.id === proposer.id)?.partyId
    if (partyId) motion.partyWhipDirection[partyId] = 'aye'
  }

  return {
    ...world,
    politicianMode: {
      ...pm,
      queuedMotion: undefined,
      currentSession: createCouncilSession(world.week, [motion], false),
    },
  }
}

export type PredictedStance = 'aye' | 'lean_aye' | 'undecided' | 'lean_nay' | 'nay'

export function predictCouncillorVote(councillor: Councillor, motion: CouncilMotion, world: World): PredictedStance {
  if (councillor.id === motion.proposerId) return 'aye'
  const committedVote = motion.votes.find((vote) => vote.councillorId === councillor.id)
  if (committedVote) return committedVote.vote === 'aye' ? 'aye' : committedVote.vote === 'nay' ? 'nay' : 'undecided'
  const whip = motion.partyWhipDirection[councillor.partyId] ?? 'free'
  const personalLeans = supportBand(councillor.personalValues, motion)
  const minorityPressure = world.government?.kind === 'minority' ? 0.1 : 0

  if (whip === 'aye' && personalLeans === 'support') return 'aye'
  if (whip === 'nay' && personalLeans === 'oppose') return 'nay'
  if (whip === 'aye' && personalLeans === 'mixed') return councillor.rebellionTendency > 0.35 ? 'lean_aye' : 'aye'
  if (whip === 'nay' && personalLeans === 'mixed') return councillor.rebellionTendency > 0.35 ? 'lean_nay' : 'nay'
  if (whip === 'aye' && personalLeans === 'oppose') return councillor.rebellionTendency + minorityPressure > 0.30 ? 'lean_nay' : 'lean_aye'
  if (whip === 'nay' && personalLeans === 'support') return councillor.rebellionTendency + minorityPressure > 0.30 ? 'lean_aye' : 'lean_nay'
  if (whip === 'free') {
    if (personalLeans === 'support') return motion.contestedness === 'broad' ? 'aye' : 'lean_aye'
    if (personalLeans === 'oppose') return motion.contestedness === 'broad' ? 'nay' : 'lean_nay'
    return 'undecided'
  }
  return 'undecided'
}

export function queueCustomMotion(world: World, input: CustomMotionInput): World {
  const pm = world.politicianMode
  const cost = input.kind === 'budget' ? BUDGET_AMENDMENT_INFLUENCE_COST : MOTION_PROPOSAL_INFLUENCE_COST
  if (!pm || pm.queuedMotion || pm.politician.influence < cost) return world
  return {
    ...world,
    newsFeed: [`Week ${world.week}: You queued "${input.headline}" for the next council session (−${cost} influence).`, ...world.newsFeed].slice(0, 30),
    politicianMode: {
      ...pm,
      politician: {
        ...pm.politician,
        influence: pm.politician.influence - cost,
        careerHistory: [...pm.politician.careerHistory, { week: world.week, description: `Queued motion: ${input.headline}`, tier: pm.politician.careerTier, rank: pm.politician.careerRank }],
      },
      queuedMotion: input,
    },
  }
}

export function queueRepealMotion(world: World, targetMotionId: string, rationale: string): World {
  const pm = world.politicianMode
  const target = pm?.legislationHistory.find((motion) => motion.id === targetMotionId && motion.status === 'passed')
  if (!pm || !target || !pm.politician.isIncumbent) return world
  return queueCustomMotion(world, {
    headline: `Repeal: ${target.headline}`,
    description: rationale || `Repeal the previously passed motion "${target.headline}".`,
    category: target.category,
    ideologyLean: {
      change: -(target.ideologyLean.change ?? 0),
      growth: -(target.ideologyLean.growth ?? 0),
      services: -(target.ideologyLean.services ?? 0),
    },
    kind: 'repeal',
    targetMotionId,
    costSignal: Math.min(1, (target.costSignal ?? 0.5) + 0.2),
  })
}

export function castPlayerVote(world: World, motionId: string, vote: 'aye' | 'nay' | 'abstain'): World {
  if (!world.politicianMode?.currentSession) return world
  const pm = world.politicianMode
  const session = pm.currentSession!
  const motions = session.motions.map((m) => m.id !== motionId ? m : { ...m, playerVote: vote })
  return { ...world, politicianMode: { ...pm, currentSession: { ...session, motions } } }
}

export function resolveCouncilSession(world: World): World {
  if (!world.politicianMode?.currentSession) return world
  const pm = world.politicianMode
  const session = pm.currentSession!
  const rng = createRng(world.seed + world.week * 4441)
  let pol = pm.politician
  let nextBudget = world.budget
  let proposedBudget = pm.proposedBudget
  let nextBudgetWeek = pm.nextBudgetWeek
  let budgetHistory = pm.budgetHistory

  const resolvedMotions = session.motions.map((motion) => {
    const votes: CouncilMotionVote[] = []
    for (const cllr of pm.councillors) {
      if (cllr.id === motion.proposerId) {
        votes.push({ councillorId: cllr.id, councillorName: cllr.name, partyId: cllr.partyId, vote: 'aye' })
        continue
      }
      const committedVote = motion.votes.find((vote) => vote.councillorId === cllr.id)
      if (committedVote) {
        votes.push(committedVote)
        continue
      }
      const whip = motion.partyWhipDirection[cllr.partyId] ?? 'free'
      let baseVote: 'aye' | 'nay' | 'abstain'
      if (whip === 'free') {
        const personalBand = supportBand(cllr.personalValues, motion)
        if (personalBand === 'support') baseVote = motion.contestedness === 'broad' ? (rng() < 0.82 ? 'aye' : 'abstain') : rng() < 0.62 ? 'aye' : (rng() < 0.55 ? 'abstain' : 'nay')
        else if (personalBand === 'oppose') baseVote = motion.contestedness === 'broad' ? (rng() < 0.82 ? 'nay' : 'abstain') : rng() < 0.68 ? 'nay' : (rng() < 0.55 ? 'abstain' : 'aye')
        else baseVote = rng() < 0.42 ? 'abstain' : (rng() < 0.42 ? 'aye' : 'nay')
      } else {
        baseVote = whip
      }
      const governingIds = governingPartyIds(world)
      const governingBudgetWhip = motion.kind === 'budget' && whip !== 'free' && governingIds.has(cllr.partyId)
      const sameParty = cllr.partyId === pol.partyId
      const rebellionChance = (
        cllr.rebellionTendency
        + (motion.contestedness === 'divisive' ? 0.10 : motion.contestedness === 'contested' ? 0.04 : 0.01)
        + (world.government?.kind === 'minority' ? 0.05 : 0)
        + (motion.costSignal * 0.05)
      ) * (governingBudgetWhip ? 0.45 : 1) * (sameParty ? 0.35 : 1)
      if (rng() < rebellionChance && whip !== 'free') baseVote = whip === 'aye' ? 'nay' : 'aye'
      const relationship = pol.relationships.find((r) => r.targetId === cllr.id)
      const followThreshold = sameParty ? 30 : 40
      const followChance = sameParty ? 0.40 : 0.18
      if (relationship && relationship.strength > followThreshold && rng() < followChance) baseVote = motion.playerVote ?? baseVote
      votes.push({ councillorId: cllr.id, councillorName: cllr.name, partyId: cllr.partyId, vote: baseVote })
    }
    if (motion.playerVote) votes.push({ councillorId: pol.id, councillorName: pol.name, partyId: pol.partyId, vote: motion.playerVote })
    const ayes = votes.filter((v) => v.vote === 'aye').length
    const nays = votes.filter((v) => v.vote === 'nay').length
    const passed = ayes > nays
    return { ...motion, votes, status: (passed ? 'passed' : 'failed') as CouncilMotion['status'] }
  })

  let motionsPassed = pol.motionsPassed
  let motionsProposed = pol.motionsProposed
  let loyaltyChange = 0
  let rebellionCount = 0
  let reputationChange = 0
  let influenceChange = 0
  let legislationHistory = [...pm.legislationHistory]
  let imposedCompromiseBudget = false

  for (const m of resolvedMotions) {
    if (m.proposerId === pol.id) motionsProposed++
    if (m.proposerId === pol.id && m.status === 'passed') motionsPassed++
    if (m.playerVote) {
      const whip = m.partyWhipDirection[pol.partyId]
      const rebelled = whip !== 'free' && m.playerVote !== whip
      if (rebelled) {
        rebellionCount++
        loyaltyChange -= (12 - (pol.traits.some((t) => t.id === 'maverick') ? 4 : 0))
        reputationChange += 4
        influenceChange += 2
      } else if (whip !== 'free') loyaltyChange += 2
      if (m.playerVote === 'aye' && m.status === 'passed') influenceChange += 1
    }
    if (m.status === 'passed' && m.kind === 'budget' && m.budgetProposal) {
      nextBudget = normalizeBudget(m.budgetProposal)
      proposedBudget = undefined
      nextBudgetWeek = world.week + world.electionCycleWeeks
      budgetHistory = [...budgetHistory, { week: world.week, passed: true }]
    } else if (m.kind === 'budget' && m.status === 'failed') {
      proposedBudget = undefined
      budgetHistory = [...budgetHistory, { week: world.week, passed: false }]
      if (consecutiveBudgetFailures(budgetHistory) >= 3) {
        nextBudget = normalizeBudget(world.budget)
        nextBudgetWeek = world.week + world.electionCycleWeeks
        imposedCompromiseBudget = true
        budgetHistory = [...budgetHistory, { week: world.week, passed: true }]
      } else {
        nextBudgetWeek = world.week + pm.councilSessionInterval
      }
    }
    if (m.status === 'passed' && m.kind === 'repeal' && m.targetMotionId) {
      legislationHistory = legislationHistory.map((entry) => entry.id === m.targetMotionId
        ? { ...entry, status: 'repealed', repealedById: m.id }
        : entry)
    }
  }

  if (pol.traits.some((t) => t.id === 'policy-wonk')) influenceChange += 2
  pol = {
    ...pol,
    motionsPassed,
    motionsProposed,
    rebellions: pol.rebellions + rebellionCount,
    partyLoyalty: clamp(pol.partyLoyalty + loyaltyChange, 0, 100),
    reputation: clamp(pol.reputation + reputationChange, 0, 100),
    influence: clamp(pol.influence + influenceChange, 0, 100),
  }

  const networkerBonus = pol.traits.some((t) => t.id === 'networker') ? 2 : 0
  const updatedRelationships = pol.relationships.map((rel) => {
    let strengthDelta = networkerBonus
    const history = [...rel.history]
    const sameParty = rel.partyId === pol.partyId
    for (const m of resolvedMotions) {
      if (!m.playerVote) continue
      const cllrVote = m.votes.find((v) => v.councillorId === rel.targetId)
      if (!cllrVote) continue
      const isProposer = m.proposerId === rel.targetId
      if (cllrVote.vote === m.playerVote) {
        const agreeBonus = isProposer && m.playerVote === 'aye' ? (m.kind === 'repeal' ? 12 : 10) : 5
        strengthDelta += sameParty ? agreeBonus + 2 : agreeBonus
        if (history.length < 5) history.push(`${isProposer && m.playerVote === 'aye' ? 'Supported their motion' : 'Agreed on'}: ${m.headline}`)
      } else if (m.playerVote !== 'abstain' && cllrVote.vote !== 'abstain') {
        strengthDelta -= isProposer ? (m.kind === 'repeal' ? 10 : 8) : 4
        if (history.length < 5) history.push(`${isProposer ? 'Opposed their motion' : 'Disagreed on'}: ${m.headline}`)
      }
    }
    const newStrength = clamp(rel.strength + strengthDelta, -100, 100)
    const newType: Relationship['type'] = newStrength > 40 ? 'ally' : newStrength < -30 ? 'rival' : rel.type === 'mentor' ? 'mentor' : 'neutral'
    return { ...rel, strength: newStrength, type: newType, history: history.slice(-8) }
  })
  pol = { ...pol, relationships: updatedRelationships }

  const passedCount = resolvedMotions.filter((m) => m.status === 'passed').length
  const failedCount = resolvedMotions.filter((m) => m.status === 'failed').length
  let updatedTiles = world.tiles
  const passedMotions = resolvedMotions.filter((m) => m.status === 'passed')
  if (passedMotions.length > 0 || nextBudget !== world.budget) {
    updatedTiles = world.tiles.map((tile) => {
      let approvalBoost = 0
      for (const motion of passedMotions) {
        for (const [blocId, impact] of Object.entries(motion.blocImpact)) {
          const blocWeight = tile.blocMix[blocId] ?? 0
          if (blocWeight > 0.1) approvalBoost += (impact / 100) * blocWeight * 0.02
        }
      }
      for (const category of nextBudget.categories) {
        const under = category.funding < 35
        const over = category.funding > 65
        if (!under && !over) continue
        const weight = category.blocs.reduce((sum, bloc) => sum + (tile.blocMix[bloc] ?? 0), 0)
        if (weight > 0.08) approvalBoost += (over ? 0.01 : -0.01) * weight
      }
      if (approvalBoost === 0) return tile
      const existingBoost = tile.campaignBoosts?.[world.playerPartyId] ?? 0
      return { ...tile, campaignBoosts: { ...tile.campaignBoosts, [world.playerPartyId]: clamp(existingBoost + approvalBoost, 0, 0.4) } }
    })
  }

  const councilNews = resolvedMotions.map((m) => {
    if (m.kind === 'budget' && m.status === 'failed' && imposedCompromiseBudget) {
      return `Week ${world.week}: After three failed votes, officers impose a compromise budget.`
    }
    return `Week ${world.week}: Council ${m.status === 'passed' ? 'passes' : 'rejects'} "${m.headline}".`
  })
  const nextOrdinaryWeek = world.week + pm.councilSessionInterval
  return {
    ...world,
    budget: nextBudget,
    tiles: updatedTiles,
    newsFeed: [...councilNews, ...world.newsFeed].slice(0, 30),
    politicianMode: {
      ...pm,
      politician: pol,
      proposedBudget,
      nextBudgetWeek,
      budgetHistory,
      currentSession: { ...session, motions: resolvedMotions, resolved: true, phase: 'resolved' },
      sessionHistory: [...pm.sessionHistory, { week: world.week, motionsPassed: passedCount, motionsFailed: failedCount }],
      legislationHistory: [...legislationHistory, ...resolvedMotions].slice(-40),
      nextSessionWeek: nextOrdinaryWeek,
    },
  }
}

export function shouldTriggerCouncilSession(world: World): boolean {
  if (!world.politicianMode) return false
  if (!world.politicianMode.politician.isIncumbent) return false
  if (world.politicianMode.currentSession && !world.politicianMode.currentSession.resolved) return false
  if (world.electionNightActive) return false
  const pm = world.politicianMode
  return world.week >= pm.nextSessionWeek || world.week >= pm.nextBudgetWeek
}

function formedPlayerGovernment(world: World, kind: GovernmentState['kind'], partnerPartyIds: string[] = []): GovernmentState {
  return {
    status: 'formed',
    kind,
    leadPartyId: world.playerPartyId,
    partnerPartyIds,
    formedWeek: world.week,
    electionNumber: world.electionsHeld,
  }
}

function formedNpcGovernment(
  world: World,
  leadPartyId: string,
  kind: GovernmentState['kind'],
  partnerPartyIds: string[] = [],
): GovernmentState {
  return {
    status: 'formed',
    kind,
    leadPartyId,
    partnerPartyIds,
    formedWeek: world.week,
    electionNumber: world.electionsHeld,
  }
}

export function formCoalitionGovernment(world: World, partnerId: string): World {
  return {
    ...world,
    government: formedPlayerGovernment(world, 'coalition', [partnerId]),
    electoralPacts: world.electoralPacts ?? [],
    pactTrust: world.pactTrust ?? {},
    newsFeed: [`Week ${world.week}: A coalition administration is formed with ${world.parties.find((party) => party.id === partnerId)?.name ?? 'a partner'}.`, ...world.newsFeed].slice(0, 30),
  }
}

export function formMinorityGovernment(world: World): World {
  return {
    ...world,
    government: formedPlayerGovernment(world, 'minority'),
    electoralPacts: world.electoralPacts ?? [],
    pactTrust: world.pactTrust ?? {},
    newsFeed: [`Week ${world.week}: A minority administration takes office.`, ...world.newsFeed].slice(0, 30),
  }
}

export function formNpcOpposition(world: World): World {
  const largest = [...world.nationalResults].sort((a, b) => b.seatsWon - a.seatsWon)[0]
  const majority = world.stats.councilMajority
  const pactFields = {
    electoralPacts: world.electoralPacts ?? [],
    pactTrust: world.pactTrust ?? {},
  }
  if (!largest) {
    return { ...world, ...pactFields, government: undefined }
  }

  if (largest.partyId === world.playerPartyId) {
    if (largest.seatsWon >= majority) {
      return {
        ...world,
        ...pactFields,
        government: formedPlayerGovernment(world, 'majority'),
        newsFeed: [`Week ${world.week}: Party leadership forms a majority administration. You are in government.`, ...world.newsFeed].slice(0, 30),
      }
    }
    const partner = [...world.nationalResults]
      .filter((result) => result.partyId !== world.playerPartyId)
      .map((result) => {
        const party = world.parties.find((entry) => entry.id === result.partyId)
        const lead = world.parties.find((entry) => entry.id === world.playerPartyId)
        const compat = party && lead ? coalitionCompatibility(lead.values, party.values) : 0
        return { result, compat }
      })
      .sort((a, b) => b.compat - a.compat || b.result.seatsWon - a.result.seatsWon)[0]
    const canCoalition = partner && largest.seatsWon + partner.result.seatsWon >= majority && partner.compat >= 50
    if (canCoalition) {
      return {
        ...formCoalitionGovernment(world, partner.result.partyId),
        newsFeed: [`Week ${world.week}: Party leadership forms a coalition with ${partner.result.partyName}. You are in government.`, ...world.newsFeed].slice(0, 30),
      }
    }
    return {
      ...formMinorityGovernment(world),
      newsFeed: [`Week ${world.week}: Party leadership forms a minority administration. You are in government.`, ...world.newsFeed].slice(0, 30),
    }
  }

  if (largest.seatsWon >= majority) {
    return {
      ...world,
      ...pactFields,
      government: formedNpcGovernment(world, largest.partyId, 'majority'),
      newsFeed: [`Week ${world.week}: ${largest.partyName} forms a majority administration. You remain in opposition.`, ...world.newsFeed].slice(0, 30),
    }
  }

  const partner = [...world.nationalResults]
    .filter((result) => result.partyId !== largest.partyId && result.partyId !== world.playerPartyId)
    .map((result) => {
      const party = world.parties.find((entry) => entry.id === result.partyId)
      const lead = world.parties.find((entry) => entry.id === largest.partyId)
      const compat = party && lead ? coalitionCompatibility(lead.values, party.values) : 0
      return { result, compat }
    })
    .sort((a, b) => b.compat - a.compat || b.result.seatsWon - a.result.seatsWon)[0]
  const canCoalition = partner && largest.seatsWon + partner.result.seatsWon >= majority && partner.compat >= 50
  return {
    ...world,
    ...pactFields,
    government: formedNpcGovernment(
      world,
      largest.partyId,
      canCoalition ? 'coalition' : 'minority',
      canCoalition ? [partner.result.partyId] : [],
    ),
    newsFeed: [`Week ${world.week}: ${largest.partyName} forms ${canCoalition ? `a coalition with ${partner.result.partyName}` : 'a minority administration'}. You remain in opposition.`, ...world.newsFeed].slice(0, 30),
  }
}

export function playerCanNegotiateCoalition(world: World): boolean {
  const rank = world.politicianMode?.politician.careerRank
  return rank === 'party-leader'
}

export function applyRelationshipAction(
  world: World,
  councillorId: string,
  action: 'reach_out' | 'antagonise',
): { world: World; result: PoliticianActionResult } {
  const pm = world.politicianMode
  const relationship = pm?.politician.relationships.find((entry) => entry.targetId === councillorId)
  if (!pm || !relationship) {
    return { world, result: { action: { type: 'lobby_councillor', label: 'Relationship action', description: '', apCost: 0 }, outcome: 'neutral', description: 'That political contact is no longer available.' } }
  }
  if (world.playerActionPoints < 1) {
    return { world, result: { action: { type: 'lobby_councillor', label: action === 'reach_out' ? 'Reach out' : 'Antagonise', description: '', apCost: 1 }, outcome: 'neutral', description: 'You’ve already acted this week.' } }
  }

  const rng = createRng(world.seed + world.week * 809 + councillorId.length + (action === 'reach_out' ? 1 : 2))
  const organiserBonus = pm.politician.traits.some((trait) => trait.id === 'community-organiser') ? 0.15 : 0
  const samePartyBonus = relationship.partyId === pm.politician.partyId ? 0.20 : 0
  const successChance = clamp(0.45 + organiserBonus + samePartyBonus + pm.politician.influence / 250 + relationship.strength / 300, 0.2, 0.85)
  const successful = action === 'antagonise' || rng() < successChance
  const delta = action === 'antagonise' ? -(10 + Math.floor(rng() * 6)) : successful ? 8 + Math.floor(rng() * 5) : 0
  const description = action === 'antagonise'
    ? `You publicly challenged ${relationship.targetName}, worsening the relationship.`
    : successful ? `You made time for ${relationship.targetName}; the relationship improved.` : `${relationship.targetName} was unreceptive to your approach this week.`
  const relationships = pm.politician.relationships.map((entry) => {
    if (entry.targetId !== councillorId) return entry
    const strength = clamp(entry.strength + delta, -100, 100)
    const type: Relationship['type'] = strength > 40 ? 'ally' : strength < -30 ? 'rival' : entry.type === 'mentor' ? 'mentor' : 'neutral'
    const history = [...entry.history, action === 'antagonise' ? 'Publicly challenged them.' : successful ? 'Reached out personally.' : 'Attempted to reach out.'].slice(-8)
    return { ...entry, strength, type, history }
  })

  return {
    world: {
      ...world,
      playerActionPoints: 0,
      politicianMode: { ...pm, politician: { ...pm.politician, relationships } },
    },
    result: {
      action: { type: 'lobby_councillor', label: action === 'reach_out' ? 'Reach out' : 'Antagonise', description: '', apCost: 1 },
      outcome: action === 'reach_out' && !successful ? 'neutral' : 'success',
      description,
    },
  }
}

export function lobbyCouncillor(world: World, councillorId: string, motionId: string, desiredVote: 'aye' | 'nay'): { world: World; success: boolean; message: string } {
  if (!world.politicianMode) return { world, success: false, message: 'Not in politician mode.' }
  const pm = world.politicianMode
  const pol = pm.politician
  const cllr = pm.councillors.find((c) => c.id === councillorId)
  if (!cllr) return { world, success: false, message: 'Councillor not found.' }

  const influenceCost = 5
  if (pol.influence < influenceCost) return { world, success: false, message: 'Not enough influence.' }

  const rng = createRng(world.seed + world.week * 5551 + councillorId.length)
  const relationship = pol.relationships.find((r) => r.targetId === councillorId)
  const relationshipBonus = relationship ? relationship.strength / 200 : 0
  const samePartyBonus = cllr.partyId === pol.partyId ? 0.15 : 0
  const successChance = 0.3 + relationshipBonus + samePartyBonus + (pol.influence / 200)

  const success = rng() < successChance
  let message: string
  const updatedRelationships = pol.relationships.map((r) => {
    if (r.targetId !== councillorId) return r
    const delta = success ? 5 : -3
    return { ...r, strength: clamp(r.strength + delta, -100, 100), history: [...r.history, success ? 'Accepted your lobbying' : 'Rejected your lobbying'].slice(-8) }
  })

  const newPol = {
    ...pol,
    influence: pol.influence - influenceCost,
    relationships: updatedRelationships,
  }

  if (success && pm.currentSession) {
    message = `${cllr.name} has agreed to vote ${desiredVote} on the motion.`
    const updatedSession = {
      ...pm.currentSession,
      motions: pm.currentSession.motions.map((m) => {
        if (m.id !== motionId) return m
        const existingVoteIdx = m.votes.findIndex((v) => v.councillorId === councillorId)
        const lobbiedVote: CouncilMotionVote = { councillorId, councillorName: cllr.name, partyId: cllr.partyId, vote: desiredVote }
        const votes = existingVoteIdx >= 0
          ? m.votes.map((v, i) => i === existingVoteIdx ? lobbiedVote : v)
          : [...m.votes, lobbiedVote]
        return { ...m, votes }
      }),
    }
    return {
      world: { ...world, politicianMode: { ...pm, politician: newPol, currentSession: updatedSession } },
      success: true,
      message,
    }
  }

  message = success ? `${cllr.name} was receptive to your argument.` : `${cllr.name} rebuffed your lobbying attempt.`
  return {
    world: { ...world, politicianMode: { ...pm, politician: newPol } },
    success,
    message,
  }
}

// ─── Career Progression ─────────────────────────────────────────────────────

export interface CareerRequirements {
  rank: CareerRank
  label: string
  requirements: { label: string; met: boolean; current: number; needed: number }[]
  eligible: boolean
}

export function getCareerRequirements(world: World): CareerRequirements | null {
  if (!world.politicianMode) return null
  const pol = world.politicianMode.politician
  const nextRank = getNextRank(pol.careerRank)
  if (!nextRank) return null

  const reqs = getRequirementsForRank(nextRank, pol)
  const eligible = reqs.every((r) => r.met)
  return { rank: nextRank, label: RANK_LABELS[nextRank], requirements: reqs, eligible }
}

function getNextRank(current: CareerRank): CareerRank | null {
  const order: CareerRank[] = ['backbencher', 'committee-chair', 'party-leader']
  const idx = order.indexOf(current)
  return idx < order.length - 1 ? order[idx + 1] : null
}

const RANK_LABELS: Record<CareerRank, string> = {
  'backbencher': 'Backbencher',
  'committee-chair': 'Committee Chair',
  'party-leader': 'Party Leader',
}

export function getTierLabel(tier: CareerRank): string {
  return RANK_LABELS[tier]
}

function getRequirementsForRank(rank: CareerRank, pol: PoliticianState): Array<{ label: string; met: boolean; current: number; needed: number }> {
  switch (rank) {
    case 'committee-chair':
      return [
        { label: 'Terms served', met: pol.termsServed >= 1, current: pol.termsServed, needed: 1 },
        { label: 'Motions passed', met: pol.motionsPassed >= 2, current: pol.motionsPassed, needed: 2 },
        { label: 'Influence', met: pol.influence >= 20, current: pol.influence, needed: 20 },
      ]
    case 'party-leader':
      return [
        { label: 'Terms served', met: pol.termsServed >= 3, current: pol.termsServed, needed: 3 },
        { label: 'Influence', met: pol.influence >= 65, current: pol.influence, needed: 65 },
        { label: 'Reputation', met: pol.reputation >= 60, current: pol.reputation, needed: 60 },
        { label: 'Allies', met: pol.relationships.filter((r) => r.type === 'ally').length >= 3, current: pol.relationships.filter((r) => r.type === 'ally').length, needed: 3 },
      ]
    default:
      return []
  }
}

export function promoteCareer(world: World): World {
  if (!world.politicianMode) return world
  const pm = world.politicianMode
  const pol = pm.politician
  const nextRank = getNextRank(pol.careerRank)
  if (!nextRank) return world

  const reqs = getRequirementsForRank(nextRank, pol)
  if (!reqs.every((r) => r.met)) return world

  const promotedPol: PoliticianState = {
    ...pol,
    careerRank: nextRank,
    careerTier: nextRank,
    careerHistory: [...pol.careerHistory, { week: world.week, description: `Promoted to ${RANK_LABELS[nextRank]}`, tier: nextRank, rank: nextRank }],
    influence: pol.influence + 10,
  }

  return {
    ...world,
    politicianMode: { ...pm, politician: promotedPol },
    newsFeed: [`Week ${world.week}: Cllr. ${pol.name} becomes ${RANK_LABELS[nextRank]}!`, ...world.newsFeed].slice(0, 30),
  }
}
