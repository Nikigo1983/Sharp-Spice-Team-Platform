import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = path.join(root, "logo_15.jpg");
const outDir = path.join(root, "public", "icons");

const ICON_BG = "#FFFFFF";
/** Серый фон углов — совпадает с типичным фоном рабочего стола Windows */
const DESKTOP_BG = "#9a9a9a";
/** Скругление как у иконок Windows 11 (~20%) */
const CORNER_RADIUS_RATIO = 0.2;

function roundedRectSvg(size, fill) {
  const radius = Math.round(size * CORNER_RADIUS_RATIO);
  return Buffer.from(
    `<svg width="${size}" height="${size}">
      <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${fill}"/>
    </svg>`,
  );
}

async function buildRoundedSquareIcon(size) {
  const logoSize = Math.round(size * 0.58);
  const logo = await sharp(src)
    .resize(logoSize, logoSize, { fit: "contain", background: ICON_BG })
    .png()
    .toBuffer();

  const grayBase = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: DESKTOP_BG,
    },
  })
    .png()
    .toBuffer();

  return sharp(grayBase)
    .composite([
      { input: roundedRectSvg(size, ICON_BG), blend: "over" },
      { input: logo, gravity: "center" },
    ])
    .png()
    .toBuffer();
}

async function buildMaskableIcon(size) {
  const logoSize = Math.round(size * 0.56);

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
        input: await sharp(src)
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
