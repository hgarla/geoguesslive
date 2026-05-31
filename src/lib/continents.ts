// Map every country in the seed list to its continent. Some countries
// span continents (Russia, Turkey, Egypt) — classified by where the
// landmark in the seed list actually sits, or by where the bulk of the
// country lies.

const CONTINENT_BY_COUNTRY: Record<string, string> = {
  // Africa
  Egypt: 'Africa',
  Ethiopia: 'Africa',
  Madagascar: 'Africa',
  Mali: 'Africa',
  Morocco: 'Africa',
  Namibia: 'Africa',
  'South Africa': 'Africa',
  Tanzania: 'Africa',
  Zimbabwe: 'Africa',

  // Asia
  Bhutan: 'Asia',
  Cambodia: 'Asia',
  China: 'Asia',
  India: 'Asia',
  Indonesia: 'Asia',
  Israel: 'Asia',
  Japan: 'Asia',
  Jordan: 'Asia',
  Malaysia: 'Asia',
  Myanmar: 'Asia',
  Nepal: 'Asia',
  Philippines: 'Asia',
  'Saudi Arabia': 'Asia',
  Singapore: 'Asia',
  'South Korea': 'Asia',
  'Sri Lanka': 'Asia',
  Thailand: 'Asia',
  Turkey: 'Asia',
  'United Arab Emirates': 'Asia',
  Vietnam: 'Asia',

  // Europe
  Austria: 'Europe',
  Belgium: 'Europe',
  Croatia: 'Europe',
  'Czech Republic': 'Europe',
  Denmark: 'Europe',
  Finland: 'Europe',
  France: 'Europe',
  Germany: 'Europe',
  Greece: 'Europe',
  Iceland: 'Europe',
  Ireland: 'Europe',
  Italy: 'Europe',
  Netherlands: 'Europe',
  Norway: 'Europe',
  Portugal: 'Europe',
  Romania: 'Europe',
  Russia: 'Europe',
  Slovenia: 'Europe',
  Spain: 'Europe',
  Sweden: 'Europe',
  Switzerland: 'Europe',
  'United Kingdom': 'Europe',
  'Vatican City': 'Europe',

  // North America
  Canada: 'North America',
  Cuba: 'North America',
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
  Colombia: 'South America',
  Ecuador: 'South America',
  Peru: 'South America',
};

export function continentOf(country: string): string {
  return CONTINENT_BY_COUNTRY[country] ?? 'Unknown';
}
