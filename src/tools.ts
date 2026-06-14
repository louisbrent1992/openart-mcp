/**
 * Tool implementations. Each function returns structured JSON.
 *
 * Selectors captured against the live OpenArt "Infinite" suite UI
 * (https://openart.ai/suite/characters-and-worlds) on 2026-06-13.
 *
 * IMPORTANT — current OpenArt UI has no public character/video IDs or
 * per-asset URLs. Characters are identified by NAME (the asset card label).
 * Generated videos are tracked by the feed card's `data-item-id`.
 *
 * Re-capture with `npx playwright codegen https://openart.ai/suite/...`
 * if OpenArt redesigns and these break.
 */
import { newPage, BASE_URL } from "./openart.js";
import type { Page } from "playwright";
import { tmpdir } from "os";
import { join } from "path";
import { writeFileSync, unlinkSync } from "fs";

const SUITE_URL = `${BASE_URL}/suite/characters-and-worlds`;
const CREATE_URL = `${BASE_URL}/suite/character?create=true`;
const CREATE_VIDEO_URL = `${BASE_URL}/suite/create-video`;

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

/** OpenArt's suite SPA never reaches `networkidle` (it polls continuously),
 *  so navigate on `domcontentloaded` and give the client a beat to hydrate. */
async function gotoSuite(page: Page, url = SUITE_URL): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
}

/** IDs of the generation cards currently in the suite feed. These cards (unlike
 *  character cards) DO carry a stable `data-item-id`, which is how a render is tracked. */
async function feedGenerationIds(page: Page): Promise<string[]> {
  return page.$$eval('[data-item-id][data-item-source="generation"]', (els) =>
    els.map((e) => e.getAttribute("data-item-id") || "").filter(Boolean)
  );
}

export async function listCharacters(): Promise<Character[]> {
  const page = await newPage();
  try {
    await gotoSuite(page);
    // Character cards expose no id/href/data-* — only an <img alt="<name>">
    // whose src lives under the character thumbnail path.
    const found = await page.$$eval("img[alt]", (els) =>
      els
        .filter((i) => /\/openart\/thumbnail\//.test((i as HTMLImageElement).src) && i.getAttribute("alt"))
        .map((i) => ({ name: i.getAttribute("alt") || "", thumbnail_url: (i as HTMLImageElement).src }))
    );
    // De-dupe by name (the UI can render a card more than once while hydrating).
    const seen = new Set<string>();
    const results: Character[] = [];
    for (const c of found) {
      if (!c.name || seen.has(c.name)) continue;
      seen.add(c.name);
      results.push({ id: c.name, name: c.name, thumbnail_url: c.thumbnail_url, url: SUITE_URL });
    }
    return results;
  } finally {
    await page.close();
  }
}

/** `id` here is the character NAME — the current OpenArt UI has no numeric/slug ID. */
export async function getCharacter(id: string): Promise<Character & { background_story?: string; voice?: string }> {
  const matches = await listCharacters();
  const found = matches.find((c) => c.id === id || c.name === id);
  if (!found) {
    throw new Error(`Character "${id}" not found. Known: ${matches.map((c) => c.name).join(", ") || "(none)"}`);
  }
  // background_story / voice are only visible inside the per-character Edit panel,
  // which is not yet mapped; return the listing-level fields.
  return { ...found };
}

export async function createCharacter(params: {
  name: string;
  image_path: string;
  background_story?: string;
  voice_id?: string;
}): Promise<Character> {
  const page = await newPage();
  try {
    await gotoSuite(page, CREATE_URL);
    // Step 1: choose the "Start from an image" path in the Create-a-character modal.
    await page.getByText("Start from an image", { exact: false }).first().click();
    await page.waitForTimeout(4000);
    // Step 2: upload the front-facing image (accepts .jpg/.jpeg/.png/.webp/.heic/.heif).
    await page.locator('input[type="file"][accept*=".png"]').first().setInputFiles(params.image_path);
    await page.waitForTimeout(6000);
    // Step 3: fill name + optional story.
    await page.locator('input[placeholder="Enter character name"]').fill(params.name);
    if (params.background_story) {
      await page.locator('textarea[placeholder*="story"]').fill(params.background_story);
    }
    // NOTE: `voice_id` is unsupported by this UI — Voice is an audio-file upload /
    // library picker, not an id. Ignored for now.
    // Step 4: submit. Use text-is to avoid matching "Create Character".
    await page.locator('button:text-is("Create")').click();
    // Success surfaces a "@<name> is Ready for the Spotlight" modal.
    await page
      .waitForSelector("text=Ready for the Spotlight", { timeout: 90_000 })
      .catch(() => {});
    return { id: params.name, name: params.name, url: SUITE_URL };
  } finally {
    await page.close();
  }
}

const ASPECT_RATIOS = ["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"] as const;
type AspectRatio = (typeof ASPECT_RATIOS)[number];

/** BytePlus library characters in the Text-to-Video reference picker. OpenArt
 *  recommends these over user-uploaded faces for the Seedance model — its banner:
 *  "use characters from the BytePlus library ... to avoid generation failures". */
const BYTEPLUS_CHARACTERS = ["Model", "Singer", "DJ/Music Producer", "Clerk/Administrative Staff", "Retiree"] as const;

/** Click an element by its visible text via its center coordinate — several composer
 *  controls sit under overlay layers that intercept a normal Playwright click. */
async function clickByText(page: Page, text: string, exact = true): Promise<void> {
  const box = await page.getByText(text, { exact }).first().boundingBox();
  if (!box) throw new Error(`Control "${text}" not found in the Text-to-Video composer.`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** Attach a BytePlus library character as the visual reference:
 *  "Add visual references" -> "Characters" -> "BytePlus" -> click the named portrait.
 *  The portrait attaches to the composer's reference slot (left, above the prompt). */
async function attachBytePlusCharacter(page: Page, name: string): Promise<void> {
  await page.getByText("Add visual references", { exact: false }).first().click();
  await page.waitForTimeout(2500);
  await clickByText(page, "Characters");
  await page.waitForTimeout(3000);
  await clickByText(page, "BytePlus");
  await page.waitForTimeout(3000);
  const portrait = page.locator(`img[alt="${name}"]`).first();
  if (!(await portrait.count())) {
    throw new Error(`BytePlus character "${name}" not found. Known: ${BYTEPLUS_CHARACTERS.join(", ")}.`);
  }
  await portrait.click({ force: true });
  await page.waitForTimeout(3000);
}

/** Download a character's image (its thumbnail) to a temp file, to attach as a
 *  visual reference in Text-to-Video — robust vs. the name-less saved-character picker. */
async function downloadCharacterImage(nameOrId: string): Promise<string> {
  const chars = await listCharacters();
  const c = chars.find((x) => x.id === nameOrId || x.name === nameOrId);
  if (!c) {
    throw new Error(`Character "${nameOrId}" not found. Known: ${chars.map((x) => x.name).join(", ") || "(none)"}`);
  }
  if (!c.thumbnail_url) throw new Error(`Character "${nameOrId}" has no image to reference.`);
  const res = await fetch(c.thumbnail_url);
  if (!res.ok) throw new Error(`Failed to download character image (HTTP ${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = (c.thumbnail_url.split("?")[0].split(".").pop() || "webp").slice(0, 5);
  const out = join(tmpdir(), `openart-ref-${Date.now()}.${ext}`);
  writeFileSync(out, buf);
  return out;
}

/**
 * Generate a video from a text prompt via OpenArt's Text-to-Video tool / Seedance
 * (https://openart.ai/suite/create-video).
 *
 * `script` is the video prompt — for a product ad, describe the scene/action and
 * what the product/character does. Optionally attach ONE visual reference so a
 * person or product appears in the shot (precedence in this order):
 *   - `byteplus_character` — a BytePlus library character (RECOMMENDED for people;
 *     OpenArt warns user-uploaded faces cause generation failures). One of
 *     BYTEPLUS_CHARACTERS.
 *   - `image_path`   — a local image (e.g. a product photo), uploaded as a reference.
 *   - `character_id` — an existing user character (by name), uploaded as a reference.
 *     Discouraged by OpenArt for this model.
 *
 * The render is async and costs credits (~400 tokens). Poll getVideoStatus with
 * the returned id. `aspect_ratio` (best-effort) supports 9:16, 16:9, 1:1, 4:3, 3:4, 21:9.
 */
export async function generateVideo(params: {
  script: string;
  byteplus_character?: string;
  image_path?: string;
  character_id?: string;
  aspect_ratio?: AspectRatio;
}): Promise<Video> {
  // Resolve an optional uploaded reference (only when not using a BytePlus character).
  let refPath: string | undefined;
  let refIsTemp = false;
  if (!params.byteplus_character) {
    if (params.image_path) {
      refPath = params.image_path;
    } else if (params.character_id) {
      refPath = await downloadCharacterImage(params.character_id);
      refIsTemp = true;
    }
  }

  const page = await newPage();
  try {
    await gotoSuite(page, CREATE_VIDEO_URL);
    const before = new Set(await feedGenerationIds(page));

    // Attach a visual reference (optional). BytePlus picker wins; else upload a file.
    if (params.byteplus_character) {
      await attachBytePlusCharacter(page, params.byteplus_character);
    } else if (refPath) {
      await page.locator('input[type="file"]').first().setInputFiles(refPath);
      await page.waitForTimeout(6000);
    }

    // Prompt — the "Describe your video" contenteditable (clicking it also closes the picker).
    const prompt = page.locator('[contenteditable="true"]').first();
    await prompt.click();
    await prompt.fill(params.script);

    // Aspect ratio (best-effort): open the "… | 720p | 5s" settings pill, click the ratio.
    if (params.aspect_ratio) {
      await page.getByText(/720p|1080p|480p/).first().click().catch(() => {});
      await page.waitForTimeout(800);
      await page.getByText(params.aspect_ratio, { exact: true }).last().click().catch(() => {});
      await page.waitForTimeout(500);
    }

    // Submit (button reads e.g. "Generate 400").
    await page.locator('button:has-text("Generate")').first().click();

    // A new generation card appears in the feed; find the id that wasn't there before.
    let id = "";
    for (let i = 0; i < 20 && !id; i++) {
      await page.waitForTimeout(3000);
      id = (await feedGenerationIds(page)).find((x) => !before.has(x)) || "";
    }
    if (!id) {
      throw new Error("Generation submitted but no new feed item appeared — check OpenArt credits/quotas.");
    }
    return { id, status: "queued", prompt: params.script };
  } finally {
    await page.close();
    if (refIsTemp && refPath) {
      try { unlinkSync(refPath); } catch { /* best effort */ }
    }
  }
}

/**
 * Check a generation's status by the id returned from generateVideo. There is no
 * per-video status endpoint, so this reads the suite generations feed card:
 * a `<video>`/`<source>` src means complete; "failed"/"Credits refunded" text
 * means failed; otherwise it is still rendering.
 */
export async function getVideoStatus(videoId: string): Promise<Video> {
  const page = await newPage();
  try {
    await gotoSuite(page);
    const card = page.locator(`[data-item-id="${videoId}"]`).first();
    if (!(await card.count())) {
      throw new Error(`Generation "${videoId}" not found in the feed (it may have scrolled out of view).`);
    }
    const info = await card.evaluate((el) => ({
      text: el.textContent || "",
      videoSrc:
        el.querySelector("video")?.getAttribute("src") ||
        el.querySelector("video source")?.getAttribute("src") ||
        "",
      imgSrc: el.querySelector("img")?.getAttribute("src") || "",
    }));
    let status: Video["status"] = "rendering";
    if (info.videoSrc) status = "complete";
    else if (/fail/i.test(info.text)) status = "failed";
    return {
      id: videoId,
      status,
      url: info.videoSrc || undefined,
      thumbnail_url: info.imgSrc || undefined,
    };
  } finally {
    await page.close();
  }
}

export async function cleanup(): Promise<void> {
  const { close } = await import("./openart.js");
  await close();
}
