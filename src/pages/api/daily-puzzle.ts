import type { NextApiRequest, NextApiResponse } from 'next';
import { dateKey, pickDailySeeds } from '@/lib/dailyPuzzle';
import seedImages from '@/data/seedImages.json';
import type { DailyPuzzle, PuzzleLocation, SeedImageEntry } from '@/types';

const images = seedImages as Record<string, SeedImageEntry>;

export default function handler(req: NextApiRequest, res: NextApiResponse<DailyPuzzle>) {
  const date = typeof req.query.date === 'string' ? req.query.date : dateKey();
  const seeds = pickDailySeeds(date, 8);

  const locations: PuzzleLocation[] = seeds.map((s, i) => {
    const img = images[s.name];
    return {
      id: i + 1,
      name: s.name,
      country: s.country,
      lat: s.lat,
      lng: s.lng,
      demographics: { population: s.population, capital: s.capital, language: s.language },
      flag: s.flag,
      image: img?.url || '',
      attribution: img?.attribution,
    };
  });

  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
  res.status(200).json({ date, locations });
}
