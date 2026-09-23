const { createClient } = require("@libsql/client");
const PRICE_LIST = require("./price-list");

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function productKey(product, categoryId) {
  return [
    categoryId,
    normalize(product.name),
    normalize(product.memory),
    normalize(product.color),
    normalize(product.version),
    product.price ?? "",
    product.priceMax ?? "",
    product.foreignPrice ?? ""
  ].join("|");
}

async function ensureCategories() {
  const categories = new Map();

  const result = await db.execute(`
    SELECT id, name, slug
    FROM categories
  `);

  for (const row of result.rows) {
    categories.set(normalize(row.name), row);
  }

  let sortOrder = result.rows.length + 1;

  for (const product of PRICE_LIST) {
    const name = String(product.category || "").trim();

    if (!name) continue;

    const key = normalize(name);

    if (categories.has(key)) continue;

    const slug = key
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "");

    await db.execute({
      sql: `
        INSERT INTO categories
          (name, slug, sort_order, active)
        VALUES (?, ?, ?, 1)
      `,
      args: [
        name,
        slug || `category-${sortOrder}`,
        sortOrder
      ]
    });

    const inserted = await db.execute({
      sql: `
        SELECT id, name, slug
        FROM categories
        WHERE slug = ?
        LIMIT 1
      `,
      args: [slug || `category-${sortOrder}`]
    });

    categories.set(key, inserted.rows[0]);
    sortOrder++;
  }

  return categories;
}

async function loadExistingProducts() {
  const result = await db.execute(`
    SELECT
      p.id,
      p.name,
      p.memory,
      p.color,
      p.version,
      p.price,
      p.category_id,
      c.name AS category_name
    FROM products p
    LEFT JOIN categories c
      ON c.id = p.category_id
  `);

  const existing = new Set();

  for (const row of result.rows) {
    existing.add(
      productKey(
        {
          name: row.name,
          memory: row.memory,
          color: row.color,
          version: row.version,
          price: row.price
        },
        row.category_id
      )
    );
  }

  return existing;
}

async function insertProduct(product, categoryId) {
  const price =
    Number.isFinite(Number(product.price))
      ? Number(product.price)
      : 0;

  const versionParts = [];

  if (product.version) {
    versionParts.push(String(product.version));
  }

  if (product.fromPrice) {
    versionParts.push("от");
  }

  if (product.priceMax) {
    versionParts.push(`до ${product.priceMax}`);
  }

  if (
    product.price == null &&
    product.foreignPrice != null
  ) {
    versionParts.push("основная цена: по запросу");
  }

  if (
    product.foreignPrice != null
  ) {
    versionParts.push(
      `иностранная: ${
        product.foreignPrice
          ? `${Number(product.foreignPrice).toLocaleString("ru-RU")} ₽`
          : "по запросу"
      }`
    );
  }

  const version = versionParts.join(" · ");

  await db.execute({
    sql: `
      INSERT INTO products (
        name,
        memory,
        color,
        version,
        price,
        image_url,
        category_id,
        is_new,
        new_sort_order,
        active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      String(product.name || ""),
      String(product.memory || ""),
      String(product.color || ""),
      version,
      price,
      "",
      categoryId,
      0,
      0,
      1
    ]
  });
}

async function main() {
  console.log("");
  console.log("======================================");
  console.log("        IROOM PRICE IMPORT");
  console.log("======================================");
  console.log("");

  if (!process.env.TURSO_DATABASE_URL) {
    throw new Error("Не найден TURSO_DATABASE_URL");
  }

  if (!process.env.TURSO_AUTH_TOKEN) {
    throw new Error("Не найден TURSO_AUTH_TOKEN");
  }

  console.log(`Позиций в прайсе: ${PRICE_LIST.length}`);
  console.log("");

  const categories = await ensureCategories();
  const existing = await loadExistingProducts();

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const product of PRICE_LIST) {
    try {
      const categoryName = normalize(product.category);
      const category = categories.get(categoryName);

      if (!category) {
        console.log(
          `⚠️ Категория не найдена: ${product.category}`
        );
        errors++;
        continue;
      }

      const key = productKey(product, category.id);

      if (existing.has(key)) {
        skipped++;
        continue;
      }

      await insertProduct(product, category.id);

      existing.add(key);
      imported++;

      console.log(
        `✓ ${product.name}` +
        `${product.memory ? ` ${product.memory}` : ""}` +
        `${product.color ? ` ${product.color}` : ""}` +
        ` — ${
          product.price
            ? `${Number(product.price).toLocaleString("ru-RU")} ₽`
            : "по запросу"
        }`
      );
    } catch (error) {
      errors++;

      console.error(
        `✗ Ошибка: ${product.name}`,
        error.message
      );
    }
  }

  console.log("");
  console.log("======================================");
  console.log("             РЕЗУЛЬТАТ");
  console.log("======================================");
  console.log(`Добавлено: ${imported}`);
  console.log(`Пропущено: ${skipped}`);
  console.log(`Ошибок:    ${errors}`);
  console.log("======================================");
  console.log("");
}

main().catch((error) => {
  console.error("");
  console.error("❌ ИМПОРТ ОСТАНОВЛЕН");
  console.error(error);
  process.exit(1);
});