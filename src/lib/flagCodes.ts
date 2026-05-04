// Country -> ISO 3166-1 alpha-2 code, used to construct flagcdn.com URLs.
// Covers every country currently in seedLocations.ts. Add a row here when
// you add a country to the seed list.

const ISO_BY_COUNTRY: Record<string, string> = {
  Argentina: 'ar',
  Australia: 'au',
  Austria: 'at',
  Belgium: 'be',
  Bolivia: 'bo',
  Brazil: 'br',
  Cambodia: 'kh',
  Canada: 'ca',
  Chile: 'cl',
  China: 'cn',
  Croatia: 'hr',
  'Czech Republic': 'cz',
  Ecuador: 'ec',
  Egypt: 'eg',
  France: 'fr',
  Germany: 'de',
  Greece: 'gr',
  Guatemala: 'gt',
  Iceland: 'is',
  India: 'in',
  Indonesia: 'id',
  Israel: 'il',
  Italy: 'it',
  Japan: 'jp',
  Jordan: 'jo',
  Malaysia: 'my',
  Mexico: 'mx',
  Morocco: 'ma',
  Myanmar: 'mm',
  'New Zealand': 'nz',
  Norway: 'no',
  Peru: 'pe',
  Portugal: 'pt',
  Romania: 'ro',
  Russia: 'ru',
  'Saudi Arabia': 'sa',
  Singapore: 'sg',
  Slovenia: 'si',
  'South Africa': 'za',
  Spain: 'es',
  Tanzania: 'tz',
  Thailand: 'th',
  Turkey: 'tr',
  'United Arab Emirates': 'ae',
  'United Kingdom': 'gb',
  'United States': 'us',
  'Vatican City': 'va',
  Vietnam: 'vn',
  Zimbabwe: 'zw',
};

// Returns a flagcdn.com URL for the country, or an empty string if unknown.
// Width 320 is plenty for the small inline pill in the hint UI.
export function flagUrlOf(country: string): string {
  const iso = ISO_BY_COUNTRY[country];
  return iso ? `https://flagcdn.com/w320/${iso}.png` : '';
}
