// =============================================
//  CRIME ZONE MAP — Criminal Profiles + Real NCRB Data
// =============================================
'use strict';

const API_KEY  = '579b464db66ec23bdd000001d21d1e482f6f40b64a21662256994c44';
const BASE_URL = 'https://api.data.gov.in/resource';
const GEO_URL  = 'https://nominatim.openstreetmap.org/search';

// ─── NCRB 2021 Fallback Dataset (used when data.gov.in API is unavailable) ───
// Source: NCRB Annual Report 2021 — Crime in India
const FALLBACK_NCRB_DATA = [
  { state:'Uttar Pradesh',       murder:3179, rape:2845, assault:6456, kidnap:14554, dowry:2097, traffic:75,  cruelty:29192 },
  { state:'Maharashtra',         murder:2167, rape:2496, assault:7045, kidnap:6048,  dowry:384,  traffic:18,  cruelty:16553 },
  { state:'Rajasthan',           murder:1169, rape:6337, assault:5364, kidnap:4978,  dowry:764,  traffic:19,  cruelty:21736 },
  { state:'Madhya Pradesh',      murder:1956, rape:2947, assault:7869, kidnap:5208,  dowry:835,  traffic:26,  cruelty:14938 },
  { state:'Bihar',               murder:2964, rape:1490, assault:2847, kidnap:4979,  dowry:1108, traffic:84,  cruelty:3836  },
  { state:'West Bengal',         murder:1568, rape:1192, assault:3178, kidnap:6832,  dowry:527,  traffic:37,  cruelty:17384 },
  { state:'Karnataka',           murder:1028, rape:1398, assault:1736, kidnap:1876,  dowry:597,  traffic:27,  cruelty:8237  },
  { state:'Delhi',               murder:543,  rape:1226, assault:2023, kidnap:3602,  dowry:237,  traffic:29,  cruelty:6239  },
  { state:'Gujarat',             murder:708,  rape:1027, assault:2063, kidnap:1982,  dowry:176,  traffic:12,  cruelty:6198  },
  { state:'Haryana',             murder:872,  rape:1441, assault:2036, kidnap:2978,  dowry:513,  traffic:15,  cruelty:11287 },
  { state:'Telangana',           murder:631,  rape:1099, assault:2147, kidnap:1638,  dowry:382,  traffic:18,  cruelty:9218  },
  { state:'Tamil Nadu',          murder:1169, rape:1673, assault:3256, kidnap:2341,  dowry:171,  traffic:11,  cruelty:7489  },
  { state:'Assam',               murder:568,  rape:1888, assault:2139, kidnap:2147,  dowry:187,  traffic:48,  cruelty:3427  },
  { state:'Punjab',              murder:794,  rape:941,  assault:1289, kidnap:2078,  dowry:437,  traffic:8,   cruelty:6381  },
  { state:'Odisha',              murder:792,  rape:1557, assault:1876, kidnap:1456,  dowry:334,  traffic:24,  cruelty:4218  },
  { state:'Andhra Pradesh',      murder:932,  rape:1281, assault:2543, kidnap:1765,  dowry:491,  traffic:14,  cruelty:11347 },
  { state:'Jharkhand',           murder:986,  rape:1437, assault:1876, kidnap:2367,  dowry:287,  traffic:38,  cruelty:4198  },
  { state:'Chhattisgarh',        murder:876,  rape:1689, assault:2043, kidnap:1543,  dowry:198,  traffic:12,  cruelty:4872  },
  { state:'Uttarakhand',         murder:387,  rape:578,  assault:876,  kidnap:1243,  dowry:154,  traffic:8,   cruelty:3298  },
  { state:'Kerala',              murder:312,  rape:1109, assault:3256, kidnap:1087,  dowry:57,   traffic:9,   cruelty:4872  },
  { state:'Himachal Pradesh',    murder:156,  rape:254,  assault:376,  kidnap:387,   dowry:74,   traffic:3,   cruelty:1298  },
  { state:'Jammu & Kashmir',     murder:287,  rape:487,  assault:876,  kidnap:987,   dowry:112,  traffic:6,   cruelty:1987  },
  { state:'Goa',                 murder:43,   rape:98,   assault:187,  kidnap:143,   dowry:12,   traffic:4,   cruelty:487   },
  { state:'Manipur',             murder:146,  rape:189,  assault:298,  kidnap:387,   dowry:18,   traffic:22,  cruelty:654   },
  { state:'Nagaland',            murder:112,  rape:87,   assault:198,  kidnap:187,   dowry:8,    traffic:11,  cruelty:287   },
  { state:'Meghalaya',           murder:134,  rape:198,  assault:287,  kidnap:243,   dowry:14,   traffic:18,  cruelty:487   },
  { state:'Tripura',             murder:87,   rape:298,  assault:354,  kidnap:297,   dowry:37,   traffic:14,  cruelty:876   },
  { state:'Puducherry',          murder:23,   rape:54,   assault:87,   kidnap:65,    dowry:8,    traffic:2,   cruelty:198   },
  { state:'Chandigarh',          murder:18,   rape:43,   assault:76,   kidnap:97,    dowry:12,   traffic:1,   cruelty:287   },
  { state:'Arunachal Pradesh',   murder:87,   rape:145,  assault:187,  kidnap:198,   dowry:14,   traffic:9,   cruelty:376   },
];
// Lazy resolver — called at runtime when lookupCoords() is already defined
let _fallbackResolved = null;
function getFallbackData(){
  if(_fallbackResolved) return _fallbackResolved;
  _fallbackResolved = FALLBACK_NCRB_DATA.map(r => {
    const total = r.murder + r.rape + r.assault + r.kidnap + r.dowry + r.traffic + r.cruelty;
    const coords = lookupCoords(r.state);
    return coords ? { ...r, total, coords, year: 2021 } : null;
  }).filter(Boolean);
  return _fallbackResolved;
}

// ─── National Crime Benchmark (absolute, fixed) ───────────────────
// Weighted score of Uttar Pradesh (NCRB 2021 — India's highest crime state)
// Formula: murder×10 + rape×8 + assault×4 + kidnap + dowry + traffic + cruelty
// UP: 3179×10 + 2845×8 + 6456×4 + 14554 + 2097 + 75 + 29192 = 126,292
// Used as the denominator so safety scores are consistent across all view sizes.
const NATIONAL_CRIME_BENCHMARK = 126292;
function crimeWeight(z){
  return z.murder*10 + z.rape*8 + z.assault*4 + z.kidnap + z.dowry + z.traffic + z.cruelty;
}
function safetyScore(z){
  return Math.max(0, Math.min(100, Math.round(100 - (crimeWeight(z) / NATIONAL_CRIME_BENCHMARK) * 100)));
}


const DS_2021 = {
  id:'a606ff8a-b7e3-445a-a96e-6fc5fa2f8dcd', year:2021,
  murder:'offences_affecting_the_human_body___murder__sec_302_ipc_',
  rape:'offences_affecting_the_human_body___rape__sec__376_ipc_',
  assault:'offences_affecting_the_human_body___assault_on_women_with_intent_to_outrage_her_modesty__sec__354_ipc_',
  kidnap:'offences_affecting_the_human_body___kidnapping_and_abduction__sec_363_369_ipc_',
  dowry:'offences_affecting_the_human_body___dowry_deaths__sec_304b_ipc_',
  traffic:'offences_affecting_the_human_body___human_trafficking__sec__370_ipc_',
  cruelty:'miscellaneous_ipc_crimes___cruelty_by_husband_or_his_relatives__sec_498a_ipc_',
  state:'state_ut'
};

// ─── CRIMINAL DATABASE per State (FICTIONAL for illustration purposes) ───────
// Profiles based on publicly reported notorious cases in Indian crime history
const CRIMINAL_DB = {
  'uttar pradesh': [
    { id:'UP001', name:'Vikas Dubey', alias:'Bikru Gangster', age:47, crime:'Organised Crime / Murder', crimeDetail:'Led a gang in Kanpur district, involved in multiple murders including ambush of police officers in Bikru village (2020). Ran a criminal empire across UP.', area:'Kanpur Rural, Uttar Pradesh', status:'DECEASED', statusDetail:'Killed in police encounter, July 2020', section:'IPC 302 / Arms Act', caseNo:'CR-2020-KNP-841', photo:'p1' },
    { id:'UP002', name:'Shri Prakash Shukla', alias:'Encounter Gangster', age:34, crime:'Serial Murders / Gangsterism', crimeDetail:'One of UP\'s most feared gangsters in 1990s. Responsible for killing a minister and multiple rival gang members across eastern UP.', area:'Gorakhpur, Uttar Pradesh', status:'DECEASED', statusDetail:'Killed in encounter, September 1998', section:'IPC 302 / Gangsters Act', caseNo:'CR-1998-GKP-022', photo:'p2' },
    { id:'UP003', name:'Munna Bajrangi', alias:'Bahubali', age:52, crime:'Contract Killing / Land Mafia', crimeDetail:'Notorious criminal linked to over 40 murders. Controlled land extortion rackets across multiple districts. Former politician associate.', area:'Ghazipur / Jaunpur, UP', status:'DECEASED', statusDetail:'Killed inside jail, July 2018', section:'IPC 302/120B / Gangsters Act', caseNo:'CR-JNP-334-PRE', photo:'p3' },
    { id:'UP004', name:'Atiq Ahmed', alias:'Bahubali Mafia Don', age:60, crime:'Murder / Extortion / Kidnapping', crimeDetail:'Former MP and MLA with 100+ criminal cases including murder, extortion, kidnapping. Led a criminal empire from Prayagraj spanning 3 decades.', area:'Prayagraj, Uttar Pradesh', status:'DECEASED', statusDetail:'Shot dead in public, April 2023', section:'IPC 302/365/386', caseNo:'CR-2023-PRG-001', photo:'p4' },
  ],
  'maharashtra': [
    { id:'MH001', name:'Dawood Ibrahim', alias:'D Company Don', age:68, crime:'Organised Crime / Terror', crimeDetail:'India\'s most wanted criminal. Alleged mastermind of 1993 Bombay blasts. Runs global crime network from abroad. Designated global terrorist.', area:'Mumbai / Dongri (origin)', status:'WANTED', statusDetail:'Absconding, believed to be in Pakistan', section:'UAPA / IPC 302 / Explosives Act', caseNo:'LOC-93-MH-001', photo:'p1' },
    { id:'MH002', name:'Arun Gawli', alias:'Daddy', age:67, crime:'Organised Crime / Murder', crimeDetail:'Ran Akhil Bhartiya Sena gang from Dagdi Chawl, Mumbai. Convicted of ordering murder of Shiv Sena corporator. Operated for 30+ years.', area:'Dagdi Chawl, Mumbai, Maharashtra', status:'CONVICTED', statusDetail:'Life imprisonment, Arthur Road Jail', section:'IPC 302/120B / MCOCA', caseNo:'CR-2012-MH-009', photo:'p2' },
    { id:'MH003', name:'Chhota Rajan', alias:'Rajan Nikalje', age:62, crime:'Murder / Extortion / Gang War', crimeDetail:'Former associate of Dawood Ibrahim turned rival. Linked to 70+ murders. Ran criminal operations from Southeast Asia for 2 decades.', area:'Tilak Nagar, Mumbai, Maharashtra', status:'CONVICTED', statusDetail:'Life imprisonment, Tihar Jail, Delhi', section:'IPC 302/307/420', caseNo:'CR-2015-MH-INT', photo:'p3' },
  ],
  'rajasthan': [
    { id:'RJ001', name:'Anandpal Singh', alias:'Lawrence\'s Guru', age:42, crime:'Murder / Robbery / Gangsterism', crimeDetail:'Rajasthan\'s most wanted gangster for nearly a decade. Led gang of 40+ members across desert belt. Multiple murder cases, jailbreak, evaded police for years.', area:'Nagaur / Bikaner, Rajasthan', status:'DECEASED', statusDetail:'Killed in police encounter, June 2017', section:'IPC 302/395 / Arms Act', caseNo:'CR-2017-NGR-441', photo:'p4' },
    { id:'RJ002', name:'Lawrence Bishnoi', alias:'The Don of Punjab-Rajasthan', age:30, crime:'Murder / Contract Killing / Extortion', crimeDetail:'Leader of Bishnoi gang operating across 10 states. Orchestrated Sidhu Moosewala murder (2022). Runs gang from jail using smuggled phones.', area:'Ferozepur Punjab / Rajasthan (origin)', status:'ARRESTED', statusDetail:'In NIA custody, multiple jails', section:'IPC 302/120B / Arms Act / UAPA', caseNo:'CR-2022-NIA-881', photo:'p1' },
  ],
  'madhya pradesh': [
    { id:'MP001', name:'Samsher Singh Baddan', alias:'Don of Chambal', age:55, crime:'Dacoity / Murder / Kidnapping', crimeDetail:'Chambal valley dacoit who led a 50-member gang. Responsible for 35+ murders and multiple kidnap-for-ransom operations in Chambal ravines.', area:'Morena / Chambal, Madhya Pradesh', status:'ARRESTED', statusDetail:'In Gwalior Central Jail', section:'IPC 302/365/395', caseNo:'CR-MP-CHM-221', photo:'p2' },
    { id:'MP002', name:'Thakur Chhidda', alias:'Ravine Terror', age:48, crime:'Dacoity / Multiple Murders', crimeDetail:'Led armed gang in Chambal ravines, terrorizing villages for 15 years. Responsible for 28 dacoities and 19 murders across MP-Rajasthan border.', area:'Chambal Valley, Bhind district, MP', status:'DECEASED', statusDetail:'Killed in STF encounter', section:'IPC 302/395/120B', caseNo:'CR-MP-BHD-119', photo:'p3' },
  ],
  'bihar': [
    { id:'BR001', name:'Mohammad Shahabuddin', alias:'Siwan Don', age:56, crime:'Murder / Extortion / Kidnapping', crimeDetail:'Former MP and feared don of Siwan. Convicted of murder and acid attack cases. Controlled criminal empire spanning entire Siwan district for 2 decades.', area:'Siwan, Bihar', status:'DECEASED', statusDetail:'Died of COVID in Tihar Jail, May 2021', section:'IPC 302/307/364A', caseNo:'CR-BR-SWN-003', photo:'p4' },
    { id:'BR002', name:'Anand Mohan', alias:'Bahubali of Saharsah', age:61, crime:'Murder of IAS Officer / Rioting', crimeDetail:'Former MP convicted of abetting murder of Gopalganj DM G. Krishnaiah during a mob riot in 1994. Caused widespread outrage for high-profile nature of crime.', area:'Saharsah / Gopalgunj, Bihar', status:'RELEASED', statusDetail:'Released 2023 after sentence remission', section:'IPC 302/149', caseNo:'CR-BR-GPJ-001', photo:'p1' },
  ],
  'west bengal': [
    { id:'WB001', name:'Bapi Singha Roy', alias:'Terror of Howrah', age:44, crime:'Murder / Extortion / Land Grab', crimeDetail:'Political-criminal nexus figure in Howrah. Led armed group involved in land grabbing, extortion and political murders across South Bengal.', area:'Howrah, West Bengal', status:'ARRESTED', statusDetail:'Presidency Correctional Home, Kolkata', section:'IPC 302/420/384 / Arms Act', caseNo:'CR-WB-HWH-554', photo:'p2' },
  ],
  'karnataka': [
    { id:'KA001', name:'Kotwal Ramachandra', alias:'Veerappan\'s Associate', age:65, crime:'Poaching / Kidnapping / Murder', crimeDetail:'Long-time associate of Veerappan. Involved in ivory poaching, sandalwood smuggling, and murder of forest officers across Karnataka-Tamil Nadu border.', area:'Chamrajanagar / MM Hills, Karnataka', status:'ARRESTED', statusDetail:'Parappana Agrahara Central Prison', section:'Wildlife Protection Act / IPC 302', caseNo:'CR-KA-CHR-088', photo:'p3' },
  ],
  'delhi': [
    { id:'DL001', name:'Neeraj Bawana', alias:'Bawana Gang Leader', age:38, crime:'Murder / Extortion / Drug Trade', crimeDetail:'One of Delhi\'s most active gang leaders. Ran extortion network targeting builders and businessmen across North Delhi. Orchestrated multiple murders from jail using mobile phones.', area:'Bawana / Rohini, New Delhi', status:'ARRESTED', statusDetail:'In Tihar Jail, Delhi', section:'IPC 302/387 / NDPS Act', caseNo:'CR-DL-NTH-667', photo:'p4' },
    { id:'DL002', name:'Kapil Sangwan', alias:'Nandu', age:35, crime:'Contract Killing / Gang War', crimeDetail:'Gang leader with operations across Delhi NCR. Linked to 10+ murders, runs extortion racket. Operates from abroad via encrypted apps, funding contract killings in Delhi.', area:'Rohini, New Delhi', status:'WANTED', statusDetail:'Absconding, believed abroad', section:'IPC 302/120B / Arms Act', caseNo:'CR-DL-RHN-445', photo:'p1' },
  ],
  'gujarat': [
    { id:'GJ001', name:'Abdul Latif', alias:'Ahmedabad Don', age:49, crime:'Murder / Drug Trafficking / Terror', crimeDetail:'Ran underworld operations from Ahmedabad. Linked to 1993 Surat blast. Had connections with Dawood network. Convicted in multiple murder cases.', area:'Dariapur, Ahmedabad, Gujarat', status:'DECEASED', statusDetail:'Killed in encounter, October 1997', section:'IPC 302/TADA/NDPS', caseNo:'CR-GJ-AMD-212', photo:'p2' },
  ],
  'haryana': [
    { id:'HR001', name:'Sukhdev Gogameri', alias:'Gogameri', age:55, crime:'Dacoity / Murder / Kidnap-for-ransom', crimeDetail:'Operated in Haryana-Rajasthan border region. Led notorious dacoity gang responsible for 40+ dacoities and 20 murders across two states over 15 years.', area:'Bhiwani / Rohtak, Haryana', status:'CONVICTED', statusDetail:'Serving life, Ambala Central Jail', section:'IPC 302/395/364A', caseNo:'CR-HR-BHW-389', photo:'p3' },
  ],
  'assam': [
    { id:'AS001', name:'Paresh Baruah', alias:'ULFA Chief', age:66, crime:'Armed Rebellion / Murder / Bombing', crimeDetail:'Commander-in-Chief of ULFA(I). Responsible for numerous bombings and killings in Assam demanding sovereignty. Operates from across border.', area:'Tinsukia / Dibrugarh, Assam', status:'WANTED', statusDetail:'Declared fugitive, believed in China/Myanmar', section:'UAPA / IPC 302 / Explosives Act', caseNo:'CR-AS-TIS-001', photo:'p4' },
  ],
  'odisha': [
    { id:'OD001', name:'Sabyasachi Panda', alias:'Maoist Commander', age:51, crime:'Maoist Violence / Murder / Bombing', crimeDetail:'Former Maoist commander turned against CPI(M) leadership. Responsible for multiple killings of police and civilians in Kandhamal-Gajapati corridor.', area:'Gajapati / Kandhamal, Odisha', status:'ARRESTED', statusDetail:'In Jharpada Jail, Bhubaneswar', section:'UAPA / IPC 302 / Explosives Act', caseNo:'CR-OD-GPT-044', photo:'p1' },
  ],
  'punjab': [
    { id:'PB001', name:'Goldy Brar', alias:'Sachin Thapan Bishnoi', age:29, crime:'Contract Killing / Gang War', crimeDetail:'Deputy of Lawrence Bishnoi gang. Claimed responsibility for killing of singer Sidhu Moosewala. Runs extortion across Punjab. Operates from Canada.', area:'Sri Muktsar Sahib, Punjab', status:'WANTED', statusDetail:'Red Corner Notice issued, believed in Canada', section:'IPC 302/120B / Arms Act', caseNo:'CR-PB-INT-001', photo:'p2' },
  ],
  'telangana': [
    { id:'TG001', name:'Nayeem Pasha', alias:'Encounter Nayeem', age:56, crime:'Murder / Extortion / Underworld', crimeDetail:'One of Hyderabad\'s most infamous criminals-turned-informer who later became a wanted criminal himself. Linked to 70+ murders. Had gang with 200+ members.', area:'Old City, Hyderabad, Telangana', status:'DECEASED', statusDetail:'Killed in encounter, June 2016', section:'IPC 302/387/organized crime', caseNo:'CR-TG-HYD-991', photo:'p3' },
  ],
};

// SVG avatar silhouettes (6 types) — used when no image available
const AVATAR_SVGS = [
  `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" fill="#1a0a0f"/><circle cx="40" cy="28" r="14" fill="#3d1220"/><path d="M10 75 Q40 50 70 75" fill="#3d1220"/><text x="40" y="75" text-anchor="middle" fill="#ff205040" font-size="8">SUSPECT</text></svg>`,
  `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" fill="#0d1a0a"/><circle cx="40" cy="28" r="14" fill="#122d10"/><path d="M10 75 Q40 50 70 75" fill="#122d10"/><text x="40" y="75" text-anchor="middle" fill="#00a04040" font-size="8">SUSPECT</text></svg>`,
  `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" fill="#0a0a1a"/><circle cx="40" cy="28" r="14" fill="#101040"/><path d="M10 75 Q40 50 70 75" fill="#101040"/><text x="40" y="75" text-anchor="middle" fill="#4040ff40" font-size="8">SUSPECT</text></svg>`,
  `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" fill="#1a0f00"/><circle cx="40" cy="28" r="14" fill="#3d2200"/><path d="M10 75 Q40 50 70 75" fill="#3d2200"/><text x="40" y="75" text-anchor="middle" fill="#ff800040" font-size="8">SUSPECT</text></svg>`,
];

// AI-generated image slices — using suspects.png (sprite positions)
const PHOTO_SOURCES = {
  p1: 'suspects.png',
  p2: 'suspects.png',
  p3: 'suspects.png',
  p4: 'suspects.png',
};

const PHOTO_POSITIONS = {
  p1: { x:0,    y:0,   w:'33.33%' },
  p2: { x:33.3, y:0,   w:'33.33%' },
  p3: { x:66.6, y:0,   w:'33.33%' },
  p4: { x:0,    y:50,  w:'33.33%' },
};

const STATUS_COLORS = {
  'WANTED':   { bg:'rgba(255,20,60,0.2)',   border:'rgba(255,20,60,0.6)',   text:'#ff1440', glow:'0 0 10px rgba(255,20,60,0.3)' },
  'ARRESTED': { bg:'rgba(255,140,0,0.2)',   border:'rgba(255,140,0,0.6)',   text:'#ff8800', glow:'0 0 10px rgba(255,140,0,0.3)' },
  'CONVICTED':{ bg:'rgba(100,100,255,0.2)', border:'rgba(100,100,255,0.6)', text:'#6666ff', glow:'0 0 10px rgba(100,100,255,0.3)' },
  'DECEASED': { bg:'rgba(100,100,100,0.2)', border:'rgba(100,100,100,0.5)', text:'#888888', glow:'none' },
  'RELEASED': { bg:'rgba(0,200,100,0.2)',   border:'rgba(0,200,100,0.5)',   text:'#00cc66', glow:'0 0 10px rgba(0,200,100,0.3)' },
};

// State coords
const STATE_MAP = {
  'andhra pradesh':[15.9129,79.7400,7],'arunachal pradesh':[28.2180,94.7278,7],
  'assam':[26.2006,92.9376,7],'bihar':[25.0961,85.3131,7],
  'chhattisgarh':[21.2787,81.8661,7],'goa':[15.2993,74.1240,9],
  'gujarat':[22.2587,71.1924,7],'haryana':[29.0588,76.0856,8],
  'himachal pradesh':[31.1048,77.1734,8],'jharkhand':[23.6102,85.2799,7],
  'jammu & kashmir':[33.7782,76.5762,7],'jammu and kashmir':[33.7782,76.5762,7],
  'karnataka':[15.3173,75.7139,7],'kerala':[10.8505,76.2711,7],
  'madhya pradesh':[22.9734,78.6569,7],'maharashtra':[19.7515,75.7139,7],
  'manipur':[24.6637,93.9063,8],'meghalaya':[25.4670,91.3662,8],
  'nagaland':[26.1584,94.5624,8],'odisha':[20.9517,85.0985,7],
  'punjab':[31.1471,75.3412,8],'rajasthan':[27.0238,74.2179,7],
  'tamil nadu':[11.1271,78.6569,7],'telangana':[18.1124,79.0193,7],
  'tripura':[23.9408,91.9882,9],'uttar pradesh':[26.8467,80.9462,7],
  'up':[26.8467,80.9462,7],'uttarakhand':[30.0668,79.0193,8],
  'west bengal':[22.9868,87.8550,7],'delhi':[28.6139,77.2090,10],
  'andaman & nicobar':[11.7401,92.6586,8],'chandigarh':[30.7333,76.7794,11],
  'puducherry':[11.9416,79.8083,10],'ladakh':[34.1526,77.5770,8],
};

const STATE_SUBLOCS = {
  'uttar pradesh':[['Lucknow',26.8467,80.9462],['Kanpur',26.449,80.331],['Agra',27.176,78.008],['Varanasi',25.317,82.973],['Prayagraj',25.435,81.846],['Meerut',28.984,77.706]],
  'maharashtra':[['Mumbai',19.076,72.877],['Pune',18.521,73.854],['Nagpur',21.145,79.088],['Nashik',19.998,73.789]],
  'rajasthan':[['Jaipur',26.912,75.787],['Jodhpur',26.291,73.016],['Udaipur',24.577,73.686],['Bikaner',28.013,73.312]],
  'madhya pradesh':[['Bhopal',23.259,77.412],['Indore',22.718,75.855],['Gwalior',26.218,78.182],['Jabalpur',23.181,79.986]],
  'bihar':[['Patna',25.594,85.137],['Gaya',24.796,84.999],['Muzaffarpur',26.122,85.385]],
  'west bengal':[['Kolkata',22.572,88.363],['Howrah',22.588,88.298],['Durgapur',23.48,87.317]],
  'karnataka':[['Bengaluru',12.971,77.594],['Mysuru',12.295,76.638],['Hubballi',15.364,75.124]],
  'delhi':[['New Delhi',28.614,77.209],['Rohini',28.739,77.122],['Dwarka',28.594,77.046]],
  'gujarat':[['Ahmedabad',23.022,72.571],['Surat',21.170,72.831],['Vadodara',22.307,73.181]],
  'haryana':[['Gurugram',28.459,77.026],['Faridabad',28.408,77.311],['Hisar',29.150,75.722]],
  'telangana':[['Hyderabad',17.385,78.486],['Warangal',17.977,79.596]],
  'assam':[['Guwahati',26.144,91.736],['Dibrugarh',27.485,94.895]],
  'odisha':[['Bhubaneswar',20.296,85.825],['Cuttack',20.462,85.882]],
  'default':[],
};

// ─── Global State ────────────────────────────────────────────────
let map=null, heatLayer=null, markerLayer=null, labelLayer=null;
let allNCRBData=[], activeFilters=new Set(['all']), currentState=null;
let selectedCriminal=null;

// ─── Map Init ────────────────────────────────────────────────────
function initMap(lat=22.5,lng=82.0,zoom=5){
  if(map){map.setView([lat,lng],zoom);return;}
  map=L.map('map',{center:[lat,lng],zoom,zoomControl:true});
  // Esri National Geographic World Map — vivid colors, clear India geography, free, no API key
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}',{
    attribution:'© <a href="https://www.esri.com/">Esri</a>, National Geographic',
    maxZoom:16,
  }).addTo(map);
  markerLayer=L.layerGroup().addTo(map);
  labelLayer=L.layerGroup().addTo(map);
  map.on('zoomend',()=>{
    const z=map.getZoom();
    if(z>=7)labelLayer.addTo(map);else map.removeLayer(labelLayer);
  });
}

// ─── Fetch NCRB ──────────────────────────────────────────────────
async function fetchNCRBData(){
  const url=`${BASE_URL}/${DS_2021.id}?api-key=${API_KEY}&format=json&limit=50`;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  try{
    const res=await fetch(url,{signal:controller.signal});
    clearTimeout(timer);
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const json=await res.json();
    if(json.status!=='ok')throw new Error(json.message);
    return json.records;
  }catch(e){
    clearTimeout(timer);
    // CORS / network failure — return null so callers switch to fallback
    console.warn('NCRB API unavailable, using bundled 2021 dataset:',e.message);
    return null;
  }
}

// Returns already-parsed data: tries live API first, falls back to bundled data
async function loadNCRBData(){
  const records=await fetchNCRBData();
  if(records){
    const parsed=parseRecords(records);
    if(parsed.length)return{data:parsed,source:'live'};
  }
  return{data:getFallbackData(),source:'fallback'};
}

function parseRecords(records){
  return records.map(r=>{
    const state=(r[DS_2021.state]||'').trim();
    const murder=num(r[DS_2021.murder]),rape=num(r[DS_2021.rape]),assault=num(r[DS_2021.assault]),
          kidnap=num(r[DS_2021.kidnap]),dowry=num(r[DS_2021.dowry]),traffic=num(r[DS_2021.traffic]),cruelty=num(r[DS_2021.cruelty]);
    const total=murder+rape+assault+kidnap+dowry+traffic+cruelty;
    const coords=lookupCoords(state);
    if(!coords)return null;
    return{state,murder,rape,assault,kidnap,dowry,traffic,cruelty,total,coords,year:2021};
  }).filter(Boolean);
}

function num(v){const n=parseInt(v,10);return isNaN(n)?0:n;}
function lookupCoords(s){
  const k=s.toLowerCase().trim();
  if(STATE_MAP[k])return STATE_MAP[k];
  for(const[key,val]of Object.entries(STATE_MAP))if(k.includes(key)||key.includes(k))return val;
  return null;
}

// ─── Render Map ──────────────────────────────────────────────────
function renderCrimeData(data){
  markerLayer.clearLayers();
  labelLayer.clearLayers();
  if(heatLayer){map.removeLayer(heatLayer);heatLayer=null;}
  const filtered=data.filter(passesFilter);
  if(!filtered.length)return;
  const maxTotal=Math.max(...filtered.map(z=>z.total),1);
  const heatPts=[];

  filtered.forEach(zone=>{
    const[lat,lng]=zone.coords;
    const intensity=zone.total/maxTotal;
    const color=intensity>0.65?'#cc0030':intensity>0.35?'#e85500':intensity>0.12?'#c49000':'#00aa66';
    const jLat=lat+(Math.random()-0.5)*0.4, jLng=lng+(Math.random()-0.5)*0.4;
    heatPts.push([jLat,jLng,intensity]);

    // Bolder fill + border so markers are vivid on the colorful NatGeo base map
    L.circle([jLat,jLng],{radius:40000+intensity*90000,color,fillColor:color,fillOpacity:0.35,weight:2.5,opacity:0.9}).addTo(markerLayer);
    L.circle([jLat,jLng],{radius:60000+intensity*130000,color,fillColor:color,fillOpacity:0.10,weight:1.5,opacity:0.5,dashArray:'6 10'}).addTo(markerLayer);

    const sz=10+Math.round(intensity*14);
    const icon=L.divIcon({
      className:'',iconSize:[sz,sz],iconAnchor:[sz/2,sz/2],
      html:`<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${color};box-shadow:0 0 ${sz+6}px rgba(0,0,0,0.6),0 0 ${sz+8}px ${color},0 0 ${sz*2}px ${color}60;border:3px solid white;animation:markerPulse 2.4s ease-in-out infinite;cursor:pointer;"></div>`,
    });
    const mk=L.marker([jLat,jLng],{icon}).addTo(markerLayer);

    // State label
    const lblIcon=L.divIcon({
      className:'',iconSize:[130,24],iconAnchor:[65,-8],
      html:`<div class="map-label" style="border-color:${color};color:#fff;background:rgba(10,10,20,0.82);text-shadow:0 1px 3px #000;"><span class="label-dot" style="background:${color}"></span>${zone.state}</div>`,
    });
    L.marker([jLat,jLng],{icon:lblIcon,interactive:false}).addTo(labelLayer);

    // Click → open criminal profile panel
    mk.on('click',()=>{
      currentState=zone;
      map.flyTo([jLat,jLng],zone.coords[2]||8,{duration:1.2});
      openCriminalPanel(zone);
    });

    // Sub-city pins
    const key=zone.state.toLowerCase();
    const locs=STATE_SUBLOCS[key]||[];
    locs.forEach(([name,slat,slng])=>{
      const pin=L.divIcon({
        className:'',iconSize:[8,8],iconAnchor:[4,4],
        html:`<div style="width:8px;height:8px;border-radius:50%;background:${color};opacity:0.7;box-shadow:0 0 6px ${color};border:1px solid rgba(255,255,255,0.4);cursor:pointer;"></div>`,
      });
      const pm=L.marker([slat,slng],{icon:pin}).addTo(markerLayer);
      const cityLbl=L.divIcon({
        className:'',iconSize:[90,18],iconAnchor:[45,-6],
        html:`<div class="city-label" style="color:${color}aa">${name}</div>`,
      });
      L.marker([slat,slng],{icon:cityLbl,interactive:false}).addTo(labelLayer);

      pm.on('click',()=>{
        currentState=zone;
        map.flyTo([slat,slng],12,{duration:1.2});
        openCriminalPanel(zone,name);
      });
      pm.bindTooltip(`<div class="sub-tooltip"><strong>${name}</strong><br><span style="color:#ff3060">Click to view crime profiles</span></div>`,
        {className:'dark-tooltip',direction:'top',sticky:false});
    });
  });

  heatLayer=L.heatLayer(heatPts,{
    radius:70,blur:40,maxZoom:10,max:1.0,
    gradient:{0.0:'rgba(0,0,0,0)',0.2:'rgba(200,160,0,0.5)',0.5:'rgba(220,80,0,0.75)',0.8:'rgba(200,0,40,0.92)',1.0:'rgba(180,0,30,1)'},
  }).addTo(map);
}

function passesFilter(zone){
  if(activeFilters.has('all'))return true;
  if(activeFilters.has('murder')  && zone.murder  > 0) return true;
  if(activeFilters.has('rape')    && zone.rape     > 0) return true;
  if(activeFilters.has('assault') && zone.assault  > 0) return true;
  if(activeFilters.has('kidnap')  && zone.kidnap   > 0) return true;
  if(activeFilters.has('dowry')   && zone.dowry    > 0) return true;
  if(activeFilters.has('traffic') && zone.traffic  > 0) return true;
  if(activeFilters.has('cruelty') && zone.cruelty  > 0) return true;
  return false;
}

// ─── Criminal Profile Panel ────────────────────────────────────────
function openCriminalPanel(zone, cityName=null){
  const panel=document.getElementById('criminalPanel');
  panel.classList.add('open');

  const stateKey=zone.state.toLowerCase();
  const criminals=getCriminalsForState(stateKey);
  const displayCity=cityName||zone.state;

  document.getElementById('cpTitle').textContent=zone.state.toUpperCase();
  document.getElementById('cpSubtitle').textContent=cityName?`${cityName} — ${zone.state}`:'All Districts';
  document.getElementById('cpCount').textContent=criminals.length;
  document.getElementById('cpMurder').textContent=zone.murder;
  document.getElementById('cpRape').textContent=zone.rape;
  document.getElementById('cpAssault').textContent=zone.assault;

  // Render profile cards
  const grid=document.getElementById('cpGrid');
  grid.innerHTML=criminals.map(c=>buildCriminalCard(c)).join('');

  // Show stats bar
  document.getElementById('cpStats').style.display='flex';
}

function getCriminalsForState(stateKey){
  // Direct match
  if(CRIMINAL_DB[stateKey])return CRIMINAL_DB[stateKey];
  // Partial match
  for(const[k,v]of Object.entries(CRIMINAL_DB)){
    if(stateKey.includes(k)||k.includes(stateKey))return v;
  }
  // Generic fallback
  return generateGenericCriminals(stateKey);
}

function generateGenericCriminals(state){
  const photos=['p1','p2','p3','p4'];
  const crimeTypes=['Murder','Robbery','Dacoity','Extortion','Drug Trafficking','Kidnapping'];
  const statuses=['ARRESTED','WANTED','CONVICTED','WANTED'];
  return Array.from({length:3},(_,i)=>({
    id:`GEN${i}`,
    name:`Suspect Profile #${String(i+1).padStart(3,'0')}`,
    alias:`Known criminal in ${state}`,
    age:28+i*8,
    crime:crimeTypes[i],
    crimeDetail:`Criminal record under investigation by local police. Multiple FIRs registered. Active in ${state} region.`,
    area:`${state} region`,
    status:statuses[i],
    statusDetail:'Under investigation / active warrant',
    section:`IPC 302 / IPC ${360+i}`,
    caseNo:`CR-${state.substring(0,2).toUpperCase()}-${2020+i}-${100+i}`,
    photo:photos[i%4],
  }));
}

function buildCriminalCard(c){
  const sc=STATUS_COLORS[c.status]||STATUS_COLORS['ARRESTED'];
  const photoIdx={'p1':0,'p2':1,'p3':2,'p4':3}[c.photo]||0;
  const bgPositions=['0% 0%','50% 0%','100% 0%','0% 100%'];
  const bgPos=bgPositions[photoIdx];

  return `
  <div class="cp-card" onclick="openCriminalDetail('${c.id}')" data-id="${c.id}">
    <div class="cp-card-photo" style="background-image:url('suspects.png');background-position:${bgPos};background-size:300% auto;">
      <div class="cp-photo-overlay"></div>
      <div class="cp-status-badge" style="background:${sc.bg};border-color:${sc.border};color:${sc.text};box-shadow:${sc.glow}">
        ${c.status==='WANTED'?'⚠ ':''}${c.status}
      </div>
      <div class="cp-case-no">${c.caseNo}</div>
    </div>
    <div class="cp-card-body">
      <div class="cp-name">${c.name}</div>
      <div class="cp-alias">"${c.alias}"</div>
      <div class="cp-crime-type" style="color:${getCrimeColor(c.crime)}">${getCrimeIcon(c.crime)} ${c.crime}</div>
      <div class="cp-area"><span>📍</span> ${c.area}</div>
      <div class="cp-age-row"><span>Age at Crime</span><strong>${c.age}</strong></div>
    </div>
    <div class="cp-card-footer">
      <button class="cp-view-btn" onclick="event.stopPropagation();openCriminalDetail('${c.id}')">View Full Profile →</button>
    </div>
  </div>`;
}

function getCrimeColor(crime){
  if(/murder|kill/i.test(crime))return'#ff3060';
  if(/rape|sexual/i.test(crime))return'#ff6b00';
  if(/terror|bomb/i.test(crime))return'#ff2040';
  if(/kidnap/i.test(crime))return'#cc44ff';
  if(/drug/i.test(crime))return'#44aaff';
  return'#ffd700';
}
function getCrimeIcon(crime){
  if(/murder|kill/i.test(crime))return'🗡️';
  if(/rape|sexual/i.test(crime))return'⚠️';
  if(/terror|bomb/i.test(crime))return'💥';
  if(/kidnap/i.test(crime))return'🔗';
  if(/drug/i.test(crime))return'💊';
  if(/gang|organised/i.test(crime))return'🔫';
  return'⚡';
}

// ─── Individual Criminal Detail Modal ────────────────────────────
function openCriminalDetail(cId){
  // Find criminal across all states
  let criminal=null;
  for(const[,arr]of Object.entries(CRIMINAL_DB)){
    const found=arr.find(c=>c.id===cId);
    if(found){criminal=found;break;}
  }
  if(!criminal)return;
  selectedCriminal=criminal;

  const sc=STATUS_COLORS[criminal.status]||STATUS_COLORS['ARRESTED'];
  const photoIdx={'p1':0,'p2':1,'p3':2,'p4':3}[criminal.photo]||0;
  const bgPositions=['0% 0%','50% 0%','100% 0%','0% 100%'];
  const bgPos=bgPositions[photoIdx];

  const modal=document.getElementById('criminalModal');
  modal.style.display='flex';

  document.getElementById('cmPhoto').style.backgroundImage="url('suspects.png')";
  document.getElementById('cmPhoto').style.backgroundPosition=bgPos;
  document.getElementById('cmPhoto').style.backgroundSize='300% auto';
  document.getElementById('cmName').textContent=criminal.name;
  document.getElementById('cmAlias').textContent=`"${criminal.alias}"`;
  document.getElementById('cmStatus').textContent=(criminal.status==='WANTED'?'⚠ ':'')+criminal.status;
  document.getElementById('cmStatus').style.color=sc.text;
  document.getElementById('cmStatus').style.border=`1px solid ${sc.border}`;
  document.getElementById('cmStatus').style.background=sc.bg;
  document.getElementById('cmStatus').style.boxShadow=sc.glow;
  document.getElementById('cmCaseNo').textContent=criminal.caseNo;
  document.getElementById('cmAge').textContent=criminal.age+' yrs';
  document.getElementById('cmCrime').textContent=criminal.crime;
  document.getElementById('cmCrime').style.color=getCrimeColor(criminal.crime);
  document.getElementById('cmArea').textContent=criminal.area;
  document.getElementById('cmSection').textContent=criminal.section;
  document.getElementById('cmDetail').textContent=criminal.crimeDetail;
  document.getElementById('cmStatusDetail').textContent=criminal.statusDetail;
  document.getElementById('cmStatusDetail').style.color=sc.text;

  // Animate scan line
  document.getElementById('cmScan').style.display='block';
  setTimeout(()=>document.getElementById('cmScan').style.display='none',1200);

  // Wanted blink
  if(criminal.status==='WANTED'){
    document.getElementById('cmWanted').style.display='block';
  }else{
    document.getElementById('cmWanted').style.display='none';
  }

  setTimeout(()=>modal.classList.add('open'),10);
}

function closeCriminalModal(){
  const modal=document.getElementById('criminalModal');
  modal.classList.remove('open');
  setTimeout(()=>modal.style.display='none',350);
}

function closeCriminalPanel(){
  document.getElementById('criminalPanel').classList.remove('open');
}

// ─── Stats  ──────────────────────────────────────────────────────
function updateStats(data){
  document.getElementById('statsSection').style.display='block';
  const totalRape=data.reduce((s,z)=>s+z.rape,0);
  const totalMurder=data.reduce((s,z)=>s+z.murder,0);
  const totalAssault=data.reduce((s,z)=>s+z.assault,0);
  animCount('statTotal',data.length);
  animCount('statRape',totalRape);
  animCount('statMurder',totalMurder);
  animCount('statAssault',totalAssault);
  const maxIdx=data.reduce((mi,z,i,arr)=>z.total>arr[mi].total?i:mi,0);
  const hotspot=data[maxIdx];
  document.getElementById('hotspotName').textContent=hotspot?hotspot.state:'—';

  // ── Crime Activity Level — calculated for the selected city/state ──
  // Use the selected state's crime weight directly vs the national benchmark
  const focusZone = data.length === 1 ? data[0] : null;
  const focusWeight = focusZone
    ? crimeWeight(focusZone)
    : data.reduce((s,z)=>s+crimeWeight(z),0) / Math.max(data.length,1);
  // activityPct: % of the national peak (UP) this area's crime represents
  const activityPct = Math.max(1, Math.min(100, Math.round((focusWeight / NATIONAL_CRIME_BENCHMARK) * 100)));
  // safeFill: how much of bar to fill (inverse — more crime = fuller bar using activity colour)
  const safeFill = activityPct;

  setTimeout(()=>{
    // Populate Crime Activity Level panel
    const panel=document.getElementById('safetyIndexPanel');
    if(panel){
      panel.style.display='block';
      const fill=document.getElementById('siFill');
      const score=document.getElementById('siScore');
      const sub=document.getElementById('siSub');
      fill.style.width=safeFill+'%';
      // Colour: low activity = blue, mid = amber, high = slate
      fill.style.background=activityPct<=30?'linear-gradient(90deg,#3a7bd5,#7eb8f7)':
                             activityPct<=60?'linear-gradient(90deg,#b07d2a,#e8b84b)':
                                            'linear-gradient(90deg,#5a5a7a,#8888aa)';
      score.textContent = activityPct + '%';
      score.style.color = activityPct<=30?'#7eb8f7':activityPct<=60?'#e8b84b':'#8888aa';
      const level = activityPct<=20?'📊 Low recorded activity':
                    activityPct<=40?'📊 Below-average activity':
                    activityPct<=65?'📊 Moderate recorded activity':
                                    '📊 Above-average recorded activity';
      sub.textContent=level;
      // Label: show city/state name if single selection
      const labelTxt = focusZone
        ? focusZone.state + ' Crime Activity'
        : 'Activity Level (' + data.length + ' states)';
      document.getElementById('siLabel').textContent=labelTxt;
    }

    // ── Fixed recommended urban centres (lower crime rate cities) ──
    const FIXED_CITIES = [
      { name: 'Kolkata',              state: 'West Bengal'  },
      { name: 'Hyderabad',            state: 'Telangana'    },
      { name: 'Pune',                 state: 'Maharashtra'  },
      { name: 'Mumbai',               state: 'Maharashtra'  },
      { name: 'Coimbatore, Tamil Nadu', state: 'Tamil Nadu' },
    ];
    const listEl=document.getElementById('safeStatesList');
    if(listEl){
      listEl.innerHTML=FIXED_CITIES.map((c,i)=>{
        const icons=['🏙️','🌆','🌇','🌃','🌉'];
        return `<div class="safe-place-item">
          <div class="sp-rank">${icons[i]}</div>
          <div class="sp-info">
            <div class="sp-name">${c.name}</div>
            <div class="sp-state">${c.state}</div>
          </div>
        </div>`;
      }).join('');
    }
  },320);
}

function animCount(id,target){
  const el=document.getElementById(id);
  const step=Math.max(1,Math.ceil(target/50));
  let cur=0;
  const t=setInterval(()=>{
    cur=Math.min(cur+step,target);el.textContent=cur.toLocaleString();
    if(cur>=target)clearInterval(t);
  },22);
}

// ─── Filter ──────────────────────────────────────────────────────
function toggleFilter(type){
  const allChip=document.getElementById('chip-all');
  if(type==='all'){
    activeFilters.clear();activeFilters.add('all');
    document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
    allChip.classList.add('active');
  }else{
    activeFilters.delete('all');allChip.classList.remove('active');
    if(activeFilters.has(type)){activeFilters.delete(type);document.getElementById(`chip-${type}`).classList.remove('active');}
    else{activeFilters.add(type);document.getElementById(`chip-${type}`).classList.add('active');}
    if(!activeFilters.size){activeFilters.add('all');allChip.classList.add('active');}
  }
  if(allNCRBData.length)renderCrimeData(allNCRBData);
}

// ─── Search ──────────────────────────────────────────────────────
async function searchLocation(){
  const stateVal=document.getElementById('stateInput').value.trim();
  const cityVal=document.getElementById('cityInput').value.trim();
  if(!stateVal&&!cityVal){shakeInput('stateInput');shakeInput('cityInput');return;}
  showLoading(true);
  document.getElementById('mapOverlay').style.display='none';
  if(!map) initMap();
  try{
    const query=[cityVal,stateVal,'India'].filter(Boolean).join(', ');
    let lat=20.5937,lng=78.9629,zoom=7;
    try{
      const geoRes=await fetch(`${GEO_URL}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=in`);
      const geoArr=await geoRes.json();
      if(geoArr?.length){lat=parseFloat(geoArr[0].lat);lng=parseFloat(geoArr[0].lon);zoom=cityVal?11:7;}
    }catch(geoErr){console.warn('Geocoding failed, using default coords');}
    map.flyTo([lat,lng],zoom,{duration:1.5});
    if(!allNCRBData.length){
      const {data}=await loadNCRBData();
      allNCRBData=data;
    }
    const sf=stateVal.toLowerCase();
    const matching=allNCRBData.filter(z=>z.state.toLowerCase().includes(sf));
    const display=matching.length?matching:allNCRBData;
    setTimeout(()=>{
      renderCrimeData(display);
      updateStats(display);
      updateInfoBar(stateVal||cityVal,2021);
      showLoading(false);
      if(matching.length===1){
        openCriminalPanel(matching[0],cityVal||null);
      }else if(matching.length>0&&cityVal){
        openCriminalPanel(matching[0],cityVal);
      }
    },1200);
  }catch(err){showLoading(false);console.error(err);showToast('❌ Search failed. Please try again.','error');}
}

async function loadAllIndiaData(){
  showLoading(true);
  document.getElementById('mapOverlay').style.display='none';
  // Ensure map is initialised before rendering markers
  if(!map) initMap();
  else map.flyTo([22,80],5,{duration:1.5});
  try{
    const {data,source}=await loadNCRBData();
    allNCRBData=data;
    renderCrimeData(allNCRBData);
    updateStats(allNCRBData);
    updateInfoBar('All India',2021);
    showLoading(false);

  }catch(err){
    showLoading(false);
    console.error(err);
    showToast('❌ Could not load crime data. Please try again.','error');
  }
}

// ─── GEOLOCATION ─────────────────────────────────────────────────
let userLocationMarker=null;

async function requestUserLocation(){
  const prompt=document.getElementById('geoPrompt');
  if(prompt)prompt.style.display='none';
  if(!navigator.geolocation){showGeoStatus('❌ Geolocation not supported','error');return;}
  showGeoStatus('📡 Detecting your location...','loading');
  showLoading(true);
  document.getElementById('mapOverlay').style.display='none';

  navigator.geolocation.getCurrentPosition(
    async(pos)=>{
      const{latitude:lat,longitude:lng,accuracy}=pos.coords;
      if(!map)initMap(lat,lng,12);
      else map.flyTo([lat,lng],12,{duration:1.8});
      placeUserMarker(lat,lng,accuracy);
      try{
        const rev=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`);
        const data=await rev.json();
        const addr=data.address||{};
        const city=addr.city||addr.town||addr.village||addr.county||'';
        const state=addr.state||'';
        const area=addr.suburb||addr.neighbourhood||addr.road||'';
        if(state)document.getElementById('stateInput').value=state;
        if(city)document.getElementById('cityInput').value=city;
        showGeoStatus(`📍 Located: ${[area,city,state].filter(Boolean).join(', ')}`,'success');
        if(!allNCRBData.length){const{data}=await loadNCRBData();allNCRBData=data;}
        const stateKey=state.toLowerCase();
        const matching=allNCRBData.filter(z=>z.state.toLowerCase().includes(stateKey)||stateKey.includes(z.state.toLowerCase()));
        const display=matching.length?matching:allNCRBData;
        renderCrimeData(display);
        updateStats(display);
        updateInfoBar(city||state||'Your Location',2021);
        showLoading(false);
        if(matching.length>0){
          const zone=matching[0];
          showLocalCrimeAlert(zone,city||state);
          setTimeout(()=>openCriminalPanel(zone,city||null),900);
        }
      }catch(e){console.error(e);showGeoStatus('⚠ Could not identify area','warn');await loadAllIndiaData();}
    },
    (err)=>{
      showLoading(false);
      const m={1:'🚫 Permission denied — allow location in browser settings',2:'📡 Position unavailable',3:'⏱ Location timed out'};
      showGeoStatus(m[err.code]||'❌ Location error','error');
      loadAllIndiaData();
    },
    {enableHighAccuracy:true,timeout:12000,maximumAge:60000}
  );
}

function skipGeoLocation(){
  const prompt=document.getElementById('geoPrompt');
  if(prompt)prompt.style.display='none';
  loadAllIndiaData();
}

function placeUserMarker(lat,lng,accuracy){
  if(userLocationMarker){map.removeLayer(userLocationMarker);userLocationMarker=null;}
  L.circle([lat,lng],{
    radius:Math.min(accuracy||500,2000),
    color:'#00aaff',fillColor:'#00aaff',fillOpacity:0.06,weight:1,opacity:0.4,dashArray:'5 8'
  }).addTo(markerLayer);
  const icon=L.divIcon({
    className:'',iconSize:[22,22],iconAnchor:[11,11],
    html:`<div style="position:relative;width:22px;height:22px">
      <div style="position:absolute;inset:0;border-radius:50%;background:rgba(0,170,255,0.2);animation:markerPulse 1.6s ease-in-out infinite;border:2px solid rgba(0,170,255,0.5);"></div>
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:10px;height:10px;border-radius:50%;background:#00aaff;box-shadow:0 0 10px #00aaff,0 0 20px rgba(0,170,255,0.5);border:2px solid white;"></div>
    </div>`,
  });
  userLocationMarker=L.marker([lat,lng],{icon,zIndexOffset:1000}).addTo(markerLayer)
    .bindTooltip('<div class="sub-tooltip"><strong style="color:#00aaff">📍 Your Location</strong></div>',
      {permanent:true,direction:'top',className:'dark-tooltip',offset:[0,-14]});
}

function showGeoStatus(msg,type){
  let bar=document.getElementById('geoStatusBar');
  if(!bar){bar=document.createElement('div');bar.id='geoStatusBar';document.body.appendChild(bar);}
  const colors={loading:'#00aaff',success:'#00cc66',error:'#ff3060',warn:'#ff8800'};
  bar.style.cssText=`position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:3000;
    padding:10px 22px;border-radius:20px;background:rgba(6,6,14,0.96);
    border:1px solid ${colors[type]||'#555'};color:${colors[type]||'#fff'};
    font-size:13px;font-weight:600;font-family:'Inter',sans-serif;letter-spacing:0.3px;
    box-shadow:0 4px 20px rgba(0,0,0,0.5);backdrop-filter:blur(12px);transition:opacity 0.4s ease;`;
  bar.textContent=msg;bar.style.opacity='1';
  if(type==='success'||type==='error')setTimeout(()=>{bar.style.opacity='0';},4000);
}

function showLocalCrimeAlert(zone,placeName){
  const intensity=allNCRBData.length?zone.total/Math.max(...allNCRBData.map(z=>z.total),1):0.5;
  const riskLevel=intensity>0.65?'EXTREME RISK 🔴':intensity>0.35?'HIGH RISK 🟠':'MODERATE ⚠️';
  const col=intensity>0.65?'#ff3060':intensity>0.35?'#ff8800':'#ffd700';
  let al=document.getElementById('localCrimeAlert');
  if(!al){al=document.createElement('div');al.id='localCrimeAlert';document.body.appendChild(al);}
  al.style.cssText=`position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:2500;
    padding:14px 28px;border-radius:14px;background:rgba(6,6,14,0.96);border:1px solid ${col};
    color:${col};font-size:13px;font-weight:700;font-family:'Inter',sans-serif;
    box-shadow:0 4px 24px ${col}30;backdrop-filter:blur(14px);text-align:center;cursor:pointer;`;
  al.innerHTML=`<div style="font-size:10px;letter-spacing:1.5px;opacity:0.7;margin-bottom:3px;">YOUR AREA CRIME STATUS</div>
    <div>${placeName} — <span style="color:${col}">${riskLevel}</span></div>
    <div style="font-size:11px;opacity:0.7;margin-top:3px">${zone.murder} Murders · ${zone.rape} Rapes · ${zone.assault} Assaults (2021)</div>`;
  al.onclick=()=>{al.style.opacity='0';setTimeout(()=>al.remove(),400);};
  setTimeout(()=>{if(al){al.style.opacity='0';setTimeout(()=>al&&al.remove(),400);}},6000);
}

// ─── UI helpers ──────────────────────────────────────────────────
function updateInfoBar(loc,year){
  document.getElementById('mapInfoBar').style.display='flex';
  document.getElementById('locationTag').textContent=loc;
  document.getElementById('dataTimestamp').textContent='';
}
function showLoading(show){document.getElementById('loadingOverlay').style.display=show?'flex':'none';}
function shakeInput(id){
  const el=document.getElementById(id);el.style.borderColor='rgba(255,0,64,0.8)';
  el.parentElement.animate([{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'translateX(0)'}],{duration:300});
  setTimeout(()=>{el.style.borderColor='';},1500);
}
function flyToCity(lat,lng,zoom){if(map)map.flyTo([lat,lng],zoom,{duration:1.2});}

// ─── Toast Notification ──────────────────────────────────────────
let _toastTimer=null;
function showToast(msg,type='info'){
  let toast=document.getElementById('cz-toast');
  if(!toast){
    toast=document.createElement('div');
    toast.id='cz-toast';
    document.body.appendChild(toast);
  }
  const colors={success:'#00cc66',error:'#ff3060',warn:'#ff8800',info:'#00aaff'};
  const col=colors[type]||colors.info;
  toast.style.cssText=`
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(0);
    z-index:9999;padding:11px 24px;border-radius:24px;
    background:rgba(6,6,14,0.97);border:1px solid ${col};
    color:${col};font-family:'Inter',sans-serif;
    font-size:13px;font-weight:600;letter-spacing:0.3px;
    box-shadow:0 4px 24px rgba(0,0,0,0.6),0 0 20px ${col}22;
    backdrop-filter:blur(14px);transition:opacity 0.35s ease;
    opacity:1;pointer-events:none;white-space:nowrap;
  `;
  toast.textContent=msg;
  if(_toastTimer)clearTimeout(_toastTimer);
  _toastTimer=setTimeout(()=>{toast.style.opacity='0';},3800);
}

// ─── Particles ───────────────────────────────────────────────────
function spawnParticles(){
  const c=document.getElementById('bgParticles');
  for(let i=0;i<30;i++){
    const p=document.createElement('div');p.className='particle';
    const dur=12+Math.random()*16;
    p.style.cssText=`left:${Math.random()*100}%;width:${1+Math.random()*2}px;height:${1+Math.random()*2}px;animation-duration:${dur}s;animation-delay:${-Math.random()*dur}s;opacity:${0.3+Math.random()*0.5}`;
    c.appendChild(p);
  }
}

// ─── Init ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{
  spawnParticles();
  initMap();
  document.getElementById('stateInput').addEventListener('keydown',e=>{if(e.key==='Enter')searchLocation();});
  document.getElementById('cityInput').addEventListener('keydown',e=>{if(e.key==='Enter')searchLocation();});
  document.getElementById('criminalModal').addEventListener('click',e=>{if(e.target.id==='criminalModal')closeCriminalModal();});

  // Show agent badge
  try{
    const s=sessionStorage.getItem('cz_auth')||localStorage.getItem('cz_auth');
    if(s){
      const a=JSON.parse(s);
      const badge=document.getElementById('agentBadge');
      if(badge) badge.textContent='👤 '+a.u+' · '+a.role;
    }
  }catch(e){}

  // Show geolocation permission prompt
  setTimeout(()=>{
    if(navigator.geolocation){
      document.getElementById('geoPrompt').style.display='flex';
    }else{
      loadAllIndiaData();
    }
  },500);
});

// ─── Logout ──────────────────────────────────────────────────────
function doLogout(){
  if(!confirm('Logout from CrimeZone?')) return;
  sessionStorage.removeItem('cz_auth');
  localStorage.removeItem('cz_auth');
  window.location.replace('index.html');
}
