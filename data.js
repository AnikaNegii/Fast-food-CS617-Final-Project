// ============ Stats data ============
// Source: MA_Food_Health_Master.xlsx (County Health Rankings 2025, USDA Food
// Environment Atlas 2020/2021) + MA_Obesity_Trends_2011_2025.xlsx (CHR).
// Populations are U.S. Census 2020 estimates (used only for dot sizing).

window.MA_DATA = {
  '25001': { name: 'Barnstable',  obesity: 24, ff: 0.9898, income:  82_980, poverty:  8.0, diab15: 5.3, diab19: 6.4, pop:  228_996 },
  '25003': { name: 'Berkshire',   obesity: 26, ff: 0.8429, income:  60_945, poverty: 10.9, diab15: 7.1, diab19: 9.0, pop:  127_017 },
  '25005': { name: 'Bristol',     obesity: 32, ff: 0.6864, income:  72_857, poverty: 11.9, diab15: 9.7, diab19: 7.9, pop:  580_028 },
  '25007': { name: 'Dukes',       obesity: 27, ff: 0.9736, income:  79_338, poverty:  7.6, diab15: 6.3, diab19: 7.2, pop:   20_600 },
  '25009': { name: 'Essex',       obesity: 26, ff: 0.7507, income:  87_145, poverty:  9.6, diab15: 8.2, diab19: 7.4, pop:  809_829 },
  '25011': { name: 'Franklin',    obesity: 28, ff: 0.4554, income:  68_948, poverty: 10.7, diab15: 7.4, diab19: 7.4, pop:   71_029 },
  '25013': { name: 'Hampden',     obesity: 30, ff: 0.6056, income:  61_818, poverty: 17.0, diab15: 9.6, diab19: 7.7, pop:  462_513 },
  '25015': { name: 'Hampshire',   obesity: 25, ff: 0.6258, income:  77_117, poverty: 11.7, diab15: 6.9, diab19: 5.7, pop:  162_283 },
  '25017': { name: 'Middlesex',   obesity: 23, ff: 0.8146, income: 112_345, poverty:  7.7, diab15: 7.3, diab19: 6.3, pop: 1_632_002 },
  '25019': { name: 'Nantucket',   obesity: 27, ff: 1.5823, income: 110_966, poverty:  5.9, diab15: 7.3, diab19: 7.2, pop:   14_255 },
  '25021': { name: 'Norfolk',     obesity: 22, ff: 0.6992, income: 114_658, poverty:  6.9, diab15: 7.4, diab19: 7.3, pop:  725_981 },
  '25023': { name: 'Plymouth',    obesity: 27, ff: 0.6129, income:  99_445, poverty:  7.5, diab15: 8.6, diab19: 7.8, pop:  535_650 },
  '25025': { name: 'Suffolk',     obesity: 25, ff: 0.9693, income:  77_163, poverty: 18.5, diab15: 8.5, diab19: 8.6, pop:  803_904 },
  '25027': { name: 'Worcester',   obesity: 31, ff: 0.6910, income:  84_583, poverty: 10.0, diab15: 8.4, diab19: 7.8, pop:  862_111 },
};

// Map county name → FIPS for the trends sheet
window.NAME_TO_FIPS = Object.fromEntries(
  Object.entries(window.MA_DATA).map(([id, d]) => [d.name, id])
);

// Years for the trend data
window.TREND_YEARS = [2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025];

// Obesity % by county by year — source: MA_Obesity_Trends_2011_2025.xlsx (CHR)
window.MA_TRENDS = {
  '25001': [19,18,18,18,18,20,20,21,20,21,23,24,26,29,27], // Barnstable
  '25003': [23,24,24,22,23,23,24,23,25,26,27,26,25,31,32], // Berkshire
  '25005': [28,29,29,29,29,28,28,29,29,29,29,32,27,30,32], // Bristol
  '25007': [18,19,19,20,22,22,22,21,23,27,28,27,25,28,25], // Dukes
  '25009': [23,24,24,24,24,24,26,26,25,25,26,26,27,30,30], // Essex
  '25011': [24,25,25,25,22,22,21,23,27,29,28,28,26,28,26], // Franklin
  '25013': [27,29,29,29,29,29,28,28,29,31,31,30,32,36,35], // Hampden
  '25015': [21,22,22,22,22,21,19,20,20,20,21,25,23,26,24], // Hampshire
  '25017': [22,23,23,23,23,23,23,23,23,22,22,23,21,23,24], // Middlesex
  '25019': [21,23,23,24,20,21,20,23,23,25,25,27,25,27,27], // Nantucket
  '25021': [19,20,20,20,20,20,21,21,22,23,25,22,23,25,23], // Norfolk
  '25023': [22,23,23,25,26,26,28,29,29,28,27,27,25,29,30], // Plymouth
  '25025': [21,22,22,22,21,21,21,21,21,21,21,25,23,25,25], // Suffolk
  '25027': [24,26,26,26,26,26,27,27,27,27,28,31,30,31,33], // Worcester
};

// Statewide annual obesity %, same source
window.STATE_TREND = [23,24,24,24,24,24,24,24,24,25,25,25,25,28,27];

// ============ Pre-computed correlations (from the MA dataset above) ============
window.MA_STATS = {
  r_ff_obesity:      -0.195,
  r_income_obesity:  -0.511,
  r_poverty_obesity:  0.306,
  R2_ff_obesity:      0.038,
  R2_income_obesity:  0.261,
  // From the prior MATH 345 national study (Negi/Guzman/Leng, Dec 2025)
  national_r:        0.448,
  national_R2:       0.11,
  national_p_pov:    0.0028,
  national_pct_low_high: 70,
};
