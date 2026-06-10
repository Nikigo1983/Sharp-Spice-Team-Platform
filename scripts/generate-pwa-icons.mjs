import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = path.join(root, "new_logo2.jpg");
const outDir = path.join(root, "public", "icons");

const BRAND_BG = "#910D0D";

async function buildCircularIcon(size) {
  const logoSize = Math.round(size * 0.68);
  const logo = await sharp(src)
    .resize(logoSize, logoSize, { fit: "contain", background: BRAND_BG })
    .png()
    .toBuffer();

  const circleMask = Buffer.from(
    `<svg width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/>
    </svg>`,
  );

  const filledCircle = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BRAND_BG,
    },
  })
    .png()
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toBuffer();

  return sharp(filledCircle)
    .composite([{ input: circleMask, blend: "dest-in" }])
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
      background: BRAND_BG,
    },
  })
    .composite([
      {
        input: await sharp(src)
          .resize(logoSize, logoSize, { fit: "contain", background: BRAND_BG })
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
  [192, "icon-192x192.png", buildCircularIcon],
  [512, "icon-512x512.png", buildCircularIcon],
  [192, "icon-maskable-192x192.png", buildMaskableIcon],
  [512, "icon-maskable-512x512.png", buildMaskableIcon],
];

for (const [size, filename, builder] of tasks) {
  const buffer = await builder(size);
  await sharp(buffer).toFile(path.join(outDir, filename));
  console.log(`created ${filename}`);
}
