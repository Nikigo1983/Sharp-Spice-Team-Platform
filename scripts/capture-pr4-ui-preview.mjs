import { mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SignJWT } from "jose";
import { chromium } from "playwright";

const BASE_URL = process.env.PREVIEW_BASE_URL ?? "http://localhost:3000";
const OUT_DIR = path.join(process.cwd(), "reports", "pr4-ui-preview");

function loadEnvLocal() {
  try {
    const raw = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    const env = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
    }
    return env;
  } catch {
    return {};
  }
}

async function createSessionToken() {
  const env = loadEnvLocal();
  const secret = new TextEncoder().encode(
    env.AUTH_SECRET?.trim() || "sharp-spice-dev-secret-change-me",
  );

  return new SignJWT({
    id: "manager-1",
    email: "gujenova220371@gmail.com",
    name: "Злата",
    role: "manager",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

async function authenticate(context) {
  const token = await createSessionToken();
  const { hostname } = new URL(BASE_URL);
  await context.addCookies([
    {
      name: "ss_session",
      value: token,
      domain: hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function waitForCalendar(page) {
  await page.waitForSelector("text=Мои события", { timeout: 45_000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "ru-RU",
  });
  const page = await context.newPage();

  await authenticate(context);

  await page.goto(`${BASE_URL}/calendar?view=month&date=2026-06-17`, {
    waitUntil: "domcontentloaded",
  });
  await waitForCalendar(page);
  await page.waitForSelector("text=Загружено", { timeout: 20_000 }).catch(() => null);

  await page.screenshot({
    path: path.join(OUT_DIR, "01-calendar-page.png"),
    fullPage: true,
  });

  const toolbar = page.locator('[class*="toolbar"]').first();
  await toolbar.screenshot({ path: path.join(OUT_DIR, "02-toolbar.png") });

  const filters = page.locator('[class*="row"]').filter({ hasText: "Мои события" }).first();
  await filters.screenshot({ path: path.join(OUT_DIR, "03-filters.png") });

  const sidebar = page.locator("aside").first();
  await sidebar.screenshot({ path: path.join(OUT_DIR, "04-sidebar-calendar-nav.png") });

  await page.goto(`${BASE_URL}/calendar?view=month&date=2030-01-01`, {
    waitUntil: "networkidle",
  });
  await waitForCalendar(page);
  await page.waitForSelector("text=Нет событий на этот период", { timeout: 15_000 });
  await page.screenshot({
    path: path.join(OUT_DIR, "05-empty-state.png"),
    fullPage: true,
  });

  const emptyCard = page.locator("text=Нет событий на этот период").locator("..").locator("..");
  await emptyCard.screenshot({ path: path.join(OUT_DIR, "05-empty-state-card.png") });

  await browser.close();
  console.log(`Screenshots saved to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
