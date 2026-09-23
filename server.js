const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const crypto = require("crypto");
const { createClient } = require("@libsql/client");

const app = express();

const PORT = Number(process.env.PORT || 10000);

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const ADMIN_ID = String(process.env.ADMIN_ID || "").trim();
const SECOND_ADMIN_ID = "5975037118";

const MINIAPP_URL =
  process.env.MINIAPP_URL || "https://iroom-dww8.onrender.com";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";

const STORE_NAME = "IRoom";
const STORE_CONTACT = "@iroom_24";
const STORE_CHANNEL = "@iroom_market";

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  console.error("❌ TURSO_DATABASE_URL или TURSO_AUTH_TOKEN не заданы");
  process.exit(1);
}

if (!BOT_TOKEN) {
  console.warn("⚠️ BOT_TOKEN не задан");
}

const db = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/* =========================================================
   MULTER
========================================================= */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

/* =========================================================
   HELPERS
========================================================= */

function now() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeId(value) {
  return String(value ?? "").trim();
}

function isAdminId(id) {
  const value = String(id || "").trim();

  if (!value) return false;

  return value === ADMIN_ID || value === SECOND_ADMIN_ID;
}

function unique(arr) {
  return [...new Set(arr)];
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function randomId() {
  return crypto.randomBytes(10).toString("hex");
}

function telegramUsername(user) {
  if (!user) return "";

  if (user.username) {
    return `@${user.username}`;
  }

  return (
    [user.first_name, user.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || String(user.id)
  );
}

/* =========================================================
   TELEGRAM WEBAPP AUTH
========================================================= */

function validateTelegramInitData(initData) {
  if (!BOT_TOKEN || !initData) return null;

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

    if (calculatedHash !== hash) {
      return null;
    }

    const userRaw = params.get("user");

    if (!userRaw) return null;

    const user = JSON.parse(userRaw);

    return user;
  } catch (error) {
    console.error("Telegram auth error:", error.message);
    return null;
  }
}

function getTelegramUser(req) {
  const initData =
    req.headers["x-telegram-init-data"] ||
    req.headers["x-telegram-web-app-data"] ||
    "";

  return validateTelegramInitData(initData);
}

function requireTelegram(req, res, next) {
  const user = getTelegramUser(req);

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
  const user = getTelegramUser(req);

  if (!user) {
    return res.status(401).json({
      ok: false,
      error: "Invalid Telegram Mini App authorization"
    });
  }

  if (!isAdminId(user.id)) {
    return res.status(403).json({
      ok: false,
      error: "Admin access denied"
    });
  }

  req.telegramUser = user;

  next();
}

/* =========================================================
   DATABASE
========================================================= */

async function initializeDatabase() {
  await db.batch(
    [
      {
        sql: `
          CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            sort_order INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            created_at TEXT NOT NULL
          )
        `
      },

      {
        sql: `
          CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT,
            category_id INTEGER,
            description TEXT DEFAULT '',
            image_id INTEGER,
            is_new INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `
      },

      {
        sql: `
          CREATE TABLE IF NOT EXISTS product_variants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            memory TEXT DEFAULT '',
            color TEXT DEFAULT '',
            country TEXT DEFAULT '',
            sim_type TEXT DEFAULT '',
            price INTEGER DEFAULT 0,
            currency TEXT DEFAULT 'RUB',
            stock INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `
      },

      {
        sql: `
          CREATE TABLE IF NOT EXISTS images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mime_type TEXT NOT NULL,
            data BLOB NOT NULL,
            created_at TEXT NOT NULL
          )
        `
      },

      {
        sql: `
          CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL
          )
        `
      },

      {
        sql: `
          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT DEFAULT ''
          )
        `
      },

      {
        sql: `
          CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id TEXT,
            username TEXT,
            product_id INTEGER,
            variant_id INTEGER,
            type TEXT DEFAULT 'booking',
            status TEXT DEFAULT 'new',
            message TEXT DEFAULT '',
            created_at TEXT NOT NULL
          )
        `
      },

      {
        sql: `
          CREATE TABLE IF NOT EXISTS promo_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            discount_type TEXT DEFAULT 'percent',
            discount_value INTEGER DEFAULT 0,
            max_uses INTEGER DEFAULT 0,
            used_count INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            created_at TEXT NOT NULL
          )
        `
      },

      {
        sql: `
          CREATE TABLE IF NOT EXISTS users (
            telegram_id TEXT PRIMARY KEY,
            username TEXT DEFAULT '',
            first_name TEXT DEFAULT '',
            last_name TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `
      }
    ],
    "write"
  );

  await ensureProductColumns();
  await seedCategories();
  await seedAdmins();

  console.log("✅ Database initialized");
}

/* =========================================================
   MIGRATIONS
========================================================= */

async function ensureColumn(table, column, definition) {
  const result = await db.execute({
    sql: `PRAGMA table_info(${table})`
  });

  const exists = result.rows.some(
    row => String(row.name) === String(column)
  );

  if (!exists) {
    await db.execute({
      sql: `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
    });
  }
}

async function ensureProductColumns() {
  try {
    await ensureColumn("products", "slug", "TEXT");
    await ensureColumn("products", "description", "TEXT DEFAULT ''");
    await ensureColumn("products", "image_id", "INTEGER");
    await ensureColumn("products", "is_new", "INTEGER DEFAULT 0");
    await ensureColumn("products", "active", "INTEGER DEFAULT 1");
    await ensureColumn("products", "created_at", "TEXT");
    await ensureColumn("products", "updated_at", "TEXT");
  } catch (error) {
    console.error("Migration error:", error.message);
  }
}

/* =========================================================
   SEED
========================================================= */

async function seedCategories() {
  const result = await db.execute(`
    SELECT COUNT(*) AS count
    FROM categories
  `);

  const count = Number(result.rows[0]?.count || 0);

  if (count > 0) return;

  const categories = [
    ["iPhone", "iphone", 1],
    ["iPad", "ipad", 2],
    ["MacBook", "macbook", 3],
    ["Apple Watch", "apple-watch", 4],
    ["AirPods", "airpods", 5],
    ["Аксессуары", "accessories", 6]
  ];

  for (const [name, slug, sortOrder] of categories) {
    await db.execute({
      sql: `
        INSERT INTO categories
        (name, slug, sort_order, active, created_at)
        VALUES (?, ?, ?, 1, ?)
      `,
      args: [name, slug, sortOrder, now()]
    });
  }
}

async function seedAdmins() {
  const ids = unique(
    [ADMIN_ID, SECOND_ADMIN_ID].filter(Boolean)
  );

  for (const id of ids) {
    try {
      await db.execute({
        sql: `
          INSERT OR IGNORE INTO admins
          (telegram_id, created_at)
          VALUES (?, ?)
        `,
        args: [id, now()]
      });
    } catch {}
  }
}

/* =========================================================
   USERS
========================================================= */

async function saveUser(user) {
  if (!user?.id) return;

  await db.execute({
    sql: `
      INSERT INTO users
      (
        telegram_id,
        username,
        first_name,
        last_name,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(telegram_id)
      DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        updated_at = excluded.updated_at
    `,
    args: [
      String(user.id),
      user.username || "",
      user.first_name || "",
      user.last_name || "",
      now(),
      now()
    ]
  });
}

/* =========================================================
   SETTINGS
========================================================= */

async function getSetting(key, fallback = "") {
  const result = await db.execute({
    sql: `
      SELECT value
      FROM settings
      WHERE key = ?
      LIMIT 1
    `,
    args: [key]
  });

  return result.rows[0]?.value ?? fallback;
}

async function setSetting(key, value) {
  await db.execute({
    sql: `
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key)
      DO UPDATE SET value = excluded.value
    `,
    args: [key, String(value)]
  });
}

/* =========================================================
   IMAGE HELPERS
========================================================= */

async function saveImage(file) {
  if (!file) return null;

  const result = await db.execute({
    sql: `
      INSERT INTO images
      (mime_type, data, created_at)
      VALUES (?, ?, ?)
    `,
    args: [file.mimetype, file.buffer, now()]
  });

  return Number(result.lastInsertRowid);
}

/* =========================================================
   CATEGORY HELPERS
========================================================= */

async function getCategories(includeInactive = false) {
  const sql = includeInactive
    ? `
      SELECT *
      FROM categories
      ORDER BY sort_order ASC, id ASC
    `
    : `
      SELECT *
      FROM categories
      WHERE active = 1
      ORDER BY sort_order ASC, id ASC
    `;

  const result = await db.execute(sql);

  return result.rows;
}

/* =========================================================
   PRODUCT HELPERS
========================================================= */

async function getProductById(id, includeInactive = true) {
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
      ${includeInactive ? "" : "AND p.active = 1"}
      LIMIT 1
    `,
    args: [id]
  });

  const product = productResult.rows[0];

  if (!product) return null;

  const variantsResult = await db.execute({
    sql: `
      SELECT *
      FROM product_variants
      WHERE product_id = ?
      ${includeInactive ? "" : "AND active = 1"}
      ORDER BY
        memory ASC,
        color ASC,
        country ASC,
        sim_type ASC,
        id ASC
    `,
    args: [id]
  });

  return {
    ...product,
    variants: variantsResult.rows
  };
}

async function getProducts({
  includeInactive = false,
  categoryId = null,
  onlyNew = false,
  search = ""
} = {}) {
  const conditions = [];
  const args = [];

  if (!includeInactive) {
    conditions.push("p.active = 1");
  }

  if (categoryId) {
    conditions.push("p.category_id = ?");
    args.push(categoryId);
  }

  if (onlyNew) {
    conditions.push("p.is_new = 1");
  }

  if (search) {
    conditions.push(`
      (
        LOWER(p.name) LIKE LOWER(?) OR
        LOWER(p.description) LIKE LOWER(?) OR
        EXISTS (
          SELECT 1
          FROM product_variants pv2
          WHERE pv2.product_id = p.id
          AND (
            LOWER(pv2.memory) LIKE LOWER(?) OR
            LOWER(pv2.color) LIKE LOWER(?) OR
            LOWER(pv2.country) LIKE LOWER(?) OR
            LOWER(pv2.sim_type) LIKE LOWER(?)
          )
        )
      )
    `);

    const q = `%${search}%`;

    args.push(q, q, q, q, q, q);
  }

  const where = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const productsResult = await db.execute({
    sql: `
      SELECT
        p.*,
        c.name AS category_name,
        c.slug AS category_slug
      FROM products p
      LEFT JOIN categories c
        ON c.id = p.category_id
      ${where}
      ORDER BY
        p.is_new DESC,
        p.id DESC
    `,
    args
  });

  const products = [];

  for (const product of productsResult.rows) {
    const variantsResult = await db.execute({
      sql: `
        SELECT *
        FROM product_variants
        WHERE product_id = ?
        ${includeInactive ? "" : "AND active = 1"}
        ORDER BY id ASC
      `,
      args: [product.id]
    });

    products.push({
      ...product,
      variants: variantsResult.rows
    });
  }

  return products;
}

/* =========================================================
   PRODUCT NORMALIZATION
========================================================= */

function cleanVariant(input = {}) {
  return {
    memory: normalizeText(input.memory),
    color: normalizeText(input.color),
    country: normalizeText(input.country),
    sim_type: normalizeText(input.sim_type),
    price: Math.max(0, Number(input.price || 0)),
    currency: normalizeText(input.currency || "RUB") || "RUB",
    stock: Math.max(0, Number(input.stock ?? 0)),
    active: input.active === false || Number(input.active) === 0 ? 0 : 1
  };
}

function cleanProduct(input = {}) {
  return {
    name: normalizeText(input.name),
    slug:
      normalizeText(input.slug) ||
      normalizeText(input.name)
        .toLowerCase()
        .replace(/[^a-zа-яё0-9]+/gi, "-")
        .replace(/^-+|-+$/g, ""),
    category_id:
      input.category_id === null ||
      input.category_id === undefined ||
      input.category_id === ""
        ? null
        : Number(input.category_id),
    description: normalizeText(input.description),
    image_id:
      input.image_id === null ||
      input.image_id === undefined ||
      input.image_id === ""
        ? null
        : Number(input.image_id),
    is_new:
      input.is_new === true ||
      Number(input.is_new) === 1
        ? 1
        : 0,
    active:
      input.active === false ||
      Number(input.active) === 0
        ? 0
        : 1
  };
}

/* =========================================================
   HEALTH
========================================================= */

app.get("/api/health", async (req, res) => {
  try {
    await db.execute("SELECT 1");

    res.json({
      ok: true,
      app: STORE_NAME,
      database: "connected",
      version: "3.0.0"
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================================================
   PUBLIC CATEGORIES
========================================================= */

app.get("/api/categories", async (req, res) => {
  try {
    const categories = await getCategories(false);

    res.json({
      ok: true,
      categories
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Failed to load categories"
    });
  }
});

/* =========================================================
   PUBLIC PRODUCTS
========================================================= */

app.get("/api/products", async (req, res) => {
  try {
    const products = await getProducts({
      includeInactive: false,
      categoryId: req.query.category_id
        ? Number(req.query.category_id)
        : null,
      search: normalizeText(req.query.search)
    });

    res.json({
      ok: true,
      products
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Failed to load products"
    });
  }
});

app.get("/api/products/new", async (req, res) => {
  try {
    const products = await getProducts({
      includeInactive: false,
      onlyNew: true
    });

    res.json({
      ok: true,
      products
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Failed to load new products"
    });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const product = await getProductById(
      Number(req.params.id),
      false
    );

    if (!product) {
      return res.status(404).json({
        ok: false,
        error: "Product not found"
      });
    }

    res.json({
      ok: true,
      product
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Failed to load product"
    });
  }
});

/* =========================================================
   PUBLIC SETTINGS
========================================================= */

app.get("/api/settings", async (req, res) => {
  res.json({
    ok: true,
    settings: {
      store_name: STORE_NAME,
      contact: STORE_CONTACT,
      channel: STORE_CHANNEL
    }
  });
});

/* =========================================================
   IMAGES
========================================================= */

app.get("/api/images/:id", async (req, res) => {
  try {
    const result = await db.execute({
      sql: `
        SELECT mime_type, data
        FROM images
        WHERE id = ?
        LIMIT 1
      `,
      args: [Number(req.params.id)]
    });

    const image = result.rows[0];

    if (!image) {
      return res.status(404).end();
    }

    res.setHeader(
      "Content-Type",
      image.mime_type || "image/jpeg"
    );

    res.setHeader("Cache-Control", "public, max-age=31536000");

    res.send(Buffer.from(image.data));
  } catch (error) {
    res.status(500).end();
  }
});

/* =========================================================
   ADMIN ME
========================================================= */

app.get("/api/admin/me", requireAdmin, async (req, res) => {
  res.json({
    ok: true,
    admin: {
      id: String(req.telegramUser.id),
      username: req.telegramUser.username || "",
      name: telegramUsername(req.telegramUser)
    }
  });
});

/* =========================================================
   ADMIN UPLOAD
========================================================= */

app.post(
  "/api/admin/upload",
  requireAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: "Image is required"
        });
      }

      const id = await saveImage(req.file);

      res.json({
        ok: true,
        image_id: id,
        url: `/api/images/${id}`
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        error: "Image upload failed"
      });
    }
  }
);

/* =========================================================
   ADMIN PRODUCTS
========================================================= */

app.get("/api/admin/products", requireAdmin, async (req, res) => {
  try {
    const products = await getProducts({
      includeInactive: true,
      categoryId: req.query.category_id
        ? Number(req.query.category_id)
        : null,
      search: normalizeText(req.query.search)
    });

    res.json({
      ok: true,
      products
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Failed to load admin products"
    });
  }
});

app.get(
  "/api/admin/products/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const product = await getProductById(
        Number(req.params.id),
        true
      );

      if (!product) {
        return res.status(404).json({
          ok: false,
          error: "Product not found"
        });
      }

      res.json({
        ok: true,
        product
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
   CREATE PRODUCT
========================================================= */

app.post(
  "/api/admin/products",
  requireAdmin,
  async (req, res) => {
    try {
      const product = cleanProduct(req.body);
      const variants = Array.isArray(req.body.variants)
        ? req.body.variants.map(cleanVariant)
        : [];

      if (!product.name) {
        return res.status(400).json({
          ok: false,
          error: "Название товара обязательно"
        });
      }

      const createdAt = now();

      const result = await db.execute({
        sql: `
          INSERT INTO products
          (
            name,
            slug,
            category_id,
            description,
            image_id,
            is_new,
            active,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          product.name,
          product.slug,
          product.category_id,
          product.description,
          product.image_id,
          product.is_new,
          product.active,
          createdAt,
          createdAt
        ]
      });

      const productId = Number(result.lastInsertRowid);

      for (const variant of variants) {
        await db.execute({
          sql: `
            INSERT INTO product_variants
            (
              product_id,
              memory,
              color,
              country,
              sim_type,
              price,
              currency,
              stock,
              active,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            productId,
            variant.memory,
            variant.color,
            variant.country,
            variant.sim_type,
            variant.price,
            variant.currency,
            variant.stock,
            variant.active,
            createdAt,
            createdAt
          ]
        });
      }

      const created = await getProductById(productId, true);

      res.json({
        ok: true,
        product: created
      });
    } catch (error) {
      console.error("Create product:", error);

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================================================
   UPDATE PRODUCT
========================================================= */

app.put(
  "/api/admin/products/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const productId = Number(req.params.id);

      const existing = await getProductById(productId, true);

      if (!existing) {
        return res.status(404).json({
          ok: false,
          error: "Product not found"
        });
      }

      const product = cleanProduct(req.body);

      const variants = Array.isArray(req.body.variants)
        ? req.body.variants.map(cleanVariant)
        : [];

      const updatedAt = now();

      await db.execute({
        sql: `
          UPDATE products
          SET
            name = ?,
            slug = ?,
            category_id = ?,
            description = ?,
            image_id = ?,
            is_new = ?,
            active = ?,
            updated_at = ?
          WHERE id = ?
        `,
        args: [
          product.name,
          product.slug,
          product.category_id,
          product.description,
          product.image_id,
          product.is_new,
          product.active,
          updatedAt,
          productId
        ]
      });

      await db.execute({
        sql: `
          DELETE FROM product_variants
          WHERE product_id = ?
        `,
        args: [productId]
      });

      for (const variant of variants) {
        await db.execute({
          sql: `
            INSERT INTO product_variants
            (
              product_id,
              memory,
              color,
              country,
              sim_type,
              price,
              currency,
              stock,
              active,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            productId,
            variant.memory,
            variant.color,
            variant.country,
            variant.sim_type,
            variant.price,
            variant.currency,
            variant.stock,
            variant.active,
            updatedAt,
            updatedAt
          ]
        });
      }

      const updated = await getProductById(productId, true);

      res.json({
        ok: true,
        product: updated
      });
    } catch (error) {
      console.error("Update product:", error);

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================================================
   DELETE PRODUCT
========================================================= */

app.delete(
  "/api/admin/products/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      await db.batch(
        [
          {
            sql: `
              DELETE FROM product_variants
              WHERE product_id = ?
            `,
            args: [id]
          },
          {
            sql: `
              DELETE FROM products
              WHERE id = ?
            `,
            args: [id]
          }
        ],
        "write"
      );

      res.json({
        ok: true
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
   CATEGORIES ADMIN
========================================================= */

app.get(
  "/api/admin/categories",
  requireAdmin,
  async (req, res) => {
    try {
      const categories = await getCategories(true);

      res.json({
        ok: true,
        categories
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

app.post(
  "/api/admin/categories",
  requireAdmin,
  async (req, res) => {
    try {
      const name = normalizeText(req.body.name);

      if (!name) {
        return res.status(400).json({
          ok: false,
          error: "Название категории обязательно"
        });
      }

      const slug =
        normalizeText(req.body.slug) ||
        name
          .toLowerCase()
          .replace(/[^a-zа-яё0-9]+/gi, "-")
          .replace(/^-+|-+$/g, "");

      const sortOrder = Number(req.body.sort_order || 0);

      const result = await db.execute({
        sql: `
          INSERT INTO categories
          (
            name,
            slug,
            sort_order,
            active,
            created_at
          )
          VALUES (?, ?, ?, ?, ?)
        `,
        args: [
          name,
          slug,
          sortOrder,
          req.body.active === false ? 0 : 1,
          now()
        ]
      });

      res.json({
        ok: true,
        category: {
          id: Number(result.lastInsertRowid),
          name,
          slug,
          sort_order: sortOrder,
          active: req.body.active === false ? 0 : 1
        }
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

app.put(
  "/api/admin/categories/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      const name = normalizeText(req.body.name);

      const slug =
        normalizeText(req.body.slug) ||
        name
          .toLowerCase()
          .replace(/[^a-zа-яё0-9]+/gi, "-")
          .replace(/^-+|-+$/g, "");

      await db.execute({
        sql: `
          UPDATE categories
          SET
            name = ?,
            slug = ?,
            sort_order = ?,
            active = ?
          WHERE id = ?
        `,
        args: [
          name,
          slug,
          Number(req.body.sort_order || 0),
          req.body.active === false ? 0 : 1,
          id
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
  }
);

app.delete(
  "/api/admin/categories/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      await db.execute({
        sql: `
          DELETE FROM categories
          WHERE id = ?
        `,
        args: [id]
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
  }
);

/* =========================================================
   ORDERS
========================================================= */

app.post(
  "/api/orders",
  requireTelegram,
  async (req, res) => {
    try {
      const productId = Number(req.body.product_id);
      const variantId = Number(req.body.variant_id);
      const type =
        req.body.type === "consultation"
          ? "consultation"
          : "booking";

      const product = await getProductById(productId, false);

      if (!product) {
        return res.status(404).json({
          ok: false,
          error: "Product not found"
        });
      }

      const variant = product.variants.find(
        item => Number(item.id) === variantId
      );

      if (!variant) {
        return res.status(404).json({
          ok: false,
          error: "Variant not found"
        });
      }

      const username = telegramUsername(req.telegramUser);

      const message =
        normalizeText(req.body.message) ||
        `${product.name} ${variant.memory} ${variant.color} ${variant.country} ${variant.sim_type}`;

      const result = await db.execute({
        sql: `
          INSERT INTO orders
          (
            telegram_id,
            username,
            product_id,
            variant_id,
            type,
            status,
            message,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, 'new', ?, ?)
        `,
        args: [
          String(req.telegramUser.id),
          username,
          productId,
          variantId,
          type,
          message,
          now()
        ]
      });

      const orderId = Number(result.lastInsertRowid);

      if (BOT_TOKEN) {
        const telegramText =
          type === "booking"
            ? `🛒 Новое бронирование #${orderId}\n\n` +
              `Товар: ${product.name}\n` +
              `Память: ${variant.memory || "—"}\n` +
              `Цвет: ${variant.color || "—"}\n` +
              `Страна: ${variant.country || "—"}\n` +
              `SIM: ${variant.sim_type || "—"}\n` +
              `Цена: ${variant.price} ₽\n\n` +
              `Клиент: ${username}\n` +
              `Telegram ID: ${req.telegramUser.id}`
            :
              `💬 Консультация #${orderId}\n\n` +
              `Товар: ${product.name}\n` +
              `Вариант: ${variant.memory || "—"} / ${variant.color || "—"} / ${variant.country || "—"} / ${variant.sim_type || "—"}\n\n` +
              `Клиент: ${username}\n` +
              `Telegram ID: ${req.telegramUser.id}`;

        await sendMessageToAdmins(telegramText);
      }

      res.json({
        ok: true,
        order_id: orderId
      });
    } catch (error) {
      console.error("Order error:", error);

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================================================
   ADMIN ORDERS
========================================================= */

app.get(
  "/api/admin/orders",
  requireAdmin,
  async (req, res) => {
    try {
      const result = await db.execute(`
        SELECT
          o.*,
          p.name AS product_name,
          pv.memory,
          pv.color,
          pv.country,
          pv.sim_type,
          pv.price
        FROM orders o
        LEFT JOIN products p
          ON p.id = o.product_id
        LEFT JOIN product_variants pv
          ON pv.id = o.variant_id
        ORDER BY o.id DESC
        LIMIT 200
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
  }
);

/* =========================================================
   OPENAI
========================================================= */

async function callOpenAI({
  system,
  input,
  schema = null
}) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY не задан");
  }

  const body = {
    model: OPENAI_MODEL,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: system
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: input
          }
        ]
      }
    ]
  };

  if (schema) {
    body.text = {
      format: {
        type: "json_schema",
        name: schema.name,
        strict: true,
        schema: schema.schema
      }
    };
  }

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  const raw = await response.text();

  if (!response.ok) {
    console.error("OpenAI error:", raw);

    throw new Error(
      `OpenAI API error ${response.status}`
    );
  }

  const data = JSON.parse(raw);

  let text = "";

  if (typeof data.output_text === "string") {
    text = data.output_text;
  } else {
    for (const item of data.output || []) {
      for (const content of item.content || []) {
        if (content.type === "output_text") {
          text += content.text || "";
        }
      }
    }
  }

  return text.trim();
}

/* =========================================================
   CATALOG FOR AI
========================================================= */

function formatVariantForAI(variant) {
  return [
    `ID варианта: ${variant.id}`,
    `Память: ${variant.memory || "не указана"}`,
    `Цвет: ${variant.color || "не указан"}`,
    `Страна: ${variant.country || "не указана"}`,
    `SIM: ${variant.sim_type || "не указана"}`,
    `Цена: ${variant.price} ₽`,
    `Наличие: ${Number(variant.stock) > 0 ? "есть" : "нет"}`
  ].join(" | ");
}

function formatCatalogForAI(products) {
  if (!products.length) {
    return "Каталог пуст.";
  }

  return products
    .map(product => {
      const variants = product.variants
        .map(formatVariantForAI)
        .join("\n  ");

      return [
        `ТОВАР ID: ${product.id}`,
        `Название: ${product.name}`,
        `Категория: ${product.category_name || "Без категории"}`,
        `Описание: ${product.description || "нет"}`,
        `Новинка: ${product.is_new ? "да" : "нет"}`,
        `Варианты:`,
        `  ${variants || "вариантов нет"}`
      ].join("\n");
    })
    .join("\n\n");
}

/* =========================================================
   CUSTOMER AI
========================================================= */

async function answerCustomerWithAI(message) {
  const products = await getProducts({
    includeInactive: false
  });

  const catalog = formatCatalogForAI(products);

  const system = `
Ты — официальный AI-консультант магазина ${STORE_NAME}.

Твоя задача — помогать покупателям выбрать технику Apple.

ВАЖНЫЕ ПРАВИЛА:

1. Используй ТОЛЬКО товары и варианты из переданного каталога.
2. Никогда не придумывай цену, цвет, память, страну или SIM.
3. Если нужного варианта нет — прямо скажи, что такого варианта сейчас нет.
4. Можно предложить существующие варианты из каталога.
5. Не утверждай наличие, если stock = 0.
6. Если пользователь спрашивает про цену — указывай цену конкретного выбранного варианта.
7. Если пользователь не указал характеристики, помоги ему подобрать вариант.
8. Отвечай коротко и естественно на русском.
9. Не показывай внутренние ID товаров и технические данные базы.
10. Если вопрос не связан с магазином — вежливо верни разговор к выбору товара.

Магазин:
${STORE_NAME}
Контакт: ${STORE_CONTACT}
Канал: ${STORE_CHANNEL}

КАТАЛОГ:
${catalog}
`;

  return callOpenAI({
    system,
    input: message
  });
}

app.post(
  "/api/ai/chat",
  requireTelegram,
  async (req, res) => {
    try {
      await saveUser(req.telegramUser);

      const message = normalizeText(req.body.message);

      if (!message) {
        return res.status(400).json({
          ok: false,
          error: "Сообщение пустое"
        });
      }

      const answer = await answerCustomerWithAI(message);

      res.json({
        ok: true,
        answer
      });
    } catch (error) {
      console.error("Customer AI:", error);

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================================================
   ADMIN AI SCHEMA
========================================================= */

const ADMIN_ACTION_SCHEMA = {
  name: "iroom_admin_action",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      action: {
        type: "string",
        enum: [
          "chat",
          "import_price_list",
          "update_price",
          "make_new",
          "remove_product",
          "activate_product",
          "create_promo",
          "show_orders"
        ]
      },

      product_id: {
        type: ["integer", "null"]
      },

      variant_id: {
        type: ["integer", "null"]
      },

      price: {
        type: ["integer", "null"]
      },

      is_new: {
        type: ["boolean", "null"]
      },

      active: {
        type: ["boolean", "null"]
      },

      promo_code: {
        type: ["string", "null"]
      },

      discount_type: {
        type: ["string", "null"]
      },

      discount_value: {
        type: ["integer", "null"]
      },

      max_uses: {
        type: ["integer", "null"]
      },

      reply: {
        type: ["string", "null"]
      }
    },
    required: [
      "action",
      "product_id",
      "variant_id",
      "price",
      "is_new",
      "active",
      "promo_code",
      "discount_type",
      "discount_value",
      "max_uses",
      "reply"
    ]
  }
};

async function parseAdminCommand(message) {
  const products = await getProducts({
    includeInactive: true
  });

  const catalog = formatCatalogForAI(products);

  const system = `
Ты AI-ассистент администратора магазина ${STORE_NAME}.

Администратор может писать команды обычным языком.

Поддерживаемые действия:

- добавить товар или большой список товаров:
  import_price_list

- изменить цену варианта:
  update_price

- сделать товар новинкой:
  make_new

- удалить товар:
  remove_product

- включить товар:
  activate_product

- создать промокод:
  create_promo

- показать заказы:
  show_orders

- обычный вопрос:
  chat

Если пользователь прислал большой прайс-лист, выбери import_price_list.

Каталог:
${catalog}
`;

  const output = await callOpenAI({
    system,
    input: message,
    schema: ADMIN_ACTION_SCHEMA
  });

  return safeJsonParse(output, {
    action: "chat",
    reply: output
  });
}

/* =========================================================
   PRICE LIST PARSER
========================================================= */

const PRICE_PARSER_SCHEMA = {
  name: "iroom_price_list",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      products: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: {
              type: "string"
            },

            category: {
              type: "string"
            },

            description: {
              type: "string"
            },

            is_new: {
              type: "boolean"
            },

            variants: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  memory: {
                    type: "string"
                  },

                  color: {
                    type: "string"
                  },

                  country: {
                    type: "string"
                  },

                  sim_type: {
                    type: "string"
                  },

                  price: {
                    type: "integer"
                  },

                  stock: {
                    type: "integer"
                  }
                },
                required: [
                  "memory",
                  "color",
                  "country",
                  "sim_type",
                  "price",
                  "stock"
                ]
              }
            }
          },
          required: [
            "name",
            "category",
            "description",
            "is_new",
            "variants"
          ]
        }
      }
    },
    required: ["products"]
  }
};

async function parsePriceListWithAI(text) {
  const system = `
Ты парсер прайс-листа магазина техники Apple.

Преобразуй текст прайс-листа в JSON.

Для каждого товара создай один объект product.

Если у одного товара несколько:
- цветов;
- вариантов памяти;
- стран;
- типов SIM;
- цен;

создавай отдельные variants.

Нельзя терять варианты.

Определяй:

memory:
256GB, 512GB, 1TB и т.д.

color:
цвет товара.

country:
страна/регион поставки, например USA, EU, UAE.

sim_type:
eSIM, SIM + eSIM, Physical SIM и т.д.

price:
целое число без валюты.

stock:
если наличие явно не указано — ставь 1.

category:
iPhone, iPad, MacBook, Apple Watch, AirPods или Аксессуары.

Если товар является новинкой, is_new=true.

Не придумывай данные, которых нет в исходном тексте.
`;

  const output = await callOpenAI({
    system,
    input: text,
    schema: PRICE_PARSER_SCHEMA
  });

  const parsed = safeJsonParse(output);

  if (!parsed || !Array.isArray(parsed.products)) {
    throw new Error("AI не смог разобрать прайс");
  }

  return parsed.products;
}

/* =========================================================
   CATEGORY RESOLUTION
========================================================= */

async function resolveCategory(categoryName) {
  const name = normalizeText(categoryName);

  if (!name) return null;

  const categories = await getCategories(true);

  const found = categories.find(
    category =>
      category.name.toLowerCase() === name.toLowerCase()
  );

  if (found) {
    return Number(found.id);
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");

  const result = await db.execute({
    sql: `
      INSERT INTO categories
      (name, slug, sort_order, active, created_at)
      VALUES (?, ?, ?, 1, ?)
    `,
    args: [
      name,
      slug || randomId(),
      categories.length + 1,
      now()
    ]
  });

  return Number(result.lastInsertRowid);
}

/* =========================================================
   IMPORT PRODUCTS
========================================================= */

async function importProductsFromAI(products) {
  const created = [];
  const errors = [];

  for (const item of products) {
    try {
      const name = normalizeText(item.name);

      if (!name) {
        continue;
      }

      const categoryId = await resolveCategory(
        item.category
      );

      const createdAt = now();

      const productResult = await db.execute({
        sql: `
          INSERT INTO products
          (
            name,
            slug,
            category_id,
            description,
            is_new,
            active,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        `,
        args: [
          name,
          name
            .toLowerCase()
            .replace(/[^a-zа-яё0-9]+/gi, "-")
            .replace(/^-+|-+$/g, "") +
            "-" +
            randomId().slice(0, 6),
          categoryId,
          normalizeText(item.description),
          item.is_new ? 1 : 0,
          createdAt,
          createdAt
        ]
      });

      const productId = Number(
        productResult.lastInsertRowid
      );

      for (const rawVariant of item.variants || []) {
        const variant = cleanVariant(rawVariant);

        await db.execute({
          sql: `
            INSERT INTO product_variants
            (
              product_id,
              memory,
              color,
              country,
              sim_type,
              price,
              currency,
              stock,
              active,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 'RUB', ?, 1, ?, ?)
          `,
          args: [
            productId,
            variant.memory,
            variant.color,
            variant.country,
            variant.sim_type,
            variant.price,
            variant.stock,
            createdAt,
            createdAt
          ]
        });
      }

      created.push({
        id: productId,
        name,
        variants: (item.variants || []).length
      });
    } catch (error) {
      errors.push({
        name: item.name,
        error: error.message
      });
    }
  }

  return {
    created,
    errors
  };
}

/* =========================================================
   ADMIN AI PARSE
========================================================= */

app.post(
  "/api/admin/ai/parse",
  requireAdmin,
  async (req, res) => {
    try {
      const text = normalizeText(req.body.text);

      if (!text) {
        return res.status(400).json({
          ok: false,
          error: "Прайс-лист пустой"
        });
      }

      const products = await parsePriceListWithAI(text);

      res.json({
        ok: true,
        products
      });
    } catch (error) {
      console.error("AI parse:", error);

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================================================
   ADMIN AI IMPORT
========================================================= */

app.post(
  "/api/admin/ai/import",
  requireAdmin,
  async (req, res) => {
    try {
      const products = Array.isArray(req.body.products)
        ? req.body.products
        : [];

      if (!products.length) {
        return res.status(400).json({
          ok: false,
          error: "Нет товаров для импорта"
        });
      }

      const result = await importProductsFromAI(products);

      res.json({
        ok: true,
        ...result
      });
    } catch (error) {
      console.error("AI import:", error);

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================================================
   ADMIN AI COMMANDS
========================================================= */

async function executeAdminAIAction(action) {
  switch (action.action) {
    case "update_price": {
      if (!action.variant_id || action.price === null) {
        return "Укажи вариант товара и новую цену.";
      }

      await db.execute({
        sql: `
          UPDATE product_variants
          SET
            price = ?,
            updated_at = ?
          WHERE id = ?
        `,
        args: [
          Number(action.price),
          now(),
          Number(action.variant_id)
        ]
      });

      return `Цена варианта #${action.variant_id} изменена на ${action.price} ₽.`;
    }

    case "make_new": {
      if (!action.product_id) {
        return "Не указан товар.";
      }

      await db.execute({
        sql: `
          UPDATE products
          SET
            is_new = 1,
            updated_at = ?
          WHERE id = ?
        `,
        args: [now(), Number(action.product_id)]
      });

      return `Товар #${action.product_id} отмечен как новинка.`;
    }

    case "remove_product": {
      if (!action.product_id) {
        return "Не указан товар.";
      }

      const id = Number(action.product_id);

      await db.batch(
        [
          {
            sql: `
              DELETE FROM product_variants
              WHERE product_id = ?
            `,
            args: [id]
          },
          {
            sql: `
              DELETE FROM products
              WHERE id = ?
            `,
            args: [id]
          }
        ],
        "write"
      );

      return `Товар #${id} удалён.`;
    }

    case "activate_product": {
      if (!action.product_id) {
        return "Не указан товар.";
      }

      await db.execute({
        sql: `
          UPDATE products
          SET
            active = ?,
            updated_at = ?
          WHERE id = ?
        `,
        args: [
          action.active === false ? 0 : 1,
          now(),
          Number(action.product_id)
        ]
      });

      return action.active === false
        ? "Товар отключён."
        : "Товар включён.";
    }

    case "create_promo": {
      if (!action.promo_code) {
        return "Не указан промокод.";
      }

      await db.execute({
        sql: `
          INSERT INTO promo_codes
          (
            code,
            discount_type,
            discount_value,
            max_uses,
            used_count,
            active,
            created_at
          )
          VALUES (?, ?, ?, ?, 0, 1, ?)
        `,
        args: [
          action.promo_code.toUpperCase(),
          action.discount_type || "percent",
          Number(action.discount_value || 0),
          Number(action.max_uses || 0),
          now()
        ]
      });

      return `Промокод ${action.promo_code.toUpperCase()} создан.`;
    }

    case "show_orders": {
      const result = await db.execute(`
        SELECT
          o.id,
          o.username,
          o.type,
          o.status,
          o.message,
          o.created_at,
          p.name AS product_name,
          pv.memory,
          pv.color,
          pv.country,
          pv.sim_type,
          pv.price
        FROM orders o
        LEFT JOIN products p
          ON p.id = o.product_id
        LEFT JOIN product_variants pv
          ON pv.id = o.variant_id
        ORDER BY o.id DESC
        LIMIT 20
      `);

      if (!result.rows.length) {
        return "Заказов пока нет.";
      }

      return result.rows
        .map(order => {
          return [
            `#${order.id}`,
            order.type === "booking"
              ? "Бронирование"
              : "Консультация",
            order.product_name || "Товар",
            [
              order.memory,
              order.color,
              order.country,
              order.sim_type
            ]
              .filter(Boolean)
              .join(" · "),
            order.price
              ? `${order.price} ₽`
              : "",
            order.username || ""
          ]
            .filter(Boolean)
            .join(" — ");
        })
        .join("\n");
    }

    case "chat":
    default:
      return action.reply || "Готово.";
  }
}

app.post(
  "/api/admin/ai/chat",
  requireAdmin,
  async (req, res) => {
    try {
      const message = normalizeText(req.body.message);

      if (!message) {
        return res.status(400).json({
          ok: false,
          error: "Сообщение пустое"
        });
      }

      const action = await parseAdminCommand(message);

      if (action.action === "import_price_list") {
        return res.json({
          ok: true,
          action: "import_price_list",
          reply:
            "Похоже, ты отправил прайс-лист. Используй импорт прайс-листа для предварительного просмотра вариантов.",
          needs_import: true
        });
      }

      const reply = await executeAdminAIAction(action);

      res.json({
        ok: true,
        action: action.action,
        reply
      });
    } catch (error) {
      console.error("Admin AI:", error);

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================================================
   TELEGRAM BOT
========================================================= */

async function telegramApi(method, body = {}) {
  if (!BOT_TOKEN) {
    throw new Error("BOT_TOKEN не задан");
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

  return response.json();
}

async function sendTelegramMessage(chatId, text, extra = {}) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    ...extra
  });
}

async function sendMessageToAdmins(text) {
  const ids = unique(
    [ADMIN_ID, SECOND_ADMIN_ID].filter(Boolean)
  );

  for (const id of ids) {
    try {
      await sendTelegramMessage(id, text);
    } catch (error) {
      console.error(
        `Failed to notify admin ${id}:`,
        error.message
      );
    }
  }
}

/* =========================================================
   BOT POLLING
========================================================= */

let telegramOffset = 0;
let pollingStarted = false;

async function processTelegramUpdate(update) {
  const message = update.message;

  if (!message?.text) return;

  const chatId = message.chat?.id;

  if (!chatId) return;

  const text = message.text.trim();

  if (text === "/start") {
    await sendTelegramMessage(
      chatId,
      `Добро пожаловать в ${STORE_NAME}.\n\nОткройте магазин по кнопке ниже.`,
      {
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
      }
    );

    return;
  }

  if (text === "/help") {
    await sendTelegramMessage(
      chatId,
      [
        `${STORE_NAME}`,
        "",
        "Магазин техники Apple.",
        "",
        "Для покупателей используйте Mini App.",
        "Для администратора доступен AI-помощник."
      ].join("\n")
    );

    return;
  }

  if (
    text === "/ai" &&
    isAdminId(message.from?.id)
  ) {
    await sendTelegramMessage(
      chatId,
      [
        "AI администратора активен.",
        "",
        "Можно написать:",
        "• добавить товар",
        "• изменить цену",
        "• сделать новинкой",
        "• удалить товар",
        "• показать заказы",
        "• создать промокод",
        "• отправить прайс-лист"
      ].join("\n")
    );

    return;
  }

  if (isAdminId(message.from?.id)) {
    try {
      const action = await parseAdminCommand(text);

      if (action.action === "import_price_list") {
        const parsed = await parsePriceListWithAI(text);

        const result = await importProductsFromAI(parsed);

        await sendTelegramMessage(
          chatId,
          `Импорт завершён.\n\nДобавлено товаров: ${result.created.length}\nОшибок: ${result.errors.length}`
        );

        return;
      }

      const reply = await executeAdminAIAction(action);

      await sendTelegramMessage(chatId, reply);

      return;
    } catch (error) {
      await sendTelegramMessage(
        chatId,
        `Ошибка AI: ${error.message}`
      );
    }
  }
}

async function telegramPollingLoop() {
  if (pollingStarted || !BOT_TOKEN) return;

  pollingStarted = true;

  console.log("🤖 Telegram polling started");

  while (true) {
    try {
      const response = await telegramApi(
        "getUpdates",
        {
          offset: telegramOffset,
          timeout: 30,
          allowed_updates: ["message"]
        }
      );

      if (!response.ok) {
        await new Promise(resolve =>
          setTimeout(resolve, 3000)
        );

        continue;
      }

      for (const update of response.result || []) {
        telegramOffset = update.update_id + 1;

        try {
          await processTelegramUpdate(update);
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

      await new Promise(resolve =>
        setTimeout(resolve, 5000)
      );
    }
  }
}

/* =========================================================
   STATIC
========================================================= */

app.use(
  express.static(
    path.join(__dirname, "public"),
    {
      extensions: ["html"]
    }
  )
);

app.get("/admin", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "admin.html")
  );
});

app.get("/admin/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "admin.html")
  );
});

app.get("*", (req, res) => {
  if (
    req.path.startsWith("/api/") ||
    req.path.startsWith("/api")
  ) {
    return res.status(404).json({
      ok: false,
      error: "API route not found"
    });
  }

  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

/* =========================================================
   START
========================================================= */

async function start() {
  try {
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(`🚀 ${STORE_NAME} started`);
      console.log(`Port: ${PORT}`);
      console.log(`Mini App: ${MINIAPP_URL}`);
      console.log(
        `Admins: ${[ADMIN_ID, SECOND_ADMIN_ID]
          .filter(Boolean)
          .join(", ")}`
      );
    });

    telegramPollingLoop().catch(error => {
      console.error(
        "Telegram polling fatal error:",
        error
      );
    });
  } catch (error) {
    console.error("❌ Startup error:", error);
    process.exit(1);
  }
}

start();