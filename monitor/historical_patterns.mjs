/**
 * Bullion Pulse — Historical Pattern, Macro Catalyst & Probabilistic Outlook Engine
 * Pure ES module with zero dependencies.
 *
 * IMPORTANT: Models probabilistic ranges from historical cross-market relationships
 * and documented event analogs. Educational / analytical tool — not financial advice.
 */

import {
  buildEventRiskSchedule,
  computeEwmaGarchVol,
  estimateJumpParams,
  runJumpDiffusion,
} from './jump_diffusion.mjs';
import { computeHurstExponent } from './precision_forecast.mjs';
import { computeSpectralForecast } from './spectral_forecast.mjs';
import { computePhysicalPremiumSignals } from './physical_premiums.mjs';
import { computeHiddenAlphaSuite } from './hidden_alpha.mjs';
import { computeAiDatacenterSignal } from './ai_datacenter.mjs';

export const DRIVER_META = {
  inflation: {
    id: 'inflation',
    label: 'Inflation & Currency',
    shortLabel: 'Inflation',
    goldWeight: 0.16,
    silverWeight: 0.13,
    description: 'CPI/PCE surprises, stagflation, fiscal deficits, and purchasing-power erosion.',
  },
  geopolitics: {
    id: 'geopolitics',
    label: 'Wars & Geopolitics',
    shortLabel: 'Geopolitics',
    goldWeight: 0.16,
    silverWeight: 0.09,
    description: 'Armed conflict escalations, sanctions, trade wars, and safe-haven demand.',
  },
  rates_usd: {
    id: 'rates_usd',
    label: 'Real Yields (TIPS) & USD',
    shortLabel: 'Real Yields',
    goldWeight: 0.19,
    silverWeight: 0.14,
    description: '10Y TIPS real yields (DFII10), breakeven inflation (T10YIE), Fed policy, and US Dollar Index.',
  },
  equities: {
    id: 'equities',
    label: 'Stock Markets & Risk',
    shortLabel: 'Equities',
    goldWeight: 0.07,
    silverWeight: 0.09,
    description: 'S&P 500 selloffs, VIX volatility spikes, credit stress, and risk-off rotation.',
  },
  mining_supply: {
    id: 'mining_supply',
    label: 'Mining & Industrial',
    shortLabel: 'Mining / Supply',
    goldWeight: 0.05,
    silverWeight: 0.17,
    description: 'Mine strikes, ore disruptions, vault deficits, and solar/EV/electronics demand.',
  },
  central_banks: {
    id: 'central_banks',
    label: 'Central Banks & ETFs',
    shortLabel: 'Central Banks',
    goldWeight: 0.08,
    silverWeight: 0.05,
    description: 'Sovereign gold reserve accumulation, de-dollarization, and bullion ETF flows.',
  },
  shanghai_sge: {
    id: 'shanghai_sge',
    label: 'Shanghai Physical (SGE)',
    shortLabel: 'Shanghai SGE',
    goldWeight: 0.10,
    silverWeight: 0.11,
    description: 'Shanghai Gold (Au99.99) & Silver (Ag(T+D)) premiums over Western spot and Asian physical demand.',
  },
  positioning_miners: {
    id: 'positioning_miners',
    label: 'COT Crowding & Miners',
    shortLabel: 'COT / Miners',
    goldWeight: 0.09,
    silverWeight: 0.10,
    description: 'CFTC Managed Money contrarian crowding (52w percentile) and GDX/SIL mining stock confirmation.',
  },
  comex_paper: {
    id: 'comex_paper',
    label: 'COMEX Paper vs. Physical',
    shortLabel: 'COMEX Paper',
    goldWeight: 0.10,
    silverWeight: 0.12,
    description: 'Fresh COMEX GC/SI paper open interest contracts vs. registered deliverable vault ounces and delivery squeeze stress.',
  },
};

/**
 * Documented historical macro episodes and how Spot Gold (XAU) & Silver (XAG)
 * reacted over roughly 7-day and 30-day windows after the catalyst emerged.
 */
export const HISTORICAL_ANALOGS = [
  {
    id: 'ukraine-2022',
    title: 'Russia–Ukraine Invasion (Feb 2022)',
    drivers: ['geopolitics', 'inflation'],
    direction: 'bullish',
    gold7dPct: 4.8,
    gold30dPct: 8.2,
    silver7dPct: 6.1,
    silver30dPct: 10.4,
    note: 'Acute geopolitical shock plus commodity inflation triggered an immediate safe-haven spike before higher Fed rates later capped gains.',
  },
  {
    id: 'mideast-2023',
    title: 'Middle East Escalation (Oct 2023)',
    drivers: ['geopolitics'],
    direction: 'bullish',
    gold7dPct: 5.4,
    gold30dPct: 7.9,
    silver7dPct: 5.0,
    silver30dPct: 8.6,
    note: 'War risk drove rapid safe-haven inflows into gold despite elevated Treasury yields.',
  },
  {
    id: 'svb-banking-2023',
    title: 'US Regional Banking Stress (Mar 2023)',
    drivers: ['equities', 'rates_usd'],
    direction: 'bullish',
    gold7dPct: 6.5,
    gold30dPct: 9.8,
    silver7dPct: 8.2,
    silver30dPct: 16.5,
    note: 'Equity/bank stress caused bond yields to plunge as markets priced emergency Fed liquidity, fueling a sharp precious-metals breakout.',
  },
  {
    id: 'fed-hikes-2022',
    title: 'Aggressive Fed Rate-Hike Cycle (Mid-2022)',
    drivers: ['rates_usd'],
    direction: 'bearish',
    gold7dPct: -2.4,
    gold30dPct: -6.8,
    silver7dPct: -4.9,
    silver30dPct: -12.5,
    note: 'Surging real yields and a 20-year high US Dollar created a strong mechanical headwind for non-yielding bullion.',
  },
  {
    id: 'covid-2020',
    title: 'COVID Liquidity Crash → Fed Cuts (Mar 2020)',
    drivers: ['equities', 'rates_usd', 'inflation'],
    direction: 'mixed',
    gold7dPct: -4.5,
    gold30dPct: 11.4,
    silver7dPct: -14.0,
    silver30dPct: 19.2,
    note: 'During sudden stock-market margin liquidations, silver and gold often dip briefly first, then rally strongly once central banks cut rates.',
  },
  {
    id: 'inflation-1979',
    title: 'Stagflation & Oil Shock (1979–1980)',
    drivers: ['inflation', 'geopolitics'],
    direction: 'bullish',
    gold7dPct: 6.2,
    gold30dPct: 18.5,
    silver7dPct: 9.4,
    silver30dPct: 26.0,
    note: 'Persistent inflation outpacing interest rates drove historic capital rotation into hard assets.',
  },
  {
    id: 'us-downgrade-2011',
    title: 'US Credit Downgrade & Euro Debt Crisis (Aug 2011)',
    drivers: ['equities', 'central_banks', 'inflation'],
    direction: 'bullish',
    gold7dPct: 5.9,
    gold30dPct: 12.1,
    silver7dPct: 4.2,
    silver30dPct: 8.5,
    note: 'Sovereign debt fears favored gold over industrial silver as equity volatility spiked.',
  },
  {
    id: 'cb-buying-2024',
    title: 'Record Central Bank Buying & Fed Pivot (2024)',
    drivers: ['central_banks', 'rates_usd'],
    direction: 'bullish',
    gold7dPct: 2.8,
    gold30dPct: 7.4,
    silver7dPct: 4.1,
    silver30dPct: 11.8,
    note: 'Sustained emerging-market central bank accumulation paired with rate-cut expectations drove repeated all-time highs.',
  },
  {
    id: 'silver-deficit-2024',
    title: 'Solar Demand & Silver Mine Supply Deficit (2024–25)',
    drivers: ['mining_supply'],
    direction: 'bullish',
    gold7dPct: 1.1,
    gold30dPct: 3.4,
    silver7dPct: 5.6,
    silver30dPct: 14.2,
    note: 'Multi-year structural silver deficits from photovoltaic solar and electronics demand compressed the Gold/Silver ratio rapidly.',
  },
  {
    id: 'silver-squeeze-2026',
    title: 'China Silver Export Curbs & SGE Squeeze (Jan 2026)',
    drivers: ['shanghai_sge', 'mining_supply'],
    direction: 'bullish',
    gold7dPct: 3.4,
    gold30dPct: 9.1,
    silver7dPct: 12.8,
    silver30dPct: 28.5,
    note: 'China refined silver export licensing and surging Shanghai Ag(T+D) premiums triggered an acute physical scramble across Asia before high-volatility mean reversion.',
  },
  {
    id: 'disinflation-rally-2013',
    title: 'Taper Tantrum & Cooling Inflation (Apr–Jun 2013)',
    drivers: ['rates_usd', 'inflation', 'central_banks'],
    direction: 'bearish',
    gold7dPct: -5.8,
    gold30dPct: -11.2,
    silver7dPct: -8.6,
    silver30dPct: -17.4,
    note: 'Rising real yields alongside heavy gold ETF outflows triggered an abrupt liquidation across bullion markets.',
  },
];

/**
 * Interactive "What-If" scenario presets used in the mobile UI & simulator.
 */
export const SCENARIO_PRESETS = [
  {
    id: 'hot_cpi',
    label: 'Hot CPI Inflation',
    driver: 'inflation',
    goldDelta: 0.65,
    silverDelta: 0.72,
    summary: 'Inflation surprise above expectations boosts hard-asset hedging demand.',
  },
  {
    id: 'war_escalation',
    label: 'War Escalation',
    driver: 'geopolitics',
    goldDelta: 0.85,
    silverDelta: 0.50,
    summary: 'Geopolitical conflict drives immediate safe-haven bids, led by Gold.',
  },
  {
    id: 'fed_rate_cut',
    label: 'Fed Rate Cut / Weak USD',
    driver: 'rates_usd',
    goldDelta: 0.75,
    silverDelta: 0.80,
    summary: 'Falling real yields and a softer US Dollar lower the opportunity cost of holding bullion.',
  },
  {
    id: 'hawkish_usd',
    label: 'Hawkish Fed / USD Surge',
    driver: 'rates_usd',
    goldDelta: -0.75,
    silverDelta: -0.82,
    summary: 'Higher real yields and stronger USD historically pressure both Gold and Silver.',
  },
  {
    id: 'stock_crash',
    label: 'Stock Market −5% Shock',
    driver: 'equities',
    goldDelta: 0.45,
    silverDelta: -0.25,
    summary: 'Sharp stock selloffs boost Gold safe-haven demand, while Silver can initially lag due to industrial & margin-call selling.',
  },
  {
    id: 'mine_strike',
    label: 'Silver Mine Strike / Deficit',
    driver: 'mining_supply',
    goldDelta: 0.25,
    silverDelta: 0.90,
    summary: 'Mine supply disruptions and tight vault inventories disproportionately lift Silver.',
  },
  {
    id: 'cb_buying',
    label: 'Central Bank Gold Buying',
    driver: 'central_banks',
    goldDelta: 0.70,
    silverDelta: 0.35,
    summary: 'Sovereign reserve accumulation provides a persistent structural floor under Gold.',
  },
  {
    id: 'shanghai_premium',
    label: 'Shanghai Premium Surge (+$40)',
    driver: 'shanghai_sge',
    goldDelta: 0.75,
    silverDelta: 0.80,
    summary: 'Elevated SGE physical premiums over London/COMEX signal strong Chinese physical bullion demand.',
  },
  {
    id: 'comex_squeeze',
    label: 'COMEX Delivery Squeeze (OI Spike)',
    driver: 'comex_paper',
    goldDelta: 0.65,
    silverDelta: 0.88,
    summary: 'Surging COMEX paper open interest against draining registered vaults raises short-covering and physical squeeze tail risk.',
  },
  {
    id: 'solar_storm',
    label: 'Solar Storm / Grid Risk (G4+)',
    driver: 'geopolitics',
    goldDelta: 0.55,
    silverDelta: 0.65,
    summary: 'Severe geomagnetic storms (G4–G5) threaten power grids, satellites, and clearing systems, lifting Gold safe-haven demand and Silver grid/solar replacement demand.',
  },
  {
    id: 'space_solar_boom',
    label: 'Space & Solar Tech Demand Surge',
    driver: 'mining_supply',
    goldDelta: 0.25,
    silverDelta: 0.78,
    summary: 'Accelerating satellite constellations, orbital solar arrays, and aerospace electronics expand physical Silver consumption.',
  },
  {
    id: 'ai_battery_silver',
    label: 'AI & Solid-State Silver Boom',
    driver: 'mining_supply',
    goldDelta: 0.22,
    silverDelta: 0.85,
    summary: 'Exploding AI data-center power hardware, TOPCon/HJT solar paste, and silver-carbon solid-state EV batteries accelerate structural Silver deficits.',
  },
  {
    id: 'sovereign_debt_brics',
    label: 'BRICS / Sovereign Debt Crisis',
    driver: 'central_banks',
    goldDelta: 0.82,
    silverDelta: 0.55,
    summary: 'Accelerating sovereign debt stress, BRICS gold trade settlement, and national reserve repatriation drive structural multi-month Gold inflows.',
  },
  {
    id: 'physical_squeeze',
    label: 'Retail Physical Squeeze (+25% Premiums)',
    driver: 'comex_paper',
    goldDelta: 0.58,
    silverDelta: 0.88,
    summary: 'Dealer coin & bar premiums surge well above spot/melt with mint bottlenecks and above-spot buybacks — leading bullish catch-up signal.',
  },
];

/* ---------- Keyword-Based News Classifier ---------- */

const DRIVER_RULES = [
  {
    driver: 'inflation',
    bullish: [
      /\binflation\b.*\b(surge|jump|rise|hot|acceler|sticky|high|above|exceed)/i,
      /\b(hot|higher|sticky|persistent)\b.*\b(cpi|pce|inflation)/i,
      /\bstagflation\b/i,
      /\b(deficit|national debt|debt ceiling|debasement|sovereign debt|fiscal crisis|bond vigilante|currency devaluation|money printing)\b/i,
      /\b(oil|crude|energy|opec)\b.*\b(surge|spike|jump|cut|shock|embargo)/i,
    ],
    bearish: [
      /\binflation\b.*\b(cool|ease|drop|fall|slow|below|tame)/i,
      /\bdisinflation\b|\bdeflation\b/i,
      /\b(cpi|pce)\b.*\b(cool|below|lower|drop|miss)/i,
    ],
  },
  {
    driver: 'geopolitics',
    bullish: [
      /\b(war|airstrike|missile|invasion|escalat|conflict|hostilit|(?<!labor\s)(?<!mine\s)(?<!union\s)(?<!workers\s)strike|retaliat)\b/i,
      /\b(middle east|ukraine|gaza|iran|taiwan|red sea|strait of hormuz|suez)\b.*\b(tension|attack|crisis|clash|warning|fear|disrupt|blockade|shipping)/i,
      /\b(sanction|tariff|trade war|embargo|geopolitical|chokepoint)\b/i,
      /\b(geomagnetic storm|solar flare|coronal mass ejection|x-class flare|solar storm|grid blackout|satellite disruption|anti-satellite|cme impact)\b/i,
      /\bsafe[- ]haven\b/i,
    ],
    bearish: [
      /\b(ceasefire|peace deal|truce|de-escalat|peace talk|diplomatic breakthrough)\b/i,
      /\b(tariff|sanction).*\b(lift|ease|pause|roll back|dropped)\b/i,
      /\b(tensions?|war fears?|conflict fears?|geopolitical risk)\b.*\b(ease|easing|cool|fade|recede|subside|calm)/i,
    ],
  },
  {
    driver: 'rates_usd',
    bullish: [
      /\b(rate cut|cut rates|dovish|pivot|easing cycle|lower rates)\b/i,
      /\b(dollar|usd|dxy|yen)\b.*\b(fall|drop|slip|weaken|slide|tumble|retreat|intervention)/i,
      /\b(yield|treasury|bond)\b.*\b(fall|drop|plunge|slip|decline|retreat|weak auction|tail)/i,
      /\bfed\b.*\b(pause|cut|dovish|soften)/i,
    ],
    bearish: [
      /\b(rate hike|hike rates|hawkish|higher for longer|tightening)\b/i,
      /\b(dollar|usd|dxy)\b.*\b(surge|rally|jump|strengthen|rise|climb|strong)/i,
      /\b(yield|treasury)\b.*\b(surge|jump|spike|climb|rise|higher)/i,
      /\bfed\b.*\b(hawkish|delay cut|hold high|hike|rules? out|push(?:es|ing)? back)/i,
      /\b(no|rules? out|push(?:es|ing)? back|delay(?:s|ed|ing)?|dash(?:es|ed)?|fade|trim|fewer|less likely|unlikely|reduces? odds|postpone)\b.*\b(rate cut|cut rates|easing|pivot)/i,
      /\b(rate cut|cut rates)\b.*\b(unlikely|delayed|postponed|fades?|fading|ruled out|pushed back|off the table)/i,
    ],
  },
  {
    driver: 'equities',
    bullish: [
      /\b(stock|equit|s&p|nasdaq|dow|wall street)\b.*\b(crash|plunge|selloff|sell-off|tumble|slump|sink|rout)/i,
      /\b(recession|banking crisis|bank failure|credit crunch|vix spike|market turmoil)\b/i,
    ],
    bearish: [
      /\b(stock|equit|s&p|nasdaq)\b.*\b(record high|rally|surge|boom|risk-on)\b/i,
      /\brisk appetite\b.*\b(return|surge|strong)/i,
    ],
  },
  {
    driver: 'mining_supply',
    bullish: [
      [
        /\b(mine|mining|miner|smelter|san dimas|newmont|barrick|first majestic|pan american|hecla|agnico|wheaton)\b/i,
        /\b(strike|labor dispute|halt|shut|disrupt|suspend|protest|shortage|deficit|decline|fall|lower output|aisc\s+(?:\w+\s+){0,3}(?:rises?|rising|jumps?|jumping)|costs?\s+(?:\w+\s+){0,3}(?:rises?|rising|jumps?|jumping))/i,
      ],
      /\b(silver|gold)\b.{0,120}\b(deficit|shortage|tight supply|vault drain|inventory drop|record demand|squeeze|sixth straight)/i,
      /\b(solar|photovoltaic|topcon|hjt|silver paste|solid[- ]?state battery|ev|electrification|charging|electronics|semiconductor|ai data center|ai server|antimicrobial)\b.{0,120}\b(demand|grow|surge|boom|rise|record|adoption|shortage|boost)/i,
      [
        /\b(nvidia|google|alphabet|microsoft|meta|amazon|aws|openai|anthropic|claude|tesla|megapack|spacex|starlink|xai|stargate|tsmc|broadcom|vertiv|eaton|hyperscaler)\b/i,
        /\b(gigawatt|megawatt|buildout|expand|surge|boom|invest|billion|power deal|grid upgrade|switchgear|busbar|launch|record|deliveries|raise(?:s|d|ing)?\s+(?:\w+\s+){0,3}capex|boost(?:s|ed|ing)?\s+(?:\w+\s+){0,3}demand)/i,
      ],
      /\b(alibaba|qwen|tencent|hunyuan|baidu|deepseek|huawei|ascend|bytedance|smic|byd|catl|xiaomi|xpeng|li auto|nio)\b.{0,120}\b(gigawatt|megawatt|buildout|expand|surge|boom|invest|billion|solid[- ]?state|deliveries|record|sales jump|ramp|boost)/i,
      /\b(asml|schneider electric|siemens|infineon|mistral|softbank|tokyo electron|advantest|toyota|samsung|sk hynix|ytl power|inari|johor|malaysia|celestica|brookfield|weg|mercadolibre|reliance|jio)\b.{0,120}\b(gigawatt|megawatt|buildout|expand|surge|boom|invest|billion|switchgear|transformer|power grid|solid[- ]?state|hbm|wire bonding|record|order|deal)/i,
      /\b(space economy|satellite constellation|orbital solar|aerospace|lunar base|starship|nasa|spacex|satellite launch)\b.{0,120}\b(demand|launch|build|solar|silver|boom|record|contract|expand)/i,
      /\b(us mint|royal mint|perth mint|bullion coin|silver eagle|costco gold)\b.{0,120}\b(shortage|sell out|sold out|surge|demand|premium|record|backlog)/i,
      /\bexport (ban|curb|restriction|licensing|control)\b.{0,120}\b(silver|gold|metal|mineral)/i,
      [
        /\b(comex|lbma|shfe)\b/i,
        /\b(inventory|stock|vault)/i,
        /\b(drop|decline|drain|low|plummet)/i,
      ],
    ],
    bearish: [
      [
        /\b(mine|mining|newmont|barrick|first majestic|pan american|hecla|loulo)\b/i,
        /\b(record output|production surge|ramps?[- ]?up|supply glut|oversupply|reopen|restart|lower(?:s|ed|ing)?\s+(?:\w+\s+){0,3}costs?|cut(?:s|ting)?\s+(?:\w+\s+){0,3}costs?)/i,
      ],
      /\b(silver|gold)\b.{0,120}\b(surplus|oversupply|weak industrial demand|thrifting|substitution|narrow)/i,
      /\b(nvidia|google|microsoft|meta|amazon|tesla|openai|anthropic|alibaba|tencent|baidu|byd|catl|xiaomi|xpeng|li auto|nio|asml|siemens|samsung|sk hynix|softbank|toyota|hyperscaler|data center|ai capex)\b.{0,120}\b(capex cut|cut spending|cuts? capex|cancel|delay|pause|slowdown|bubble burst|slump|sales drop|sales fall|halt|pullback)/i,
    ],
  },
  {
    driver: 'central_banks',
    bullish: [
      /\bcentral bank\b.{0,120}\b(buy|buying|accumulat|add|reserve|record|gold)\b/i,
      /\b(china|pboc|india|rbi|poland|nbp|turkey|brics|imf|sovereign)\b.{0,120}\b(gold reserve|buys gold|adds gold|silver import|gold import|repatriat|gold[- ]backed|settlement)/i,
      /\b(gold|silver) (etf|etp)\b.{0,120}\b(inflow|surge|buying|add|recover)/i,
      /\b(paxg|xaut|tether gold|tokenized gold|basel iii)\b.{0,120}\b(surge|inflow|demand|tier 1|record|growth|adoption|vault)/i,
      /\bde-?dollariz/i,
    ],
    bearish: [
      /\b(central bank|china|pboc|india|rbi|poland|turkey)\b.{0,120}\b(sell|selling|pause[sd]? buying|pause[sd]? gold|halt(?:s|ed|ing)? gold|stop(?:s|ped|ping)? buying|dump|zero gold|ends? buying)\b/i,
      [
        /\b(pboc|china|central bank)\b/i,
        /\b(gold buying|gold reserve)/i,
        /\b(pause|halt|zero|stop|ended|slow)/i,
      ],
      /\b(gold|silver) (etf|etp)\b.{0,120}\b(outflow|redemption|selling|trim)/i,
    ],
  },
  {
    driver: 'shanghai_sge',
    bullish: [
      /\b(shanghai|sge|shfe)\b.{0,120}\b(premium|surge|high|squeeze|tight|demand|au99|ag\(t\+d\)|vault drain)/i,
      [
        /\bchina\b/i,
        /\b(silver|gold)\b/i,
        /\b(export control|export restriction|licensing|premium|rush|shortage)/i,
      ],
      /\b(india|dubai|dmcc|turkey|mcx|swiss gold exports|diwali|akshaya tritiya)\b.{0,120}\b(surge|jump|record|boom|import|demand|premium|buying)/i,
    ],
    bearish: [
      /\b(shanghai|sge|shfe|india|dubai|turkey)\b.{0,120}\b(discount|margin hike|margin rate|cooling|inventory build|slump|import drop|import fall)/i,
    ],
  },
  {
    driver: 'comex_paper',
    bullish: [
      [
        /\b(comex|lbma|london bullion)\b/i,
        /\b(registered|vault|stockpile|inventor|delivery)/i,
        /\b(drop|drain|fall|low|squeeze|drawdown|outflow|stand for delivery|tight)/i,
      ],
      /\b(paper silver|paper gold|open interest|gold lease rate|silver lease rate|backwardation|efp spread)\b.{0,120}\b(surge|jump|squeeze|record|exceed|short covering|spike|soar|tight)/i,
    ],
    bearish: [
      [
        /\b(comex|lbma)\b/i,
        /\b(margin hike|registered build|inventory surge|liquidation|paper dump|paper slam|lease rate\s+(?:\w+\s+){0,3}fall)/i,
      ],
    ],
  },
];

export const NEWS_TOPICS = {
  central_banks: 'Central Banks & BRICS',
  tech_solar_ai: 'Solar, AI & EV Tech',
  vaults_physical: 'Vaults & Lease Rates',
  asia_retail: 'India, China & Retail',
  geo_space: 'World & Space',
  macro_debt: 'Macro, Debt & Banks',
  miners_supply: 'Mines & Energy',
};

export function classifyHeadlineTopic(text = '', driver = '') {
  if (/\b(solar flare|geomagnetic|space weather|noaa|satellite|aerospace|spacex|nasa|orbital|war|missile|airstrike|sanction|tariff|strait of hormuz|red sea|geopolit|conflict|ceasefire)\b/i.test(text)) {
    return { topic: 'geo_space', topicLabel: NEWS_TOPICS.geo_space };
  }
  if (/\b(solar|photovoltaic|topcon|hjt|silver paste|solid[- ]?state battery|ai data center|ai server|ai capex|ai infrastructure|hyperscal|gigawatt|switchgear|busbar|wire bonding|nvidia|tesla|megapack|anthropic|openai|stargate|alibaba|qwen|tencent|baidu|deepseek|huawei|smic|byd|catl|xiaomi|xpeng|li auto|nio|asml|schneider electric|siemens|infineon|mistral|softbank|tokyo electron|advantest|toyota|samsung|sk hynix|ytl power|inari|johor|celestica|brookfield|weg|mercadolibre|reliance|vertiv|eaton|ev |semiconductor|electrification|antimicrobial)\b/i.test(text)) {
    return { topic: 'tech_solar_ai', topicLabel: NEWS_TOPICS.tech_solar_ai };
  }
  if (/\b(central bank|brics|pboc|rbi|nbp|repatriat|de-?dollariz|sovereign.*reserve|basel iii|paxg|xaut|tether gold|tokenized gold|gld|slv|pslv|etf)\b/i.test(text)) {
    return { topic: 'central_banks', topicLabel: NEWS_TOPICS.central_banks };
  }
  if (/\b(comex|lbma|lease rate|backwardation|efp|registered|vault|swiss gold|delivery|open interest|cftc|cot)\b/i.test(text)) {
    return { topic: 'vaults_physical', topicLabel: NEWS_TOPICS.vaults_physical };
  }
  if (/\b(shanghai|sge|shfe|india|mcx|dubai|dmcc|turkey|diwali|akshaya|costco|us mint|silver eagle|bullion coin|jewelry|retail)\b/i.test(text)) {
    return { topic: 'asia_retail', topicLabel: NEWS_TOPICS.asia_retail };
  }
  if (/\b(mine|mining|miner|aisc|newmont|barrick|agnico|wheaton|pan american|hecla|first majestic|fresnillo|smelter|crude oil|opec|copper|commodity supercycle)\b/i.test(text)) {
    return { topic: 'miners_supply', topicLabel: NEWS_TOPICS.miners_supply };
  }
  if (driver === 'geopolitics') return { topic: 'geo_space', topicLabel: NEWS_TOPICS.geo_space };
  if (driver === 'central_banks') return { topic: 'central_banks', topicLabel: NEWS_TOPICS.central_banks };
  if (driver === 'comex_paper') return { topic: 'vaults_physical', topicLabel: NEWS_TOPICS.vaults_physical };
  if (driver === 'shanghai_sge') return { topic: 'asia_retail', topicLabel: NEWS_TOPICS.asia_retail };
  if (driver === 'mining_supply') return { topic: 'miners_supply', topicLabel: NEWS_TOPICS.miners_supply };
  return { topic: 'macro_debt', topicLabel: NEWS_TOPICS.macro_debt };
}

export function classifyHeadline(headline) {
  const text = `${headline?.title || ''} ${headline?.summary || ''}`.trim().slice(0, 600);
  let bestMatch = null;
  const matchesRule = (rx) => (Array.isArray(rx) ? rx.every((r) => r.test(text)) : rx.test(text));

  for (const rule of DRIVER_RULES) {
    let bullHits = 0;
    let bearHits = 0;
    for (const rx of rule.bullish) {
      if (matchesRule(rx)) bullHits++;
    }
    for (const rx of rule.bearish) {
      if (matchesRule(rx)) bearHits++;
    }
    const total = bullHits + bearHits;
    if (total === 0) continue;

    let polarity = bullHits === bearHits ? 0 : bullHits > bearHits ? 1 : -1;
    // Negation & reversal precision guards so "ceasefire eases war", "Fed rules out rate cut",
    // "PBOC pauses gold buying", or "NVIDIA delays data center" NEVER flip positive!
    if (rule.driver === 'rates_usd' && bearHits > 0 && /\b(no|rules? out|push(?:es|ing)? back|delay(?:s|ed|ing)?|dash(?:es|ed)?|unlikely|postpone|off the table|fewer)\b.{0,120}\b(rate cut|cut rates|easing|pivot)|\b(rate cut|cut rates)\b.{0,120}\b(unlikely|delayed|postponed|fades?|fading|ruled out|pushed back|off the table)/i.test(text)) {
      polarity = -1;
    } else if (rule.driver === 'geopolitics' && bearHits > 0 && !/\b(collapse|breaks? down|fails?|shatter|violat)\b/i.test(text)) {
      polarity = -1;
    } else if (rule.driver === 'central_banks' && bearHits > 0 && /\b(pause[sd]?|pausing|halt(?:s|ed|ing)?|stop(?:s|ped|ping)?|sell(?:s|ing)?|sold|outflow|redemption|dump(?:s|ed|ing)?|zero gold)\b/i.test(text)) {
      polarity = -1;
    } else if (rule.driver === 'mining_supply' && bearHits > 0 && !/\b(mine strike|labor dispute|shortage|deficit|vault drain)\b/i.test(text)) {
      polarity = -1;
    }

    const strength = Math.min(1, 0.45 + total * 0.22);
    if (!bestMatch || total > bestMatch.hits) {
      bestMatch = {
        driver: rule.driver,
        polarity,
        strength,
        hits: total,
      };
    }
  }

  if (!bestMatch) {
    // Broad fallback for global US/China/EU/JP/KR/MY/CA/LatAm/IN AI, SpaceX, Grid & EV Metal Race stories
    const hasGlobalTechGiant = /\b(nvidia|google|alphabet|microsoft|meta|amazon|aws|tesla|megapack|spacex|starlink|starship|openai|stargate|anthropic|claude|xai|tsmc|broadcom|vertiv|eaton|alibaba|qwen|tencent|hunyuan|baidu|ernie|deepseek|huawei|ascend|bytedance|smic|byd|catl|xiaomi|xpeng|li auto|nio|asml|schneider electric|siemens|infineon|mistral|softbank|tokyo electron|advantest|toyota|samsung|sk hynix|ytl power|inari|johor|celestica|brookfield|weg|mercadolibre|reliance|jio)\b/i.test(text);
    const hasInfraOrMetalContext = /\b(ai|data center|hyperscal|gigawatt|megawatt|chip|semiconductor|hbm|switchgear|busbar|transformer|power grid|grid|ev|electric vehicle|solid[- ]?state|battery|charging|satellite|orbital|wire bonding|silver|gold|server|capex|cloud|foundry|wafer)\b/i.test(text);
    if (hasGlobalTechGiant && hasInfraOrMetalContext) {
      const isBearTech = /\b(cut|cancel|delay|pause|slowdown|slump|drop|fall|shrink|bubble|pullback|halt|decline|weak|warning)\b/i.test(text);
      const isBullTech = /\b(expand|buildout|surge|boom|invest|billion|gigawatt|megawatt|record|launch|deal|order|demand|upgrade|factory|plant|growth|deliveries|ramp|accelerat|partner)\b/i.test(text);
      const pol = isBearTech ? -1 : isBullTech ? 1 : 0;
      bestMatch = {
        driver: 'mining_supply',
        polarity: pol,
        strength: pol === 0 ? 0 : 0.56,
        hits: 1,
      };
    }
  }

  if (!bestMatch) return null;

  // Direct bullion price-action check when driver polarity is ambiguous (0)
  if (bestMatch.polarity === 0) {
    if (/\b(gold|silver|bullion)\b.*\b(plunge|tumble|slide|drop|sink|fall|slump|retreat|selloff|profit[- ]taking)\b/i.test(text)) {
      bestMatch.polarity = -1;
      bestMatch.strength = Math.max(bestMatch.strength, 0.45);
    } else if (/\b(gold|silver|bullion)\b.*\b(surge|soar|rally|jump|record high|all[- ]time high|breakout|climb)\b/i.test(text)) {
      bestMatch.polarity = 1;
      bestMatch.strength = Math.max(bestMatch.strength, 0.45);
    }
  }

  const topicInfo = classifyHeadlineTopic(text, bestMatch.driver);

  // Mentioning silver specifically boosts silver sensitivity; gold boosts gold
  const mentionsSilver = /\b(silver|xag|comex silver|solar)\b/i.test(text);
  const mentionsGold = /\b(gold|xau|bullion)\b/i.test(text);

  let goldImpact = bestMatch.polarity * bestMatch.strength;
  let silverImpact = bestMatch.polarity * bestMatch.strength;

  if (topicInfo.topic === 'tech_solar_ai') {
    // AI data centers, EVs, switchgear & solar drive Silver strongly and Gold as a supporting tech layer
    silverImpact *= 1.20;
    goldImpact *= 0.42;
  } else if (bestMatch.driver === 'mining_supply') {
    silverImpact *= 1.25;
    goldImpact *= 0.65;
  } else if (bestMatch.driver === 'geopolitics' || bestMatch.driver === 'central_banks') {
    goldImpact *= 1.15;
    silverImpact *= 0.75;
  } else if (bestMatch.driver === 'equities' && bestMatch.polarity > 0) {
    // Stock crash / recession helps safe-haven Gold, while recession fears slightly weigh on industrial Silver
    goldImpact *= 1.05;
    if (/\b(recession|crash|rout|plunge)\b/i.test(text) && !/\b(banking crisis|bank failure|fed)\b/i.test(text)) {
      silverImpact *= -0.22;
    } else {
      silverImpact *= 0.35;
    }
  }

  if (mentionsSilver && !mentionsGold) {
    silverImpact *= 1.2;
    goldImpact *= 0.7;
  }

  return {
    title: headline.title,
    source: headline.source || 'News Feed',
    publishedAt: headline.publishedAt || new Date().toISOString(),
    url: headline.url || '',
    driver: bestMatch.driver,
    driverLabel: DRIVER_META[bestMatch.driver].shortLabel,
    topic: topicInfo.topic,
    topicLabel: topicInfo.topicLabel,
    sentiment: bestMatch.polarity > 0 ? 'bullish' : bestMatch.polarity < 0 ? 'bearish' : 'neutral',
    goldImpact: clamp(goldImpact, -1, 1),
    silverImpact: clamp(silverImpact, -1, 1),
  };
}

const TIER1_SOURCES = /\b(reuters|bloomberg|financial times|ft|wsj|silver institute|world bank|cftc|federal reserve|sge|shanghai gold exchange|metals focus|kitco)\b/i;
const TIER2_SOURCES = /\b(mining\.com|mining weekly|fxstreet|seeking alpha|crux investor|investing|marketwatch|cnbc|barron|yahoo|asia metals|commodity desk|metals wire)\b/i;

export function sourceTierInfo(source = '') {
  if (TIER1_SOURCES.test(source)) return { tier: 1, weight: 1.25 };
  if (TIER2_SOURCES.test(source)) return { tier: 2, weight: 1.0 };
  return { tier: 3, weight: 0.75 };
}

// Category-specific exponential half-lives (hours): slow structural shifts persist days, fast chatter decays quickly
const DRIVER_HALF_LIFE_HOURS = {
  central_banks: 144,
  mining_supply: 120,
  inflation: 72,
  rates_usd: 72,
  geopolitics: 60,
  shanghai_sge: 48,
  comex_paper: 48,
  positioning_miners: 48,
  equities: 18,
};

export function recencyDecayWeight(publishedAt, nowMs = Date.now(), driver = null) {
  const ts = publishedAt ? new Date(publishedAt).getTime() : NaN;
  if (!Number.isFinite(ts)) return 0.7;
  const ageHours = Math.max(0, (nowMs - ts) / 3600000);
  const halfLife = (driver && DRIVER_HALF_LIFE_HOURS[driver]) || 18;
  return +clamp(Math.exp((-Math.LN2 * ageHours) / halfLife), 0.2, 1.0).toFixed(3);
}

function titleTokens(title = '') {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !/^(the|and|for|with|from|that|this|into|over|amid|after|says|report)$/.test(w))
  );
}

function jaccardSimilarity(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  return inter / (setA.size + setB.size - inter);
}

export function classifyHeadlines(rawHeadlines = [], nowMs = Date.now()) {
  const clusters = [];

  for (const h of rawHeadlines) {
    const classified = classifyHeadline(h);
    if (!classified) continue;

    const { tier, weight: tierW } = sourceTierInfo(classified.source);
    const recencyW = recencyDecayWeight(classified.publishedAt, nowMs, classified.driver);
    const combinedW = +(tierW * recencyW).toFixed(3);
    const enriched = {
      ...classified,
      sourceTier: tier,
      recencyWeight: recencyW,
      weight: combinedW,
      clusterCount: 1,
      goldImpact: +clamp(classified.goldImpact * combinedW, -1, 1).toFixed(3),
      silverImpact: +clamp(classified.silverImpact * combinedW, -1, 1).toFixed(3),
    };

    const tokens = titleTokens(enriched.title);
    const match = clusters.find(
      (c) => c.item.driver === enriched.driver && jaccardSimilarity(c.tokens, tokens) >= 0.52
    );

    if (match) {
      match.item.clusterCount += 1;
      // Keep higher-weighted (fresher / higher-tier) headline as cluster lead
      if (enriched.weight > match.item.weight) {
        enriched.clusterCount = match.item.clusterCount;
        match.item = enriched;
        match.tokens = tokens;
      }
    } else {
      clusters.push({ tokens, item: enriched });
    }
  }

  // Sublinear novelty weighting so syndicated rewrites add modest confirmation without drowning out unique catalysts
  return clusters
    .map((c) => {
      const n = c.item.clusterCount || 1;
      const noveltyMult = +(1 + 0.18 * Math.log1p(n - 1)).toFixed(3);
      return {
        ...c.item,
        noveltyMult,
        goldImpact: +clamp(c.item.goldImpact * noveltyMult, -1, 1).toFixed(3),
        silverImpact: +clamp(c.item.silverImpact * noveltyMult, -1, 1).toFixed(3),
      };
    })
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Selects up to maxCount (default 100) deduplicated headlines using balanced round-robin
 * across all 7 Gold/Silver/AI/Global topics so no single topic crowds out global coverage.
 */
export function selectBalancedHeadlines(scoredHeadlines = [], maxCount = 100) {
  if (!Array.isArray(scoredHeadlines) || scoredHeadlines.length <= maxCount) {
    return Array.isArray(scoredHeadlines) ? [...scoredHeadlines] : [];
  }
  const byTopic = new Map();
  for (const h of scoredHeadlines) {
    const k = h.topic || 'macro_debt';
    if (!byTopic.has(k)) byTopic.set(k, []);
    byTopic.get(k).push(h);
  }
  const picked = [];
  const seen = new Set();
  const topicLists = [...byTopic.values()];
  let round = 0;
  while (picked.length < maxCount && round < 16) {
    let addedAny = false;
    for (const list of topicLists) {
      if (round < list.length && picked.length < maxCount) {
        const item = list[round];
        if (!seen.has(item)) {
          seen.add(item);
          picked.push(item);
          addedAny = true;
        }
      }
    }
    if (!addedAny) break;
    round++;
  }
  for (const h of scoredHeadlines) {
    if (picked.length >= maxCount) break;
    if (!seen.has(h)) {
      seen.add(h);
      picked.push(h);
    }
  }
  return picked.sort(
    (a, b) =>
      Math.max(Math.abs(b.goldImpact), Math.abs(b.silverImpact), 0.15) * (b.weight || 1) -
      Math.max(Math.abs(a.goldImpact), Math.abs(a.silverImpact), 0.15) * (a.weight || 1)
  );
}

/* ---------- Quantitative Historical Series Helpers ---------- */

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function dailyReturns(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const curr = closes[i];
    if (prev > 0 && Number.isFinite(curr)) {
      out.push((curr - prev) / prev);
    }
  }
  return out;
}

export function stdDev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function pearsonCorrelation(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 5) return null;
  const a = xs.slice(-n);
  const b = ys.slice(-n);
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : +(num / den).toFixed(2);
}

function pctChangeOver(closes, lookback) {
  if (!closes || closes.length < 2) return 0;
  const last = closes[closes.length - 1];
  const idx = Math.max(0, closes.length - 1 - lookback);
  const prev = closes[idx];
  return prev > 0 ? ((last - prev) / prev) * 100 : 0;
}

function movingAverage(closes, period) {
  if (!closes || closes.length === 0) return null;
  const slice = closes.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

function ewmaVolatility(closes, lambda = 0.94) {
  const rets = dailyReturns(closes.slice(-45));
  if (rets.length < 4) return null;
  let variance = rets[0] * rets[0];
  for (let i = 1; i < rets.length; i++) {
    variance = lambda * variance + (1 - lambda) * (rets[i] * rets[i]);
  }
  return Math.sqrt(Math.max(0, variance));
}

function garmanKlassVol(opens = [], highs = [], lows = [], closes = []) {
  const n = Math.min(opens.length, highs.length, lows.length, closes.length);
  if (n < 8) return null;
  const start = Math.max(0, n - 21);
  let sum = 0;
  let used = 0;
  const c2 = 2 * Math.LN2 - 1;
  for (let i = start; i < n; i++) {
    const o = opens[i];
    const h = highs[i];
    const l = lows[i];
    const c = closes[i];
    if (!(o > 0 && h >= l && l > 0 && c > 0)) continue;
    const hl = Math.log(h / l);
    const co = Math.log(c / o);
    sum += 0.5 * hl * hl - c2 * co * co;
    used++;
  }
  return used >= 5 ? Math.sqrt(Math.max(0, sum / used)) : null;
}

function computeRsi14(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length <= period) return null;
  const rets = [];
  for (let i = 1; i < closes.length; i++) {
    rets.push(closes[i] - closes[i - 1]);
  }
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (rets[i] >= 0) avgGain += rets[i];
    else avgLoss += Math.abs(rets[i]);
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period; i < rets.length; i++) {
    const g = rets[i] >= 0 ? rets[i] : 0;
    const l = rets[i] < 0 ? Math.abs(rets[i]) : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 98;
  const rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(1);
}

function dampenTrendByRsi(rawTrend, rsi) {
  if (rsi == null) return rawTrend;
  if (rsi <= 22 && rawTrend < 0) {
    const scale = clamp((rsi - 10) / 14, 0.35, 1);
    const reboundNudge = clamp((24 - rsi) / 55, 0, 0.22);
    return clamp(rawTrend * scale + reboundNudge, -1, 1);
  }
  if (rsi >= 78 && rawTrend > 0) {
    const scale = clamp((90 - rsi) / 14, 0.35, 1);
    const pullbackNudge = clamp((rsi - 76) / 55, 0, 0.22);
    return clamp(rawTrend * scale - pullbackNudge, -1, 1);
  }
  return rawTrend;
}

/**
 * 5-year (2021–2026) monthly Gold/Silver Ratio reference distribution for Z-Score & percentile valuation.
 * Covers major modern regimes (2021 silver squeeze ~65, 2022–2024 high-rate range 78–92, 2025–2026 squeeze/reversion 46–101).
 */
const RATIO_5Y_ANCHOR = [
  66.2, 68.5, 67.1, 69.8, 70.4, 72.1, 74.5, 76.2, 78.4, 79.1, 77.6, 80.2,
  82.5, 84.1, 86.3, 88.9, 91.2, 93.4, 89.7, 85.4, 83.2, 81.8, 79.5, 78.1,
  80.6, 82.9, 84.8, 86.1, 88.2, 90.5, 87.6, 85.0, 83.7, 82.1, 84.3, 86.7,
  88.4, 87.2, 84.9, 81.5, 79.2, 77.8, 80.1, 82.4, 85.6, 89.1, 91.8, 94.2,
  90.4, 87.1, 84.2, 81.0, 76.5, 72.8, 68.4, 61.5, 52.0, 64.5, 75.8, 84.5,
];

export function computeRatioAnalytics({ ratio, goldCloses = [], silverCloses = [] } = {}) {
  const sample = [...RATIO_5Y_ANCHOR];
  const nLive = Math.min(goldCloses.length, silverCloses.length);
  if (nLive >= 5) {
    const gOff = goldCloses.length - nLive;
    const sOff = silverCloses.length - nLive;
    const step = Math.max(1, Math.floor(nLive / 12));
    for (let i = 0; i < nLive; i += step) {
      const g = goldCloses[gOff + i];
      const s = silverCloses[sOff + i];
      if (g > 0 && s > 0) {
        const r = g / s;
        if (r >= 25 && r <= 140) sample.push(r);
      }
    }
  }

  const current = Number.isFinite(ratio) && ratio > 0 ? ratio : 82;
  const mean = sample.reduce((a, b) => a + b, 0) / sample.length;
  const std = Math.max(2.5, stdDev(sample));
  const zScore = (current - mean) / std;
  const belowCount = sample.filter((v) => v <= current).length;
  const percentile5y = Math.round(clamp((belowCount / sample.length) * 100, 1, 99));

  let regime = 'Fair Value Range';
  let swapBias = 'Hold / Neutral';
  let tone = 'neutral';

  if (zScore >= 1.15 || current >= 90) {
    regime = 'Silver Historically Cheap';
    swapBias = 'Rotate Gold → Silver';
    tone = 'bullish';
  } else if (zScore >= 0.45 || current >= 85) {
    regime = 'Silver Discount Zone';
    swapBias = 'Rotate Gold → Silver';
    tone = 'bullish';
  } else if (zScore <= -1.15 || current <= 66) {
    regime = 'Gold Historically Cheap';
    swapBias = 'Rotate Silver → Gold';
    tone = 'gold';
  } else if (zScore <= -0.45 || current <= 73) {
    regime = 'Gold Discount Zone';
    swapBias = 'Rotate Silver → Gold';
    tone = 'gold';
  }

  return {
    current: +current.toFixed(2),
    mean5y: +mean.toFixed(1),
    std5y: +std.toFixed(1),
    zScore: +zScore.toFixed(2),
    percentile5y,
    regime,
    swapBias,
    tone,
  };
}

export function computeSetupQuality({
  metal = 'gold',
  spot = 0,
  regime = null,
  rsi14 = null,
  dailyVol = 0.012,
  fibLevels = null,
  dollarStrength = null,
  basis = null,
  unitScore = 0,
} = {}) {
  const isSilver = metal === 'silver';
  const discScore = Number.isFinite(regime?.discoveryScore) ? regime.discoveryScore : 45;
  const sqzScore = Number.isFinite(regime?.squeezeScore) ? regime.squeezeScore : 30;
  const isBackw = Boolean(regime?.isBackwardation || basis?.isBackwardation || (basis?.basisUsd ?? 1) < 0);
  const dxyScore = Number.isFinite(dollarStrength?.score) ? dollarStrength.score : 50;
  const hasRsi = Number.isFinite(rsi14);

  // Derive realistic Support / Resistance anchored to Fib Golden Pocket (50%-61.8%) or volatility range
  let support = spot > 0 ? spot * (1 - clamp(dailyVol * 2.3, 0.018, 0.085)) : 0;
  let resistance = spot > 0 ? spot * (1 + clamp(dailyVol * 2.5, 0.02, 0.095)) : 0;
  if (fibLevels && Number.isFinite(fibLevels.swingLow) && Number.isFinite(fibLevels.swingHigh) && fibLevels.swingHigh > fibLevels.swingLow) {
    const lv50 = fibLevels.levels?.find((l) => l.ratio === 0.5)?.price;
    const lv618 = fibLevels.levels?.find((l) => l.ratio === 0.618)?.price;
    const lv382 = fibLevels.levels?.find((l) => l.ratio === 0.382)?.price;
    const belowCandidates = [fibLevels.swingLow, lv618, lv50, lv382].filter((v) => Number.isFinite(v) && v < spot * 0.996);
    const aboveCandidates = [fibLevels.swingHigh, lv382, lv50, lv618].filter((v) => Number.isFinite(v) && v > spot * 1.004);
    if (belowCandidates.length) support = Math.max(...belowCandidates);
    if (aboveCandidates.length) resistance = Math.min(...aboveCandidates);
  }

  let label = 'Balanced / Range-Bound';
  let score = 52;
  let tone = 'neutral';
  let summary = 'Mixed macro and physical forces — scale patiently near support or wait for regime breakout.';

  const exhaustionRisk = sqzScore >= 65 && discScore < 45 && hasRsi && rsi14 >= 78;

  if (exhaustionRisk) {
    label = 'Squeeze Exhaustion — Slam Risk';
    score = Math.round(clamp(34 - (rsi14 - 78) * 1.1, 18, 36));
    tone = 'bearish';
    summary = `Overextended short-covering (RSI ${rsi14.toFixed(0)}, ${sqzScore}S vs ${discScore}D) without strong structural backing — elevated sudden slam/pullback risk.`;
  } else if (sqzScore >= 60 && ((hasRsi && rsi14 >= 66) || discScore < 48)) {
    label = 'Squeeze Breakout — Chase Caution';
    score = Math.round(clamp(58 + (isBackw ? 8 : 0) + (discScore - 40) * 0.2, 48, 74));
    tone = 'hybrid';
    summary = `${isBackw ? 'COMEX backwardation + high' : 'High'} squeeze tension (${sqzScore}S) favors explosive upside spikes, but avoid chasing green candles — prefer pullbacks toward support.`;
  } else if ((hasRsi && rsi14 <= 36) || (discScore >= 52 && unitScore >= 0.10 && (!hasRsi || rsi14 <= 56))) {
    label = 'Accumulation / Dip-Buy Zone';
    const rsiBonus = hasRsi && rsi14 <= 36 ? clamp((38 - rsi14) * 0.85, 0, 18) : 0;
    score = Math.round(clamp(70 + rsiBonus + (discScore - 50) * 0.35 + (isBackw ? 6 : 0), 66, 94));
    tone = 'bullish';
    summary =
      hasRsi && rsi14 <= 36
        ? `Oversold momentum (RSI ${rsi14.toFixed(0)}) creates a favorable risk/reward accumulation zone near support${isBackw ? ' backed by COMEX backwardation' : ''}.`
        : `Structural Price Discovery (${discScore}D) supports steady accumulation without overbought stretch.`;
  } else if (discScore >= 58 && unitScore >= 0.14) {
    label = 'Structural Uptrend';
    score = Math.round(clamp(72 + (discScore - 58) * 0.45 + (isBackw ? 5 : 0), 70, 92));
    tone = 'bullish';
    summary = `True Price Discovery (${discScore}D) backed by macro/physical pillars — trend favors holding core bullion and buying orderly dips.`;
  } else if ((unitScore <= -0.20 && dxyScore >= 60) || (discScore < 40 && unitScore <= -0.18)) {
    label = 'Macro Headwind — Wait';
    score = Math.round(clamp(32 - Math.max(0, dxyScore - 60) * 0.4 + unitScore * 18, 16, 42));
    tone = 'bearish';
    summary = `Firm USD (${dxyScore}/100) and soft structural demand (${discScore}D) weigh on near-term momentum — wait for support test or RSI washout.`;
  } else if (isBackw && unitScore >= -0.05) {
    label = 'Physical Tightness — Watch Breakout';
    score = Math.round(clamp(64 + (sqzScore - 40) * 0.25, 58, 78));
    tone = 'bullish';
    summary = `Spot-to-futures backwardation signals tight immediate ${isSilver ? 'silver' : 'gold'} supply — upside price discovery trigger is active.`;
  }

  return {
    metal,
    label,
    score,
    tone,
    summary,
    support: +support.toFixed(isSilver ? 2 : 0),
    resistance: +resistance.toFixed(isSilver ? 2 : 0),
    rsi14: hasRsi ? +rsi14.toFixed(1) : null,
  };
}

export function computeQuantSignals(series = {}) {
  const goldCloses = series.gold || [];
  const silverCloses = series.silver || [];
  const dxyCloses = series.dxy || [];
  const spxCloses = series.spx || [];
  const tnxCloses = series.tnx || [];
  const vixCloses = series.vix || [];

  const goldRet = dailyReturns(goldCloses.slice(-30));
  const silverRet = dailyReturns(silverCloses.slice(-30));

  const goldStd = stdDev(goldRet);
  const goldEwma = ewmaVolatility(goldCloses);
  const goldGk = garmanKlassVol(series.goldOpen, series.goldHigh, series.goldLow, goldCloses);
  const goldBlendVol =
    goldGk && goldStd && goldEwma
      ? 0.40 * goldStd + 0.35 * goldEwma + 0.25 * goldGk
      : goldEwma && goldStd
        ? 0.55 * goldStd + 0.45 * goldEwma
        : goldStd;

  const silverStd = stdDev(silverRet);
  const silverEwma = ewmaVolatility(silverCloses);
  const silverGk = garmanKlassVol(series.silverOpen, series.silverHigh, series.silverLow, silverCloses);
  const silverBlendVol =
    silverGk && silverStd && silverEwma
      ? 0.40 * silverStd + 0.35 * silverEwma + 0.25 * silverGk
      : silverEwma && silverStd
        ? 0.55 * silverStd + 0.45 * silverEwma
        : silverStd;

  // Fallback daily volatilities if historical data is thin (typical long-run σ: ~0.95% gold, ~1.85% silver)
  const goldDailyVol = clamp(goldBlendVol || 0.0095, 0.0055, 0.028);
  const silverDailyVol = clamp(silverBlendVol || 0.0185, 0.010, 0.048);

  const goldLast = goldCloses[goldCloses.length - 1] ?? 2685;
  const silverLast = silverCloses[silverCloses.length - 1] ?? 31.5;
  const ratio = silverLast > 0 ? goldLast / silverLast : 85;

  const goldRsi14 = computeRsi14(goldCloses);
  const silverRsi14 = computeRsi14(silverCloses);

  // Trend: price vs 20d & 50d moving averages (damped at extreme RSI exhaustion readings)
  const goldSma20 = movingAverage(goldCloses, 20) ?? goldLast;
  const goldSma50 = movingAverage(goldCloses, 50) ?? goldLast;
  const silverSma20 = movingAverage(silverCloses, 20) ?? silverLast;
  const silverSma50 = movingAverage(silverCloses, 50) ?? silverLast;

  const rawGoldTrend = clamp(((goldLast - goldSma20) / goldSma20) * 14 + ((goldSma20 - goldSma50) / goldSma50) * 10, -1, 1);
  const rawSilverTrend = clamp(((silverLast - silverSma20) / silverSma20) * 10 + ((silverSma20 - silverSma50) / silverSma50) * 8, -1, 1);
  const goldTrend = dampenTrendByRsi(rawGoldTrend, goldRsi14);
  const silverTrend = dampenTrendByRsi(rawSilverTrend, silverRsi14);

  // Gold/Silver ratio mean-reversion (historical modern norm ~75-82)
  const ratioSignalSilver = clamp((ratio - 80) / 18, -0.7, 0.7);

  // Cross-market macro shifts (multi-timeframe DXY + 5-day rates/equities/metals)
  const dxyLast = dxyCloses.length ? dxyCloses[dxyCloses.length - 1] : null;
  const dxy5dPct = pctChangeOver(dxyCloses, 5);
  const dxy20dPct = pctChangeOver(dxyCloses, 20);
  const dxySma20 = movingAverage(dxyCloses, 20);
  const dxySma50 = movingAverage(dxyCloses, 50);
  const dxyVsSma20Pct =
    dxyLast != null && dxySma20 ? +(((dxyLast - dxySma20) / dxySma20) * 100).toFixed(2) : 0;
  const dxyVsSma50Pct =
    dxyLast != null && dxySma50 ? +(((dxyLast - dxySma50) / dxySma50) * 100).toFixed(2) : 0;

  const tnx5dPct = pctChangeOver(tnxCloses, 5);
  const spx5dPct = pctChangeOver(spxCloses, 5);
  const cuCloses = series.copper || [];
  const platCloses = series.platinum || [];
  const oilCloses = series.oil || [];
  const btcCloses = series.btc || [];
  const dowCloses = series.dow || [];
  const cu5dPct = pctChangeOver(cuCloses, 5);
  const plat5dPct = pctChangeOver(platCloses, 5);
  const vixLast = vixCloses[vixCloses.length - 1] ?? 16.5;

  // Rolling correlations (up to 60 trading days)
  const goldVsDxyCorr = pearsonCorrelation(dailyReturns(goldCloses.slice(-61)), dailyReturns(dxyCloses.slice(-61)));
  const silverVsDxyCorr = pearsonCorrelation(dailyReturns(silverCloses.slice(-61)), dailyReturns(dxyCloses.slice(-61)));
  const goldVsSpxCorr = pearsonCorrelation(dailyReturns(goldCloses.slice(-61)), dailyReturns(spxCloses.slice(-61)));

  // Multi-timeframe US Dollar Strength Score (0 = Very Weak USD Tailwind, 50 = Balanced, 100 = Strong USD Headwind)
  const dxyLevelTerm = dxyLast != null ? clamp((dxyLast - 101) / 8, -1, 1) : 0;
  const dxyTrendTerm = clamp(
    (dxy5dPct / 2.2) * 0.42 +
      (dxy20dPct / 4.2) * 0.33 +
      (dxyVsSma20Pct / 2.5) * 0.15 +
      (dxyVsSma50Pct / 4.0) * 0.10,
    -1,
    1
  );
  const dxyComposite = clamp(dxyLevelTerm * 0.38 + dxyTrendTerm * 0.62, -1, 1);
  const dxyStrengthScore = Math.round(clamp(50 + dxyComposite * 50, 0, 100));
  const dxyRegime =
    dxyStrengthScore >= 72
      ? 'Strong USD Headwind'
      : dxyStrengthScore >= 58
        ? 'Firm USD'
        : dxyStrengthScore <= 28
          ? 'Weak USD Tailwind'
          : dxyStrengthScore <= 42
            ? 'Soft USD'
            : 'Balanced USD';

  // Scale ratesUsdMacro dynamically by rolling DXY sensitivity + multi-timeframe DXY trend
  const dxySensitivity =
    goldVsDxyCorr != null && Number.isFinite(goldVsDxyCorr)
      ? clamp(0.75 + Math.max(0, -goldVsDxyCorr) * 0.65, 0.75, 1.3)
      : 1.0;
  const dxyMacroTerm = clamp(-(dxy5dPct / 2.2) * 0.58 - (dxy20dPct / 4.5) * 0.42, -1, 1);
  const ratesUsdMacro = clamp(dxyMacroTerm * 0.62 * dxySensitivity + (-tnx5dPct / 6.0) * 0.38, -1, 1);

  // Equity stress: moderate-to-high VIX + equity drawdown boosts Gold safe-haven demand
  const equityStressGold = clamp((-spx5dPct / 4.5) * 0.6 + ((vixLast - 17) / 16) * 0.4, -0.8, 0.9);
  // Silver reacts positively to moderate risk-on growth, negatively to acute crashes (VIX > 28)
  const equityStressSilver =
    vixLast > 28 ? clamp(-((vixLast - 25) / 20), -0.8, 0) : clamp((spx5dPct / 5.0) * 0.4, -0.5, 0.5);

  const ratioAnalytics = computeRatioAnalytics({
    ratio,
    goldCloses,
    silverCloses,
  });

  return {
    goldDailyVol,
    silverDailyVol,
    goldRsi14,
    silverRsi14,
    ratio: +ratio.toFixed(2),
    ratioAnalytics,
    goldTrend: +goldTrend.toFixed(3),
    silverTrend: +silverTrend.toFixed(3),
    ratioSignalSilver: +ratioSignalSilver.toFixed(3),
    ratesUsdMacro: +ratesUsdMacro.toFixed(3),
    equityStressGold: +equityStressGold.toFixed(3),
    equityStressSilver: +equityStressSilver.toFixed(3),
    dollarStrength: {
      dxy: dxyLast != null ? +dxyLast.toFixed(2) : null,
      dxy5dPct: +dxy5dPct.toFixed(2),
      dxy20dPct: +dxy20dPct.toFixed(2),
      dxyVsSma20Pct,
      dxyVsSma50Pct,
      score: dxyStrengthScore,
      regime: dxyRegime,
      unitBias: +(-dxyComposite).toFixed(3),
      goldVsDxyCorr,
      silverVsDxyCorr,
    },
    macroSnapshot: {
      dxy: dxyLast != null ? +dxyLast.toFixed(2) : null,
      dxy5dPct: +dxy5dPct.toFixed(2),
      dxy20dPct: +dxy20dPct.toFixed(2),
      dxyVsSma20Pct,
      dxyVsSma50Pct,
      dxyStrengthScore,
      dxyRegime,
      spx: spxCloses.length ? +spxCloses[spxCloses.length - 1].toFixed(1) : null,
      spx5dPct: +spx5dPct.toFixed(2),
      tnx: tnxCloses.length ? +tnxCloses[tnxCloses.length - 1].toFixed(2) : null,
      tnx5dPct: +tnx5dPct.toFixed(2),
      copper: cuCloses.length ? +cuCloses[cuCloses.length - 1].toFixed(2) : null,
      cu5dPct: +cu5dPct.toFixed(2),
      platinum: platCloses.length ? +platCloses[platCloses.length - 1].toFixed(1) : null,
      platinum5dPct: +plat5dPct.toFixed(2),
      oil: oilCloses.length ? +oilCloses[oilCloses.length - 1].toFixed(2) : null,
      btc: btcCloses.length ? +btcCloses[btcCloses.length - 1].toFixed(0) : null,
      dow: dowCloses.length ? +dowCloses[dowCloses.length - 1].toFixed(0) : null,
      vix: vixCloses.length ? +vixLast.toFixed(1) : null,
      goldRsi14,
      silverRsi14,
      goldVolAnnPct: +(goldDailyVol * Math.sqrt(252) * 100).toFixed(1),
      silverVolAnnPct: +(silverDailyVol * Math.sqrt(252) * 100).toFixed(1),
      goldVsDxyCorr,
      silverVsDxyCorr,
      goldVsSpxCorr,
    },
  };
}

/* ---------- Composite Outlook Builder ---------- */

function signalLabelFromScore(score) {
  if (score >= 45) return 'Strong Bullish';
  if (score >= 16) return 'Bullish';
  if (score <= -45) return 'Strong Bearish';
  if (score <= -16) return 'Bearish';
  return 'Neutral';
}

export const SEASONAL_20Y_MONTHLY = {
  gold: [2.8, 0.4, -0.3, 1.1, 0.2, -0.5, 1.5, 1.9, -0.4, 0.3, 1.4, 2.1],
  silver: [3.1, 1.2, -0.9, 1.8, -0.6, -1.1, 2.9, 1.6, -1.3, 0.8, 1.7, 2.6],
};

export function getUpcoming30dSeasonality(metal = 'gold', nowDate = new Date()) {
  const arr = SEASONAL_20Y_MONTHLY[metal === 'silver' ? 'silver' : 'gold'];
  const d = nowDate instanceof Date ? nowDate : new Date(nowDate);
  const mIdx = d.getUTCMonth();
  const nextIdx = (mIdx + 1) % 12;
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), mIdx + 1, 0)).getUTCDate();
  const remFrac = clamp((daysInMonth - d.getUTCDate() + 1) / 30, 0.05, 1);
  const blendedPct = arr[mIdx] * remFrac + arr[nextIdx] * (1 - remFrac);
  const unitTilt = clamp(blendedPct / 16, -0.14, 0.14);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return {
    blendedPct: +blendedPct.toFixed(2),
    unitTilt: +unitTilt.toFixed(3),
    windowLabel: remFrac >= 0.72 ? months[mIdx] : `${months[mIdx]}–${months[nextIdx]}`,
    label: blendedPct >= 0.8 ? 'Seasonal Tailwind' : blendedPct <= -0.4 ? 'Seasonal Soft Patch' : 'Neutral Seasonality',
  };
}

/**
 * Cross-Asset Lead-Lag Alpha: captures signals that empirically lead Gold/Silver spot by 1-10 days:
 *  - Gold/Silver Miners relative strength vs metal (GDX/GC, SIL/SI)
 *  - Shanghai SGE physical arbitrage premium
 *  - COMEX spot-to-futures backwardation tightness
 *  - Cross-metal Gold/Silver ratio catch-up pressure
 */
export function computeCrossAssetLeadLag({
  metal = 'gold',
  proSignals = null,
  shanghai = null,
  basis = null,
  physicalPremiums = null,
  aiDatacenter = null,
  ratio = 82,
} = {}) {
  const isSilver = metal === 'silver';
  const minersSig = clamp(
    Number(isSilver ? proSignals?.miners?.silverSignal : proSignals?.miners?.goldSignal) || 0,
    -1,
    1
  );

  let sgeLead = 0;
  if (shanghai?.[metal]) {
    const prem = isSilver ? shanghai.silver.exVatPremiumUsdOz : shanghai.gold.premiumUsdOz;
    if (typeof prem === 'number' && Number.isFinite(prem)) {
      sgeLead = isSilver ? clamp(prem / 3.5, -0.8, 0.8) : clamp((prem - 5) / 42, -0.8, 0.8);
    }
  }

  const basisMetal = basis?.[metal] || null;
  const backwLead =
    basisMetal?.isBackwardation || (basisMetal?.basisUsd ?? 1) < 0
      ? (isSilver ? 0.72 : 0.58)
      : basisMetal?.state === 'Compressed EFP'
        ? 0.28
        : 0;

  const physLead = clamp(Number(physicalPremiums?.[metal]?.signal) || 0, -0.4, 0.92);
  const aiLead = clamp(Number(aiDatacenter?.[metal]?.signal) || 0, -0.65, 0.92);

  const ratioLead = isSilver
    ? clamp((ratio - 76) / 22, -0.55, 0.75)
    : clamp((70 - ratio) / 28, -0.25, 0.35);

  const score = isSilver
    ? clamp(
        minersSig * 0.29 + sgeLead * 0.19 + backwLead * 0.14 + physLead * 0.15 + aiLead * 0.15 + ratioLead * 0.08,
        -1,
        1
      )
    : clamp(
        minersSig * 0.33 + sgeLead * 0.21 + backwLead * 0.15 + physLead * 0.16 + aiLead * 0.06 + ratioLead * 0.09,
        -1,
        1
      );
  const label =
    score >= 0.22
      ? 'Lead Signals Bullish ↑'
      : score <= -0.22
        ? 'Lead Signals Soft ↓'
        : 'Lead Signals Balanced';

  return {
    score: +score.toFixed(3),
    label,
    components: {
      minersLead: +minersSig.toFixed(3),
      shanghaiLead: +sgeLead.toFixed(3),
      backwardationLead: +backwLead.toFixed(3),
      physicalPremLead: +physLead.toFixed(3),
      aiDatacenterLead: +aiLead.toFixed(3),
      ratioLead: +ratioLead.toFixed(3),
    },
  };
}

/**
 * Strictly Causal Empirical Historical Twin Matcher (Cosine-Similarity K-Nearest-Neighbors):
 * Searches past trading windows (>= 21 trading days ago so forward 30d returns are strictly realized)
 * matching today's [20d trend, RSI, trailing vol, DXY 20d] state.
 */
export function computeEmpiricalHistoricalTwins({
  closes = [],
  dxy = [],
  vix = [],
  tnx = [],
  horizonDays = 21,
} = {}) {
  const n = closes.length;
  if (n < 48) return null;

  const stateVecAt = (idx) => {
    if (idx < 20) return null;
    const c = closes[idx];
    const c5 = closes[idx - 5];
    const c20 = closes[idx - 20];
    if (!(c > 0 && c5 > 0 && c20 > 0)) return null;
    const ret5 = ((c - c5) / c5) * 100;
    const ret20 = ((c - c20) / c20) * 100;
    let gains = 0;
    let losses = 0;
    let sqVol = 0;
    for (let k = idx - 13; k <= idx; k++) {
      const diff = closes[k] - closes[k - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
      if (closes[k - 1] > 0) {
        const r = (closes[k] - closes[k - 1]) / closes[k - 1];
        sqVol += r * r;
      }
    }
    const rsi = losses === 0 ? (gains === 0 ? 50 : 88) : 100 - 100 / (1 + gains / losses);
    const vol14 = Math.sqrt(sqVol / 14) * 100;
    let dxy20 = 0;
    const dxyIdx = idx + (dxy.length - n);
    if (dxy.length >= 25 && dxyIdx >= 20 && dxyIdx < dxy.length && dxy[dxyIdx] > 0 && dxy[dxyIdx - 20] > 0) {
      dxy20 = ((dxy[dxyIdx] - dxy[dxyIdx - 20]) / dxy[dxyIdx - 20]) * 100;
    }
    const vec = [
      clamp(ret5 / 3.0, -2.5, 2.5),
      clamp(ret20 / 6.5, -2.5, 2.5),
      clamp((rsi - 50) / 18, -2.5, 2.5),
      clamp((vol14 - 1.2) / 0.8, -2.5, 2.5),
      clamp(-dxy20 / 3.0, -2.5, 2.5),
    ];
    // Multi-factor macro conditioning: add VIX regime & 10Y Treasury Yield momentum (right-aligned for holiday robustness)
    const vixIdx = idx + (vix.length - n);
    if (vix.length >= 25 && vixIdx >= 0 && vixIdx < vix.length && vix[vixIdx] > 0) {
      vec.push(clamp((vix[vixIdx] - 18) / 7.5, -2.5, 2.5));
    }
    const tnxIdx = idx + (tnx.length - n);
    if (tnx.length >= 25 && tnxIdx >= 20 && tnxIdx < tnx.length && tnx[tnxIdx] > 0 && tnx[tnxIdx - 20] > 0) {
      const tnx20 = ((tnx[tnxIdx] - tnx[tnxIdx - 20]) / tnx[tnxIdx - 20]) * 100;
      vec.push(clamp(-tnx20 / 8.0, -2.5, 2.5));
    }
    return vec;
  };

  const curVec = stateVecAt(n - 1);
  if (!curVec) return null;
  const norm = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  const curNorm = norm(curVec);

  const matches = [];
  for (let i = 20; i <= n - 1 - horizonDays; i++) {
    const v = stateVecAt(i);
    if (!v) continue;
    let dot = 0;
    for (let j = 0; j < v.length; j++) dot += curVec[j] * v[j];
    const sim = dot / (curNorm * norm(v));
    if (sim >= 0.45 && closes[i] > 0 && closes[i + horizonDays] > 0) {
      const fwdPct = ((closes[i + horizonDays] - closes[i]) / closes[i]) * 100;
      matches.push({ idx: i, sim, fwdPct });
    }
  }
  if (!matches.length) return null;

  // Pick top 4 non-overlapping matches (spaced >= 4 trading days apart)
  matches.sort((a, b) => b.sim - a.sim);
  const picked = [];
  for (const m of matches) {
    if (picked.every((p) => Math.abs(p.idx - m.idx) >= 4)) {
      picked.push(m);
      if (picked.length >= 4) break;
    }
  }
  if (!picked.length) return null;

  const wSum = picked.reduce((s, m) => s + m.sim, 0) || 1;
  const avgReturnPct = picked.reduce((s, m) => s + m.fwdPct * m.sim, 0) / wSum;
  const avgSimPct = Math.round((wSum / picked.length) * 100);
  const upPct = Math.round((picked.filter((m) => m.fwdPct > 0).length / picked.length) * 100);

  return {
    count: picked.length,
    matchPct: clamp(avgSimPct, 45, 97),
    avgReturnPct: +avgReturnPct.toFixed(2),
    upPct,
    unitTilt: +clamp(avgReturnPct / 12, -0.35, 0.35).toFixed(3),
  };
}

/**
 * Fine-Tuned Next 30 Days Precision Projection Model (21 trading days):
 *  - Structural slow-driver 30D weighting (Real Yields, Central Banks, COMEX, Shanghai, Deficits)
 *  - 4-Specialist Ensemble (Structural Macro, Hurst Trend/Reversion, Lead-Lag Alpha, Seasonal+Twins)
 *  - Ensemble Agreement Damping & RSI(14) mean-reversion brake
 *  - Asymmetric Upside/Downside Semi-Volatility calibrated ranges
 *  - Curved 4-Checkpoint Trajectory: Day 7 -> Day 14 -> Day 21 -> Day 30
 */
export function project30DayPrecision({
  spotPrice,
  dailyVol,
  shortTermUnit = 0,
  drivers = {},
  quant = {},
  metal = 'gold',
  regimeWeightSet = null,
  marketGaps = null,
  proSignals = null,
  shanghai = null,
  basis = null,
  physicalPremiums = null,
  aiDatacenter = null,
  learnedWeights = null,
  series = {},
  coneMultiplier = 1.0,
  nowDate = new Date(),
}) {
  const isSilver = metal === 'silver';
  const closes = Array.isArray(series?.[metal]) ? series[metal] : [];
  const dxySeries = Array.isArray(series?.dxy) ? series.dxy : [];

  // 1. Structural 30-day driver weighting (slow fundamental forces dominate over 21 trading days)
  const slowBoostMap = {
    rates_usd: 1.28,
    central_banks: 1.25,
    mining_supply: 1.22,
    comex_paper: 1.20,
    shanghai_sge: 1.18,
    inflation: 1.15,
    geopolitics: 0.96,
    positioning_miners: 0.92,
    equities: 0.68,
  };
  let wTotal = 0;
  let structSum = 0;
  const driverContribs = [];
  for (const [id, meta] of Object.entries(DRIVER_META)) {
    const baseW =
      regimeWeightSet?.[metal]?.[id] ?? (isSilver ? meta.silverWeight : meta.goldWeight);
    const w30 = baseW * (slowBoostMap[id] ?? 1.0);
    const dVal = Number(drivers?.[id]?.[metal] ?? 0);
    structSum += dVal * w30;
    wTotal += w30;
    driverContribs.push({ id, label: meta.shortLabel, contrib: dVal * w30, raw: dVal });
  }
  const structuralMacroUnit = clamp((wTotal > 0 ? structSum / wTotal : 0) * 1.48, -1, 1);

  // 2. Hurst Exponent Market State + RSI(14) Exhaustion Mean-Reversion Brake
  const hurstInfo = computeHurstExponent(closes.slice(-60));
  const rsi14 = isSilver ? (quant?.silverRsi14 ?? 50) : (quant?.goldRsi14 ?? 50);
  const rawTrend = isSilver ? (quant?.silverTrend ?? 0) : (quant?.goldTrend ?? 0);
  const hurstTrendScale = clamp(1 + (hurstInfo.hurst - 0.50) * 1.35, 0.55, 1.45);
  const rsiBrake =
    rsi14 >= 70
      ? -clamp((rsi14 - 68) / 24, 0, 0.55)
      : rsi14 <= 30
        ? clamp((32 - rsi14) / 24, 0, 0.55)
        : 0;
  const techReversionUnit = clamp(rawTrend * 0.72 * hurstTrendScale + rsiBrake, -1, 1);

  // 3. Cross-Asset Lead-Lag Alpha (Miners + Shanghai + Backwardation + Physical Dealer Premiums + AI Data Centers + Ratio)
  const leadLag = computeCrossAssetLeadLag({
    metal,
    proSignals,
    shanghai,
    basis,
    physicalPremiums,
    aiDatacenter,
    ratio: quant?.ratio ?? 82,
  });

  // 4. 20-Year Calendar Seasonality + Empirical Historical Twin Matcher + Ratio Pull
  const seasonality = getUpcoming30dSeasonality(metal, nowDate);
  const twins = computeEmpiricalHistoricalTwins({
    closes,
    dxy: dxySeries,
    vix: Array.isArray(series?.vix) ? series.vix : [],
    tnx: Array.isArray(series?.tnx) ? series.tnx : [],
    horizonDays: 21,
  });
  const ratioPull = isSilver ? clamp(quant?.ratioSignalSilver ?? 0, -0.5, 0.5) * 0.45 : 0;
  const cycleSeasonalUnit = clamp(
    seasonality.unitTilt * 2.1 + (twins?.unitTilt ?? 0) * 0.85 + ratioPull,
    -1,
    1
  );

  // 4b. Frequency-Domain Spectral Cycle Specialist (DFT PSD + Phase-Locked Harmonic Regression)
  const spectral = computeSpectralForecast(closes, {
    horizonDays: 21,
    minPeriod: 4,
    maxPeriod: 90,
    maxHarmonics: 3,
    sampleLabel: 'days',
  });
  // Adaptive weight: scales from 6% in noisy spectra up to 14% when dominant cycles are crystal clear
  const specWeight = spectral.available
    ? +clamp(0.06 + spectral.clarityScore * 0.08, 0.06, 0.14).toFixed(3)
    : 0.06;
  const remWeight = 1 - specWeight;

  // 5. 5-Specialist 30D Ensemble (incl. Frequency-Domain Spectral Cycles) + Disagreement Damping
  const modelVotes = [
    { id: 'macro', label: 'Macro & Vaults', unit: structuralMacroUnit, weight: +(0.46 * remWeight).toFixed(3) },
    { id: 'leadlag', label: 'Lead-Lag Alpha', unit: leadLag.score, weight: +(0.22 * remWeight).toFixed(3) },
    { id: 'hurst', label: 'Hurst & RSI', unit: techReversionUnit, weight: +(0.16 * remWeight).toFixed(3) },
    { id: 'seasonal', label: 'Seasonal & Twins', unit: cycleSeasonalUnit, weight: +(0.16 * remWeight).toFixed(3) },
    { id: 'spectral', label: 'Spectral Cycles (FFT)', unit: spectral.spectralUnitScore, weight: specWeight },
  ];
  const upVotes = modelVotes.filter((m) => m.unit >= 0.08).length;
  const dnVotes = modelVotes.filter((m) => m.unit <= -0.08).length;
  const agreeCount = Math.max(upVotes, dnVotes, modelVotes.filter((m) => Math.abs(m.unit) < 0.08).length);
  const agreementPct = Math.round((agreeCount / modelVotes.length) * 100);
  const agreeDamp = agreementPct >= 80 ? 1.0 : agreementPct >= 60 ? 0.91 : 0.76;

  // Gaps decay to 35% strength over 30 days; backwardation & learned 30D bias add crisp structural calibration
  const gapDecay30d = (marketGaps?.[metal]?.predictionBoost || 0) * 0.35;
  const learned30dBias = clamp(
    ((isSilver ? learnedWeights?.driftBias30dSilverPct : learnedWeights?.driftBias30dGoldPct) || 0) * 0.12,
    -0.08,
    0.08
  );

  const rawUnit30d = modelVotes.reduce((s, m) => s + m.unit * m.weight, 0);
  const ai30dBoost = (aiDatacenter?.[metal]?.predictionBoost || 0) * (isSilver ? 0.85 : 0.45);
  const unit30d = clamp(rawUnit30d * agreeDamp + gapDecay30d + ai30dBoost + learned30dBias, -1, 1);

  // 6. Asymmetric Upside / Downside Semi-Volatility (GJR-style bullion squeeze vs liquidation skew)
  const rets45 = dailyReturns(closes.slice(-45));
  let upSq = 0;
  let upN = 0;
  let dnSq = 0;
  let dnN = 0;
  for (const r of rets45) {
    if (r >= 0) {
      upSq += r * r;
      upN++;
    } else {
      dnSq += r * r;
      dnN++;
    }
  }
  const baseVol = Math.max(0.005, dailyVol);
  const upDailyVol = upN >= 5 ? clamp(Math.sqrt(upSq / upN), baseVol * 0.72, baseVol * 1.38) : baseVol;
  const dnDailyVol = dnN >= 5 ? clamp(Math.sqrt(dnSq / dnN), baseVol * 0.72, baseVol * 1.38) : baseVol;

  const sigma30 = baseVol * Math.sqrt(21);
  const expectedDrift = unit30d * sigma30 * 0.74;
  const mult = clamp(coneMultiplier, 0.85, 1.32);
  const upBand = 1.08 * upDailyVol * Math.sqrt(21) * mult;
  const dnBand = 1.08 * dnDailyVol * Math.sqrt(21) * mult;

  const basePct = expectedDrift * 100;
  const bullPct = (expectedDrift + upBand) * 100;
  const bearPct = (expectedDrift - dnBand) * 100;

  // Calibrated probability of finishing higher after 30 days (logistic approximation to normal CDF)
  const zScore = sigma30 > 0 ? expectedDrift / sigma30 : 0;
  const probHigherPct = Math.round(clamp((1 / (1 + Math.exp(-1.7 * zScore))) * 100, 12, 88));

  // 7. Curved 4-Checkpoint 30-Day Path (Day 7 -> Day 14 -> Day 21 -> Day 30)
  // Weeks 1-2 reflect fast catalysts/RSI/gap dynamics; Weeks 3-4 converge onto structural 30D drift
  const fast7dPct = clamp(shortTermUnit * baseVol * Math.sqrt(5) * 0.72 * 100, -12, 12);
  const d7Pct = +(fast7dPct * 0.65 + basePct * 0.30).toFixed(2);
  const d14Pct = +(fast7dPct * 0.35 + basePct * 0.58).toFixed(2);
  const d21Pct = +(fast7dPct * 0.12 + basePct * 0.82).toFixed(2);
  const d30Pct = +basePct.toFixed(2);

  const mkNode = (day, label, pct, note) => ({
    day,
    label,
    pct,
    price: +(spotPrice * (1 + pct / 100)).toFixed(2),
    note,
  });

  const milestones = [
    mkNode(7, 'Day 7', d7Pct, Math.abs(rsiBrake) >= 0.15 ? 'Momentum / RSI check' : 'Near-term flow'),
    mkNode(14, 'Day 14', d14Pct, Math.abs(leadLag.score) >= 0.18 ? 'Lead-lag pass-through' : 'Mid-month balance'),
    mkNode(21, 'Day 21', d21Pct, 'Structural macro build'),
    mkNode(30, 'Day 30', d30Pct, seasonality.label),
  ];

  driverContribs.sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib));
  const topDrivers30d = driverContribs
    .filter((d) => Math.abs(d.raw) >= 0.08)
    .slice(0, 2)
    .map((d) => d.label);

  return {
    bear: +(spotPrice * (1 + bearPct / 100)).toFixed(2),
    base: +(spotPrice * (1 + basePct / 100)).toFixed(2),
    bull: +(spotPrice * (1 + bullPct / 100)).toFixed(2),
    bearPct: +bearPct.toFixed(2),
    expectedPct: +basePct.toFixed(2),
    bullPct: +bullPct.toFixed(2),
    unit30d: +unit30d.toFixed(3),
    score30d: Math.round(unit30d * 100),
    probHigherPct,
    agreementPct,
    agreeCount,
    hurst: hurstInfo.hurst,
    hurstLabel: hurstInfo.label,
    leadLag,
    seasonality,
    historicalTwins: twins,
    spectral,
    milestones,
    topDrivers30d,
    modelVotes: modelVotes.map((m) => ({
      id: m.id,
      label: m.label,
      weight: m.weight,
      dir: m.unit >= 0.08 ? 'up' : m.unit <= -0.08 ? 'down' : 'flat',
      score: Math.round(m.unit * 100),
    })),
  };
}

export function projectHorizon(spotPrice, dailyVol, compositeUnitScore, tradingDays, coneMultiplier = 1.0) {
  const sigmaH = dailyVol * Math.sqrt(tradingDays);
  // Modest expected drift capped to realistic fraction of horizon volatility
  const expectedDrift = compositeUnitScore * sigmaH * 0.72;
  const bandHalfWidth = 1.15 * sigmaH * clamp(coneMultiplier, 0.85, 1.35);
  const bearPct = (expectedDrift - bandHalfWidth) * 100;
  const basePct = expectedDrift * 100;
  const bullPct = (expectedDrift + bandHalfWidth) * 100;

  return {
    bear: +(spotPrice * (1 + bearPct / 100)).toFixed(2),
    base: +(spotPrice * (1 + basePct / 100)).toFixed(2),
    bull: +(spotPrice * (1 + bullPct / 100)).toFixed(2),
    bearPct: +bearPct.toFixed(2),
    expectedPct: +basePct.toFixed(2),
    bullPct: +bullPct.toFixed(2),
  };
}

export function matchHistoricalAnalogs(driverScores, overallDir) {
  const activeDrivers = Object.entries(driverScores)
    .filter(([, d]) => Math.abs(d.gold) >= 0.12 || Math.abs(d.silver) >= 0.12)
    .sort((a, b) => Math.max(Math.abs(b[1].gold), Math.abs(b[1].silver)) - Math.max(Math.abs(a[1].gold), Math.abs(a[1].silver)))
    .map(([id]) => id);

  const scored = HISTORICAL_ANALOGS.map((analog) => {
    let relevance = 0;
    for (const d of analog.drivers) {
      const idx = activeDrivers.indexOf(d);
      if (idx === 0) relevance += 3.0;
      else if (idx === 1) relevance += 2.2;
      else if (idx >= 2) relevance += 1.4;
    }
    if (analog.direction === overallDir) relevance += 1.2;
    else if (analog.direction === 'mixed') relevance += 0.5;
    return { ...analog, relevance: +relevance.toFixed(2) };
  });

  scored.sort((a, b) => b.relevance - a.relevance);
  return scored.slice(0, 3);
}

/* ---------- Short Squeeze vs. True Price Discovery Classifier ---------- */

function classifyMarketRegimeLabel(discoveryScore, squeezeScore) {
  if (discoveryScore >= 58 && squeezeScore >= 58) {
    return { label: 'Hybrid: Squeeze + Discovery', key: 'hybrid' };
  }
  if (discoveryScore >= 58 && discoveryScore >= squeezeScore) {
    return { label: 'True Price Discovery', key: 'discovery' };
  }
  if (squeezeScore >= 58 && squeezeScore > discoveryScore) {
    return { label: 'Short Squeeze', key: 'squeeze' };
  }
  if (discoveryScore >= 45 && discoveryScore >= squeezeScore + 8) {
    return { label: 'Discovery Bias', key: 'discovery' };
  }
  if (squeezeScore >= 45 && squeezeScore >= discoveryScore + 8) {
    return { label: 'Squeeze Bias', key: 'squeeze' };
  }
  return { label: 'Consolidation / Neutral', key: 'neutral' };
}

export function computeMarketRegimeDecomposition({
  drivers = {},
  quant = {},
  comex = null,
  shanghai = null,
  proSignals = null,
  institutionalSignals = null,
} = {}) {
  const driverMap = Array.isArray(drivers)
    ? Object.fromEntries(drivers.map((d) => [d.id, d]))
    : drivers || {};

  const dVal = (id, metal) => {
    const v = driverMap?.[id]?.[metal];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  };

  const normDiscoveryPillar = (v) => clamp(0.42 + v * 0.54, 0.06, 1.0);

  const scoreMetal = (metal) => {
    const isSilver = metal === 'silver';

    // 1. True Price Discovery (0-100): structural repricing pillars
    //    - 10Y TIPS real yields & DXY (rates_usd)
    //    - Shanghai physical SGE premiums (shanghai_sge)
    //    - Sovereign reserve & ETF flows (central_banks / inflation)
    //    - Producer confirmation (miners)
    //    - Steady multi-week trend
    const ratesSig = dVal('rates_usd', metal);

    let sgeSig = dVal('shanghai_sge', metal);
    if (sgeSig === 0 && shanghai?.[metal]) {
      const prem = isSilver ? shanghai.silver.exVatPremiumUsdOz : shanghai.gold.premiumUsdOz;
      if (typeof prem === 'number' && Number.isFinite(prem)) {
        sgeSig = isSilver ? clamp(prem / 3.5, -0.85, 0.9) : clamp((prem - 5) / 42, -0.85, 0.9);
      }
    }

    const cbSig = dVal('central_banks', metal);
    const inflSig = dVal('inflation', metal);
    const cbInflSig = cbSig * 0.62 + inflSig * 0.38;

    const minersRaw = isSilver ? proSignals?.miners?.silverSignal : proSignals?.miners?.goldSignal;
    const minersSig =
      typeof minersRaw === 'number' && Number.isFinite(minersRaw)
        ? minersRaw
        : dVal('positioning_miners', metal) * 0.5;

    const trendRaw = isSilver ? quant?.silverTrend : quant?.goldTrend;
    const trendSig = typeof trendRaw === 'number' && Number.isFinite(trendRaw) ? trendRaw : 0;

    const discWeighted =
      normDiscoveryPillar(ratesSig) * 0.26 +
      normDiscoveryPillar(sgeSig) * 0.22 +
      normDiscoveryPillar(cbInflSig) * 0.20 +
      normDiscoveryPillar(minersSig) * 0.16 +
      normDiscoveryPillar(trendSig) * 0.16;

    const discoveryScore = Math.round(clamp(discWeighted * 100, 0, 100));

    // 2. Short Squeeze (0-100): acute mechanical & delivery squeeze catalysts
    //    - COMEX paper-to-registered vault leverage (comex_paper + ratio + vault drain)
    //    - Spot-to-Futures downward-sloping backwardation (isBackwardation)
    //    - Washed-out CFTC Managed Money positioning (<= 35% 52w percentile)
    //    - ^GVZ volatility / gamma pressure
    const comexMetal = comex?.[metal] || null;
    const comexDriver = dVal('comex_paper', metal);
    const ratio = comexMetal?.paperToRegisteredRatio;
    const reg30d = comexMetal?.registered30dPct ?? 0;
    const oi4w = comexMetal?.oi4wPct ?? 0;

    const ratioNorm =
      typeof ratio === 'number' && Number.isFinite(ratio)
        ? isSilver
          ? clamp((ratio - 3.0) / 3.8, 0, 1)
          : clamp((ratio - 2.0) / 3.4, 0, 1)
        : 0;
    const drainNorm = reg30d < 0 ? clamp(-reg30d / 12, 0, 0.35) : 0;
    const oiBuildNorm = oi4w > 2 ? clamp((oi4w - 2) / 14, 0, 0.22) : 0;
    const comexDriverNorm = clamp((comexDriver + 0.05) / 0.95, 0, 1);

    const comexCombined =
      typeof ratio === 'number' && Number.isFinite(ratio)
        ? clamp(ratioNorm * 0.55 + drainNorm * 0.2 + oiBuildNorm + comexDriverNorm * 0.25, 0, 1)
        : comexDriverNorm;
    const comexPts = comexCombined * 34;

    const basisMetal = institutionalSignals?.basis?.[metal] || null;
    const isBackwardation =
      basisMetal?.isBackwardation === true ||
      (typeof basisMetal?.basisUsd === 'number' && Number.isFinite(basisMetal.basisUsd) && basisMetal.basisUsd < 0);
    const basisPct = typeof basisMetal?.basisPct === 'number' && Number.isFinite(basisMetal.basisPct) ? basisMetal.basisPct : null;
    let basisPts = 0;
    if (isBackwardation) {
      basisPts = 20 + clamp(Math.abs(basisPct ?? 0.2) / 0.8, 0, 1) * 4;
    } else if (basisMetal && basisPct != null && basisPct < (isSilver ? 0.22 : 0.18)) {
      basisPts = isSilver ? 7.5 : 6.0;
    } else if (basisMetal && basisPct != null && basisPct < 0.45) {
      basisPts = 1.5;
    }

    const cotPct = proSignals?.cot?.[metal]?.percentile52w;
    let cotPts = 0;
    if (typeof cotPct === 'number' && Number.isFinite(cotPct)) {
      if (cotPct <= 35) {
        cotPts = (0.35 + ((35 - cotPct) / 35) * 0.65) * 24;
      } else if (cotPct <= 55) {
        cotPts = ((55 - cotPct) / 20) * 4.5;
      }
    }

    const gvz = institutionalSignals?.impliedVol?.gvz;
    const ivMinusRv = institutionalSignals?.impliedVol?.ivMinusRv ?? 0;
    let volPts = 0;
    if (typeof gvz === 'number' && Number.isFinite(gvz)) {
      const gvzNorm = clamp((gvz - 15) / 18, 0, 1);
      const spreadNorm = clamp(ivMinusRv / 14, 0, 1);
      const volScale = isSilver ? 1.0 : 0.85;
      volPts = clamp(gvzNorm * 0.72 + spreadNorm * 0.28, 0, 1) * 18 * volScale;
    } else if (typeof quant?.macroSnapshot?.vix === 'number') {
      volPts = clamp((quant.macroSnapshot.vix - 16) / 18, 0, 1) * 14;
    }

    const squeezeScore = Math.round(clamp(comexPts + basisPts + cotPts + volPts, 0, 100));
    const cls = classifyMarketRegimeLabel(discoveryScore, squeezeScore);

    return {
      metal,
      discoveryScore,
      squeezeScore,
      label: cls.label,
      key: cls.key,
      isBackwardation,
      components: {
        ratesUsd: +ratesSig.toFixed(3),
        shanghaiSge: +sgeSig.toFixed(3),
        centralBanksInflation: +cbInflSig.toFixed(3),
        miners: +minersSig.toFixed(3),
        trend: +trendSig.toFixed(3),
        comexPts: +comexPts.toFixed(1),
        basisPts: +basisPts.toFixed(1),
        cotPts: +cotPts.toFixed(1),
        volPts: +volPts.toFixed(1),
      },
    };
  };

  return {
    gold: scoreMetal('gold'),
    silver: scoreMetal('silver'),
  };
}

export function analyzeMarketGaps(bars, liveSpot = null, metal = 'gold', tf = '1d') {
  if (!Array.isArray(bars) || bars.length < 2) {
    return {
      metal,
      tf,
      gaps: [],
      primary: null,
      openCount: 0,
      signal: 0,
      predictionBoost: 0,
      bias: 'neutral',
      status: 'No Open Gap',
    };
  }
  const isSilver = metal === 'silver';
  const minGapPct =
    tf === '15min' || tf === '1h'
      ? (isSilver ? 0.22 : 0.12)
      : tf === '4h' || tf === '1d'
        ? (isSilver ? 0.40 : 0.22)
        : tf === '7d' || tf === '1m' || tf === '6m'
          ? (isSilver ? 0.65 : 0.35)
          : (isSilver ? 1.15 : 0.70);

  const spot =
    Number.isFinite(Number(liveSpot)) && Number(liveSpot) > 0
      ? Number(liveSpot)
      : bars[bars.length - 1].c;
  const gaps = [];

  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1];
    const curr = bars[i];
    if (!prev || !curr || !(prev.c > 0) || !(curr.o > 0)) continue;
    const rawGapUsd = curr.o - prev.c;
    const rawGapPct = (rawGapUsd / prev.c) * 100;
    const absPct = Math.abs(rawGapPct);
    if (absPct < minGapPct) continue;

    const dir = rawGapUsd >= 0 ? 'up' : 'down';
    const fillTarget = prev.c;
    const gapEdge = curr.o;
    const zoneLow = Math.min(fillTarget, gapEdge);
    const zoneHigh = Math.max(fillTarget, gapEdge);
    const zoneSpan = Math.max(0.0001, zoneHigh - zoneLow);
    const dtMs = (curr.t || 0) - (prev.t || 0);
    const kind =
      dtMs >= 24 * 3600000
        ? 'Weekend Gap'
        : dtMs >= 45 * 60000
          ? 'Session Gap'
          : absPct >= (isSilver ? 1.0 : 0.6)
            ? 'Breakaway Gap'
            : 'Price Gap';

    let extremeSince = dir === 'up' ? curr.l : curr.h;
    let filledAtIdx = null;
    for (let j = i; j < bars.length; j++) {
      const b = bars[j];
      if (dir === 'up') {
        if (b.l < extremeSince) extremeSince = b.l;
        if (filledAtIdx == null && b.l <= fillTarget) filledAtIdx = j;
      } else {
        if (b.h > extremeSince) extremeSince = b.h;
        if (filledAtIdx == null && b.h >= fillTarget) filledAtIdx = j;
      }
    }
    if (dir === 'up' && spot < extremeSince) extremeSince = spot;
    if (dir === 'down' && spot > extremeSince) extremeSince = spot;
    if (filledAtIdx == null) {
      if ((dir === 'up' && spot <= fillTarget) || (dir === 'down' && spot >= fillTarget)) {
        filledAtIdx = bars.length - 1;
      }
    }

    const fillRatio =
      dir === 'up'
        ? clamp((zoneHigh - extremeSince) / zoneSpan, 0, 1)
        : clamp((extremeSince - zoneLow) / zoneSpan, 0, 1);
    const isFilled = fillRatio >= 0.99 || filledAtIdx != null;
    const fillPct = isFilled ? 100 : Math.round(fillRatio * 100);
    const moveToFillUsd = fillTarget - spot;
    const moveToFillPct = spot > 0 ? (moveToFillUsd / spot) * 100 : 0;
    const holdingBeyond = dir === 'up' ? spot >= zoneHigh : spot <= zoneLow;
    const unfilledFrac = isFilled ? 0 : 1 - fillRatio;

    // Age-decay: full weight for first 48h, fades smoothly over days 2–10, and retires after 10 days as a confirmed Breakaway
    const refNowMs = bars[bars.length - 1]?.t || curr.t || 0;
    const ageHours = curr.t && refNowMs > curr.t ? (refNowMs - curr.t) / 3600000 : 0;
    const ageDays = ageHours / 24;
    const isBreakawayAged = !isFilled && ageDays >= 4 && fillPct < 50 && holdingBeyond;
    const freshness = isFilled
      ? 0
      : ageDays <= 2
        ? 1
        : ageDays >= 10
          ? 0
          : +clamp(Math.exp(-(ageDays - 2) / 3.2), 0, 1).toFixed(3);

    const magNorm = clamp(absPct / (isSilver ? 2.4 : 1.35), 0.25, 1.0);
    const holdMult = holdingBeyond ? 1.15 : 0.72;
    const signal =
      isFilled || freshness <= 0
        ? 0
        : clamp((dir === 'up' ? 1 : -1) * magNorm * unfilledFrac * holdMult * freshness * 0.78, -0.85, 0.85);
    const predictionBoost = isFilled || freshness <= 0 ? 0 : clamp(signal * 0.20, -0.16, 0.16);

    gaps.push({
      idx: i,
      t: curr.t,
      prevT: prev.t,
      dir,
      kind: isBreakawayAged ? 'Breakaway Gap (Confirmed)' : kind,
      tf,
      gapUsd: +rawGapUsd.toFixed(2),
      gapPct: +rawGapPct.toFixed(2),
      fillTarget: +fillTarget.toFixed(2),
      gapEdge: +gapEdge.toFixed(2),
      zoneLow: +zoneLow.toFixed(2),
      zoneHigh: +zoneHigh.toFixed(2),
      fillPct,
      isFilled,
      filledAtIdx,
      holdingBeyond,
      ageDays: +ageDays.toFixed(1),
      freshness,
      isBreakawayAged,
      moveToFillUsd: +moveToFillUsd.toFixed(2),
      moveToFillPct: +moveToFillPct.toFixed(2),
      signal: +signal.toFixed(3),
      predictionBoost: +predictionBoost.toFixed(4),
    });
  }

  const openGaps = gaps.filter((g) => !g.isFilled && g.freshness > 0);
  const rankGap = (g) => {
    const kindW = g.kind === 'Weekend Gap' ? 1.55 : g.kind === 'Session Gap' ? 1.25 : 1.0;
    return Math.abs(g.gapPct) * (1 - g.fillPct / 100) * Math.max(0.15, g.freshness) * kindW;
  };
  const primary = openGaps.length
    ? [...openGaps].sort((a, b) => rankGap(b) - rankGap(a) || b.idx - a.idx)[0]
    : gaps.length
      ? gaps[gaps.length - 1]
      : null;

  return {
    metal,
    tf,
    gaps: gaps.slice(-4),
    primary,
    openCount: openGaps.length,
    signal: primary ? primary.signal : 0,
    predictionBoost: primary ? primary.predictionBoost : 0,
    bias: primary && !primary.isFilled && primary.freshness > 0 ? (primary.dir === 'up' ? 'bullish' : 'bearish') : 'neutral',
    status: !primary
      ? 'No Open Gap'
      : primary.isFilled
        ? 'Gap Filled ✓'
        : primary.freshness <= 0
          ? 'Breakaway (Aged)'
          : primary.dir === 'up'
            ? 'Gap Up · Bullish ↑'
            : 'Gap Down · Bearish ↓',
  };
}

/**
 * Parses official NOAA Space Weather Prediction Center (SWPC) `noaa-scales.json`
 * into clean G (Geomagnetic), S (Solar Radiation), and R (Radio Blackout) scales
 * and computes honest safe-haven Gold & industrial/grid Silver transmission impacts.
 */
export function parseNoaaSpaceWeather(noaaJson, nowIso = new Date().toISOString()) {
  const cur = noaaJson?.['0'] || noaaJson?.['-1'] || null;
  const fcast = noaaJson?.['1'] || null;
  const toScale = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.min(5, Math.round(n)) : 0;
  };
  const gScale = toScale(cur?.G?.Scale);
  const sScale = toScale(cur?.S?.Scale);
  const rScale = toScale(cur?.R?.Scale);
  const gForecast = toScale(fcast?.G?.Scale);
  const peakScale = Math.max(gScale, sScale, rScale, Math.floor(gForecast * 0.8));

  let status = 'Quiet (G0)';
  let tone = 'neutral';
  let goldBoost = 0;
  let silverBoost = 0;
  let jumpBoost = 0;
  let summary = 'Normal solar & geomagnetic conditions — no grid or satellite disruption premium.';

  if (peakScale >= 4) {
    status = `Severe Solar Storm (G${gScale}/R${rScale})`;
    tone = 'bullish';
    goldBoost = 0.13;
    silverBoost = 0.15;
    jumpBoost = 0.032;
    summary = 'Severe geomagnetic/solar storm elevates power-grid & satellite disruption hedging (Gold safe-haven + Silver grid/solar demand).';
  } else if (peakScale === 3) {
    status = `Strong Solar Storm (G${gScale}/R${rScale})`;
    tone = 'bullish';
    goldBoost = 0.08;
    silverBoost = 0.09;
    jumpBoost = 0.020;
    summary = 'Strong NOAA solar storm active — heightened satellite & grid watch lifts safe-haven and solar/electronics silver sensitivity.';
  } else if (peakScale === 2) {
    status = `Moderate Solar Activity (G${gScale}/R${rScale})`;
    tone = 'watch';
    goldBoost = 0.03;
    silverBoost = 0.04;
    jumpBoost = 0.008;
    summary = 'Moderate geomagnetic/radio activity detected — mild watch on grid & orbital infrastructure.';
  } else if (peakScale === 1 || gForecast >= 2) {
    status = gForecast >= 2 ? `Storm Watch Ahead (G${gForecast})` : `Minor Solar Activity (G${gScale})`;
    tone = 'watch';
    goldBoost = gForecast >= 2 ? 0.025 : 0;
    silverBoost = gForecast >= 2 ? 0.03 : 0;
    jumpBoost = gForecast >= 2 ? 0.006 : 0;
    summary =
      gForecast >= 2
        ? `NOAA forecasts G${gForecast} geomagnetic storm within 24h — minor safe-haven watch active.`
        : 'Minor solar breeze (G1) — routine space weather with negligible bullion impact.';
  }

  const safeDate = typeof cur?.DateStamp === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cur.DateStamp.trim()) ? cur.DateStamp.trim() : '';
  const safeTime = typeof cur?.TimeStamp === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(cur.TimeStamp.trim()) ? cur.TimeStamp.trim() : '';
  return {
    source: cur ? 'NOAA SWPC Live' : 'Baseline Quiet',
    updatedAt: safeDate ? `${safeDate}${safeTime ? ` ${safeTime}` : ''}` : nowIso,
    gScale,
    sScale,
    rScale,
    gForecast,
    peakScale,
    status,
    tone,
    goldBoost: +goldBoost.toFixed(4),
    silverBoost: +silverBoost.toFixed(4),
    jumpBoost: +jumpBoost.toFixed(4),
    summary,
  };
}

/**
 * Dynamic World & Space Catalyst Pulse: combines breaking (<6h / <24h) news velocity,
 * live NOAA Space Weather scales, upcoming macro/COMEX event proximity, and physical tightness.
 */
export function computeWorldSpacePulse({
  scoredHeadlines = [],
  nowMs = Date.now(),
  spaceWeather = null,
  eventRisk = null,
  basis = null,
} = {}) {
  let breakingCount = 0;
  let fresh24hCount = 0;
  let velocityGold = 0;
  let velocitySilver = 0;

  for (const h of scoredHeadlines) {
    const pubMs = h.publishedAt ? Date.parse(h.publishedAt) : NaN;
    const ageHrs = Number.isFinite(pubMs) ? Math.max(0, (nowMs - pubMs) / 3600000) : 36;
    if (ageHrs <= 6) {
      breakingCount++;
      fresh24hCount++;
      velocityGold += (h.goldImpact || 0) * 0.45;
      velocitySilver += (h.silverImpact || 0) * 0.45;
    } else if (ageHrs <= 24) {
      fresh24hCount++;
      velocityGold += (h.goldImpact || 0) * 0.18;
      velocitySilver += (h.silverImpact || 0) * 0.18;
    }
  }

  const sw = spaceWeather || parseNoaaSpaceWeather(null);
  const daysToEv = eventRisk?.nextEvent?.daysUntil;
  const eventHeat =
    typeof daysToEv === 'number' && Number.isFinite(daysToEv)
      ? daysToEv <= 1
        ? 26
        : daysToEv <= 3
          ? 18
          : daysToEv <= 7
            ? 9
            : 2
      : 0;
  const backwHeat =
    basis?.gold?.isBackwardation || basis?.silver?.isBackwardation ? 16 : 0;
  const spaceHeat = sw.peakScale * 9;
  const newsHeat = Math.min(42, breakingCount * 11 + fresh24hCount * 3);
  const activityScore = Math.round(clamp(14 + newsHeat + eventHeat + spaceHeat + backwHeat, 10, 99));

  const regime =
    activityScore >= 72
      ? 'High-Velocity Catalyst Surge'
      : activityScore >= 46
        ? 'Active World & Space Flow'
        : 'Steady Macro Pulse';

  const goldDynamicBoost = +clamp(velocityGold * 0.06 + sw.goldBoost, -0.14, 0.18).toFixed(4);
  const silverDynamicBoost = +clamp(velocitySilver * 0.06 + sw.silverBoost, -0.14, 0.20).toFixed(4);
  const topHeadline = scoredHeadlines[0]?.title || null;

  return {
    activityScore,
    regime,
    breakingCount,
    fresh24hCount,
    spaceWeather: sw,
    nextEvent: eventRisk?.nextEvent || null,
    goldDynamicBoost,
    silverDynamicBoost,
    topCatalyst: topHeadline,
  };
}

export function buildOutlook({
  spotGold,
  spotSilver,
  rawHeadlines = [],
  series = {},
  scenarioIds = [],
  shanghai = null,
  comex = null,
  proSignals = null,
  institutionalSignals = null,
  candles = null,
  spaceWeather = null,
  learnedWeights = null,
  accuracy = null,
  coneMultiplier = 1.0,
  generatedAt = new Date().toISOString(),
}) {
  const nowMs = new Date(generatedAt).getTime() || Date.now();
  const scoredHeadlines = classifyHeadlines(rawHeadlines, nowMs);
  const quant = computeQuantSignals(series);

  // Aggregate recency- & tier-weighted news per driver
  const driverBuckets = {};
  for (const id of Object.keys(DRIVER_META)) {
    driverBuckets[id] = { goldSum: 0, silverSum: 0, count: 0 };
  }

  for (const h of scoredHeadlines) {
    const b = driverBuckets[h.driver];
    if (!b) continue;
    b.goldSum += h.goldImpact;
    b.silverSum += h.silverImpact;
    b.count += 1;
  }

  // Blend in quantitative macro signals: FRED Real Yields, Shanghai SGE, COMEX Paper, ETF Flows, Copper/JPY, Basis, COT & Miners
  const shanghaiGoldPremUsd = shanghai?.gold?.premiumUsdOz;
  const shanghaiGoldPct = shanghai?.gold?.pct ?? 0;
  const shanghaiGoldSignal =
    typeof shanghaiGoldPremUsd === 'number' && Number.isFinite(shanghaiGoldPremUsd)
      ? clamp((shanghaiGoldPremUsd - 5) / 42 + (shanghaiGoldPct / 5) * 0.25, -0.85, 0.9)
      : null;

  const shanghaiSilverExVatPrem = shanghai?.silver?.exVatPremiumUsdOz;
  const shanghaiSilverPct = shanghai?.silver?.pct ?? 0;
  const shanghaiSilverSignal =
    typeof shanghaiSilverExVatPrem === 'number' && Number.isFinite(shanghaiSilverExVatPrem)
      ? clamp(shanghaiSilverExVatPrem / 3.5 + (shanghaiSilverPct / 6) * 0.25, -0.85, 0.9)
      : shanghaiGoldSignal != null
        ? shanghaiGoldSignal * 0.75
        : null;

  const comexGoldSig = comex?.gold?.signal ?? null;
  const comexSilverSig = comex?.silver?.signal ?? null;

  const inst = institutionalSignals || {};
  const etfFlows = inst.etfFlows || null;
  const crossMkt = inst.crossMarket || null;
  const basis = inst.basis || null;
  const impliedVol = inst.impliedVol || null;
  const eventRisk = inst.eventRisk || null;

  const ry = proSignals?.realYields || null;
  const yc = proSignals?.yieldCurve || null;
  const spxGold = proSignals?.spxGoldRatio || null;
  const cotGoldSig = proSignals?.cot?.gold?.signal ?? null;
  const cotSilverSig = proSignals?.cot?.silver?.signal ?? null;
  const minerGoldSig = proSignals?.miners?.goldSignal ?? null;
  const minerSilverSig = proSignals?.miners?.silverSignal ?? null;

  const blendOpt = (a, b, wa = 0.55) =>
    a != null && b != null ? a * wa + b * (1 - wa) : a ?? b ?? 0;

  const posMinersGold = blendOpt(cotGoldSig, minerGoldSig, 0.55);
  const posMinersSilver = blendOpt(cotSilverSig, minerSilverSig, 0.55);

  const drivers = {};
  for (const [id, meta] of Object.entries(DRIVER_META)) {
    const b = driverBuckets[id];
    let g = b.count > 0 ? clamp(b.goldSum / Math.sqrt(b.count + 0.5), -1, 1) : 0;
    let s = b.count > 0 ? clamp(b.silverSum / Math.sqrt(b.count + 0.5), -1, 1) : 0;

    if (id === 'rates_usd') {
      const baseMacroG = ry ? clamp(ry.goldSignal * 0.62 + quant.ratesUsdMacro * 0.38, -1, 1) : quant.ratesUsdMacro;
      const baseMacroS = ry ? clamp(ry.silverSignal * 0.60 + quant.ratesUsdMacro * 0.40, -1, 1) : quant.ratesUsdMacro;
      const macroG = yc ? clamp(baseMacroG * 0.80 + yc.goldSignal * 0.20, -1, 1) : baseMacroG;
      const macroS = yc ? clamp(baseMacroS * 0.82 + yc.silverSignal * 0.18, -1, 1) : baseMacroS;
      g = clamp(b.count > 0 ? g * 0.45 + macroG * 0.55 : macroG, -1, 1);
      s = clamp(b.count > 0 ? s * 0.45 + macroS * 0.55 : macroS, -1, 1);
    } else if (id === 'equities') {
      const baseEqG = crossMkt ? clamp(quant.equityStressGold * 0.65 + crossMkt.goldSignal * 0.35, -1, 1) : quant.equityStressGold;
      const baseEqS = crossMkt ? clamp(quant.equityStressSilver * 0.7 + crossMkt.goldSignal * 0.3, -1, 1) : quant.equityStressSilver;
      const eqG = spxGold ? clamp(baseEqG * 0.78 + spxGold.goldSignal * 0.22, -1, 1) : baseEqG;
      const eqS = spxGold ? clamp(baseEqS * 0.82 + spxGold.silverSignal * 0.18, -1, 1) : baseEqS;
      g = clamp(b.count > 0 ? g * 0.55 + eqG * 0.45 : eqG, -1, 1);
      s = clamp(b.count > 0 ? s * 0.55 + eqS * 0.45 : eqS, -1, 1);
    } else if (id === 'mining_supply') {
      // Blend Copper (HG=F) industrial confirmation directly into Silver supply/demand driver
      if (crossMkt?.silverSignal != null) {
        s = clamp(b.count > 0 ? s * 0.62 + crossMkt.silverSignal * 0.38 : crossMkt.silverSignal, -1, 1);
        g = clamp(b.count > 0 ? g * 0.8 + crossMkt.goldSignal * 0.2 : crossMkt.goldSignal * 0.4, -1, 1);
      }
    } else if (id === 'central_banks') {
      // Blend GLD / SLV / PSLV physical ETF money flows directly into Central Banks & ETFs driver
      if (etfFlows) {
        g = clamp(b.count > 0 ? g * 0.5 + etfFlows.goldSignal * 0.5 : etfFlows.goldSignal, -1, 1);
        s = clamp(b.count > 0 ? s * 0.45 + etfFlows.silverSignal * 0.55 : etfFlows.silverSignal, -1, 1);
      }
    } else if (id === 'shanghai_sge') {
      if (shanghaiGoldSignal != null) {
        g = clamp(b.count > 0 ? g * 0.45 + shanghaiGoldSignal * 0.55 : shanghaiGoldSignal, -1, 1);
      }
      if (shanghaiSilverSignal != null) {
        s = clamp(b.count > 0 ? s * 0.45 + shanghaiSilverSignal * 0.55 : shanghaiSilverSignal, -1, 1);
      }
    } else if (id === 'positioning_miners') {
      g = clamp(posMinersGold, -1, 1);
      s = clamp(posMinersSilver, -1, 1);
    } else if (id === 'comex_paper') {
      const wComexG = basis?.gold?.isBackwardation ? 0.56 : 0.72;
      const wComexS = basis?.silver?.isBackwardation ? 0.54 : 0.70;
      const combG = blendOpt(comexGoldSig, basis?.gold?.signal ?? null, wComexG);
      const combS = blendOpt(comexSilverSig, basis?.silver?.signal ?? null, wComexS);
      if (comexGoldSig != null || basis?.gold?.signal != null) {
        g = clamp(b.count > 0 ? g * 0.3 + combG * 0.7 : combG, -1, 1);
      }
      if (comexSilverSig != null || basis?.silver?.signal != null) {
        s = clamp(b.count > 0 ? s * 0.3 + combS * 0.7 : combS, -1, 1);
      }
    }

    drivers[id] = {
      id,
      label: meta.label,
      shortLabel: meta.shortLabel,
      gold: +g.toFixed(3),
      silver: +s.toFixed(3),
      headlineCount: b.count,
    };
  }

  // Apply optional interactive "What-If" scenario shocks
  for (const sid of scenarioIds) {
    const preset = SCENARIO_PRESETS.find((p) => p.id === sid);
    if (!preset) continue;
    const d = drivers[preset.driver];
    if (!d) continue;
    d.gold = +clamp(d.gold + preset.goldDelta, -1, 1).toFixed(3);
    d.silver = +clamp(d.silver + preset.silverDelta, -1, 1).toFixed(3);
  }

  // Detect active market regime ('calm' vs 'stress') to select matching self-learned weights
  const vixVal = quant.macroSnapshot.vix ?? 18;
  const gvzVal = impliedVol?.gvz ?? null;
  const silverBackw = (basis?.silver?.basisUsd ?? 1) < 0;
  const comexSiRatio = comex?.silver?.paperToRegisteredRatio ?? null;
  const activeRegime =
    (Number.isFinite(gvzVal) && gvzVal >= 20) ||
    vixVal >= 21 ||
    silverBackw ||
    (Number.isFinite(comexSiRatio) && comexSiRatio >= 6.5)
      ? 'stress'
      : 'calm';

  const regimeWeightSet =
    learnedWeights?.regimeWeights?.[activeRegime] || learnedWeights?.weights || null;

  // Weighted composite news+macro driver score (uses dual-regime daily post-close self-learned weights when present)
  let goldDriverComposite = 0;
  let silverDriverComposite = 0;
  for (const [id, meta] of Object.entries(DRIVER_META)) {
    const wG = regimeWeightSet?.gold?.[id] ?? meta.goldWeight;
    const wS = regimeWeightSet?.silver?.[id] ?? meta.silverWeight;
    goldDriverComposite += drivers[id].gold * wG;
    silverDriverComposite += drivers[id].silver * wS;
  }

  // Gentle capped drift bias nudge from daily 5:10 PM ET self-learning calibration
  const driftNudgeGold = clamp((learnedWeights?.driftBiasGoldPct || 0) * 0.14, -0.06, 0.06);
  const driftNudgeSilver = clamp((learnedWeights?.driftBiasSilverPct || 0) * 0.14, -0.06, 0.06);
  const effectiveConeMult =
    coneMultiplier === 1.0 && Number.isFinite(learnedWeights?.coneMultiplier)
      ? learnedWeights.coneMultiplier
      : coneMultiplier;

  // Direct Spot-to-Futures Backwardation price-discovery lift (Futures < Spot = downward-sloping curve)
  const backwBoostGold =
    basis?.gold?.priceDiscoveryBoost ??
    (basis?.gold?.isBackwardation || (basis?.gold?.basisUsd ?? 1) < 0 ? 0.12 : 0);
  const backwBoostSilver =
    basis?.silver?.priceDiscoveryBoost ??
    (basis?.silver?.isBackwardation || (basis?.silver?.basisUsd ?? 1) < 0 ? 0.14 : 0);

  // Market Gap Analyzer (unfilled Gap Up = bullish momentum, unfilled Gap Down = bearish momentum)
  const goldGapBars = candles?.gold || candles?.timeframes?.['1d']?.gold || [];
  const silverGapBars = candles?.silver || candles?.timeframes?.['1d']?.silver || [];
  const marketGaps = {
    gold: analyzeMarketGaps(goldGapBars, spotGold, 'gold', '1d'),
    silver: analyzeMarketGaps(silverGapBars, spotSilver, 'silver', '1d'),
  };
  const gapBoostGold = marketGaps.gold.predictionBoost || 0;
  const gapBoostSilver = marketGaps.silver.predictionBoost || 0;

  // Live World News Velocity + Official NOAA Space Weather Catalyst Pulse
  const parsedSpace =
    spaceWeather && typeof spaceWeather.peakScale === 'number'
      ? spaceWeather
      : parseNoaaSpaceWeather(spaceWeather, generatedAt);
  const worldSpacePulse = computeWorldSpacePulse({
    scoredHeadlines,
    nowMs,
    spaceWeather: parsedSpace,
    eventRisk,
    basis,
  });

  // Physical Bullion Dealer Premiums vs. Spot & Pure Melt (leading retail squeeze indicator)
  const goldClosesArr = series.gold || [];
  const silverClosesArr = series.silver || [];
  const g1dPct = goldClosesArr.length >= 2 && goldClosesArr.at(-2) > 0
    ? ((goldClosesArr.at(-1) - goldClosesArr.at(-2)) / goldClosesArr.at(-2)) * 100
    : 0;
  const s1dPct = silverClosesArr.length >= 2 && silverClosesArr.at(-2) > 0
    ? ((silverClosesArr.at(-1) - silverClosesArr.at(-2)) / silverClosesArr.at(-2)) * 100
    : 0;
  const physicalPremiums = computePhysicalPremiumSignals({
    spotGold,
    spotSilver,
    spotGoldDailyPct: g1dPct,
    spotSilverDailyPct: s1dPct,
    shanghai,
    comex,
    basis,
    vix: vixVal,
    gvz: gvzVal,
    headlines: scoredHeadlines,
  });
  const physBoostGold = physicalPremiums.gold.predictionBoost || 0;
  const physBoostSilver = physicalPremiums.silver.predictionBoost || 0;

  // 6 Exclusive Hidden-Alpha Bullion Engines (East/West Session Flow, 21-FX Stealth Breadth,
  // Spring Coiling, Cross-Asset Liquidity Compass, Consensus Crowding Contrarian Brake, COMEX OpEx Magnet)
  const hiddenAlpha = computeHiddenAlphaSuite({
    spotGold,
    spotSilver,
    goldIntradayBars: goldGapBars,
    silverIntradayBars: silverGapBars,
    goldDailyCloses: goldClosesArr,
    silverDailyCloses: silverClosesArr,
    comex,
    basis,
    macroSnapshot: quant.macroSnapshot,
    series,
    headlines: scoredHeadlines,
    goldRsi14: quant.goldRsi14,
    silverRsi14: quant.silverRsi14,
    cotGoldPct: proSignals?.cot?.gold?.percentile52w ?? 50,
    cotSilverPct: proSignals?.cot?.silver?.percentile52w ?? 50,
    goldTrendSign: quant.goldTrend,
    silverTrendSign: quant.silverTrend,
    nowDate: new Date(nowMs),
  });
  const hiddenBoostGold = hiddenAlpha.gold.netBoost || 0;
  const hiddenBoostSilver = hiddenAlpha.silver.netBoost || 0;

  // Big Tech AI Data Center & Hyperscale Power Race (Google, NVIDIA, Microsoft, Meta, Amazon, Vertiv, Eaton, Constellation)
  const aiScenarioMode = scenarioIds.includes('ai_capex_surge')
    ? 'surge'
    : scenarioIds.includes('ai_capex_pause')
      ? 'pause'
      : null;
  const aiDatacenter = computeAiDatacenterSignal({
    series,
    headlines: scoredHeadlines,
    copper5dPct: quant.macroSnapshot.cu5dPct,
    comex,
    basis,
    physicalPremiums,
    scenarioMode: aiScenarioMode,
  });
  const aiBoostGold = aiDatacenter.gold.predictionBoost || 0;
  const aiBoostSilver = aiDatacenter.silver.predictionBoost || 0;

  // Blend: 78% macro+news+pro drivers, 22% technical trend (+ ratio mean reversion for silver) + backwardation + unfilled gap + physical premiums + hidden alpha + AI data center race + world/space pulse
  const goldUnit = clamp(
    goldDriverComposite * 1.48 * 0.78 +
      quant.goldTrend * 0.22 +
      driftNudgeGold +
      backwBoostGold +
      gapBoostGold +
      physBoostGold * 0.75 +
      hiddenBoostGold * 0.80 +
      aiBoostGold * 0.78 +
      worldSpacePulse.goldDynamicBoost * 0.65,
    -1,
    1
  );
  const silverUnit = clamp(
    silverDriverComposite * 1.48 * 0.75 +
      quant.silverTrend * 0.15 +
      quant.ratioSignalSilver * 0.10 +
      driftNudgeSilver +
      backwBoostSilver +
      gapBoostSilver +
      physBoostSilver * 0.75 +
      hiddenBoostSilver * 0.80 +
      aiBoostSilver * 0.82 +
      worldSpacePulse.silverDynamicBoost * 0.65,
    -1,
    1
  );

  const goldScore = Math.round(goldUnit * 100);
  const silverScore = Math.round(silverUnit * 100);

  // GARCH(1,1) / EWMA volatility clustering blended with forward-looking ^GVZ options implied volatility
  const garchGold = computeEwmaGarchVol(series.gold || [], {
    impliedVolAnnPct: impliedVol?.gvz ?? null,
    fallbackDailyVol: quant.goldDailyVol,
  });
  const garchSilver = computeEwmaGarchVol(series.silver || [], {
    impliedVolAnnPct: impliedVol?.gvz != null ? impliedVol.gvz * 1.55 : null,
    fallbackDailyVol: quant.silverDailyVol,
  });
  const baseGoldVol = impliedVol?.blendedGoldDailyVol || quant.goldDailyVol;
  const effectiveGoldDailyVol = +clamp(
    garchGold.blendedDailyVol * 0.6 + baseGoldVol * 0.4,
    0.0045,
    0.06
  ).toFixed(5);
  const ivRatio =
    impliedVol?.blendedGoldDailyVol && quant.goldDailyVol > 0
      ? clamp(impliedVol.blendedGoldDailyVol / quant.goldDailyVol, 0.82, 1.32)
      : 1.0;
  const effectiveSilverDailyVol = +clamp(
    garchSilver.blendedDailyVol * 0.6 + quant.silverDailyVol * ivRatio * 0.4,
    0.008,
    0.075
  ).toFixed(5);

  // US Dollar Strength (DXY) FX Cost Impact attribution across 7D (5 trading days) & 30D (21 trading days)
  const dsBase = quant.dollarStrength || {
    dxy: quant.macroSnapshot.dxy ?? 103.7,
    dxy5dPct: quant.macroSnapshot.dxy5dPct ?? 0,
    dxy20dPct: quant.macroSnapshot.dxy20dPct ?? 0,
    dxyVsSma20Pct: quant.macroSnapshot.dxyVsSma20Pct ?? 0,
    dxyVsSma50Pct: quant.macroSnapshot.dxyVsSma50Pct ?? 0,
    score: 50,
    regime: 'Balanced USD',
    unitBias: 0,
    goldVsDxyCorr: quant.macroSnapshot.goldVsDxyCorr ?? null,
    silverVsDxyCorr: quant.macroSnapshot.silverVsDxyCorr ?? null,
  };
  const dxyRatesShift = (scenarioIds.includes('hawkish_usd') ? -0.42 : 0) + (scenarioIds.includes('fed_rate_cut') ? 0.42 : 0);
  const effDxyScore = Math.round(clamp(dsBase.score - dxyRatesShift * 45, 0, 100));
  const effDxyRegime =
    effDxyScore >= 72
      ? 'Strong USD Headwind'
      : effDxyScore >= 58
        ? 'Firm USD'
        : effDxyScore <= 28
          ? 'Weak USD Tailwind'
          : effDxyScore <= 42
            ? 'Soft USD'
            : 'Balanced USD';
  const dxyUnitEffect = clamp((50 - effDxyScore) / 50, -1, 1); // negative when USD strong, positive when USD weak
  const wRatesG = regimeWeightSet?.gold?.rates_usd ?? DRIVER_META.rates_usd.goldWeight;
  const wRatesS = regimeWeightSet?.silver?.rates_usd ?? DRIVER_META.rates_usd.silverWeight;
  const corrScaleG = clamp(0.65 + Math.max(0, -(dsBase.goldVsDxyCorr ?? -0.45)) * 0.7, 0.65, 1.25);
  const corrScaleS = clamp(0.65 + Math.max(0, -(dsBase.silverVsDxyCorr ?? -0.40)) * 0.7, 0.65, 1.25);
  const fxImpactFor = (days) => {
    const gPct = dxyUnitEffect * wRatesG * 0.62 * corrScaleG * effectiveGoldDailyVol * Math.sqrt(days) * 0.72 * 100;
    const sPct = dxyUnitEffect * wRatesS * 0.62 * corrScaleS * effectiveSilverDailyVol * Math.sqrt(days) * 0.72 * 100;
    return {
      goldPct: +gPct.toFixed(2),
      goldUsdOz: +((spotGold * gPct) / 100).toFixed(2),
      silverPct: +sPct.toFixed(2),
      silverUsdOz: +((spotSilver * sPct) / 100).toFixed(2),
    };
  };
  const dollarStrength = {
    ...dsBase,
    score: effDxyScore,
    regime: effDxyRegime,
    impact7d: fxImpactFor(5),
    impact30d: fxImpactFor(21),
  };

  // Confidence reflects evidence breadth + agreement across drivers (capped at 86% to stay honest)
  const activeVals = Object.values(drivers).map((d) => d.gold).filter((v) => Math.abs(v) >= 0.1);
  const sameSign =
    activeVals.length > 0
      ? Math.max(
          activeVals.filter((v) => v > 0).length,
          activeVals.filter((v) => v < 0).length
        ) / activeVals.length
      : 0.5;
  const proDataPoints =
    (ry ? 2 : 0) +
    (cotGoldSig != null ? 2 : 0) +
    (minerGoldSig != null ? 2 : 0) +
    (comexGoldSig != null ? 2 : 0) +
    (impliedVol ? 1.5 : 0) +
    (etfFlows ? 1.5 : 0) +
    (crossMkt ? 1.5 : 0) +
    (basis ? 1.5 : 0);
  const breadth = Math.min(1, (scoredHeadlines.length + (quant.macroSnapshot.dxy ? 3 : 0) + proDataPoints) / 18);
  const confidence = Math.round(clamp(30 + sameSign * 30 + breadth * 26, 28, 86));

  const overallDir = goldScore > 12 ? 'bullish' : goldScore < -12 ? 'bearish' : 'mixed';
  const matchedAnalogs = matchHistoricalAnalogs(drivers, overallDir);

  const topDriverList = Object.values(drivers)
    .sort((a, b) => Math.abs(b.gold) + Math.abs(b.silver) - (Math.abs(a.gold) + Math.abs(a.silver)))
    .slice(0, 2);

  const marketRegime = computeMarketRegimeDecomposition({
    drivers,
    quant,
    comex,
    shanghai,
    proSignals,
    institutionalSignals: inst,
  });

  const narrative = buildNarrative({
    goldScore,
    silverScore,
    topDrivers: topDriverList,
    ratio: quant.ratio,
    headlineCount: scoredHeadlines.length,
    proSignals,
    comex,
    institutionalSignals: inst,
    marketRegime,
    dollarStrength,
  });

  // Run Merton Jump-Diffusion Monte Carlo simulations (with COMEX + Event Calendar + GVZ + Basis + Carry + self-calibrated tail multipliers)
  const sharedJumpBoost =
    (eventRisk?.jumpBoost || 0) +
    (impliedVol?.jumpBoost || 0) +
    (crossMkt?.jumpBoost || 0) +
    (parsedSpace?.jumpBoost || 0);
  const goldCatIntensity = clamp(
    Math.abs(goldUnit) + (comex?.gold?.jumpBoost || 0) + (basis?.gold?.jumpBoost || 0) + sharedJumpBoost,
    0.15,
    1.0
  );
  const silverCatIntensity = clamp(
    Math.abs(silverUnit) + (comex?.silver?.jumpBoost || 0) + (basis?.silver?.jumpBoost || 0) + sharedJumpBoost,
    0.15,
    1.0
  );
  const lambdaMult = learnedWeights?.jumpCalibration?.lambdaMult ?? 1.0;
  const sigmaJMult = learnedWeights?.jumpCalibration?.sigmaJMult ?? 1.0;

  const liveSpotRatio =
    Number.isFinite(spotGold) && Number.isFinite(spotSilver) && spotSilver > 0
      ? spotGold / spotSilver
      : quant.ratio;
  const ratioAnalytics = computeRatioAnalytics({
    ratio: liveSpotRatio,
    goldCloses: series.gold || [],
    silverCloses: series.silver || [],
  });

  const setupQuality = {
    gold: computeSetupQuality({
      metal: 'gold',
      spot: spotGold,
      regime: marketRegime.gold,
      rsi14: quant.goldRsi14,
      dailyVol: effectiveGoldDailyVol,
      dollarStrength,
      basis: basis?.gold || null,
      unitScore: goldUnit,
    }),
    silver: computeSetupQuality({
      metal: 'silver',
      spot: spotSilver,
      regime: marketRegime.silver,
      rsi14: quant.silverRsi14,
      dailyVol: effectiveSilverDailyVol,
      dollarStrength,
      basis: basis?.silver || null,
      unitScore: silverUnit,
    }),
  };

  const goldJumpParams = estimateJumpParams({
    metal: 'gold',
    dailyVol: effectiveGoldDailyVol,
    unitScore: goldUnit,
    vix: vixVal,
    catalystIntensity: goldCatIntensity,
    coneMultiplier: effectiveConeMult,
    lambdaMult,
    sigmaJMult,
    regime: marketRegime.gold,
    rsi14: quant.goldRsi14,
  });
  const silverJumpParams = estimateJumpParams({
    metal: 'silver',
    dailyVol: effectiveSilverDailyVol,
    unitScore: silverUnit,
    vix: vixVal,
    catalystIntensity: silverCatIntensity,
    coneMultiplier: effectiveConeMult,
    lambdaMult,
    sigmaJMult,
    regime: marketRegime.silver,
    rsi14: quant.silverRsi14,
  });

  const goldHorizon7d = projectHorizon(spotGold, effectiveGoldDailyVol, goldUnit, 5, effectiveConeMult);
  const silverHorizon7d = projectHorizon(spotSilver, effectiveSilverDailyVol, silverUnit, 5, effectiveConeMult);

  const goldHorizon30d = project30DayPrecision({
    spotPrice: spotGold,
    dailyVol: effectiveGoldDailyVol,
    shortTermUnit: goldUnit,
    drivers,
    quant,
    metal: 'gold',
    regimeWeightSet,
    marketGaps,
    proSignals,
    shanghai,
    basis,
    physicalPremiums,
    aiDatacenter,
    learnedWeights,
    series,
    coneMultiplier: effectiveConeMult,
    nowDate: new Date(nowMs),
  });
  const silverHorizon30d = project30DayPrecision({
    spotPrice: spotSilver,
    dailyVol: effectiveSilverDailyVol,
    shortTermUnit: silverUnit,
    drivers,
    quant,
    metal: 'silver',
    regimeWeightSet,
    marketGaps,
    proSignals,
    shanghai,
    basis,
    physicalPremiums,
    aiDatacenter,
    learnedWeights,
    series,
    coneMultiplier: effectiveConeMult,
    nowDate: new Date(nowMs),
  });

  // Sync 30-day Jump-Diffusion Monte Carlo drift with the fine-tuned 30D structural model
  const goldJumpParams30d = estimateJumpParams({
    metal: 'gold',
    dailyVol: effectiveGoldDailyVol,
    unitScore: goldHorizon30d.unit30d,
    vix: vixVal,
    catalystIntensity: goldCatIntensity,
    coneMultiplier: effectiveConeMult,
    lambdaMult,
    sigmaJMult,
    regime: marketRegime.gold,
    rsi14: quant.goldRsi14,
  });
  const silverJumpParams30d = estimateJumpParams({
    metal: 'silver',
    dailyVol: effectiveSilverDailyVol,
    unitScore: silverHorizon30d.unit30d,
    vix: vixVal,
    catalystIntensity: silverCatIntensity,
    coneMultiplier: effectiveConeMult,
    lambdaMult,
    sigmaJMult,
    regime: marketRegime.silver,
    rsi14: quant.silverRsi14,
  });

  const eventSchedule7d = buildEventRiskSchedule(eventRisk?.expandedEvents || [], {
    calendarDays: 7,
    steps: 5,
  });
  const eventSchedule30d = buildEventRiskSchedule(eventRisk?.expandedEvents || [], {
    calendarDays: 30,
    steps: 21,
  });

  const goldMc7d = runJumpDiffusion({
    spot: spotGold,
    tradingDays: 5,
    paths: 1500,
    ...goldJumpParams,
    eventSchedule: eventSchedule7d,
    samplePathCount: 16,
    seed: 20261119,
  });
  const goldMc30d = runJumpDiffusion({
    spot: spotGold,
    tradingDays: 21,
    paths: 1500,
    ...goldJumpParams30d,
    eventSchedule: eventSchedule30d,
    samplePathCount: 16,
    seed: 20261120,
  });
  const silverMc7d = runJumpDiffusion({
    spot: spotSilver,
    tradingDays: 5,
    paths: 1500,
    ...silverJumpParams,
    eventSchedule: eventSchedule7d,
    samplePathCount: 16,
    seed: 20261121,
  });
  const silverMc30d = runJumpDiffusion({
    spot: spotSilver,
    tradingDays: 21,
    paths: 1500,
    ...silverJumpParams30d,
    eventSchedule: eventSchedule30d,
    samplePathCount: 16,
    seed: 20261122,
  });

  const selfLearning = learnedWeights
    ? {
        version: learnedWeights.version || 2,
        schedule: learnedWeights.schedule || '5:10 PM ET (10m after close)',
        lastLearnedDay: learnedWeights.lastLearnedDay || null,
        lastUpdatedAt: learnedWeights.lastUpdatedAt || null,
        totalCycles: learnedWeights.totalCycles || 0,
        activeRegime,
        coneMultiplier: learnedWeights.coneMultiplier ?? 1.0,
        driftBiasGoldPct: learnedWeights.driftBiasGoldPct ?? 0,
        driftBiasSilverPct: learnedWeights.driftBiasSilverPct ?? 0,
        driftBias30dGoldPct: learnedWeights.driftBias30dGoldPct ?? 0,
        driftBias30dSilverPct: learnedWeights.driftBias30dSilverPct ?? 0,
        weights: regimeWeightSet || learnedWeights.weights || null,
        regimeWeights: learnedWeights.regimeWeights || null,
        weightDeltasFromBase: learnedWeights.weightDeltasFromBase || null,
        jumpCalibration: learnedWeights.jumpCalibration || null,
        championChallenger: learnedWeights.championChallenger || null,
        walkForwardBacktest: learnedWeights.walkForwardBacktest || null,
        summary: learnedWeights.summary || null,
        recentHistory: (learnedWeights.history || []).slice(0, 20),
      }
    : null;

  const topicCoverage = {};
  for (const h of scoredHeadlines) {
    const k = h.topic || 'macro_debt';
    topicCoverage[k] = (topicCoverage[k] || 0) + 1;
  }

  return {
    generatedAt,
    disclaimer:
      'Anonymous probabilistic scenario model combining global news (recency-weighted), FRED 10Y TIPS real yields, COMEX paper vs. registered vault contracts, CBOE ^GVZ implied volatility, GLD/SLV/PHYS/PSLV flows, Copper/USD-JPY cross-markets, COMEX EFP basis, Event-Risk calendar, Shanghai SGE premiums, Hurst regime detection, 5-model ensemble stacking (incl. DFT frequency-domain spectral cycles), empirical historical twins, daily 5:10 PM ET self-learning calibration, and event-aware Merton Jump-Diffusion simulations. Educational — not financial advice.',
    confidence,
    coneMultiplier: +effectiveConeMult.toFixed(2),
    narrative,
    gold: {
      spot: +spotGold.toFixed(2),
      score: goldScore,
      signal: signalLabelFromScore(goldScore),
      regime: marketRegime.gold,
      hurst: goldHorizon30d.hurst,
      leadLagAlpha: goldHorizon30d.leadLag.score,
      spectral: goldHorizon30d.spectral,
      horizon7d: goldHorizon7d,
      horizon30d: goldHorizon30d,
      jumpParams: goldJumpParams,
      jumpDiffusion7d: goldMc7d,
      jumpDiffusion30d: goldMc30d,
    },
    silver: {
      spot: +spotSilver.toFixed(2),
      score: silverScore,
      signal: signalLabelFromScore(silverScore),
      regime: marketRegime.silver,
      hurst: silverHorizon30d.hurst,
      leadLagAlpha: silverHorizon30d.leadLag.score,
      spectral: silverHorizon30d.spectral,
      horizon7d: silverHorizon7d,
      horizon30d: silverHorizon30d,
      jumpParams: silverJumpParams,
      jumpDiffusion7d: silverMc7d,
      jumpDiffusion30d: silverMc30d,
    },
    marketRegime,
    marketGaps,
    physicalPremiums,
    hiddenAlpha,
    aiDatacenter,
    spaceWeather: parsedSpace,
    worldSpacePulse,
    setupQuality,
    ratioAnalytics,
    dollarStrength,
    drivers: Object.values(drivers),
    macroSnapshot: quant.macroSnapshot,
    goldSilverRatio: +liveSpotRatio.toFixed(2),
    shanghai,
    comex,
    proSignals,
    institutionalSignals: institutionalSignals || null,
    selfLearning,
    accuracy,
    matchedAnalogs,
    topicCoverage,
    headlines: selectBalancedHeadlines(scoredHeadlines, 100),
  };
}

function buildNarrative({ goldScore, silverScore, topDrivers, ratio, headlineCount, proSignals, comex, institutionalSignals, marketRegime, dollarStrength }) {
  const gLabel = signalLabelFromScore(goldScore).toLowerCase();
  const sLabel = signalLabelFromScore(silverScore).toLowerCase();
  const lead = topDrivers
    .filter((d) => Math.abs(d.gold) >= 0.08 || Math.abs(d.silver) >= 0.08)
    .map((d) => d.label)
    .join(' and ');

  const driverPhrase = lead
    ? `Primary active drivers: ${lead}.`
    : 'Macro and news drivers are balanced without a single dominant catalyst.';

  const extras = [];
  if (marketRegime?.gold && marketRegime?.silver) {
    extras.push(
      `Regime decomposition: Gold ${marketRegime.gold.label} (${marketRegime.gold.discoveryScore}D/${marketRegime.gold.squeezeScore}S) and Silver ${marketRegime.silver.label} (${marketRegime.silver.discoveryScore}D/${marketRegime.silver.squeezeScore}S).`
    );
  }
  if (dollarStrength?.dxy != null) {
    const gFx = dollarStrength.impact7d?.goldUsdOz ?? 0;
    extras.push(
      `US Dollar Index (DXY ${dollarStrength.dxy.toFixed(2)}, strength ${dollarStrength.score}/100 · ${dollarStrength.regime}) implies ${gFx >= 0 ? '+' : '−'}$${Math.abs(gFx).toFixed(2)}/oz 7d FX cost impact on Gold.`
    );
  }
  if (comex?.gold?.paperToRegisteredRatio && comex?.silver?.paperToRegisteredRatio) {
    extras.push(
      `COMEX paper claims stand at ${comex.gold.paperToRegisteredRatio}:1 for Gold (${comex.gold.openInterestContracts.toLocaleString('en-US')} GC) and ${comex.silver.paperToRegisteredRatio}:1 for Silver (${comex.silver.openInterestContracts.toLocaleString('en-US')} SI) vs. registered vaults.`
    );
  }
  if (institutionalSignals?.eventRisk?.nextEvent) {
    const ev = institutionalSignals.eventRisk.nextEvent;
    extras.push(`Next high-vol catalyst: ${ev.title} in ${ev.daysUntil}d (${ev.date}).`);
  }
  if (institutionalSignals?.impliedVol?.gvz != null) {
    extras.push(`Options ^GVZ implied vol is ${institutionalSignals.impliedVol.gvz}% (${institutionalSignals.impliedVol.regime}).`);
  }
  if (institutionalSignals?.basis?.gold?.isBackwardation || (institutionalSignals?.basis?.gold?.basisUsd ?? 1) < 0) {
    extras.push(`COMEX Gold futures sit in downward-sloping backwardation (${institutionalSignals.basis.gold.basisUsd.toFixed(2)}/oz vs spot), lifting upside price discovery.`);
  }
  if (institutionalSignals?.basis?.silver?.isBackwardation || (institutionalSignals?.basis?.silver?.basisUsd ?? 1) < 0) {
    extras.push(`COMEX Silver futures sit in downward-sloping backwardation (${institutionalSignals.basis.silver.basisUsd.toFixed(2)}/oz vs spot), signaling immediate physical tightness and lifting upside price discovery.`);
  }
  if (proSignals?.realYields?.realYield10yPct != null) {
    extras.push(`10Y TIPS real yield sits at ${proSignals.realYields.realYield10yPct}% (${proSignals.realYields.realDelta5dBps >= 0 ? '+' : ''}${proSignals.realYields.realDelta5dBps} bps 5d).`);
  }
  if (proSignals?.yieldCurve?.spread10y2yPct != null) {
    const yc = proSignals.yieldCurve;
    extras.push(
      `10Y–2Y yield curve sits at ${yc.spread10y2yPct >= 0 ? '+' : ''}${yc.spread10y2yPct.toFixed(2)}% (2Y yield ${yc.yield2yPct != null ? `${yc.yield2yPct.toFixed(2)}%` : '—'}, ${yc.regime}).`
    );
  }
  if (proSignals?.spxGoldRatio?.ratio != null) {
    const sg = proSignals.spxGoldRatio;
    extras.push(
      `S&P 500 / Gold capital-rotation ratio stands at ${sg.ratio.toFixed(2)} (${sg.chg5dPct >= 0 ? '+' : ''}${sg.chg5dPct.toFixed(1)}% 5d${sg.ma40m != null ? ` vs 40m MA ${sg.ma40m.toFixed(2)}` : ''}${sg.ma80m != null ? ` / 80m MA ${sg.ma80m.toFixed(2)}` : ''}, ${sg.regime}).`
    );
  }
  if (proSignals?.miners?.goldBreadthPct != null && proSignals?.miners?.silverBreadthPct != null) {
    extras.push(
      `Producer breadth tracks ${proSignals.miners.goldBreadthPct}% positive among Gold majors (NEM/AEM/B/WPM/FNV) and ${proSignals.miners.silverBreadthPct}% among Silver peers (PAAS/HL/AG/CDE).`
    );
  }
  if (ratio >= 86) {
    extras.push(`Gold/Silver ratio (${ratio.toFixed(1)}:1) sits elevated, historically favoring Silver catch-up.`);
  }

  return `Anonymous model signals a ${gLabel} tilt for Gold and ${sLabel} tilt for Silver across ${headlineCount} deduplicated news clusters. ${driverPhrase}${extras.length ? ' ' + extras.join(' ') : ''}`;
}
