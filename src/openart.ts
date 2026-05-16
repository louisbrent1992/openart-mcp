import { chromium, Browser, BrowserContext, Page } from "playwright";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

const STORAGE_STATE = process.env.OPENART_STORAGE_STATE
  || `${process.env.USERPROFILE || process.env.HOME}/.openart-mcp/auth.json`;

const HEADLESS = process.env.OPENART_HEADLESS !== "false";
const BASE_URL = "https://openart.ai";

let browser: Browser | null = null;
let context: BrowserContext | null = null;

export async function getContext(): Promise<BrowserContext> {
  if (context) return context;

  if (!existsSync(STORAGE_STATE)) {
    throw new Error(
      `No saved auth at ${STORAGE_STATE}. Run \`npm run login\` first to log in to OpenArt and save a session.`
    );
  }

  browser = await chromium.launch({ headless: HEADLESS });
  context = await browser.newContext({ storageState: STORAGE_STATE });
  return context;
}

export async function newPage(): Promise<Page> {
  const ctx = await getContext();
  return ctx.newPage();
}

export async function close(): Promise<void> {
  if (context) await context.close();
  if (browser) await browser.close();
  context = null;
  browser = null;
}

export async function saveSession(): Promise<void> {
  if (!context) throw new Error("No active context");
  const dir = dirname(STORAGE_STATE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  await context.storageState({ path: STORAGE_STATE });
}

export { BASE_URL, STORAGE_STATE };
