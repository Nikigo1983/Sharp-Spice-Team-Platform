import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = path.join(root, "logo_15.jpg");
const outDir = path.join(root, "public", "icons");

const ICON_BG = "#FFFFFF";
/** Скругление как у иконок Windows 11 (~18%) */
const CORNER_RADIUS_RATIO = 0.18;

async function loadTrimmedLogo() {
  return sharp(src).trim({ threshold: 12 }).png().toBuffer();
}

function roundedRectMask(size) {
  const radius = Math.round(size * CORNER_RADIUS_RATIO);
  return Buffer.from(
    `<svg width="${size}" height="${size}">
      <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="white"/>
    </svg>`,
  );
}

async function buildRoundedSquareIcon(size) {
  const trimmed = await loadTrimmedLogo();
  const logoSize = Math.round(size * 0.86);

  const logo = await sharp(trimmed)
    .resize(logoSize, logoSize, { fit: "contain", background: ICON_BG })
    .png()
    .toBuffer();

  const filled = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: ICON_BG,
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toBuffer();

  return sharp(filled)
    .composite([{ input: roundedRectMask(size), blend: "dest-in" }])
    .flatten({ background: ICON_BG })
    .png()
    .toBuffer();
}

async function buildMaskableIcon(size) {
  const trimmed = await loadTrimmedLogo();
  const logoSize = Math.round(size * 0.72);

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: ICON_BG,
    },
  })
    .composite([
      {
        input: await sharp(trimmed)
          .resize(logoSize, logoSize, { fit: "contain", background: ICON_BG })
          .png()
          .toBuffer(),
        gravity: "center",
      },
    ])
    .png()
    .toBuffer();
}

fs.mkdirSync(outDir, { recursive: true });

const tasks = [
  [192, "icon-192x192.png", buildRoundedSquareIcon],
  [512, "icon-512x512.png", buildRoundedSquareIcon],
  [192, "icon-maskable-192x192.png", buildMaskableIcon],
  [512, "icon-maskable-512x512.png", buildMaskableIcon],
];

for (const [size, filename, builder] of tasks) {
  const buffer = await builder(size);
  await sharp(buffer).toFile(path.join(outDir, filename));
  console.log(`created ${filename}`);
}

const faviconTargets = [
  path.join(root, "public", "favicon.jpg"),
  path.join(root, "src", "app", "icon.jpg"),
  path.join(root, "src", "app", "apple-icon.jpg"),
];

const faviconBuffer = await buildRoundedSquareIcon(192);
for (const target of faviconTargets) {
  await sharp(faviconBuffer).jpeg({ quality: 92 }).toFile(target);
  console.log(`updated ${path.relative(root, target)}`);
}
