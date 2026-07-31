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
  type PartyEdit,
  type PartyPerformance,
  type PoliticalValueKey,
  type PoliticalValues,
  type PopulationTile,
  type SettlementCenter,
  type TilePreferenceEstimate,
  type TilePartyPreference,
  type TownStats,
  type VoteHistoryEntry,
  type CareerTier,
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
  {
    id: 'bus-route-cuts',
    label: 'Bus Route Cuts',
    description: 'Reduced weekend buses leave peripheral wards isolated.',
    tags: ['rural', 'suburban', 'industrial'],
    effect: { services: -12, growth: -5 },
    popularityEffect: { target: 'major', amount: -0.06 },
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
    popularityEffect: { target: 'minor', amount: -0.04 },
  },
  {
    id: 'heritage-status',
    label: 'Heritage Status Bid',
    description: 'A campaign to protect historic buildings restricts new developments.',
    tags: ['oldtown', 'hill', 'center'],
    effect: { growth: -8, change: -12 },
    popularityEffect: { target: 'major', amount: 0.05 },
  },
  {
    id: 'air-quality-alert',
    label: 'Air Quality Concerns',
    description: 'Smog from the industrial estate is triggering health complaints.',
    tags: ['industrial', 'school', 'east'],
    effect: { services: 8, change: 10 },
    popularityEffect: { target: 'minor', amount: 0.04 },
  },
  {
    id: 'tech-hub-rumors',
    label: 'Tech Hub Rumors',
    description: 'Excitement builds over a tech firm eyeing an old warehouse.',
    tags: ['metro', 'industrial', 'south'],
    effect: { growth: 15, change: 12 },
    popularityEffect: { target: 'minor', amount: 0.07 },
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

// ─── Party naming ────────────────────────────────────────────────────────────
//
// Derives a short, plausible party name from the party's political values.
// Major parties: 1–2 words, feel like real parties ("Conservatives", "Labour",
//   "Reform Party", "The Greens", "Progress Alliance").
// Minor parties: local/single-issue flavour ("Brindleford Residents",
//   "Save Our Streets", "Market Quarter Alliance", "Independent Voices").
//
// Political axes:
//   change:   negative = conservative/traditionalist, positive = reformist/progressive
//   growth:   positive = pro-business/enterprise, negative = anti-growth/careful
//   services: positive = high public services / welfare, negative = low-tax minimal

// Maps a party's values to a core ideology word or phrase
function ideologyWordFromValues(rng: () => number, values: PoliticalValues): string {
  const { change, growth, services } = values

  // Conservative/traditionalist: low change, any growth, low-to-mid services
  if (change < -15 && services < 30) {
    if (growth > 15) return pickOne(rng, ['Conservative', 'Unionist', 'Traditional', 'Moderate'])
    return pickOne(rng, ['Conservative', 'Traditional', 'Heritage', 'Unionist'])
  }

  // Pro-business / enterprise: pro-growth, moderate change, low services
  if (growth > 25 && change > -20 && services < 30) {
    return pickOne(rng, ['Enterprise', 'Progress', 'Reform', 'Prosperity', 'Business'])
  }

  // Labour / working class: high services, pro-worker
  if (services > 30 && change >= -10 && growth < 30) {
    return pickOne(rng, ['Labour', 'Workers', 'Community', 'Solidarity', 'People\'s'])
  }

  // Progressive / reform: high change, moderate services
  if (change > 25 && services >= 10) {
    return pickOne(rng, ['Progressive', 'Forward', 'Reform', 'New Democrats', 'Radical'])
  }

  // Green / environment: high change, low growth
  if (change > 20 && growth < 0) {
    return pickOne(rng, ['Green', 'Ecology', 'Sustainable', 'Environment'])
  }

  // Liberal / centrist: moderate on all axes
  if (Math.abs(change) < 20 && Math.abs(growth) < 20 && Math.abs(services) < 20) {
    return pickOne(rng, ['Liberal', 'Democratic', 'Civic', 'Alliance', 'Centre'])
  }

  // Default fallback
  return pickOne(rng, ['Independent', 'Local', 'Residents', 'Community'])
}

// Build a short, punchy major party name
function majorPartyName(rng: () => number, values: PoliticalValues): string {
  const ideologyWord = ideologyWordFromValues(rng, values)
  const r = rng()

  if (r < 0.30) {
    // Pluralised noun: "Conservatives", "Greens", "Progressives"
    const plurals: Record<string, string> = {
      Conservative: 'Conservatives',
      Labour: 'Labour',
      Green: 'Greens',
      Liberal: 'Liberals',
      Progressive: 'Progressives',
      Reform: 'Reform',
      Enterprise: 'Enterprise',
      Unionist: 'Unionists',
      Traditional: 'Traditionalists',
      Heritage: 'Heritage',
      Workers: 'Workers',
      Community: 'Community',
      Solidarity: 'Solidarity',
      Forward: 'Forward',
      Democratic: 'Democrats',
      Civic: 'Civic',
      Alliance: 'Alliance',
      Centre: 'Centrists',
      'New Democrats': 'New Democrats',
      Prosperity: 'Prosperity',
      Ecology: 'Ecologists',
      Sustainable: 'Sustainability',
      Environment: 'Environmentalists',
      Independent: 'Independents',
      Local: 'Local',
      Residents: 'Residents',
      "People's": "People's Party",
      Radical: 'Radicals',
      Business: 'Business Party',
      Moderate: 'Moderates',
    }
    return plurals[ideologyWord] ?? `${ideologyWord} Party`
  }

  if (r < 0.55) {
    // "[Ideology] Party"
    return `${ideologyWord} Party`
  }

  if (r < 0.75) {
    // "[Ideology] Alliance" / "[Ideology] Democrats" etc
    const suffixes = ['Alliance', 'Democrats', 'Union', 'Coalition']
    return `${ideologyWord} ${pickOne(rng, suffixes)}`
  }

  // "The [Ideology] [Short Suffix]"
  const shortSuffixes = ['Party', 'Group', 'Alliance']
  return `The ${ideologyWord} ${pickOne(rng, shortSuffixes)}`
}

// Build a local-flavoured minor party name
function minorPartyName(rng: () => number, values: PoliticalValues, townName: string): string {
  const r = rng()

  if (r < 0.28) {
    // Town-named: "Brindleford Independents", "Coppergate Residents"
    const localSuffixes = ['Independents', 'Residents', 'Ratepayers', 'Community Group', 'First']
    return `${townName} ${pickOne(rng, localSuffixes)}`
  }

  if (r < 0.52) {
    // Single-issue feel: "Residents First", "Save Our Streets", "Local Voice"
    const singleIssue = [
      'Residents First',
      'Local Voice',
      'Save Our Streets',
      'Residents United',
      'Neighbours First',
      'Our Town',
      'Community First',
      'Independent Residents',
      'Ratepayers Alliance',
      'Local Alliance',
      'The Residents\' Party',
      'Streets Ahead',
    ]
    return pickOne(rng, singleIssue)
  }

  if (r < 0.72) {
    // Slightly ideological minor: pull a softer adjective from values
    const { change, services } = values
    const adj = change > 20
      ? pickOne(rng, ['Forward', 'Progressive', 'Independent', 'Reform'])
      : services > 25
        ? pickOne(rng, ['Community', 'Local', 'Residents', 'Welfare'])
        : pickOne(rng, ['Independent', 'Local', 'Residents', 'Neighbourhood'])
    const minorSuffixes = ['Action', 'Voice', 'Forum', 'Network', 'Movement']
    return `${adj} ${pickOne(rng, minorSuffixes)}`
  }

  // "[Town] [Issue]" style
  const issueSuffixes = ['Greens', 'Independents', 'Residents Association', 'Alliance', 'Residents']
  return `${townName} ${pickOne(rng, issueSuffixes)}`
}

// Derive an ideology-matched slogan
function sloganFromValues(rng: () => number, values: PoliticalValues, tier: 'major' | 'minor' | 'custom'): string {
  const { change, growth, services } = values

  if (tier === 'minor') {
    return pickOne(rng, [
      'Your street, your voice.',
      'Small party, real results.',
      'Locals know best.',
      'One ward at a time.',
      'No party whips. Just common sense.',
      'For the people who live here.',
      'We actually turned up.',
    ])
  }

  // Ideology-matched for majors
  if (change < -15 && services < 30) {
    return pickOne(rng, [
      'Keep what works.',
      'Steady hands for steady streets.',
      'No grand experiments.',
      'Tradition, community, common sense.',
      'If it ain\'t broke, don\'t fix it.',
    ])
  }
  if (growth > 25 && services < 30) {
    return pickOne(rng, [
      'Open for business.',
      'Growth that works for all.',
      'A town that earns its keep.',
      'Enterprise, not excuses.',
      'More jobs, lower rates.',
    ])
  }
  if (services > 30 && change >= -10) {
    return pickOne(rng, [
      'Invest in every street.',
      'Good services, fair town.',
      'No one left behind.',
      'The council that delivers.',
      'Better services, full stop.',
    ])
  }
  if (change > 25) {
    return pickOne(rng, [
      'Time for a change.',
      'Bold ideas, real results.',
      'The old way isn\'t working.',
      'Let\'s do things differently.',
      'This town deserves better.',
    ])
  }
  if (change > 10 && growth < 0) {
    return pickOne(rng, [
      'People before profit.',
      'Protect what we love.',
      'Green streets, clean future.',
      'Our parks, our promise.',
    ])
  }

  // Centrist fallback
  return pickOne(rng, [
    'Getting things done.',
    'Sensible. Local. Effective.',
    'For every ward, every week.',
    'A friendlier town hall.',
    'Practical politics for real people.',
  ])
}

function createGeneratedParties(rng: () => number, blocs: FictionalBloc[], townName: string) {
  const sorted = [...blocs].sort((a, b) => b.weight - a.weight)
  const majorBlocs = sorted.slice(0, Math.min(3, sorted.length))
  const minorBlocs = sorted.slice(3)
  const parties: PartyDefinition[] = []
  const usedNames = new Set<string>()

  // Generate a unique name, retrying up to 8 times if there's a collision
  function uniqueName(gen: () => string): string {
    for (let i = 0; i < 8; i++) {
      const name = gen()
      if (!usedNames.has(name)) {
        usedNames.add(name)
        return name
      }
    }
    // Fallback: append a number
    const base = gen()
    usedNames.add(base)
    return base
  }

  majorBlocs.forEach((bloc, index) => {
    const values = addValues(bloc.center, {
      change: gaussian(rng, 0, 4),
      growth: gaussian(rng, 0, 4),
      services: gaussian(rng, 0, 4),
    })
    parties.push({
      id: `party-major-${index + 1}`,
      name: uniqueName(() => majorPartyName(rng, values)),
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
      slogan: sloganFromValues(rng, values, 'major'),
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
      name: uniqueName(() => minorPartyName(rng, values, townName)),
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
      slogan: sloganFromValues(rng, values, 'minor'),
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
  const values = scores.map((score) => Math.exp((score - max) / SOFTMAX_TEMP))
  const total = values.reduce((sum, value) => sum + value, 0)
  return values.map((value) => value / total)
}

function applyTacticalSqueeze(rankings: TilePartyPreference[], constituency?: Constituency): TilePartyPreference[] {
  if (rankings.length <= 2) return rankings

  const sorted = [...rankings].sort((a, b) => b.support - a.support)
  const secondPlaceSupport = sorted[1]?.support ?? 0
  let squeezedSupport = 0

  for (let index = 2; index < sorted.length; index += 1) {
    const party = sorted[index]
    const gapFromSecond = secondPlaceSupport - party.support
    const gapIntensity = clamp((gapFromSecond - 5) / 15, 0, 1)
    const pressure = constituency?.tacticalPressure?.[party.partyId] ?? 1
    const loss = party.support * 0.15 * gapIntensity * pressure
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
  const tierMatch = current.popularityEffect.target === party.tier ||
    (current.popularityEffect.target === 'minor' && party.tier === 'custom')
  if (tierMatch) return current.popularityEffect.amount
  return 0
}

function scorePartyForTile(world: World, seat: Constituency | undefined, tile: PopulationTile, party: PartyDefinition) {
  // 1. Amplified wardFit: stronger bloc match → much stronger home-ward advantage
  const wardFit = party.seedBlocId ? (tile.blocMix[party.seedBlocId] ?? 0) * (party.tier === 'major' ? 1.8 : 0.9) : 0.15
  const focus = seat && party.focusSeatIds.includes(seat.id) ? 0.18 : 0
  // 2. Organization has more range: clearly separates well-organised from weak parties
  const organization = Math.log(party.organization + 1) * 0.55
  // 3. Tag bonus raised: home-turf tags meaningfully reinforce strength
  const tagBonus = party.strategyTags.reduce((sum, tag) => sum + (tile.tags.includes(tag) ? 0.20 : 0), 0)
  // 4. Tighter issueFit: ideological distance hurts more — mismatched parties lose real ground
  const issueFit = -valueDistance(tile.values, party.values, tile.salience) / ISSUE_FIT_SCALE
  const eventBonus = world.currents.reduce((sum, current) => sum + partyEventBonus(party, current, tile.tags), 0)
  // Campaign boost from canvassing/ads/rally
  const wardBoost = seat ? (party.wardBoosts[seat.id] ?? 0) : 0
  const tileBoost = (tile.campaignBoosts?.[party.id] ?? 0)
  // 5. Incumbency bonus — two tiers:
  //    a) Current poll leader in this ward: tiny name-recognition advantage (+0.04)
  //    b) Elected incumbent (won the seat at the last actual election): moderate boost (+0.10)
  //    These stack, so an elected incumbent who is also currently leading gets +0.14 total.
  //    Kept intentionally modest so sustained campaigning can realistically unseat them.
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
      const isCompetitive = leaderShare - result.voteShare <= 5
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
        party.baseUtility * 0.95 + gaussian(rng, 0, party.tier === 'major' ? 0.02 : 0.015),
        -1.2, 1.2,
      ),
      // Momentum also much calmer — only noticeable after a rally or event response
      momentum: clamp(party.momentum * 0.65 + gaussian(rng, 0, 0.03), -0.7, 0.7),
      // Reset AI action points each week (players get theirs in App)
      aiActionPoints: isPlayer ? party.aiActionPoints : (party.tier === 'major' ? 3 : 2),
      // Decay ward boosts more slowly — canvass effect lasts ~4 weeks
      wardBoosts: Object.fromEntries(
        Object.entries(party.wardBoosts).map(([k, v]) => [k, v * WARD_BOOST_DECAY]),
      ),
    }
  })
}

// ─── AI campaigning ──────────────────────────────────────────────────────────
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

  const targetResultInInitiatorWard = initiatorWard.results.find((r) => r.partyId === targetId)
  const initiatorResultInTargetWard = targetWard.results.find((r) => r.partyId === initiatorId)
  const targetStandingInTargetWard = targetWard.results.find((r) => r.partyId === targetId)

  const leaderShare = targetWard.results[0]?.voteShare ?? 1
  const targetWinningInRequested = Math.min(1, (targetStandingInTargetWard?.voteShare ?? 0) / Math.max(1, leaderShare)) * 0.40
  const isLeading = targetWard.leadingPartyId === targetId && (targetWard.margin ?? 0) > 8
  const targetHopelessInInitiator = isLeading
    ? -0.30
    : Math.max(0, 1 - (targetResultInInitiatorWard?.voteShare ?? 0) / 25) * 0.30
  const initiatorCloseInTarget = Math.min(1, (initiatorResultInTargetWard?.voteShare ?? 0) / 25) * 0.25

  // Incumbent check: if target won this ward at the last election, they refuse outright
  const isIncumbent = world.electionsHeld >= 1 && world.electionNightResults.some(
    (r) => r.wardId === targetWardId && r.winner?.partyId === targetId
  )
  if (isIncumbent) return STANDING_DOWN_SCORE

  const valueDist = valueDistance(initiatorParty.values, targetParty.values, { change: 1, growth: 1, services: 1 })
  const ideologicalBonus = Math.max(0, 1 - valueDist / ALLIANCE_IDEOLOGY_SCALE)
  const repKey = [initiatorId, targetId].sort().join('_')
  const repPenalty = (world.allianceReputation[repKey] ?? 0) * 0.15

  const asymmetryBonus = Math.max(0, (targetHopelessInInitiator - initiatorCloseInTarget) * 0.5)
  const initiatorShare = initiatorWard.results.find((r) => r.partyId === initiatorId)?.voteShare ?? 0
  const endorsementValueBonus = (initiatorShare / 100) * 0.30

  return targetHopelessInInitiator + initiatorCloseInTarget + asymmetryBonus + endorsementValueBonus + ideologicalBonus * 0.25 - repPenalty - targetWinningInRequested
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
  const totalChance = Math.max(0.05, Math.min(0.85, baseChance + multiBonus))
  const roll = acceptanceSeed(world, initiatorId, targetId, initiatorWardId, targetWardId)
  return { accepted: roll < totalChance, chance: Math.round(totalChance * 100), roll: Math.round(roll * 100) }
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
          const initClose = initShare > 0 && initWard.results[0].voteShare - initShare < 5
          if (initClose) continue
          const initIsIncumbent = world.electionsHeld >= 1 && world.electionNightResults.some(
            (r) => r.wardId === initWard.id && r.winner?.partyId === party.id,
          )
          if (initIsIncumbent) continue
          const initStrength = Math.max(0, initShare / 40)
          const initLeading = initWard.leadingPartyId === party.id && initWard.margin > 8
          for (const targWard of world.constituencies) {
            if (initWard.id === targWard.id) continue
            if (targCommittedWards.has(targWard.id)) continue
            const targShare = targWard.results.find((r) => r.partyId === target.id)?.voteShare ?? 0
            const targClose = targShare > 0 && targWard.results[0].voteShare - targShare < 5
            if (targClose) continue
            const targStrength = Math.max(0, targShare / 40)
            const targLeading = targWard.leadingPartyId === target.id && targWard.margin > 8
            const pairScore = (initLeading ? initStrength * 0.2 : initStrength * 0.5) +
              (targLeading ? targStrength * 0.2 : targStrength * 0.5)
            if (pairScore > bestScore) {
              bestScore = pairScore
              bestPair = { initWard: initWard.id, targWard: targWard.id }
            }
          }
        }

        if (bestPair) {
          const chance = evaluateAllianceAcceptance(world, party.id, target.id, bestPair.initWard, bestPair.targWard)
          const accepted = chance > STANDING_DOWN_SCORE + 1 && rng() < Math.max(0.05, Math.min(0.85, chance))

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
            const initClose = initShare > 0 && initWard.results[0].voteShare - initShare < 5
            if (initClose) continue
            const initIsIncumbent = world.electionsHeld >= 1 && world.electionNightResults.some(
              (r) => r.wardId === initWard.id && r.winner?.partyId === party.id,
            )
            if (initIsIncumbent) continue
            const initStrength = Math.max(0, initShare / 40)
          const initLeading = initWard.leadingPartyId === party.id && initWard.margin > 8
            for (const targWard of world.constituencies) {
              if (initWard.id === targWard.id) continue
              if (playerCommittedWards.has(targWard.id)) continue
              const targShare = targWard.results.find((r) => r.partyId === world.playerPartyId)?.voteShare ?? 0
              const targStrength = Math.max(0, targShare / 40)
              const targLeading = targWard.leadingPartyId === world.playerPartyId && targWard.margin > 8
              const pairScore = (initLeading ? initStrength * 0.2 : initStrength * 0.5) +
                (targLeading ? targStrength * 0.2 : targStrength * 0.5)
              if (pairScore > bestScore2) {
                bestScore2 = pairScore
                bestPair2 = { initWard: initWard.id, targWard: targWard.id }
              }
            }
          }
          if (bestPair2) {
            const chance2 = evaluateAllianceAcceptance(world, party.id, world.playerPartyId, bestPair2.initWard, bestPair2.targWard)
            const accepted2 = chance2 > STANDING_DOWN_SCORE + 1 && rng() < Math.max(0.05, Math.min(0.85, chance2))
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
  if (world.playerActionPoints < action.apCost) {
    return { world, result: { action, outcome: 'neutral', description: `You need ${action.apCost} AP for ${action.label}.` } }
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
          acceptedEntries.push(entry)
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
    playerActionPoints: world.playerActionPoints - action.apCost,
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

  // Create parties first (before constituencies, since constituencies need candidates)
  let parties = [...createGeneratedParties(rng, blocs, townName), ...convertCustomParties(options.customParties)]

  const tiles = createPopulationTiles(rng, landmass.points, centers, blocs)
  const generatedConstituencies = createConstituencies(rng, tiles, options.constituencyCount, parties)
  const constituencies = generatedConstituencies.map((constituency) => ({
    ...constituency,
    tacticalPressure: Object.fromEntries(parties.map((party) => [party.id, 1])),
  }))
  parties = assignPartyFocus(parties, constituencies)

  // Player is the LAST major party — starting behind as underdog
  const majorParties = parties.filter((p) => p.tier === 'major')
  const defaultPlayerPartyId = options.playerPartyId && parties.some((p) => p.id === options.playerPartyId)
    ? options.playerPartyId
    : majorParties[majorParties.length - 1]?.id ?? parties[0]?.id ?? ''

  parties = parties.map((p) => {
    if (p.id === defaultPlayerPartyId) {
      return { ...p, baseUtility: p.baseUtility - 0.08, organization: p.organization * 0.9 }
    }
    return p
  })

  const electionCycleWeeks = 24
  // Start 8–20 weeks before the first election so you can campaign
  const weeksUntilElection = Math.floor(randomBetween(rng, 8, 20))
  const currents = shuffle(issueCurrents, rng).slice(0, 3).map<GeographicCurrent>((current) => ({
    ...current,
    intensity: randomBetween(rng, 0.7, 1.25),
  }))

  const incumbent = pickOne(rng, majorParties.filter((p) => p.id !== defaultPlayerPartyId))

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
    currentMayorParty: incumbent?.name ?? majorParties[0]?.name ?? '',
    currentMayorLeader: incumbent?.leader ?? majorParties[0]?.leader ?? '',
    electionCycleWeeks,
    weeksUntilElection,
    playerActionPoints: 5,
    maxActionPoints: 5,
    activeCampaigns: [] as ActiveCampaign[],
    actionsThisWeek: [] as ActionResult[],
    weeklyEvent: pickWeeklyEvent(rng),
    newsFeed: [`Welcome to ${townName}. You are building a local political career. Election in ${weeksUntilElection} weeks.`],
    voteHistory: [] as VoteHistoryEntry[],
    isGoverning: false,
    governanceDecisions: [] as GovernanceDecision[],
    electionNightActive: false,
    electionNightResults: [],
    electionNightRevealIndex: 0,
    electionNightPreviousSeats: {},
    electionsHeld: 0,
    policyShiftUsedThisCycle: false,
    alliancePacts: [] as AlliancePact[],
    allianceReputation: {} as Record<string, number>,
    needsCoalition: false,
    minorityGovernment: false,
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
      finalWorld.maxActionPoints = 6
      finalWorld.playerActionPoints = 6
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
    // Reset player AP for new week, then subtract permanent campaign drains (capped at 3 AP/week)
    playerActionPoints: Math.max(0, world.maxActionPoints - Math.min(3, world.activeCampaigns.reduce((sum, c) => sum + c.apCostPerTurn, 0))),
    actionsThisWeek: [] as ActionResult[],
    // New weekly event
    weeklyEvent: pickWeeklyEvent(rng),
    policyShiftUsedThisCycle: world.weeksUntilElection === 0 ? false : world.policyShiftUsedThisCycle,
    voteHistory: [...world.voteHistory, historyEntry].slice(-52),
  }

  // Apply permanent campaign boosts (ward boosts carry-forward through evolveParties decay, so re-apply each week)
  const provisionalWithCampaigns = (() => {
    if (world.activeCampaigns.length === 0) return provisional as World
    let partiesWithBoosts = [...provisional.parties]
    for (const campaign of world.activeCampaigns) {
      if (!campaign.wardId) continue
      const boostAmount = campaign.type === 'canvass' ? 0.06
        : campaign.type === 'ads' ? 0.08
        : campaign.type === 'fix_potholes' ? 0.05
        : campaign.type === 'improve_bins' ? 0.04
        : 0.05
      partiesWithBoosts = partiesWithBoosts.map((p) =>
        p.id === world.playerPartyId
          ? { ...p, wardBoosts: { ...p.wardBoosts, [campaign.wardId!]: clamp((p.wardBoosts[campaign.wardId!] ?? 0) + boostAmount, 0, 0.55) } }
          : p,
      )
    }
    return { ...provisional, parties: partiesWithBoosts } as World
  })()

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
    currentMayorParty: electionHappening && seatLeader ? seatLeader.partyName : world.currentMayorParty,
    currentMayorLeader: electionHappening && seatLeader ? seatLeader.leader : world.currentMayorLeader,
    electionNightActive: electionHappening,
    electionNightResults: sortedResults,
    electionNightRevealIndex: 0,
    electionNightPreviousSeats,
    electionsHeld: world.electionsHeld + (electionHappening ? 1 : 0),
    isGoverning: electionHappening ? playerWon : world.isGoverning,
    governanceDecisions: electionHappening ? [] : world.governanceDecisions,
    needsCoalition: electionHappening && !playerWon && !results.nationalResults.some((r) => r.seatsWon >= majority),
    minorityGovernment: electionHappening ? false : world.minorityGovernment,
    coalitionPartnerId: electionHappening ? undefined : world.coalitionPartnerId,
    newsFeed: [...newsFeedLines.map((l) => `Week ${world.week + 1}: ${l}`), ...world.newsFeed].slice(0, 30),
    alliancePacts: world.alliancePacts,
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
  let autoApDrain = 0
  const politicianNews: string[] = []
  if (politicianMode) {
    const pol = politicianMode.politician
    const approvalDecay = pol.personalApproval * 0.03
    const relationshipDecay = pol.isIncumbent ? 1 : 0.5
    const decayedRelationships = pol.relationships.map((r) => ({
      ...r,
      strength: r.strength > 0 ? r.strength - relationshipDecay : r.strength < 0 ? r.strength + relationshipDecay : 0,
    }))
    politicianMode = {
      ...politicianMode,
      politician: { ...pol, personalApproval: pol.personalApproval - approvalDecay, relationships: decayedRelationships },
    }
    if (politicianMode.autoCampaigns.length > 0) {
      let autoPol = politicianMode.politician
      let autoParties = merged.parties
      const autoRng = createRng(world.seed + (world.week + 1) * 9991)
      for (const actionType of politicianMode.autoCampaigns) {
        if (actionType === 'hold_surgery' && !autoPol.isIncumbent) continue
        const cost = actionType === 'attend_event' ? 0 : actionType === 'local_media' || actionType === 'call_party_support' || actionType === 'smear_opponent' ? 2 : 1
        if (autoApDrain + cost > merged.playerActionPoints) break
        autoApDrain += cost
        let approvalGain = 0
        let repGain = 0
        let infGain = 0
        switch (actionType) {
          case 'door_knock': approvalGain = 0.05 + autoRng() * 0.04; break
          case 'hold_surgery': approvalGain = 0.04 + autoRng() * 0.03; repGain = 2; break
          case 'leaflet_drop': repGain = 4 + Math.floor(autoRng() * 3); approvalGain = 0.02; break
          case 'local_media': if (autoRng() < 0.2) { approvalGain = -0.04; repGain = -3 } else { approvalGain = 0.06; repGain = 5 } break
          case 'call_party_support': {
            if (autoPol.partyLoyalty >= 30) {
              const wardBoostAmount = (0.08 + autoRng() * 0.04) * (autoPol.partyLoyalty / 100)
              autoParties = autoParties.map((party) => party.id === world.playerPartyId
                ? { ...party, wardBoosts: { ...party.wardBoosts, [autoPol.wardId]: clamp((party.wardBoosts[autoPol.wardId] ?? 0) + wardBoostAmount, 0, 0.45) } }
                : party)
              autoPol = { ...autoPol, partyLoyalty: clamp(autoPol.partyLoyalty + 3, 0, 100) }
            }
            break
          }
          case 'smear_opponent': if (autoRng() < 0.3) { approvalGain = -0.06 } else { approvalGain = 0.04 } break
          case 'attend_event': infGain = 1; break
          default: approvalGain = 0.02; infGain = 1; break
        }
        autoPol = {
          ...autoPol,
          personalApproval: clamp(autoPol.personalApproval + approvalGain, -1, 1),
          reputation: clamp(autoPol.reputation + repGain, 0, 100),
          influence: clamp(autoPol.influence + infGain, 0, 100),
        }
      }
      politicianMode = { ...politicianMode, politician: autoPol }
      merged.parties = autoParties
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
        { week: world.week + 1, description: wonSeat ? 'Won seat' : pol.wardId ? 'Lost seat' : 'Remained without a seat', tier: pol.careerTier },
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
          personalValues: party ? { ...party.values } : { change: 0, growth: 0, services: 0 },
          rebellionTendency: existing?.rebellionTendency ?? rng() * 0.4,
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
    politicianMode = {
      ...politicianMode,
      politician: { ...updatedPol, relationships: updatedRelationships },
      councillors: updatedCouncillors,
      nextSessionWeek: firstTerm ? merged.week + politicianMode.councilSessionInterval : politicianMode.nextSessionWeek,
    }
  }

  const stats = buildStats(merged)
  return {
    ...merged,
    stats,
    politicianMode,
    newsFeed: politicianNews.length > 0 ? [`Week ${merged.week}: ${politicianNews[0]}`, ...merged.newsFeed].slice(0, 30) : merged.newsFeed,
    playerActionPoints: Math.max(0, merged.playerActionPoints - autoApDrain),
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
    const playerResult = ourWard.results.find((r) => r.partyId === world.playerPartyId)
    const playerShare = playerResult?.voteShare ?? 0
    if (playerResult && playerResult.partyId === ourWard.leadingPartyId && ourWard.margin > 15) continue

    for (const theirWard of world.constituencies) {
      if (ourWard.id === theirWard.id) continue
      if (allyCommitted.has(theirWard.id)) continue
      const allyResult = theirWard.results.find((r) => r.partyId === allyPartyId)
      const allyShare = allyResult?.voteShare ?? 0
      if (allyResult && allyResult.partyId === theirWard.leadingPartyId && theirWard.margin > 15) continue

      const playerWeakness = Math.max(0, 1 - playerShare / 40)
      const allyStrength = Math.max(0, allyShare / 40)
      const playerLeading = playerResult?.partyId === ourWard.leadingPartyId && ourWard.margin > 8
      const allyLeading = allyResult?.partyId === theirWard.leadingPartyId && theirWard.margin > 8
      const playerCompetitiveness = playerResult && playerResult.partyId !== ourWard.leadingPartyId
        ? Math.max(0, 1 - ourWard.margin / 20)
        : 0
      const endorsementValue = allyShare * 0.01
      const score = (playerLeading ? playerWeakness * 0.1 : playerWeakness * 0.3) +
        (allyLeading ? allyStrength * 0.1 : allyStrength * 0.3) +
        playerCompetitiveness * 0.2 + Math.min(1, endorsementValue * 5) * 0.2

      // AI acceptance — ally refuses if they're leading or incumbent
      const isIncumbentHere = world.electionsHeld >= 1 && world.electionNightResults.some(
        (r) => r.wardId === theirWard.id && r.winner?.partyId === allyPartyId
      )
      const incumbencyPenalty = isIncumbentHere ? 0.70 : 0

      const valueDist = valueDistance(playerParty.values, allyParty.values, { change: 1, growth: 1, services: 1 })
      const ideologicalBonus = Math.max(0, 1 - valueDist / 8000)
      const repKey = [world.playerPartyId, allyPartyId].sort().join('_')
      const repPenalty = (world.allianceReputation[repKey] ?? 0) * 0.15

      // Could the endorsement flip the ward?
      const playerInTheirWard = theirWard.results.find((r) => r.partyId === world.playerPartyId)
      const playerInTheirShare = playerInTheirWard?.voteShare ?? 0
      const boost = allyShare * 0.01
      const estimatedGain = boost * 25
      const currentLeader = theirWard.results[0]
      const couldFlip = currentLeader && currentLeader.partyId !== world.playerPartyId && playerInTheirShare + estimatedGain > (currentLeader.voteShare ?? 0)
      const flipDelta = couldFlip
        ? `+${estimatedGain.toFixed(1)}% → flip from ${currentLeader!.partyName} to ${playerParty?.name ?? 'you'}`
        : undefined

      if (score > 0.05) {
        const breakdown: { label: string; value: string }[] = []

        const targetInOurWard = ourWard.results.find((r) => r.partyId === allyPartyId)?.voteShare ?? 0
        const targetHopeless = allyLeading
          ? -0.30
          : (1 - targetInOurWard / 25) * 0.30
        const targetHopelessPct = Math.round(targetHopeless * 100)

        const ourInTheirWard = theirWard.results.find((r) => r.partyId === world.playerPartyId)?.voteShare ?? 0
        const initiatorClose = Math.min(1, ourInTheirWard / 25) * 0.25
        const initiatorClosePct = Math.round(initiatorClose * 100)

        const ideologyPct = Math.round(ideologicalBonus * 0.25 * 100)
        const repPct = Math.round(repPenalty * 100)
        const incPct = Math.round(incumbencyPenalty * 100)

        const targWinningRequested = allyResult
          ? Math.min(1, allyShare / Math.max(1, theirWard.results[0]?.voteShare ?? 100)) * 0.40
          : 0
        const sacrificePct = Math.round(targWinningRequested * 100)

        if (Math.abs(targetHopelessPct) > 0) {
          breakdown.push({ label: 'Their chances here', value: `${targetHopelessPct > 0 ? '+' : ''}${targetHopelessPct}%` })
        }
        if (initiatorClosePct > 0) {
          breakdown.push({ label: 'Your position there', value: `+${initiatorClosePct}%` })
        }
        if (ideologyPct > 0) {
          breakdown.push({ label: 'Ideology match', value: `+${ideologyPct}%` })
        }
        if (repPct > 0) {
          breakdown.push({ label: 'Past broken pacts', value: `-${repPct}%` })
        }
        if (sacrificePct > 0) {
          breakdown.push({ label: 'Sacrifice penalty', value: `-${sacrificePct}%` })
        }
        if (incPct > 0) {
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
          score,
          acceptanceChance: det.chance,
          acceptanceRoll: det.roll,
          multiBonus: Math.round(Math.min(0.50, totalSacrifice * 1.5) * 100),
          willAccept: det.accepted,
          couldFlip,
          flipDelta,
          breakdown,
        })
      }
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

  const allyResult = theirWard.results.find((r) => r.partyId === allyPartyId)
  const allyShare = allyResult?.voteShare ?? 0
  const allyLeading = allyResult?.partyId === theirWard.leadingPartyId && theirWard.margin > 8

  // Collect wards the player is already committed to
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
    const playerResult = ourWard.results.find((r) => r.partyId === world.playerPartyId)
    const playerShare = playerResult?.voteShare ?? 0
    if (playerResult && playerResult.partyId === ourWard.leadingPartyId && ourWard.margin > 15) continue

    const playerLeading = playerResult?.partyId === ourWard.leadingPartyId && ourWard.margin > 8
    const isIncumbentHere = world.electionsHeld >= 1 && world.electionNightResults.some(
      (r) => r.wardId === theirWard.id && r.winner?.partyId === allyPartyId
    )
    const incumbencyPenalty = isIncumbentHere ? 0.70 : 0
    const playerStrength = Math.max(0, playerShare / 40)
    const endorsementValue = playerShare * 0.01
    const score = (playerLeading ? playerStrength * 0.2 : playerStrength * 0.5) +
      Math.min(1, endorsementValue * 5) * 0.3 +
      (allyLeading ? 0 : allyShare / 40 * 0.2)

    if (score > 0.02) {
      const boost = allyShare * 0.01
      const estimatedGain = boost * 25
      const currentLeader = theirWard.results[0]
      const playerInAllyWard = theirWard.results.find((r) => r.partyId === world.playerPartyId)
      const couldFlip = currentLeader && currentLeader.partyId !== world.playerPartyId &&
        (playerInAllyWard?.voteShare ?? 0) + estimatedGain > (currentLeader.voteShare ?? 0)

      const breakdown: { label: string; value: string }[] = []

      const allyHope = allyLeading
        ? -0.30
        : Math.max(0, 1 - allyShare / 25) * 0.30
      const playerHope = Math.max(0, 1 - playerShare / 25) * 0.25
      const playLead = (playerLeading ? ourWard.margin / 15 : 0) * 0.60

      if (allyLeading) {
        breakdown.push({ label: 'They\'re leading here', value: `-${Math.round(0.30 * 100)}%` })
      } else if (allyHope > 0) {
        breakdown.push({ label: 'They\'re not leading', value: `+${Math.round(allyHope * 100)}%` })
      }
      if (playerHope > 0) {
        breakdown.push({ label: 'Your endorsement', value: `+${Math.round(playerHope * 100)}%` })
      }
      if (playLead > 0) {
        breakdown.push({ label: 'You\'re leading here', value: `-${Math.round(playLead * 100)}%` })
      }
      const theirShareInOurWard = ourWard.results.find((r) => r.partyId === allyPartyId)?.voteShare ?? 0
      if (theirShareInOurWard > 0) {
        breakdown.push({ label: 'Their votes here', value: `${theirShareInOurWard.toFixed(1)}%` })
      }
      if (incumbencyPenalty > 0) {
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
        score,
        acceptanceChance: det2.chance,
        acceptanceRoll: det2.roll,
        multiBonus: 0,
        willAccept: det2.accepted,
        couldFlip,
        flipDelta: couldFlip ? `+${estimatedGain.toFixed(1)}% → flip from ${currentLeader!.partyName} to ${playerParty?.name ?? 'you'}` : undefined,
        breakdown,
      })
    }
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
    totalBudget: 350,
    categories: [
      { id: 'roads',      label: 'Roads & Potholes',     funding: 50, blocs: ['workshop_crews', 'market_regulars'] },
      { id: 'buses',      label: 'Buses & Transport',     funding: 50, blocs: ['river_walkers', 'college_corner'] },
      { id: 'parks',      label: 'Parks & Recreation',    funding: 50, blocs: ['river_walkers', 'pondside_peacemakers'] },
      { id: 'libraries',  label: 'Libraries & Culture',   funding: 50, blocs: ['old_town_loyalists', 'college_corner'] },
      { id: 'bins',       label: 'Bins & Recycling',      funding: 50, blocs: ['hill_street_households', 'market_regulars'] },
      { id: 'safety',     label: 'Community Safety',      funding: 50, blocs: ['pondside_peacemakers', 'hill_street_households'] },
      { id: 'youth',      label: 'Youth Services',        funding: 50, blocs: ['college_corner', 'workshop_crews'] },
    ],
  }
}

// ─── Single-Politician Mode ────────────────────────────────────────────

const TRAIT_POOL: PoliticianTrait[] = [
  { id: 'local-roots', label: 'Local Roots', effect: '+20% door-knock effectiveness', modifier: { approvalGain: 0.2 } },
  { id: 'media-savvy', label: 'Media Savvy', effect: 'Halved gaffe risk on media appearances', modifier: { reputationGain: 0.3 } },
  { id: 'policy-wonk', label: 'Policy Wonk', effect: '+2 influence per council session', modifier: { influenceGain: 0.25 } },
  { id: 'peoples-champion', label: "People's Champion", effect: '+30% surgery approval gains', modifier: { approvalGain: 0.3 } },
  { id: 'maverick', label: 'Maverick', effect: 'Rebellion loyalty cost reduced by 4', modifier: { rebellionCostReduction: 4 } },
  { id: 'networker', label: 'Networker', effect: 'Relationships gain +2 strength per session', modifier: { influenceGain: 0.15 } },
  { id: 'fundraiser', label: 'Fundraiser', effect: '+1 AP per week maximum', modifier: {} },
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
    personalValues: { ...playerParty.values },
    personalPolicyNextWeek: world.week,
    reputation: 20,
    relationships: [],
    traits: assignedTraits,
    careerHistory: [{ week: world.week, description: wardId ? 'Selected as candidate' : 'Joined the local party', tier: 'backbencher' }],
    personalFunds: 3,
    influence: 5,
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
        personalValues: party ? { ...party.values } : { change: 0, growth: 0, services: 0 },
        rebellionTendency: rng() * 0.4,
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
    strength: c.partyId === world.playerPartyId ? 20 : 0,
    history: [],
  }))

  return {
    politician,
    councillors,
    currentSession: undefined,
    sessionHistory: [],
    nextSessionWeek: world.week + 4,
    councilSessionInterval: 4,
    autoCampaigns: [],
    legislationHistory: [],
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
    personalValues: party ? { ...party.values } : { change: 0, growth: 0, services: 0 },
    rebellionTendency: rng() * 0.4,
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
      strength: councillor.partyId === politician.partyId ? 20 : 0,
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
    careerHistory: [...pol.careerHistory, { week: world.week, description: `Selected to contest ${ward.name}`, tier: pol.careerTier }],
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

export function getPoliticianActions(world: World): PoliticianActionMeta[] {
  if (!world.politicianMode) return []
  const pol = world.politicianMode.politician
  const usedAttendEvent = world.actionsThisWeek.some((a) => a.action.label === 'Attend local event')
  const hasLocalRoots = pol.traits.some((t) => t.id === 'local-roots')
  const hasChampion = pol.traits.some((t) => t.id === 'peoples-champion')
  const hasMediaSavvy = pol.traits.some((t) => t.id === 'media-savvy')

  const actions: PoliticianActionMeta[] = [
    { type: 'door_knock', label: 'Door-knock streets', description: 'Knock on doors to build personal support.', apCost: 1, category: 'grassroots', expectedEffect: '+5–9% approval', traitBonus: hasLocalRoots ? 'Local Roots: +20%' : undefined },
    { type: 'leaflet_drop', label: 'Leaflet drop', description: 'Distribute leaflets for name recognition.', apCost: 1, category: 'communications', expectedEffect: '+4–7 reputation, +2% approval' },
    { type: 'local_media', label: 'Local media', description: 'Appear on local radio or newspaper.', apCost: 2, category: 'communications', expectedEffect: '+6–10% approval, +5–9 rep', riskDescription: hasMediaSavvy ? '10% gaffe risk' : '20% gaffe risk', traitBonus: hasMediaSavvy ? 'Media Savvy: halved risk' : undefined },
    { type: 'call_party_support', label: 'Call in party support', description: 'Request HQ resources for your ward.', apCost: 2, category: 'political', expectedEffect: 'Ward boost + loyalty' },
    { type: 'smear_opponent', label: 'Smear opponent', description: 'Attack the leading rival candidate.', apCost: 2, category: 'political', expectedEffect: '+4–7% approval', riskDescription: '30% backfire risk' },
    { type: 'shift_personal_policy', label: 'Set personal position', description: 'Move your own public position without changing the party platform.', apCost: 1, category: 'political', expectedEffect: 'Personal ward fit shifts', riskDescription: world.week < pol.personalPolicyNextWeek ? `Available again in week ${pol.personalPolicyNextWeek}` : 'May reduce party loyalty if you diverge' },
  ]
  if (pol.isIncumbent) {
    actions.splice(1, 0, { type: 'hold_surgery', label: 'Hold surgery', description: 'Meet constituents face-to-face as their councillor.', apCost: 1, category: 'grassroots', expectedEffect: '+4–7% approval, +2 rep', traitBonus: hasChampion ? "People's Champion: +30%" : undefined })
  }
  if (!usedAttendEvent) {
    actions.push({ type: 'attend_event', label: 'Attend local event', description: 'Show up at a community event and build local connections.', apCost: 0, category: 'grassroots', expectedEffect: '+1 influence' })
  }
  return actions
}

export function getPoliticianActionsByCategory(world: World): Array<{ category: ActionCategory; label: string; actions: PoliticianActionMeta[] }> {
  const all = getPoliticianActions(world)
  const groups: Array<{ category: ActionCategory; label: string; actions: PoliticianActionMeta[] }> = [
    { category: 'grassroots', label: 'Ground Game', actions: all.filter((a) => a.category === 'grassroots') },
    { category: 'communications', label: 'Outreach', actions: all.filter((a) => a.category === 'communications') },
    { category: 'political', label: 'Power Plays', actions: all.filter((a) => a.category === 'political') },
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
  if (world.playerActionPoints < action.apCost) {
    return { world, result: { action, outcome: 'neutral', description: `You need ${action.apCost} AP for ${action.label}.` } }
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
      description = `You knocked on doors across ${world.constituencies.find((c) => c.id === pol.wardId)?.name ?? 'your ward'}. Constituents appreciated the personal touch.`
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
      reputationDelta = 4 + Math.floor(rng() * 3)
      approvalDelta = 0.02
      description = 'Leaflets distributed across the ward. Your name recognition improved.'
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
      const loyaltyFactor = pol.partyLoyalty / 100
      const wardBoostAmount = (0.08 + rng() * 0.04) * loyaltyFactor
      if (pol.partyLoyalty < 30) {
        outcome = 'neutral'
        description = 'Party HQ declined your request. Your loyalty score is too low for them to invest resources.'
        break
      }
      const updatedParties = world.parties.map((p) =>
        p.id === world.playerPartyId
          ? { ...p, wardBoosts: { ...p.wardBoosts, [pol.wardId]: clamp((p.wardBoosts[pol.wardId] ?? 0) + wardBoostAmount, 0, 0.45) } }
          : p,
      )
      loyaltyDelta = 3
      description = pol.partyLoyalty < 60
        ? 'Party HQ sent limited resources — your loyalty record has them cautious.'
        : 'Party HQ sent activists and resources to your ward. The campaign feels stronger.'
      const updatedWorld = { ...world, parties: updatedParties }
      const newPol = { ...pol, partyLoyalty: clamp(pol.partyLoyalty + loyaltyDelta, 0, 100) }
      return {
        world: {
          ...updatedWorld,
          playerActionPoints: world.playerActionPoints - action.apCost,
          actionsThisWeek: [...world.actionsThisWeek, { action: { type: 'canvass', label: action.label, description: action.description, apCost: action.apCost, wardId: pol.wardId }, outcome, description, wardName: world.constituencies.find((c) => c.id === pol.wardId)?.name }],
          politicianMode: { ...pm, politician: newPol },
        },
        result: { action, outcome, description, loyaltyDelta },
      }
    }
    case 'attend_event': {
      influenceDelta = 1
      description = 'You attended the community fair and strengthened your local political network.'
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
        careerHistory: [...pol.careerHistory, { week: world.week, description: `Set personal position on ${axisLabel}`, tier: pol.careerTier }],
      }
      return {
        world: {
          ...world,
          playerActionPoints: world.playerActionPoints - action.apCost,
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
      playerActionPoints: world.playerActionPoints - action.apCost,
      actionsThisWeek: [...world.actionsThisWeek, { action: { type: 'canvass', label: action.label, description: action.description, apCost: action.apCost, wardId: pol.wardId }, outcome, description, wardName }],
      politicianMode: { ...pm, politician: newPol },
    },
    result: { action, outcome, description, approvalDelta, reputationDelta, influenceDelta, loyaltyDelta },
  }
}

// ─── Council Chamber System ─────────────────────────────────────────────────

interface MotionTemplate {
  pattern: string
  descPattern: string
  category: MotionCategory
  baseLean: Partial<PoliticalValues>
  baseBlocImpact: Record<string, number>
}

const LOCATIONS = [
  'High Street', 'Market Square', 'the industrial estate', 'Riverside Path',
  'the school grounds', 'the old library site', 'Station Road', 'Church Lane',
  'the recreation ground', 'Oak Park', 'the town centre', 'Mill Lane',
  'the allotments', 'Harbour Road', 'the canal towpath',
]

const SERVICES_SUBJECTS = [
  'libraries', 'bin collections', 'park maintenance', 'youth services',
  'road repairs', 'bus routes', 'street lighting', 'public toilets',
  'swimming pools', 'community centres', 'meals on wheels', 'school crossings',
  'recycling centres', 'social care', 'children\'s play areas',
]

const ENVIRONMENTAL_SUBJECTS = [
  'single-use plastics', 'vehicle idling', 'private cars', 'diesel vehicles',
  'disposable coffee cups', 'wood-burning stoves', 'garden bonfires',
  'pesticide spraying', 'non-recyclable packaging', 'motorised scooters',
]

const PLANNING_SUBJECTS = [
  'a 200-home housing estate', 'a retail park', 'a drive-through restaurant',
  'student accommodation', 'a warehouse distribution centre', 'an office block',
  'a care home', 'a mosque', 'affordable flats', 'a multi-storey car park',
  'a wind turbine', 'solar panels on council roofs', 'an electric vehicle charging hub',
]

const BUDGET_SUBJECTS = [
  'the old depot', 'the civic centre car park', 'unused council land',
  'the former town hall annex', 'vacant retail units', 'the disused leisure centre',
]

const GOVERNANCE_SUBJECTS = [
  'planning', 'licensing', 'scrutiny', 'finance', 'housing',
  'environment', 'transport', 'health & wellbeing',
]

const MOTION_TEMPLATES: MotionTemplate[] = [
  { pattern: 'Approve {subject} development on {location}', descPattern: 'Grant planning permission for {subject} on the site at {location}.', category: 'planning', baseLean: { growth: 20, change: 10 }, baseBlocImpact: { workshop_crews: 8, market_regulars: -6 } },
  { pattern: 'Reject planning application for {subject}', descPattern: 'Refuse permission for {subject}, citing impact on local character.', category: 'planning', baseLean: { change: -15, growth: -10 }, baseBlocImpact: { old_town_loyalists: 10, workshop_crews: -5 } },
  { pattern: 'Designate {location} as conservation area', descPattern: 'Protect {location} from future development with conservation status.', category: 'planning', baseLean: { change: -10, growth: -15 }, baseBlocImpact: { river_walkers: 10, workshop_crews: -8 } },
  { pattern: 'Rezone {location} for mixed use', descPattern: 'Allow residential and commercial development at {location}.', category: 'planning', baseLean: { growth: 15, change: 5 }, baseBlocImpact: { market_regulars: 6, old_town_loyalists: -4 } },
  { pattern: 'Compulsory purchase order on {location}', descPattern: 'Acquire {location} by compulsory purchase for community use.', category: 'planning', baseLean: { change: 20, services: 15 }, baseBlocImpact: { hill_street_households: 10, market_regulars: -8 } },
  { pattern: 'Permit temporary use of {location} for markets', descPattern: 'Allow pop-up markets and stalls at {location} on weekends.', category: 'planning', baseLean: { growth: 10, change: 5 }, baseBlocImpact: { market_regulars: 12, old_town_loyalists: -3 } },
  { pattern: 'Refuse conversion of {location} to flats', descPattern: 'Block plans to convert the building at {location} into residential units.', category: 'planning', baseLean: { change: -10, growth: -5 }, baseBlocImpact: { old_town_loyalists: 8, hill_street_households: -5 } },
  { pattern: 'Build {subject} near {location}', descPattern: 'Approve new construction of {subject} adjacent to {location}.', category: 'planning', baseLean: { growth: 18, change: 8 }, baseBlocImpact: { workshop_crews: 10, river_walkers: -5 } },

  { pattern: 'Increase funding for {subject}', descPattern: 'Raise the annual budget for {subject} by allocating additional council reserves.', category: 'services', baseLean: { services: 20 }, baseBlocImpact: { hill_street_households: 10, college_corner: 5 } },
  { pattern: 'Cut hours at {subject}', descPattern: 'Reduce opening hours of {subject} to save money in the current budget.', category: 'services', baseLean: { services: -20, growth: 10 }, baseBlocImpact: { college_corner: -12, old_town_loyalists: -8 } },
  { pattern: 'Outsource {subject} to private contractor', descPattern: 'Transfer delivery of {subject} to a private company to reduce costs.', category: 'services', baseLean: { services: -15, growth: 15 }, baseBlocImpact: { workshop_crews: -10, market_regulars: 5 } },
  { pattern: 'Launch new {subject} scheme', descPattern: 'Introduce a new pilot programme expanding {subject} provision across the borough.', category: 'services', baseLean: { services: 18, change: 10 }, baseBlocImpact: { college_corner: 10, pondside_peacemakers: 6 } },
  { pattern: 'Restore weekly {subject}', descPattern: 'Return {subject} to a weekly schedule after previous cuts.', category: 'services', baseLean: { services: 12 }, baseBlocImpact: { hill_street_households: 10, old_town_loyalists: 8 } },
  { pattern: 'Commission emergency repairs to {subject}', descPattern: 'Allocate emergency funds for urgent maintenance of {subject} infrastructure.', category: 'services', baseLean: { services: 10 }, baseBlocImpact: { workshop_crews: 8, hill_street_households: 6 } },
  { pattern: 'Close {subject} facility permanently', descPattern: 'Permanently shut down the {subject} facility to redirect resources elsewhere.', category: 'services', baseLean: { services: -25, growth: 5 }, baseBlocImpact: { college_corner: -15, pondside_peacemakers: -10 } },
  { pattern: 'Extend {subject} to evening hours', descPattern: 'Keep {subject} open until 9pm on weeknights to improve access.', category: 'services', baseLean: { services: 15, change: 5 }, baseBlocImpact: { college_corner: 8, workshop_crews: 5 } },

  { pattern: 'Ban {subject} in the town centre', descPattern: 'Prohibit {subject} within the designated town centre zone.', category: 'environment', baseLean: { change: 20, growth: -10 }, baseBlocImpact: { river_walkers: 10, workshop_crews: -8 } },
  { pattern: 'Create a green corridor along {location}', descPattern: 'Plant trees and hedgerows to create wildlife habitat along {location}.', category: 'environment', baseLean: { change: 15, services: 5 }, baseBlocImpact: { river_walkers: 12, pondside_peacemakers: 8 } },
  { pattern: 'Impose {subject} charges', descPattern: 'Introduce a levy on {subject} to fund environmental improvements.', category: 'environment', baseLean: { change: 15, growth: -5 }, baseBlocImpact: { river_walkers: 8, market_regulars: -6 } },
  { pattern: 'Plant 500 trees along {location}', descPattern: 'Major tree-planting initiative along {location} to improve air quality.', category: 'environment', baseLean: { change: 18, services: 5 }, baseBlocImpact: { river_walkers: 12, hill_street_households: 5 } },
  { pattern: 'Declare a climate emergency', descPattern: 'Commit the council to net-zero carbon operations within five years.', category: 'environment', baseLean: { change: 30, growth: -15 }, baseBlocImpact: { river_walkers: 15, workshop_crews: -10 } },
  { pattern: 'Introduce a clean air zone around {location}', descPattern: 'Charge polluting vehicles entering the zone around {location}.', category: 'environment', baseLean: { change: 20, growth: -10 }, baseBlocImpact: { river_walkers: 10, workshop_crews: -8 } },
  { pattern: 'Create car-free Sundays on {location}', descPattern: 'Close {location} to motor traffic every Sunday for pedestrians and cyclists.', category: 'environment', baseLean: { change: 15, growth: -5 }, baseBlocImpact: { river_walkers: 8, market_regulars: 5 } },
  { pattern: 'Expand recycling collection to include {subject}', descPattern: 'Add {subject} to kerbside recycling collections borough-wide.', category: 'environment', baseLean: { change: 10, services: 8 }, baseBlocImpact: { river_walkers: 6, hill_street_households: 4 } },
  { pattern: 'Install electric vehicle chargers at {location}', descPattern: 'Place 20 new public EV charging points at {location}.', category: 'environment', baseLean: { change: 12, growth: 5 }, baseBlocImpact: { college_corner: 5, workshop_crews: 3 } },

  { pattern: 'Raise council tax by 3%', descPattern: 'Approve a 3% increase in council tax to fund service improvements.', category: 'budget', baseLean: { services: 15, growth: -5 }, baseBlocImpact: { hill_street_households: -5, old_town_loyalists: -8 } },
  { pattern: 'Sell {subject} to raise revenue', descPattern: 'Dispose of {subject} on the open market to generate capital receipts.', category: 'budget', baseLean: { growth: 20, services: -10 }, baseBlocImpact: { market_regulars: 6, river_walkers: -10 } },
  { pattern: 'Freeze spending on {subject}', descPattern: 'Maintain current {subject} budget with no increase for the coming year.', category: 'budget', baseLean: { services: -10, growth: 5 }, baseBlocImpact: { old_town_loyalists: 5, college_corner: -5 } },
  { pattern: 'Invest £2m in {subject}', descPattern: 'Major capital investment in {subject} from council reserves.', category: 'budget', baseLean: { services: 20, growth: 10 }, baseBlocImpact: { hill_street_households: 10, workshop_crews: 8 } },
  { pattern: 'Accept central government austerity grant', descPattern: 'Take the reduced settlement without protest to maintain central government relations.', category: 'budget', baseLean: { growth: 5, services: -15 }, baseBlocImpact: { old_town_loyalists: -5, college_corner: -8 } },
  { pattern: 'Introduce workplace parking levy', descPattern: 'Charge businesses for staff car parking spaces to fund public transport.', category: 'budget', baseLean: { change: 10, growth: -5, services: 10 }, baseBlocImpact: { river_walkers: 5, workshop_crews: -8 } },
  { pattern: 'Create a community investment fund', descPattern: 'Pool resident contributions into a fund for neighbourhood improvements.', category: 'budget', baseLean: { services: 12, change: 8 }, baseBlocImpact: { pondside_peacemakers: 8, hill_street_households: 6 } },
  { pattern: 'Cut councillor expenses by 15%', descPattern: 'Reduce the councillor travel and subsistence budget.', category: 'budget', baseLean: { services: 5, growth: -5 }, baseBlocImpact: { old_town_loyalists: 6, market_regulars: 4 } },

  { pattern: 'Reform {subject} committee structure', descPattern: 'Restructure the {subject} committee to improve decision-making.', category: 'governance', baseLean: { change: 10 }, baseBlocImpact: { pondside_peacemakers: 5, college_corner: 3 } },
  { pattern: 'Increase transparency of {subject} decisions', descPattern: 'Require all {subject} decisions to be published with full reasoning within 48 hours.', category: 'governance', baseLean: { change: 15, services: 5 }, baseBlocImpact: { college_corner: 8, pondside_peacemakers: 6 } },
  { pattern: 'Create new deputy {subject} chair role', descPattern: 'Establish a paid deputy chair position on the {subject} committee.', category: 'governance', baseLean: { growth: 5 }, baseBlocImpact: { old_town_loyalists: -3, college_corner: -2 } },
  { pattern: 'Reduce councillor allowances by 10%', descPattern: 'Cut annual councillor pay to save public money.', category: 'governance', baseLean: { growth: -5, services: 5 }, baseBlocImpact: { old_town_loyalists: 8, market_regulars: 5 } },
  { pattern: 'Introduce public question time at council meetings', descPattern: 'Allow 30 minutes of public questions at the start of each full council meeting.', category: 'governance', baseLean: { change: 12, services: 5 }, baseBlocImpact: { pondside_peacemakers: 10, college_corner: 6 } },
  { pattern: 'Livestream all {subject} committee meetings', descPattern: 'Broadcast {subject} committee meetings online for public viewing.', category: 'governance', baseLean: { change: 10, services: 3 }, baseBlocImpact: { college_corner: 6, pondside_peacemakers: 5 } },
  { pattern: 'Establish a citizens\' assembly on {subject}', descPattern: 'Convene a randomly-selected citizens\' panel to advise on {subject} policy.', category: 'governance', baseLean: { change: 18, services: 8 }, baseBlocImpact: { pondside_peacemakers: 10, college_corner: 8 } },
  { pattern: 'Appoint independent auditor for {subject}', descPattern: 'Hire an external auditor to review {subject} spending and processes.', category: 'governance', baseLean: { change: 8, growth: -3 }, baseBlocImpact: { old_town_loyalists: 5, pondside_peacemakers: 4 } },
]

type ScopeLevel = 'modest' | 'standard' | 'ambitious'

const SCOPE_MODIFIERS: Record<ScopeLevel, { multiplier: number; adjectives: string[] }> = {
  modest: { multiplier: 0.6, adjectives: ['minor', 'small-scale', 'limited', 'pilot'] },
  standard: { multiplier: 1.0, adjectives: [] },
  ambitious: { multiplier: 1.5, adjectives: ['major', 'comprehensive', 'sweeping', 'bold'] },
}

function pickScope(rng: () => number): ScopeLevel {
  const r = rng()
  if (r < 0.3) return 'modest'
  if (r < 0.8) return 'standard'
  return 'ambitious'
}

function pickFrom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]
}

function getSubjectsForCategory(category: MotionCategory): string[] {
  switch (category) {
    case 'planning': return PLANNING_SUBJECTS
    case 'services': return SERVICES_SUBJECTS
    case 'environment': return ENVIRONMENTAL_SUBJECTS
    case 'budget': return BUDGET_SUBJECTS
    case 'governance': return GOVERNANCE_SUBJECTS
  }
}

function generateProceduralMotion(rng: () => number): Omit<CouncilMotion, 'id' | 'proposerId' | 'proposerName' | 'status' | 'votes' | 'partyWhipDirection' | 'playerVote' | 'whipIssuerId' | 'whipIssuerName'> {
  const template = pickFrom(MOTION_TEMPLATES, rng)
  const subjects = getSubjectsForCategory(template.category)
  const subject = pickFrom(subjects, rng)
  const location = pickFrom(LOCATIONS, rng)
  const scope = pickScope(rng)
  const scopeMod = SCOPE_MODIFIERS[scope]

  const headline = template.pattern
    .replace('{subject}', subject)
    .replace('{location}', location)

  const scopeAdj = scopeMod.adjectives.length > 0 ? pickFrom(scopeMod.adjectives, rng) + ' ' : ''
  const description = template.descPattern
    .replace('{subject}', subject)
    .replace('{location}', location)
    .replace('{scope}', scopeAdj)

  const ideologyLean: Partial<PoliticalValues> = {}
  if (template.baseLean.change !== undefined) ideologyLean.change = Math.round(template.baseLean.change * scopeMod.multiplier)
  if (template.baseLean.growth !== undefined) ideologyLean.growth = Math.round(template.baseLean.growth * scopeMod.multiplier)
  if (template.baseLean.services !== undefined) ideologyLean.services = Math.round(template.baseLean.services * scopeMod.multiplier)

  const blocImpact: Record<string, number> = {}
  for (const [bloc, val] of Object.entries(template.baseBlocImpact)) {
    blocImpact[bloc] = Math.round(val * scopeMod.multiplier)
  }

  return { headline, description, category: template.category, ideologyLean, blocImpact }
}

function blocImpactForCategory(category: MotionCategory, ideologyLean: Partial<PoliticalValues>) {
  const categoryBlocMap: Record<MotionCategory, string[]> = {
    environment: ['river_walkers', 'college_corner'],
    services: ['hill_street_households', 'old_town_loyalists'],
    planning: ['workshop_crews', 'market_regulars'],
    budget: ['old_town_loyalists', 'market_regulars'],
    governance: ['pondside_peacemakers', 'college_corner'],
  }
  const magnitude = Math.abs(ideologyLean.change ?? 0) + Math.abs(ideologyLean.growth ?? 0) + Math.abs(ideologyLean.services ?? 0)
  return Object.fromEntries(categoryBlocMap[category].map((bloc) => [bloc, Math.round(magnitude * 0.1)]))
}

export function generateCouncilSession(world: World): World {
  if (!world.politicianMode) return world
  const pm = world.politicianMode
  if (!pm.politician.isIncumbent) return world

  const rng = createRng(world.seed + world.week * 3331)
  const queuedMotion = pm.queuedMotion
  const m = queuedMotion
    ? {
        headline: queuedMotion.headline,
        description: queuedMotion.description,
        category: queuedMotion.category,
        ideologyLean: queuedMotion.ideologyLean,
        blocImpact: blocImpactForCategory(queuedMotion.category, queuedMotion.ideologyLean),
      }
    : generateProceduralMotion(rng)

  const { directions: whipDirection, whipIssuer } = buildPartyWhips(world, m.ideologyLean, m.category, pm)

  const ayePartyIds = new Set(Object.entries(whipDirection).filter(([, d]) => d === 'aye').map(([id]) => id))
  const ayeCouncillors = pm.councillors.filter((c) => ayePartyIds.has(c.partyId))
  let proposer: { id: string; name: string; partyId: string }
  if (queuedMotion) {
    proposer = pm.politician
  } else if (ayeCouncillors.length > 0) {
    proposer = pickFrom(ayeCouncillors, rng)
  } else {
    const sorted = [...pm.councillors].sort((a, b) => ideologyDistanceToMotion(a.personalValues, m.ideologyLean) - ideologyDistanceToMotion(b.personalValues, m.ideologyLean))
    proposer = sorted[0]
    whipDirection[proposer.partyId] = 'aye'
  }

  const motions: CouncilMotion[] = [{
    ...m,
    id: `motion_${world.week}_0`,
    proposerId: proposer.id,
    proposerName: proposer.name,
    status: 'voting' as const,
    votes: [],
    partyWhipDirection: whipDirection,
    playerVote: queuedMotion ? 'aye' : undefined,
    whipIssuerId: whipIssuer?.id,
    whipIssuerName: whipIssuer?.name,
  }]

  return {
    ...world,
    politicianMode: {
      ...pm,
      queuedMotion: undefined,
      currentSession: { week: world.week, motions, resolved: false },
    },
  }
}

function motionLeanToValues(lean: Partial<PoliticalValues>): PoliticalValues {
  return { change: lean.change ?? 0, growth: lean.growth ?? 0, services: lean.services ?? 0 }
}

function ideologyDistanceToMotion(values: PoliticalValues, lean: Partial<PoliticalValues>) {
  return valueDistance(values, motionLeanToValues(lean), { change: 1, growth: 1, services: 1 })
}

function supportBand(values: PoliticalValues, motion: Pick<CouncilMotion, 'ideologyLean' | 'category'> | { ideologyLean: Partial<PoliticalValues>; category: MotionCategory }) {
  const technicalAllowance = motion.category === 'services' || motion.category === 'governance' ? 900 : 0
  const distance = Math.max(0, ideologyDistanceToMotion(values, motion.ideologyLean) - technicalAllowance)
  if (distance <= 2200) return 'support' as const
  if (distance >= 9000) return 'oppose' as const
  return 'mixed' as const
}

function buildPartyWhips(world: World, ideologyLean: Partial<PoliticalValues>, category: MotionCategory, pm: PoliticianModeState) {
  const directions: Record<string, 'aye' | 'nay' | 'free'> = {}
  for (const party of world.parties) {
    const band = supportBand(party.values, { ideologyLean, category })
    directions[party.id] = band === 'support' ? 'aye' : band === 'oppose' ? 'nay' : 'free'
  }
  const playerPartyNPCs = pm.councillors.filter((councillor) => councillor.partyId === pm.politician.partyId)
  if (playerPartyNPCs.length === 0) directions[pm.politician.partyId] = 'free'
  const whipIssuer = playerPartyNPCs.length > 0
    ? playerPartyNPCs.reduce((a, b) => b.influence > a.influence ? b : a)
    : undefined
  return { directions, whipIssuer }
}

export type PredictedStance = 'aye' | 'lean_aye' | 'undecided' | 'lean_nay' | 'nay'

export function predictCouncillorVote(councillor: Councillor, motion: CouncilMotion, world: World): PredictedStance {
  if (councillor.id === motion.proposerId) return 'aye'
  const committedVote = motion.votes.find((vote) => vote.councillorId === councillor.id)
  if (committedVote) return committedVote.vote === 'aye' ? 'aye' : committedVote.vote === 'nay' ? 'nay' : 'undecided'
  const whip = motion.partyWhipDirection[councillor.partyId] ?? 'free'
  const personalLeans = supportBand(councillor.personalValues, motion)

  if (whip === 'aye' && personalLeans === 'support') return 'aye'
  if (whip === 'nay' && personalLeans === 'oppose') return 'nay'
  if (whip === 'aye' && personalLeans === 'mixed') return councillor.rebellionTendency > 0.3 ? 'lean_aye' : 'aye'
  if (whip === 'nay' && personalLeans === 'mixed') return councillor.rebellionTendency > 0.3 ? 'lean_nay' : 'nay'
  if (whip === 'aye' && personalLeans === 'oppose') return councillor.rebellionTendency > 0.25 ? 'lean_nay' : 'lean_aye'
  if (whip === 'nay' && personalLeans === 'support') return councillor.rebellionTendency > 0.25 ? 'lean_aye' : 'lean_nay'
  if (whip === 'free') {
    if (personalLeans === 'support') return 'lean_aye'
    if (personalLeans === 'oppose') return 'lean_nay'
    return 'undecided'
  }
  void world
  return 'undecided'
}

export function createCustomMotion(world: World, input: CustomMotionInput): World {
  if (!world.politicianMode?.currentSession) return world
  const pm = world.politicianMode
  const session = pm.currentSession!
  const pol = pm.politician
  const influenceCost = 8
  if (pol.influence < influenceCost) return world

  const { directions: whipDirection, whipIssuer } = buildPartyWhips(world, input.ideologyLean, input.category, pm)

  const blocImpact: Record<string, number> = {}
  const categoryBlocMap: Record<string, string[]> = {
    environment: ['river_walkers', 'college_corner'],
    services: ['hill_street_households', 'old_town_loyalists'],
    planning: ['workshop_crews', 'market_regulars'],
    budget: ['old_town_loyalists', 'market_regulars'],
    governance: ['pondside_peacemakers', 'college_corner'],
  }
  const relevantBlocs = categoryBlocMap[input.category] ?? []
  const leanMagnitude = Math.abs(input.ideologyLean.change) + Math.abs(input.ideologyLean.growth) + Math.abs(input.ideologyLean.services)
  for (const bloc of relevantBlocs) {
    blocImpact[bloc] = Math.round(leanMagnitude * 0.1)
  }

  const newMotion: CouncilMotion = {
    id: `motion_${world.week}_player_custom`,
    proposerId: pol.id,
    proposerName: pol.name,
    headline: input.headline || 'Untitled Motion',
    description: input.description || '',
    category: input.category,
    ideologyLean: input.ideologyLean,
    blocImpact,
    status: 'voting',
    votes: [],
    partyWhipDirection: whipDirection,
    playerVote: 'aye',
    whipIssuerId: whipIssuer?.id,
    whipIssuerName: whipIssuer?.name,
  }

  return {
    ...world,
    politicianMode: {
      ...pm,
      politician: { ...pol, influence: pol.influence - influenceCost },
      currentSession: { ...session, motions: [...session.motions, newMotion] },
    },
  }
}

export function queueCustomMotion(world: World, input: CustomMotionInput): World {
  const pm = world.politicianMode
  if (!pm || pm.queuedMotion || pm.politician.influence < 8) return world
  return {
    ...world,
    newsFeed: [`Week ${world.week}: You have queued "${input.headline}" for the next council session.`, ...world.newsFeed].slice(0, 30),
    politicianMode: {
      ...pm,
      politician: {
        ...pm.politician,
        influence: pm.politician.influence - 8,
        careerHistory: [...pm.politician.careerHistory, { week: world.week, description: `Queued motion: ${input.headline}`, tier: pm.politician.careerTier }],
      },
      queuedMotion: input,
    },
  }
}

export function castPlayerVote(world: World, motionId: string, vote: 'aye' | 'nay' | 'abstain'): World {
  if (!world.politicianMode?.currentSession) return world
  const pm = world.politicianMode
  const session = pm.currentSession!
  const motions = session.motions.map((m) => {
    if (m.id !== motionId) return m
    return { ...m, playerVote: vote }
  })
  return {
    ...world,
    politicianMode: { ...pm, currentSession: { ...session, motions } },
  }
}

export function resolveCouncilSession(world: World): World {
  if (!world.politicianMode?.currentSession) return world
  const pm = world.politicianMode
  const session = pm.currentSession!
  const rng = createRng(world.seed + world.week * 4441)
  let pol = pm.politician

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
        baseVote = personalBand === 'support' ? 'aye' : personalBand === 'oppose' ? 'nay' : 'abstain'
      } else {
        baseVote = whip
      }
      if (rng() < cllr.rebellionTendency && whip !== 'free') {
        baseVote = whip === 'aye' ? 'nay' : 'aye'
      }
      const relationship = pol.relationships.find((r) => r.targetId === cllr.id)
      if (relationship && relationship.strength > 40 && rng() < 0.2) {
        baseVote = motion.playerVote ?? baseVote
      }
      votes.push({ councillorId: cllr.id, councillorName: cllr.name, partyId: cllr.partyId, vote: baseVote })
    }

    if (motion.playerVote) {
      votes.push({ councillorId: pol.id, councillorName: pol.name, partyId: pol.partyId, vote: motion.playerVote })
    }

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

  for (const m of resolvedMotions) {
    if (m.proposerId === pol.id) motionsProposed++
    if (m.proposerId === pol.id && m.status === 'passed') motionsPassed++

    if (m.playerVote) {
      const whip = m.partyWhipDirection[pol.partyId]
      const rebelled = whip !== 'free' && m.playerVote !== whip
      if (rebelled) {
        rebellionCount++
        const maverickReduction = pol.traits.some((t) => t.id === 'maverick') ? 4 : 0
        loyaltyChange -= (12 - maverickReduction)
        reputationChange += 4
        influenceChange += 2
      } else if (whip !== 'free') {
        loyaltyChange += 2
      }
      if (m.playerVote === 'aye' && m.status === 'passed') influenceChange += 1
    }
  }

  if (pol.traits.some((t) => t.id === 'policy-wonk')) {
    influenceChange += 2
  }

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
    for (const m of resolvedMotions) {
      if (!m.playerVote) continue
      const cllrVote = m.votes.find((v) => v.councillorId === rel.targetId)
      if (!cllrVote) continue
      const isProposer = m.proposerId === rel.targetId
      if (cllrVote.vote === m.playerVote) {
        const agreementBonus = isProposer && m.playerVote === 'aye' ? 10 : 5
        strengthDelta += agreementBonus
        if (history.length < 5) history.push(`${isProposer && m.playerVote === 'aye' ? 'Supported their motion' : 'Agreed on'}: ${m.headline}`)
      } else if (m.playerVote !== 'abstain' && cllrVote.vote !== 'abstain') {
        strengthDelta -= isProposer ? 8 : 4
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
  if (passedMotions.length > 0) {
    updatedTiles = world.tiles.map((tile) => {
      let approvalBoost = 0
      for (const motion of passedMotions) {
        for (const [blocId, impact] of Object.entries(motion.blocImpact)) {
          const blocWeight = tile.blocMix[blocId] ?? 0
          if (blocWeight > 0.1) {
            approvalBoost += (impact / 100) * blocWeight * 0.02
          }
        }
      }
      if (approvalBoost === 0) return tile
      const existingBoost = tile.campaignBoosts?.[world.playerPartyId] ?? 0
      return { ...tile, campaignBoosts: { ...tile.campaignBoosts, [world.playerPartyId]: clamp(existingBoost + approvalBoost, 0, 0.4) } }
    })
  }

  const councilNews: string[] = []
  for (const m of resolvedMotions) {
    councilNews.push(`Week ${world.week}: Council ${m.status === 'passed' ? 'passes' : 'rejects'} "${m.headline}".`)
  }

  return {
    ...world,
    tiles: updatedTiles,
    newsFeed: [...councilNews, ...world.newsFeed].slice(0, 30),
    politicianMode: {
      ...pm,
      politician: pol,
      currentSession: { ...session, motions: resolvedMotions, resolved: true },
      sessionHistory: [...pm.sessionHistory, { week: world.week, motionsPassed: passedCount, motionsFailed: failedCount }],
      legislationHistory: [...pm.legislationHistory, ...resolvedMotions].slice(-40),
      nextSessionWeek: world.week + pm.councilSessionInterval,
    },
  }
}

export function proposeMotion(world: World): World {
  if (!world.politicianMode?.currentSession) return world
  const pm = world.politicianMode
  const session = pm.currentSession!
  const pol = pm.politician
  const influenceCost = 8
  if (pol.influence < influenceCost) return world

  const rng = createRng(world.seed + world.week * 6661 + session.motions.length)
  const picked = generateProceduralMotion(rng)

  const { directions: whipDirection, whipIssuer } = buildPartyWhips(world, picked.ideologyLean, picked.category, pm)

  const newMotion: CouncilMotion = {
    ...picked,
    id: `motion_${world.week}_player_${session.motions.length}`,
    proposerId: pol.id,
    proposerName: pol.name,
    status: 'voting',
    votes: [],
    partyWhipDirection: whipDirection,
    playerVote: 'aye',
    whipIssuerId: whipIssuer?.id,
    whipIssuerName: whipIssuer?.name,
  }

  return {
    ...world,
    politicianMode: {
      ...pm,
      politician: { ...pol, influence: pol.influence - influenceCost },
      currentSession: { ...session, motions: [...session.motions, newMotion] },
    },
  }
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
  if (action === 'reach_out' && world.playerActionPoints < 1) {
    return { world, result: { action: { type: 'lobby_councillor', label: 'Reach out', description: '', apCost: 1 }, outcome: 'neutral', description: 'You need 1 AP to reach out this week.' } }
  }

  const rng = createRng(world.seed + world.week * 809 + councillorId.length + (action === 'reach_out' ? 1 : 2))
  const organiserBonus = pm.politician.traits.some((trait) => trait.id === 'community-organiser') ? 0.15 : 0
  const successChance = clamp(0.45 + organiserBonus + pm.politician.influence / 250 + relationship.strength / 300, 0.2, 0.85)
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
      playerActionPoints: world.playerActionPoints - (action === 'reach_out' ? 1 : 0),
      politicianMode: { ...pm, politician: { ...pm.politician, relationships } },
    },
    result: {
      action: { type: 'lobby_councillor', label: action === 'reach_out' ? 'Reach out' : 'Antagonise', description: '', apCost: action === 'reach_out' ? 1 : 0 },
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
  const successChance = 0.3 + relationshipBonus + (pol.influence / 200)

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

export function shouldTriggerCouncilSession(world: World): boolean {
  if (!world.politicianMode) return false
  if (!world.politicianMode.politician.isIncumbent) return false
  if (world.politicianMode.currentSession && !world.politicianMode.currentSession.resolved) return false
  return world.week >= world.politicianMode.nextSessionWeek
}

// ─── Career Progression ─────────────────────────────────────────────────────

export interface CareerRequirements {
  tier: CareerTier
  label: string
  requirements: { label: string; met: boolean; current: number; needed: number }[]
  eligible: boolean
}

export function getCareerRequirements(world: World): CareerRequirements | null {
  if (!world.politicianMode) return null
  const pol = world.politicianMode.politician
  const nextTier = getNextTier(pol.careerTier)
  if (!nextTier) return null

  const reqs = getRequirementsForTier(nextTier, pol)
  const eligible = reqs.every((r) => r.met)
  return { tier: nextTier, label: TIER_LABELS[nextTier], requirements: reqs, eligible }
}

function getNextTier(current: CareerTier): CareerTier | null {
  const order: CareerTier[] = ['backbencher', 'committee-chair', 'deputy-leader', 'party-leader', 'mayor']
  const idx = order.indexOf(current)
  return idx < order.length - 1 ? order[idx + 1] : null
}

const TIER_LABELS: Record<CareerTier, string> = {
  'backbencher': 'Backbencher',
  'committee-chair': 'Committee Chair',
  'deputy-leader': 'Deputy Leader',
  'party-leader': 'Party Leader',
  'mayor': 'Mayor',
}

export function getTierLabel(tier: CareerTier): string {
  return TIER_LABELS[tier]
}

function getRequirementsForTier(tier: CareerTier, pol: PoliticianState): Array<{ label: string; met: boolean; current: number; needed: number }> {
  switch (tier) {
    case 'committee-chair':
      return [
        { label: 'Terms served', met: pol.termsServed >= 1, current: pol.termsServed, needed: 1 },
        { label: 'Motions passed', met: pol.motionsPassed >= 2, current: pol.motionsPassed, needed: 2 },
        { label: 'Influence', met: pol.influence >= 20, current: pol.influence, needed: 20 },
      ]
    case 'deputy-leader':
      return [
        { label: 'Terms served', met: pol.termsServed >= 2, current: pol.termsServed, needed: 2 },
        { label: 'Motions passed', met: pol.motionsPassed >= 5, current: pol.motionsPassed, needed: 5 },
        { label: 'Party loyalty', met: pol.partyLoyalty >= 60, current: pol.partyLoyalty, needed: 60 },
        { label: 'Influence', met: pol.influence >= 40, current: pol.influence, needed: 40 },
      ]
    case 'party-leader':
      return [
        { label: 'Terms served', met: pol.termsServed >= 3, current: pol.termsServed, needed: 3 },
        { label: 'Influence', met: pol.influence >= 65, current: pol.influence, needed: 65 },
        { label: 'Reputation', met: pol.reputation >= 60, current: pol.reputation, needed: 60 },
        { label: 'Allies', met: pol.relationships.filter((r) => r.type === 'ally').length >= 3, current: pol.relationships.filter((r) => r.type === 'ally').length, needed: 3 },
      ]
    case 'mayor':
      return [
        { label: 'Terms served', met: pol.termsServed >= 4, current: pol.termsServed, needed: 4 },
        { label: 'Motions passed', met: pol.motionsPassed >= 10, current: pol.motionsPassed, needed: 10 },
        { label: 'Influence', met: pol.influence >= 80, current: pol.influence, needed: 80 },
        { label: 'Reputation', met: pol.reputation >= 75, current: pol.reputation, needed: 75 },
      ]
    default:
      return []
  }
}

export function promoteCareer(world: World): World {
  if (!world.politicianMode) return world
  const pm = world.politicianMode
  const pol = pm.politician
  const nextTier = getNextTier(pol.careerTier)
  if (!nextTier) return world

  const reqs = getRequirementsForTier(nextTier, pol)
  if (!reqs.every((r) => r.met)) return world

  const promotedPol: PoliticianState = {
    ...pol,
    careerTier: nextTier,
    careerHistory: [...pol.careerHistory, { week: world.week, description: `Promoted to ${TIER_LABELS[nextTier]}`, tier: nextTier }],
    influence: pol.influence + 10,
  }

  return {
    ...world,
    politicianMode: { ...pm, politician: promotedPol },
    newsFeed: [`Week ${world.week}: Cllr. ${pol.name} becomes ${TIER_LABELS[nextTier]}!`, ...world.newsFeed].slice(0, 30),
  }
}
