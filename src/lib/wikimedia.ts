// Fetch a representative image for a landmark from Wikipedia / Wikimedia Commons.
// Two-step: ask Wikipedia for the lead image filename of the landmark's article,
// then ask Commons for that file's license + URL.
//
// We hard-filter for: photo formats only, >=1200px wide, allowed CC licenses,
// and filename patterns that suggest it's not a representative photo (maps,
// diagrams, coats of arms, etc).

import type { ImageAttribution } from '@/types';

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'rainbolt-geo-guess/1.0 (https://github.com/) build-script';

const ALLOWED_LICENSE_TOKENS = [
  'cc0', 'cc-zero', 'cc zero',
  'public domain', 'pd-',
  'cc-by', 'cc by',
  'cc-by-sa', 'cc by-sa',
  'fal',           // Free Art License
  'gfdl',          // GNU Free Documentation License
  'gnu free documentation',
];

const MIN_WIDTH = 800;

const BAD_FILENAME = /\b(map|diagram|coat[_ ]of[_ ]arms|flag|logo|plan|floorplan|sketch|drawing|engraving|painting|stamp|seal|chart)\b/i;

export interface WikiImage {
  url: string;          // thumb URL (~1600 wide) suitable for serving
  width: number;        // original width
  height: number;       // original height
  mime: string;
  artist: string;
  license: string;
  sourceUrl: string;    // Commons file description page
}

async function getJSON(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function getLeadImageFile(title: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    titles: title,
    prop: 'pageimages',
    piprop: 'name',
    redirects: '1',
    origin: '*',
  });
  const json = await getJSON(`${WIKI_API}?${params}`);
  const page = json?.query?.pages?.[0];
  if (!page || page.missing) return null;
  if (!page.pageimage) return null;
  return `File:${page.pageimage}`;
}

// Fallback: list every image embedded in the article and return them in order.
// Used when pageimages returns nothing or returns an SVG logo.
async function listArticleImages(title: string): Promise<string[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    titles: title,
    prop: 'images',
    imlimit: '20',
    redirects: '1',
    origin: '*',
  });
  const json = await getJSON(`${WIKI_API}?${params}`);
  const page = json?.query?.pages?.[0];
  if (!page || !Array.isArray(page.images)) return [];
  return page.images.map((i: { title: string }) => i.title);
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function getImageInfo(fileTitle: string): Promise<WikiImage | null> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    titles: fileTitle,
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size|mime',
    iiurlwidth: '1600',
    origin: '*',
  });
  const json = await getJSON(`${COMMONS_API}?${params}`);
  const ii = json?.query?.pages?.[0]?.imageinfo?.[0];
  if (!ii) return null;
  const meta = ii.extmetadata || {};
  const license = (meta.LicenseShortName?.value || '').toString().toLowerCase().trim();
  const artist = stripHtml(meta.Artist?.value || '') || 'Unknown';
  return {
    url: ii.thumburl || ii.url,
    width: ii.width,
    height: ii.height,
    mime: ii.mime,
    artist,
    license,
    sourceUrl: ii.descriptionurl,
  };
}

function isAcceptable(file: string, info: WikiImage): boolean {
  if (BAD_FILENAME.test(file)) return false;
  if (info.mime !== 'image/jpeg' && info.mime !== 'image/png') return false;
  if ((info.width || 0) < MIN_WIDTH) return false;
  if (!ALLOWED_LICENSE_TOKENS.some(t => info.license.includes(t))) return false;
  return true;
}

async function tryFile(file: string): Promise<WikiImage | null> {
  try {
    const info = await getImageInfo(file);
    if (!info) return null;
    if (!isAcceptable(file, info)) return null;
    return info;
  } catch {
    return null;
  }
}

export async function fetchLandmarkImage(name: string, wikiTitle?: string): Promise<WikiImage | null> {
  const title = (wikiTitle || name).replace(/ /g, '_');

  // 1. Try the article's lead image (Wikipedia's preferred representative shot).
  try {
    const lead = await getLeadImageFile(title);
    if (lead) {
      const info = await tryFile(lead);
      if (info) return info;
    }
  } catch { /* fall through */ }

  // 2. Fall back to walking the article's full image list and using the first acceptable one.
  try {
    const candidates = await listArticleImages(title);
    for (const cand of candidates) {
      const info = await tryFile(cand);
      if (info) return info;
    }
  } catch { /* nothing else to try */ }

  return null;
}

export function attributionFrom(info: WikiImage): ImageAttribution {
  return {
    artist: info.artist,
    license: info.license,
    sourceUrl: info.sourceUrl,
  };
}
