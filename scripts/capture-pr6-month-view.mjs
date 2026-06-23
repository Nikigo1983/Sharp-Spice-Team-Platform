import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SignJWT } from "jose";
import { chromium } from "playwright";

const BASE_URL = process.env.PREVIEW_BASE_URL ?? "http://localhost:3000";
const OUT_DIR = path.join(process.cwd(), "reports", "pr6-month-view");
const STORE_PATH = path.join(process.cwd(), ".data", "calendar-events.json");

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

async function ensureOverflowEvents() {
  let store = { events: [] };
  try {
    store = JSON.parse(await readFile(STORE_PATH, "utf8"));
  } catch {
    // keep empty
  }

  const overflowIds = new Set([
    "evt-preview-overflow-1",
    "evt-preview-overflow-2",
    "evt-preview-overflow-3",
    "evt-preview-overflow-4",
    "evt-preview-overflow-5",
  ]);

  const base = store.events.filter((event) => !overflowIds.has(event.id));
  const overflow = Array.from(overflowIds, (id, index) => ({
    id,
    companyId: "sharp-spice",
    scope: index % 2 === 0 ? "personal" : "company",
    ownerUserId: index % 2 === 0 ? "manager-1" : null,
    title: `Событие ${index + 1}`,
    description: "",
    eventType: "general",
    startAt: `2026-06-20T${String(8 + index).padStart(2, "0")}:00:00.000Z`,
    endAt: `2026-06-20T${String(8 + index).padStart(2, "0")}:30:00.000Z`,
    allDay: false,
    location: "",
    createdByUserId: "manager-1",
    createdByName: "Злата",
    updatedByUserId: null,
    createdAt: "2026-06-17T10:00:00.000Z",
    updatedAt: "2026-06-17T10:00:00.000Z",
  }));

  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(
    STORE_PATH,
    JSON.stringify({ events: [...base, ...overflow] }, null, 2),
    "utf8",
  );
}

async function main() {
  await ensureOverflowEvents();
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
  await page.waitForSelector('[aria-label="Календарь месяца"]', { timeout: 30_000 });
  await page.screenshot({
    path: path.join(OUT_DIR, "01-month-view-with-events.png"),
    fullPage: true,
  });

  await page.goto(`${BASE_URL}/calendar?view=month&date=2026-06-20`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("text=Событие 1", { timeout: 30_000 });
  await page.screenshot({
    path: path.join(OUT_DIR, "02-month-view-overflow.png"),
    fullPage: true,
  });

  await page.goto(`${BASE_URL}/calendar?view=month&date=2030-01-01`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector('[aria-label="Календарь месяца"]', { timeout: 30_000 });
  await page.screenshot({
    path: path.join(OUT_DIR, "03-month-view-empty.png"),
    fullPage: true,
  });

  await page.goto(`${BASE_URL}/calendar?view=month&date=2026-06-17`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("button", { name: "День 2026-06-19" }).click({
    position: { x: 10, y: 10 },
  });
  await page.waitForFunction(() => window.location.search.includes("view=day"), null, {
    timeout: 30_000,
  });
  await page.waitForSelector("text=Консультация с клиентом", { timeout: 30_000 });
  await page.screenshot({
    path: path.join(OUT_DIR, "04-day-click-navigation.png"),
    fullPage: true,
  });

  await browser.close();
  console.log(`Screenshots saved to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
