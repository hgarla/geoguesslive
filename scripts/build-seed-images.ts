// One-off script to populate src/data/seedImages.json.
// For each entry in seedLocations, try Wikimedia first; if no acceptable image
// is found, fall back to OpenAI gpt-image-1 generation (saved to public/seed-images/).
//
// Usage:
//   npm run build-seed-images          # only fill in missing entries
//   npm run build-seed-images -- --force   # rebuild everything
//   npm run build-seed-images -- --only "Eiffel Tower"   # rebuild a single entry
//   npm run build-seed-images -- --no-generate   # skip OpenAI fallback (Wikimedia only)

import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { seedLocations } from '../src/data/seedLocations';
import { fetchLandmarkImage, attributionFrom } from '../src/lib/wikimedia';
import { generateImageBase64 } from '../src/lib/imageGen';
import type { SeedImageEntry } from '../src/types';

const ROOT = process.cwd();
const OUT_JSON = join(ROOT, 'src/data/seedImages.json');
const GEN_DIR = join(ROOT, 'public/seed-images');

const args = process.argv.slice(2);
const force = args.includes('--force');
const noGenerate = args.includes('--no-generate');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function main() {
  const cache: Record<string, SeedImageEntry> = existsSync(OUT_JSON)
    ? JSON.parse(readFileSync(OUT_JSON, 'utf8'))
    : {};

  const targets = only
    ? seedLocations.filter(s => s.name === only)
    : seedLocations;

  if (only && targets.length === 0) {
    console.error(`No seed found with name "${only}".`);
    process.exit(1);
  }

  let wmHits = 0;
  let genHits = 0;
  let skipped = 0;
  let cached = 0;

  for (const seed of targets) {
    const key = seed.name;
    if (cache[key] && !force) {
      cached++;
      console.log(`✓ cached    ${key}  (${cache[key].source})`);
      continue;
    }

    process.stdout.write(`→ ${key} `);
    let entry: SeedImageEntry | null = null;

    try {
      const wm = await fetchLandmarkImage(seed.name, seed.wikiTitle);
      if (wm) {
        entry = { source: 'wikimedia', url: wm.url, attribution: attributionFrom(wm) };
        wmHits++;
        console.log(`✓ wikimedia (${wm.license})`);
      }
    } catch (e) {
      console.log(`! wikimedia error: ${e}`);
    }

    if (!entry && !noGenerate) {
      if (!process.env.OPENAI_API_KEY) {
        console.log(`⚠ no Wikimedia hit and OPENAI_API_KEY not set — skipping`);
        skipped++;
      } else {
        try {
          const b64 = await generateImageBase64({ prompt: seed.imagePrompt, size: '1024x1024' });
          mkdirSync(GEN_DIR, { recursive: true });
          const slug = slugify(seed.name);
          await writeFile(join(GEN_DIR, `${slug}.png`), Buffer.from(b64, 'base64'));
          entry = { source: 'generated', url: `/seed-images/${slug}.png` };
          genHits++;
          console.log(`✓ generated`);
        } catch (e) {
          console.log(`! generation failed: ${e}`);
          skipped++;
        }
      }
    } else if (!entry && noGenerate) {
      console.log(`⚠ no Wikimedia hit (--no-generate set, skipping)`);
      skipped++;
    }

    if (entry) {
      cache[key] = entry;
      writeFileSync(OUT_JSON, JSON.stringify(cache, null, 2));
    }

    // Be polite to Wikimedia.
    await new Promise(r => setTimeout(r, 250));
  }

  writeFileSync(OUT_JSON, JSON.stringify(cache, null, 2));
  console.log('\n--- Summary ---');
  console.log(`Cached (skipped):  ${cached}`);
  console.log(`Wikimedia hits:    ${wmHits}`);
  console.log(`Generated:         ${genHits}`);
  console.log(`Skipped:           ${skipped}`);
  console.log(`Total in cache:    ${Object.keys(cache).length} / ${seedLocations.length}`);
  console.log(`Wrote: ${OUT_JSON}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
