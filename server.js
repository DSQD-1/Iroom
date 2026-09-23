import express from "express";
import crypto from "crypto";
import multer from "multer";
import { createClient } from "@libsql/client";

const app = express();

const PORT = Number(process.env.PORT || 10000);

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const ADMIN_ID = String(process.env.ADMIN_ID || "");
const SECOND_ADMIN_ID = "5975037118";

const ADMIN_IDS = new Set(
  [ADMIN_ID, SECOND_ADMIN_ID]
    .map(String)
    .map((x) => x.trim())
    .filter(Boolean)
);

const MINIAPP_URL =
  process.env.MINIAPP_URL || "https://iroom-dww8.onrender.com";

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL || "";
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || "";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";

const CONTACT_USERNAME = "iroom_24";
const STORE_NAME = "IRoom";

if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  console.error("TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are missing");
}

const db = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

function now() {
  return new Date().toISOString();
}

function randomId(prefix = "id") {
  return `${prefix}_${crypto.randomUUID()}`;
}

function text(value) {
  return value == null ? "" : String(value);
}

function isAdmin(id) {
  return ADMIN_IDS.has(String(id));
}

function escapeHtml(value) {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================================================
   DATABASE HELPERS
========================================================= */

async function tableExists(table) {
  const result = await db.execute({
    sql: `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
      AND name = ?
    `,
    args: [table]
  });

  return result.rows.length > 0;
}

async function columnExists(table, column) {
  const exists = await tableExists(table);

  if (!exists) return false;

  const result = await db.execute({
    sql: `PRAGMA table_info(${table})`
  });

  return result.rows.some((row) => String(row.name) === column);
}

async function addColumnIfMissing(table, column, definition) {
  if (!(await columnExists(table, column))) {
    console.log(`DB MIGRATION: ${table}.${column}`);

    await db.execute({
      sql: `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
    });
  }
}

async function createTable(sql) {
  await db.execute({ sql });
}

/* =========================================================
   DATABASE INITIALIZATION
========================================================= */

async function initDatabase() {
  console.log("Turso database initialization started");

  /*
   * CATEGORIES
   */
  await createTable(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT,
      image_url TEXT,
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT
    )
  `);

  await addColumnIfMissing("categories", "slug", "TEXT");
  await addColumnIfMissing("categories", "image_url", "TEXT");
  await addColumnIfMissing("categories", "sort_order", "INTEGER DEFAULT 0");
  await addColumnIfMissing("categories", "active", "INTEGER DEFAULT 1");
  await addColumnIfMissing("categories", "created_at", "TEXT");
  await addColumnIfMissing("categories", "updated_at", "TEXT");

  /*
   * PRODUCTS
   */
  await createTable(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      category_id TEXT,
      name TEXT NOT NULL,
      slug TEXT,
      description TEXT,
      image_url TEXT,
      price REAL DEFAULT 0,
      old_price REAL,
      active INTEGER DEFAULT 1,
      is_new INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    )
  `);

  await addColumnIfMissing("products", "category_id", "TEXT");
  await addColumnIfMissing("products", "slug", "TEXT");
  await addColumnIfMissing("products", "description", "TEXT");
  await addColumnIfMissing("products", "image_url", "TEXT");
  await addColumnIfMissing("products", "price", "REAL DEFAULT 0");
  await addColumnIfMissing("products", "old_price", "REAL");
  await addColumnIfMissing("products", "active", "INTEGER DEFAULT 1");
  await addColumnIfMissing("products", "is_new", "INTEGER DEFAULT 0");
  await addColumnIfMissing("products", "sort_order", "INTEGER DEFAULT 0");
  await addColumnIfMissing("products", "created_at", "TEXT");
  await addColumnIfMissing("products", "updated_at", "TEXT");

  /*
   * PRODUCT VARIANTS
   */
  await createTable(`
    CREATE TABLE IF NOT EXISTS product_variants (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      color TEXT,
      memory TEXT,
      country TEXT,
      sim TEXT,
      price REAL DEFAULT 0,
      stock INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    )
  `);

  await addColumnIfMissing("product_variants", "product_id", "TEXT");
  await addColumnIfMissing("product_variants", "color", "TEXT");
  await addColumnIfMissing("product_variants", "memory", "TEXT");
  await addColumnIfMissing("product_variants", "country", "TEXT");
  await addColumnIfMissing("product_variants", "sim", "TEXT");
  await addColumnIfMissing("product_variants", "price", "REAL DEFAULT 0");
  await addColumnIfMissing("product_variants", "stock", "INTEGER DEFAULT 0");
  await addColumnIfMissing("product_variants", "active", "INTEGER DEFAULT 1");
  await addColumnIfMissing("product_variants", "created_at", "TEXT");
  await addColumnIfMissing("product_variants", "updated_at", "TEXT");

  /*
   * IMAGES
   */
  await createTable(`
    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      product_id TEXT,
      category_id TEXT,
      url TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT
    )
  `);

  await addColumnIfMissing("images", "product_id", "TEXT");
  await addColumnIfMissing("images", "category_id", "TEXT");
  await addColumnIfMissing("images", "url", "TEXT");
  await addColumnIfMissing("images", "sort_order", "INTEGER DEFAULT 0");
  await addColumnIfMissing("images", "created_at", "TEXT");

  /*
   * ADMINS
   *
   * Старый вариант таблицы мог не иметь id.
   */
  await createTable(`
    CREATE TABLE IF NOT EXISTS admins (
      telegram_id TEXT PRIMARY KEY,
      created_at TEXT
    )
  `);

  await addColumnIfMissing("admins", "created_at", "TEXT");

  /*
   * SETTINGS
   */
  await createTable(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  /*
   * USERS
   */
  await createTable(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      telegram_id TEXT UNIQUE,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `);

  await addColumnIfMissing("users", "telegram_id", "TEXT");
  await addColumnIfMissing("users", "username", "TEXT");
  await addColumnIfMissing("users", "first_name", "TEXT");
  await addColumnIfMissing("users", "last_name", "TEXT");
  await addColumnIfMissing("users", "created_at", "TEXT");
  await addColumnIfMissing("users", "updated_at", "TEXT");

  /*
   * ORDERS
   */
  await createTable(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      telegram_id TEXT,
      product_id TEXT,
      variant_id TEXT,
      product_name TEXT,
      variant_text TEXT,
      price REAL DEFAULT 0,
      customer_name TEXT,
      customer_username TEXT,
      status TEXT DEFAULT 'new',
      created_at TEXT,
      updated_at TEXT
    )
  `);

  await addColumnIfMissing("orders", "telegram_id", "TEXT");
  await addColumnIfMissing("orders", "product_id", "TEXT");
  await addColumnIfMissing("orders", "variant_id", "TEXT");
  await addColumnIfMissing("orders", "product_name", "TEXT");
  await addColumnIfMissing("orders", "variant_text", "TEXT");
  await addColumnIfMissing("orders", "price", "REAL DEFAULT 0");
  await addColumnIfMissing("orders", "customer_name", "TEXT");
  await addColumnIfMissing("orders", "customer_username", "TEXT");
  await addColumnIfMissing("orders", "status", "TEXT DEFAULT 'new'");
  await addColumnIfMissing("orders", "created_at", "TEXT");
  await addColumnIfMissing("orders", "updated_at", "TEXT");

  /*
   * PROMO CODES
   */
  await createTable(`
    CREATE TABLE IF NOT EXISTS promo_codes (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE,
      discount REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      usage_limit INTEGER,
      usage_count INTEGER DEFAULT 0,
      created_at TEXT
    )
  `);

  await addColumnIfMissing("promo_codes", "code", "TEXT");
  await addColumnIfMissing("promo_codes", "discount", "REAL DEFAULT 0");
  await addColumnIfMissing("promo_codes", "active", "INTEGER DEFAULT 1");
  await addColumnIfMissing("promo_codes", "usage_limit", "INTEGER");
  await addColumnIfMissing("promo_codes", "usage_count", "INTEGER DEFAULT 0");
  await addColumnIfMissing("promo_codes", "created_at", "TEXT");

  /*
   * SEED ADMIN
   */
  for (const adminId of ADMIN_IDS) {
    await db.execute({
      sql: `
        INSERT INTO admins (telegram_id, created_at)
        VALUES (?, ?)
        ON CONFLICT(telegram_id) DO NOTHING
      `,
      args: [adminId, now()]
    });
  }

  /*
   * DEFAULT CATEGORIES
   */
  const defaultCategories = [
    ["iphone", "iPhone", 1],
    ["ipad", "iPad", 2],
    ["mac", "Mac", 3],
    ["watch", "Apple Watch", 4],
    ["airpods", "AirPods", 5],
    ["other", "Другое", 6]
  ];

  for (const [slug, name, sort] of defaultCategories) {
    const existing = await db.execute({
      sql: `
        SELECT id
        FROM categories
        WHERE slug = ?
        LIMIT 1
      `,
      args: [slug]
    });

    if (!existing.rows.length) {
      await db.execute({
        sql: `
          INSERT INTO categories (
            id,
            name,
            slug,
            sort_order,
            active,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, 1, ?, ?)
        `,
        args: [
          randomId("cat"),
          name,
          slug,
          sort,
          now(),
          now()
        ]
      });
    }
  }

  console.log("Turso database initialized");
}

/* =========================================================
   TELEGRAM MINI APP AUTH
========================================================= */

function validateTelegramInitData(initData) {
  if (!initData || !BOT_TOKEN) return null;

  try {
    const params = new URLSearchParams(initData);

    const hash = params.get("hash");

    if (!hash) return null;

    params.delete("hash");

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(BOT_TOKEN)
      .digest();

    const calculatedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    if (
      calculatedHash.length !== hash.length ||
      !crypto.timingSafeEqual(
        Buffer.from(calculatedHash),
        Buffer.from(hash)
      )
    ) {
      return null;
    }

    const userRaw = params.get("user");

    if (!userRaw) return null;

    return JSON.parse(userRaw);
  } catch {
    return null;
  }
}

function getInitData(req) {
  return (
    req.headers["x-telegram-init-data"] ||
    req.headers["x-telegram-web-app-init-data"] ||
    ""
  );
}

function requireTelegram(req, res, next) {
  const user = validateTelegramInitData(getInitData(req));

  if (!user) {
    return res.status(401).json({
      ok: false,
      error: "Invalid Telegram Mini App authorization"
    });
  }

  req.telegramUser = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = validateTelegramInitData(getInitData(req));

  if (!user) {
    return res.status(401).json({
      ok: false,
      error: "Invalid Telegram Mini App authorization"
    });
  }

  if (!isAdmin(user.id)) {
    return res.status(403).json({
      ok: false,
      error: "Admin access required"
    });
  }

  req.telegramUser = user;
  next();
}

/* =========================================================
   USER UPSERT
========================================================= */

async function upsertUser(user) {
  if (!user?.id) return;

  const telegramId = String(user.id);

  const existing = await db.execute({
    sql: `
      SELECT id
      FROM users
      WHERE telegram_id = ?
      LIMIT 1
    `,
    args: [telegramId]
  });

  if (existing.rows.length) {
    await db.execute({
      sql: `
        UPDATE users
        SET
          username = ?,
          first_name = ?,
          last_name = ?,
          updated_at = ?
        WHERE telegram_id = ?
      `,
      args: [
        user.username || null,
        user.first_name || null,
        user.last_name || null,
        now(),
        telegramId
      ]
    });

    return;
  }

  await db.execute({
    sql: `
      INSERT INTO users (
        id,
        telegram_id,
        username,
        first_name,
        last_name,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      randomId("usr"),
      telegramId,
      user.username || null,
      user.first_name || null,
      user.last_name || null,
      now(),
      now()
    ]
  });
}

/* =========================================================
   TELEGRAM API
========================================================= */

async function telegram(method, body = {}) {
  if (!BOT_TOKEN) {
    throw new Error("BOT_TOKEN is missing");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json();

  if (!data.ok) {
    throw new Error(
      data.description || `Telegram API error: ${method}`
    );
  }

  return data.result;
}

async function notifyAdmins(message) {
  if (!BOT_TOKEN) return;

  for (const adminId of ADMIN_IDS) {
    try {
      await telegram("sendMessage", {
        chat_id: adminId,
        text: message,
        parse_mode: "HTML"
      });
    } catch (error) {
      console.error(
        "Telegram admin notification error:",
        error.message
      );
    }
  }
}

/* =========================================================
   HEALTH
========================================================= */

app.get("/health", async (req, res) => {
  try {
    await db.execute("SELECT 1");

    res.json({
      ok: true,
      app: STORE_NAME,
      database: true,
      telegram: Boolean(BOT_TOKEN),
      ai: Boolean(OPENAI_API_KEY)
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================================================
   PUBLIC API
========================================================= */

app.get("/api/categories", async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT *
      FROM categories
      WHERE COALESCE(active, 1) = 1
      ORDER BY COALESCE(sort_order, 0), name
    `);

    res.json({
      ok: true,
      categories: result.rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.get("/api/products", async (req, res) => {
  try {
    const category = text(req.query.category).trim();
    const search = text(req.query.search).trim();

    let sql = `
      SELECT
        p.*,
        c.name AS category_name,
        c.slug AS category_slug
      FROM products p
      LEFT JOIN categories c
        ON c.id = p.category_id
      WHERE COALESCE(p.active, 1) = 1
    `;

    const args = [];

    if (category) {
      sql += `
        AND (
          c.slug = ?
          OR c.id = ?
        )
      `;

      args.push(category, category);
    }

    if (search) {
      sql += `
        AND (
          p.name LIKE ?
          OR p.description LIKE ?
          OR c.name LIKE ?
        )
      `;

      const q = `%${search}%`;

      args.push(q, q, q);
    }

    sql += `
      ORDER BY
        COALESCE(p.is_new, 0) DESC,
        COALESCE(p.sort_order, 0),
        p.created_at DESC
    `;

    const result = await db.execute({
      sql,
      args
    });

    res.json({
      ok: true,
      products: result.rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const productResult = await db.execute({
      sql: `
        SELECT
          p.*,
          c.name AS category_name,
          c.slug AS category_slug
        FROM products p
        LEFT JOIN categories c
          ON c.id = p.category_id
        WHERE p.id = ?
        LIMIT 1
      `,
      args: [req.params.id]
    });

    if (!productResult.rows.length) {
      return res.status(404).json({
        ok: false,
        error: "Product not found"
      });
    }

    const product = productResult.rows[0];

    const variants = await db.execute({
      sql: `
        SELECT *
        FROM product_variants
        WHERE product_id = ?
        AND COALESCE(active, 1) = 1
        ORDER BY id
      `,
      args: [req.params.id]
    });

    const images = await db.execute({
      sql: `
        SELECT *
        FROM images
        WHERE product_id = ?
        ORDER BY COALESCE(sort_order, 0), id
      `,
      args: [req.params.id]
    });

    res.json({
      ok: true,
      product,
      variants: variants.rows,
      images: images.rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================================================
   CURRENT USER
========================================================= */

app.get("/api/me", requireTelegram, async (req, res) => {
  try {
    await upsertUser(req.telegramUser);

    res.json({
      ok: true,
      user: req.telegramUser,
      admin: isAdmin(req.telegramUser.id)
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================================================
   SETTINGS
========================================================= */

app.get("/api/settings", async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT key, value
      FROM settings
    `);

    const settings = {};

    for (const row of result.rows) {
      settings[row.key] = row.value;
    }

    res.json({
      ok: true,
      settings,
      contact: CONTACT_USERNAME,
      store: STORE_NAME
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================================================
   ORDERS / BOOKINGS
========================================================= */

app.post("/api/orders", requireTelegram, async (req, res) => {
  try {
    const {
      productId,
      variantId,
      productName,
      variantText,
      price
    } = req.body;

    if (!productId && !productName) {
      return res.status(400).json({
        ok: false,
        error: "Product is required"
      });
    }

    await upsertUser(req.telegramUser);

    const orderId = randomId("ord");

    await db.execute({
      sql: `
        INSERT INTO orders (
          id,
          telegram_id,
          product_id,
          variant_id,
          product_name,
          variant_text,
          price,
          customer_name,
          customer_username,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)
      `,
      args: [
        orderId,
        String(req.telegramUser.id),
        productId || null,
        variantId || null,
        productName || "",
        variantText || "",
        Number(price || 0),
        [
          req.telegramUser.first_name,
          req.telegramUser.last_name
        ]
          .filter(Boolean)
          .join(" "),
        req.telegramUser.username || "",
        now(),
        now()
      ]
    });

    const message = [
      "🛍 <b>Новая бронь IRoom</b>",
      "",
      `<b>Товар:</b> ${escapeHtml(productName || "")}`,
      variantText
        ? `<b>Вариант:</b> ${escapeHtml(variantText)}`
        : "",
      `<b>Цена:</b> ${Number(price || 0).toLocaleString("ru-RU")} ₽`,
      "",
      `<b>Клиент:</b> ${escapeHtml(
        [
          req.telegramUser.first_name,
          req.telegramUser.last_name
        ]
          .filter(Boolean)
          .join(" ")
      )}`,
      req.telegramUser.username
        ? `<b>Username:</b> @${escapeHtml(
            req.telegramUser.username
          )}`
        : "",
      `<b>ID:</b> ${req.telegramUser.id}`
    ]
      .filter(Boolean)
      .join("\n");

    await notifyAdmins(message);

    res.json({
      ok: true,
      orderId
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================================================
   ADMIN
========================================================= */

app.get("/api/admin/me", requireAdmin, async (req, res) => {
  res.json({
    ok: true,
    admin: true,
    telegramUser: req.telegramUser,
    admins: [...ADMIN_IDS]
  });
});

app.get("/api/admin/products", requireAdmin, async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT
        p.*,
        c.name AS category_name,
        c.slug AS category_slug
      FROM products p
      LEFT JOIN categories c
        ON c.id = p.category_id
      ORDER BY p.created_at DESC
    `);

    res.json({
      ok: true,
      products: result.rows
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.get("/api/admin/categories", requireAdmin, async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT *
      FROM categories
      ORDER BY COALESCE(sort_order, 0), name
    `);

    res.json({
      ok: true,
      categories: result.rows
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT *
      FROM orders
      ORDER BY created_at DESC
    `);

    res.json({
      ok: true,
      orders: result.rows
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================================================
   ADMIN PRODUCTS
========================================================= */

app.post("/api/admin/products", requireAdmin, async (req, res) => {
  try {
    const {
      name,
      category_id,
      categoryId,
      description,
      image_url,
      imageUrl,
      price,
      active,
      is_new,
      isNew,
      sort_order,
      variants
    } = req.body;

    if (!name) {
      return res.status(400).json({
        ok: false,
        error: "Name is required"
      });
    }

    const productId = randomId("prod");

    await db.execute({
      sql: `
        INSERT INTO products (
          id,
          category_id,
          name,
          slug,
          description,
          image_url,
          price,
          active,
          is_new,
          sort_order,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        productId,
        category_id || categoryId || null,
        name,
        name
          .toLowerCase()
          .replace(/[^a-zа-я0-9]+/gi, "-")
          .replace(/^-|-$/g, ""),
        description || "",
        image_url || imageUrl || "",
        Number(price || 0),
        active === false ? 0 : 1,
        is_new || isNew ? 1 : 0,
        Number(sort_order || 0),
        now(),
        now()
      ]
    });

    if (Array.isArray(variants)) {
      for (const variant of variants) {
        await db.execute({
          sql: `
            INSERT INTO product_variants (
              id,
              product_id,
              color,
              memory,
              country,
              sim,
              price,
              stock,
              active,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
          `,
          args: [
            randomId("var"),
            productId,
            variant.color || "",
            variant.memory || "",
            variant.country || "",
            variant.sim || "",
            Number(variant.price || price || 0),
            Number(variant.stock || 0),
            now(),
            now()
          ]
        });
      }
    }

    res.json({
      ok: true,
      productId
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.put("/api/admin/products/:id", requireAdmin, async (req, res) => {
  try {
    const {
      name,
      category_id,
      categoryId,
      description,
      image_url,
      imageUrl,
      price,
      active,
      is_new,
      isNew,
      sort_order
    } = req.body;

    await db.execute({
      sql: `
        UPDATE products
        SET
          name = COALESCE(?, name),
          category_id = ?,
          description = COALESCE(?, description),
          image_url = COALESCE(?, image_url),
          price = COALESCE(?, price),
          active = COALESCE(?, active),
          is_new = COALESCE(?, is_new),
          sort_order = COALESCE(?, sort_order),
          updated_at = ?
        WHERE id = ?
      `,
      args: [
        name || null,
        category_id || categoryId || null,
        description || null,
        image_url || imageUrl || null,
        price == null ? null : Number(price),
        active == null ? null : active ? 1 : 0,
        is_new == null && isNew == null
          ? null
          : is_new || isNew
          ? 1
          : 0,
        sort_order == null ? null : Number(sort_order),
        now(),
        req.params.id
      ]
    });

    res.json({
      ok: true
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
  try {
    await db.execute({
      sql: `
        UPDATE products
        SET active = 0, updated_at = ?
        WHERE id = ?
      `,
      args: [now(), req.params.id]
    });

    res.json({
      ok: true
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================================================
   ADMIN CATEGORIES
========================================================= */

app.post("/api/admin/categories", requireAdmin, async (req, res) => {
  try {
    const {
      name,
      slug,
      image_url,
      imageUrl,
      sort_order,
      sortOrder,
      active
    } = req.body;

    if (!name) {
      return res.status(400).json({
        ok: false,
        error: "Name is required"
      });
    }

    const id = randomId("cat");

    await db.execute({
      sql: `
        INSERT INTO categories (
          id,
          name,
          slug,
          image_url,
          sort_order,
          active,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        id,
        name,
        slug || name.toLowerCase().replace(/\s+/g, "-"),
        image_url || imageUrl || "",
        Number(sort_order ?? sortOrder ?? 0),
        active === false ? 0 : 1,
        now(),
        now()
      ]
    });

    res.json({
      ok: true,
      categoryId: id
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.put("/api/admin/categories/:id", requireAdmin, async (req, res) => {
  try {
    const {
      name,
      slug,
      image_url,
      imageUrl,
      sort_order,
      sortOrder,
      active
    } = req.body;

    await db.execute({
      sql: `
        UPDATE categories
        SET
          name = COALESCE(?, name),
          slug = COALESCE(?, slug),
          image_url = COALESCE(?, image_url),
          sort_order = COALESCE(?, sort_order),
          active = COALESCE(?, active),
          updated_at = ?
        WHERE id = ?
      `,
      args: [
        name || null,
        slug || null,
        image_url || imageUrl || null,
        sort_order == null && sortOrder == null
          ? null
          : Number(sort_order ?? sortOrder),
        active == null ? null : active ? 1 : 0,
        now(),
        req.params.id
      ]
    });

    res.json({
      ok: true
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.delete("/api/admin/categories/:id", requireAdmin, async (req, res) => {
  try {
    await db.execute({
      sql: `
        UPDATE categories
        SET active = 0, updated_at = ?
        WHERE id = ?
      `,
      args: [now(), req.params.id]
    });

    res.json({
      ok: true
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================================================
   IMAGE UPLOAD
========================================================= */

app.post(
  "/api/admin/upload",
  requireAdmin,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: "File is required"
        });
      }

      /*
       * Для текущей версии сохраняем изображение как data URL.
       * Это не требует Cloudinary/S3 и работает без дополнительных сервисов.
       */
      const mime = req.file.mimetype || "image/jpeg";

      const dataUrl = `data:${mime};base64,${req.file.buffer.toString(
        "base64"
      )}`;

      res.json({
        ok: true,
        url: dataUrl
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================================================
   AI
========================================================= */

async function askOpenAI(prompt) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: prompt
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message || "OpenAI request failed"
    );
  }

  return (
    data.output_text ||
    data.output
      ?.flatMap((item) => item.content || [])
      ?.map((item) => item.text || "")
      ?.join("") ||
    ""
  );
}

app.post("/api/admin/ai/chat", requireAdmin, async (req, res) => {
  try {
    const message = text(req.body.message).trim();

    if (!message) {
      return res.status(400).json({
        ok: false,
        error: "Message is required"
      });
    }

    const products = await db.execute(`
      SELECT
        p.id,
        p.name,
        p.price,
        p.active,
        c.name AS category
      FROM products p
      LEFT JOIN categories c
        ON c.id = p.category_id
      ORDER BY p.name
    `);

    const catalog = products.rows
      .map(
        (p) =>
          `${p.name} | ${p.category || ""} | ${
            p.price || 0
          } ₽ | active=${p.active}`
      )
      .join("\n");

    const prompt = `
Ты AI-помощник магазина IRoom.

Отвечай на русском языке.

Каталог:
${catalog || "Каталог пуст"}

Запрос администратора:
${message}

Не выдумывай товары, цены или наличие.
Если данных нет — скажи об этом.
`;

    const answer = await askOpenAI(prompt);

    res.json({
      ok: true,
      answer
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================================================
   STATIC FILES
========================================================= */

app.use(express.static("public"));

app.get("*", (req, res, next) => {
  if (
    req.path.startsWith("/api/") ||
    req.path === "/health"
  ) {
    return next();
  }

  res.sendFile("index.html", {
    root: "public"
  });
});

/* =========================================================
   TELEGRAM BOT
========================================================= */

let telegramOffset = 0;
let pollingStarted = false;

async function handleTelegramUpdate(update) {
  const message = update?.message;

  if (!message) return;

  const chatId = message.chat?.id;
  const textMessage = text(message.text).trim();

  if (!chatId) return;

  if (textMessage === "/start") {
    await telegram("sendMessage", {
      chat_id: chatId,
      text:
        `Добро пожаловать в ${STORE_NAME} 🍎\n\n` +
        "Откройте магазин через кнопку ниже.",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Открыть IRoom",
              web_app: {
                url: MINIAPP_URL
              }
            }
          ]
        ]
      }
    });

    return;
  }

  if (textMessage === "/help") {
    await telegram("sendMessage", {
      chat_id: chatId,
      text:
        "IRoom — магазин техники Apple.\n\n" +
        "Используйте кнопку «Открыть IRoom» для просмотра каталога."
    });
  }
}

async function telegramPolling() {
  if (!BOT_TOKEN || pollingStarted) return;

  pollingStarted = true;

  console.log("Telegram polling started");

  while (true) {
    try {
      const updates = await telegram("getUpdates", {
        offset: telegramOffset,
        timeout: 25,
        allowed_updates: ["message"]
      });

      for (const update of updates) {
        telegramOffset = update.update_id + 1;

        try {
          await handleTelegramUpdate(update);
        } catch (error) {
          console.error(
            "Telegram update error:",
            error.message
          );
        }
      }
    } catch (error) {
      console.error(
        "Telegram polling error:",
        error.message
      );

      await new Promise((resolve) =>
        setTimeout(resolve, 3000)
      );
    }
  }
}

/* =========================================================
   START
========================================================= */

async function start() {
  try {
    await initDatabase();

    app.listen(PORT, () => {
      console.log(`iroom started on port ${PORT}`);
      console.log(`Store: ${STORE_NAME}`);
      console.log(`Contact: @${CONTACT_USERNAME}`);
      console.log(`Admin 1: ${ADMIN_ID || "not set"}`);
      console.log(`Admin 2: ${SECOND_ADMIN_ID}`);
      console.log(
        `OpenAI: ${OPENAI_API_KEY ? "enabled" : "disabled"}`
      );
      console.log(
        `Telegram bot configured: ${BOT_TOKEN ? "yes" : "no"}`
      );
      console.log(`Mini App URL: ${MINIAPP_URL}`);
      console.log(
        `AI: ${OPENAI_API_KEY ? "enabled" : "disabled"}`
      );
    });

    telegramPolling().catch((error) => {
      console.error(
        "Telegram polling fatal error:",
        error.message
      );
    });
  } catch (error) {
    console.error("Fatal startup error:", error);
    process.exit(1);
  }
}

start();