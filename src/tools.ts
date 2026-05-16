/**
 * Tool implementations. Each function returns structured JSON.
 *
 * NOTE: OpenArt's DOM selectors are placeholders. After running `npm run login`,
 * use Playwright Inspector (`npx playwright codegen https://openart.ai`) to
 * capture real selectors and replace the TODO markers below.
 */
import { newPage, close, BASE_URL } from "./openart.js";

export interface Character {
  id: string;
  name: string;
  thumbnail_url?: string;
  url: string;
}

export interface Video {
  id: string;
  status: "queued" | "rendering" | "complete" | "failed";
  url?: string;
  thumbnail_url?: string;
  prompt?: string;
}

export async function listCharacters(): Promise<Character[]> {
  const page = await newPage();
  try {
    await page.goto(`${BASE_URL}/suite/characters-and-worlds`);
    await page.waitForLoadState("networkidle");

    // TODO: replace with real selectors after inspecting OpenArt UI.
    // Use `npx playwright codegen https://openart.ai/suite/characters-and-worlds`
    const cards = await page.locator('[data-character-card]').all();

    const results: Character[] = [];
    for (const card of cards) {
      const id = (await card.getAttribute("data-character-id")) || "";
      const name = (await card.locator(".character-name").textContent())?.trim() || "";
      const thumb = await card.locator("img").first().getAttribute("src");
      results.push({
        id,
        name,
        thumbnail_url: thumb || undefined,
        url: `${BASE_URL}/character/${id}`,
      });
    }
    return results;
  } finally {
    await page.close();
  }
}

export async function getCharacter(id: string): Promise<Character & { background_story?: string; voice?: string }> {
  const page = await newPage();
  try {
    await page.goto(`${BASE_URL}/character/${id}`);
    await page.waitForLoadState("networkidle");

    // TODO: replace selectors
    const name = (await page.locator("h1").textContent())?.trim() || "";
    const story = (await page.locator('[data-background-story]').textContent())?.trim();
    const voice = (await page.locator('[data-voice]').textContent())?.trim();

    return {
      id,
      name,
      url: `${BASE_URL}/character/${id}`,
      background_story: story,
      voice,
    };
  } finally {
    await page.close();
  }
}

export async function createCharacter(params: {
  name: string;
  image_path: string;
  background_story?: string;
  voice_id?: string;
}): Promise<Character> {
  const page = await newPage();
  try {
    await page.goto(`${BASE_URL}/suite/characters-and-worlds`);
    await page.waitForLoadState("networkidle");

    // TODO: real selectors. Approximate flow:
    await page.locator('button:has-text("Create Character")').click();
    await page.locator('input[name="name"]').fill(params.name);
    await page.locator('input[type="file"]').setInputFiles(params.image_path);
    if (params.background_story) {
      await page.locator('textarea[name="background_story"]').fill(params.background_story);
    }
    if (params.voice_id) {
      await page.locator(`[data-voice-id="${params.voice_id}"]`).click();
    }
    await page.locator('button:has-text("Create")').click();
    await page.waitForURL(/\/character\/.+/);

    const id = page.url().split("/character/").pop() || "";
    return {
      id,
      name: params.name,
      url: page.url(),
    };
  } finally {
    await page.close();
  }
}

export async function generateVideo(params: {
  character_id: string;
  script: string;
  aspect_ratio?: "9:16" | "16:9" | "1:1";
}): Promise<Video> {
  const page = await newPage();
  try {
    await page.goto(`${BASE_URL}/character/${params.character_id}`);
    await page.waitForLoadState("networkidle");

    // TODO: real selectors.
    await page.locator('button:has-text("Add a script")').click();
    await page.locator('textarea[name="script"]').fill(params.script);
    if (params.aspect_ratio) {
      await page.locator(`[data-aspect-ratio="${params.aspect_ratio}"]`).click();
    }
    await page.locator('button:has-text("Generate")').click();

    // Wait for job ID to appear in URL or DOM
    await page.waitForSelector('[data-video-id]', { timeout: 60_000 });
    const videoId = await page.locator('[data-video-id]').first().getAttribute("data-video-id") || "";

    return {
      id: videoId,
      status: "queued",
    };
  } finally {
    await page.close();
  }
}

export async function getVideoStatus(videoId: string): Promise<Video> {
  const page = await newPage();
  try {
    await page.goto(`${BASE_URL}/video/${videoId}`);
    await page.waitForLoadState("networkidle");

    // TODO: real selectors.
    const status = (await page.locator('[data-video-status]').getAttribute("data-status")) as Video["status"];
    const videoUrl = await page.locator("video source").first().getAttribute("src");
    const thumb = await page.locator('[data-video-thumbnail]').getAttribute("src");
    const prompt = (await page.locator('[data-video-prompt]').textContent())?.trim();

    return {
      id: videoId,
      status: status || "rendering",
      url: videoUrl || undefined,
      thumbnail_url: thumb || undefined,
      prompt,
    };
  } finally {
    await page.close();
  }
}

export async function cleanup(): Promise<void> {
  await close();
}
