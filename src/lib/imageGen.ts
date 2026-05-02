// Thin wrapper around OpenAI image generation (gpt-image-1).
// The OpenAI SDK is loaded lazily so the rest of the app builds without it.
// Returns a base64-encoded PNG (no data: prefix).

export interface GenerateImageOptions {
  prompt: string;
  size?: '1024x1024' | '1536x1024' | '1024x1536';
}

export async function generateImageBase64({ prompt, size = '1536x1024' }: GenerateImageOptions): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  // Direct REST call — avoids hard dependency on the openai SDK.
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      size,
      n: 1,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI image gen failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { data: Array<{ b64_json?: string; url?: string }> };
  const item = json.data?.[0];
  if (item?.b64_json) return item.b64_json;
  if (item?.url) {
    // Some configurations return URLs; download and re-encode.
    const imgRes = await fetch(item.url);
    const buf = Buffer.from(await imgRes.arrayBuffer());
    return buf.toString('base64');
  }
  throw new Error('OpenAI image gen returned no image data');
}
