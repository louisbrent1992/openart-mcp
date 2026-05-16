/**
 * One-time login flow. Launches a non-headless browser, lets you log into
 * OpenArt manually, then saves the session to disk.
 *
 * Run: npm run build && npm run login
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { BASE_URL, STORAGE_STATE } from "./openart.js";

async function main() {
  console.log(`Launching browser. Log into OpenArt, then press Enter here.`);
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL);

  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
  });

  const dir = dirname(STORAGE_STATE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  await context.storageState({ path: STORAGE_STATE });
  console.log(`Saved session to ${STORAGE_STATE}`);

  await context.close();
  await browser.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
