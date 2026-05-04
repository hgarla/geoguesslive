// Map every country in the seed list to its continent. Some countries
// span continents (Russia, Turkey, Egypt) — classified by where the
// landmark in the seed list actually sits, or by where the bulk of the
// country lies.

const CONTINENT_BY_COUNTRY: Record<string, string> = {
  // Africa
  Egypt: 'Africa',
  Morocco: 'Africa',
  'South Africa': 'Africa',
  Tanzania: 'Africa',
  Zimbabwe: 'Africa',

  // Asia
  Cambodia: 'Asia',
  China: 'Asia',
  India: 'Asia',
  Indonesia: 'Asia',
  Israel: 'Asia',
  Japan: 'Asia',
  Jordan: 'Asia',
  Malaysia: 'Asia',
  Myanmar: 'Asia',
  'Saudi Arabia': 'Asia',
  Singapore: 'Asia',
  Thailand: 'Asia',
  Turkey: 'Asia',
  'United Arab Emirates': 'Asia',
  Vietnam: 'Asia',

  // Europe
  Austria: 'Europe',
  Belgium: 'Europe',
  Croatia: 'Europe',
  'Czech Republic': 'Europe',
  France: 'Europe',
  Germany: 'Europe',
  Greece: 'Europe',
  Iceland: 'Europe',
  Italy: 'Europe',
  Norway: 'Europe',
  Portugal: 'Europe',
  Romania: 'Europe',
  Russia: 'Europe',
  Slovenia: 'Europe',
  Spain: 'Europe',
  'United Kingdom': 'Europe',
  'Vatican City': 'Europe',

  // North America
  Canada: 'North America',
  Guatemala: 'North America',
  Mexico: 'North America',
  'United States': 'North America',

  // Oceania
  Australia: 'Oceania',
  'New Zealand': 'Oceania',

  // South America
  Argentina: 'South America',
  Bolivia: 'South America',
  Brazil: 'South America',
  Chile: 'South America',
  Ecuador: 'South America',
  Peru: 'South America',
};

export function continentOf(country: string): string {
  return CONTINENT_BY_COUNTRY[country] ?? 'Unknown';
}
