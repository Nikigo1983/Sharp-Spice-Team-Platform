import { mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SignJWT } from "jose";
import { chromium } from "playwright";

const BASE_URL = process.env.PREVIEW_BASE_URL ?? "http://localhost:3000";
const OUT_DIR = path.join(process.cwd(), "reports", "pr5-day-view");

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

async function authenticate(context) {
  const env = loadEnvLocal();
  const secret = new TextEncoder().encode(
    env.AUTH_SECRET?.trim() || "sharp-spice-dev-secret-change-me",
  );
  const token = await new SignJWT({
    id: "manager-1",
    email: "gujenova220371@gmail.com",
    name: "Злата",
    role: "manager",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);

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

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "ru-RU",
  });
  const page = await context.newPage();
  await authenticate(context);

  await page.goto(`${BASE_URL}/calendar?view=day&date=2026-06-19`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("text=Консультация с клиентом", { timeout: 30_000 });
  await page.screenshot({
    path: path.join(OUT_DIR, "01-day-view-with-events.png"),
    fullPage: true,
  });

  await page.goto(`${BASE_URL}/calendar?view=day&date=2030-01-01`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("text=Нет событий на этот период", { timeout: 30_000 });
  await page.screenshot({
    path: path.join(OUT_DIR, "02-day-view-empty.png"),
    fullPage: true,
  });

  await browser.close();
  console.log(`Screenshots saved to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
