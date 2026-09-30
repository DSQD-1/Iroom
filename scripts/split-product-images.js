const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const SOURCE = path.join(__dirname, "../public/product-source.jpg");
const OUT = path.join(__dirname, "../public/product-images");

const products = [
  // iPhone
  ["iPhone-18-Pro-Max.jpg", 0, 0],
  ["iPhone-18-Pro.jpg", 1, 0],
  ["iPhone-18.jpg", 2, 0],
  ["iPhone-17-Pro-Max.jpg", 3, 0],
  ["iPhone-17-Pro.jpg", 4, 0],
  ["iPhone-17-Air.jpg", 5, 0],
  ["iPhone-17.jpg", 6, 0],

  ["iPhone-16-Pro-Max.jpg", 0, 1],
  ["iPhone-16-Pro.jpg", 1, 1],
  ["iPhone-16.jpg", 2, 1],
  ["iPhone-16e.jpg", 3, 1],
  ["iPhone-16-Plus.jpg", 4, 1],

  // AirPods / Watch
  ["AirPods-Pro-3.jpg", 0, 2],
  ["AirPods-Pro-2.jpg", 1, 2],
  ["AirPods-5.jpg", 2, 2],
  ["AirPods-4.jpg", 3, 2],
  ["AirPods-Max-2.jpg", 4, 2],

  ["Apple-Watch-Ultra-4.jpg", 5, 2],
  ["Apple-Watch-12.jpg", 6, 2],

  // iPad / MacBook
  ["iPad-Pro.jpg", 0, 3],
  ["iPad-Air.jpg", 1, 3],
  ["iPad-11.jpg", 2, 3],
  ["iPad-mini-7.jpg", 3, 3],

  ["MacBook-Pro.jpg", 4, 3],
  ["MacBook-Air.jpg", 5, 3],
  ["MacBook-Neo.jpg", 6, 3],

  // Android / consoles / Dyson
  ["Samsung.jpg", 0, 4],
  ["Xiaomi.jpg", 1, 4],
  ["Google-Pixel.jpg", 2, 4],
  ["OnePlus.jpg", 3, 4],
  ["Honor.jpg", 4, 4],
  ["Huawei.jpg", 5, 4],
  ["Gaming-Consoles.jpg", 6, 4]
];

async function main() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Нет исходного изображения: ${SOURCE}`);
  }

  fs.mkdirSync(OUT, { recursive: true });

  const meta = await sharp(SOURCE).metadata();

  const columns = 7;
  const rows = 5;

  /*
    Большие отступы между товарами.
    Мы НЕ режем картинку вплотную к соседнему товару.
  */
  const cellWidth = meta.width / columns;
  const cellHeight = meta.height / rows;

  const marginX = Math.round(cellWidth * 0.18);
  const marginY = Math.round(cellHeight * 0.15);

  for (const [filename, column, row] of products) {
    const left = Math.round(column * cellWidth + marginX);
    const top = Math.round(row * cellHeight + marginY);

    const width = Math.round(cellWidth - marginX * 2);
    const height = Math.round(cellHeight - marginY * 2);

    await sharp(SOURCE)
      .extract({
        left,
        top,
        width,
        height
      })
      .resize(900, 900, {
        fit: "contain",
        background: {
          r: 0,
          g: 0,
          b: 0,
          alpha: 1
        }
      })
      .jpeg({
        quality: 95
      })
      .toFile(path.join(OUT, filename));

    console.log(`✓ ${filename}`);
  }

  console.log("\nГотово.");
}

main().catch(err => {
  console.error("IMAGE SPLITTER ERROR:", err);
  process.exit(1);
});