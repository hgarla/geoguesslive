export interface SeedLocation {
  name: string;
  country: string;
  lat: number;
  lng: number;
  capital: string;
  language: string;
  population: string;
  flag: string;
  imagePrompt: string;
  // Optional override for Wikipedia article title when the landmark name
  // doesn't match the article title (e.g. "Pyramid of the Sun, Teotihuacan" -> "Pyramid of the Sun").
  wikiTitle?: string;
}

export interface ImageAttribution {
  artist: string;
  license: string;
  sourceUrl: string;
}

export interface SeedImageEntry {
  source: 'wikimedia' | 'generated';
  url: string;
  attribution?: ImageAttribution;
}

export interface PuzzleLocation {
  id: number;
  name: string;
  country: string;
  lat: number;
  lng: number;
  demographics: {
    population: string;
    capital: string;
    language: string;
  };
  flag: string;
  image: string;
  attribution?: ImageAttribution;
}

export interface DailyPuzzle {
  date: string;
  locations: PuzzleLocation[];
}
