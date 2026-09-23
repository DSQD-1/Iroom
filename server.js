import express from "express";
import crypto from "crypto";
import multer from "multer";
import { createClient } from "@libsql/client";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 10000);

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const ADMIN_ID = String(process.env.ADMIN_ID || "").trim();
const MINIAPP_URL =
  process.env.MINIAPP_URL || "https://iroom-dww8.onrender.com";

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL || "";
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || "";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";

const SECOND_ADMIN_ID = "5975037118";

const ADMIN_IDS = new Set(
  [ADMIN_ID, SECOND_ADMIN_ID]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
);

if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  console.warn("WARNING: Turso environment variables are missing.");
}

const db = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN
});

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

const PUBLIC_DIR = path.join(__dirname, "public");

function now() {
  return new Date().toISOString();
}

function randomId(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function normalize(value) {
  return String(value ?? "").trim();
}

function safeJson(value, fallback = {}) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================================================
   DATABASE
========================================================= */

async function tableExists(tableName) {
  const result = await db.execute({
    sql: `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name = ?
      LIMIT 1
    `,
    args: [tableName]
  });

  return result.rows.length > 0;
}

async function getTableColumns(tableName) {
  const result = await db.execute({
    sql: `PRAGMA table_info(${tableName})`
  });

  return result.rows.map((row) => ({
    name: String(row.name ?? ""),
    type: String(row.type ?? ""),
    notnull: Number(row.notnull ?? 0),
    pk: Number(row.pk ?? 0)
  }));
}

/*
  IMPORTANT:

  Older versions of IRoom created admins without an "id" column.

  We DO NOT drop the table.
  We DO NOT delete existing admin records.

  We inspect the current Turso schema and safely add missing
  columns where possible.
*/
async function migrateAdminsTable() {
  const exists = await tableExists("admins");

  if (!exists) {
    await db.execute(`
      CREATE TABLE admins (
        id TEXT PRIMARY KEY,
        telegram_id TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      )
    `);

    return;
  }

  let columns = await getTableColumns("admins");

  const names = new Set(columns.map((x) => x.name));

  /*
    Normal expected old schema:
      telegram_id
      created_at

    New schema:
      id
      telegram_id
      created_at
  */

  if (!names.has("telegram_id")) {
    /*
      Extremely old/broken schema.

      Preserve the old table by renaming it instead of deleting it.
      Then create a clean admins table.
    */

    const backupName = `admins_legacy_${Date.now()}`;

    await db.execute({
      sql: `ALTER TABLE admins RENAME TO ${backupName}`
    });

    await db.execute(`
      CREATE TABLE admins (
        id TEXT PRIMARY KEY,
        telegram_id TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      )
    `);

    console.warn(
      `Old admins table did not contain telegram_id. Preserved as ${backupName}.`
    );

    return;
  }

  if (!names.has("id")) {
    console.log("Migrating admins table: adding id column...");

    await db.execute(`
      ALTER TABLE admins ADD COLUMN id TEXT
    `);

    columns = await getTableColumns("admins");
  }

  if (!new Set(columns.map((x) => x.name)).has("created_at")) {
    console.log("Migrating admins table: adding created_at column...");

    await db.execute(`
      ALTER TABLE admins ADD COLUMN created_at TEXT
    `);
  }

  /*
    Fill missing IDs for old admin rows.
  */

  const existingRows = await db.execute(`
    SELECT rowid, telegram_id, created_at, id
    FROM admins
  `);

  for (const row of existingRows.rows) {
    const telegramId = normalize(row.telegram_id);
    const currentId = normalize(row.id);

    if (!telegramId) {
      continue;
    }

    if (!currentId) {
      await db.execute({
        sql: `
          UPDATE admins
          SET id = ?
          WHERE rowid = ?
        `,
        args: [randomId("adm"), row.rowid]
      });
    }

    if (!normalize(row.created_at)) {
      await db.execute({
        sql: `
          UPDATE admins
          SET created_at = ?
          WHERE rowid = ?
        `,
        args: [now(), row.rowid]
      });
    }
  }

  console.log("Admins table migration completed.");
}

async function initDatabase() {
  /*
    FIRST migrate admins.

    This must happen BEFORE inserting admins.
  */
  await migrateAdminsTable();

  await db.batch(
    [
      {
        sql: `
          CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
          )
        `
      },

      {
        sql: `
          CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            category_id TEXT,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            description TEXT DEFAULT '',
            image_url TEXT DEFAULT '',
            price INTEGER NOT NULL DEFAULT 0,
            old_price INTEGER,
            active INTEGER NOT NULL DEFAULT 1,
            is_new INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `
      },

      {
        sql: `
          CREATE TABLE IF NOT EXISTS product_variants (
            id TEXT PRIMARY KEY,
            product_id TEXT NOT NULL,
            color TEXT DEFAULT '',
            memory TEXT DEFAULT '',
            country TEXT DEFAULT '',
            sim TEXT DEFAULT '',
            price INTEGER NOT NULL DEFAULT 0,
            old_price INTEGER,
            stock INTEGER NOT NULL DEFAULT 0,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `
      },

      {
        sql: `
          CREATE TABLE IF NOT EXISTS images (
            id TEXT PRIMARY KEY,
            product_id TEXT,
            url TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
          )
        `
      },

      {
        sql: `
          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT DEFAULT '',
            updated_at TEXT NOT NULL
          )
        `
      },

      {
        sql: `
          CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            telegram_id TEXT NOT NULL,
            username TEXT DEFAULT '',
            product_id TEXT,
            product_name TEXT DEFAULT '',
            variant_id TEXT,
            variant_json TEXT DEFAULT '',
            price INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'new',
            comment TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `
      },

      {
        sql: `
          CREATE TABLE IF NOT EXISTS promo_codes (
            id TEXT PRIMARY KEY,
            code TEXT NOT NULL UNIQUE,
            discount_type TEXT NOT NULL DEFAULT 'percent',
            discount_value INTEGER NOT NULL DEFAULT 0,
            active INTEGER NOT NULL DEFAULT 1,
            max_uses INTEGER,
            used_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
          )
        `
      },

      {
        sql: `
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            telegram_id TEXT NOT NULL UNIQUE,
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

  /*
    Default categories
  */

  const defaultCategories = [
    ["iPhone", "iphone", 1],
    ["iPad", "ipad", 2],
    ["Mac", "mac", 3],
    ["Apple Watch", "apple-watch", 4],
    ["AirPods", "airpods", 5],
    ["Другое", "other", 6]
  ];

  for (const [name, slug, sortOrder] of defaultCategories) {
    await db.execute({
      sql: `
        INSERT INTO categories (
          id,
          name,
          slug,
          sort_order,
          active,
          created_at
        )
        VALUES (?, ?, ?, ?, 1, ?)
        ON CONFLICT(slug) DO NOTHING
      `,
      args: [
        randomId("cat"),
        name,
        slug,
        sortOrder,
        now()
      ]
    });
  }

  /*
    Insert configured admins.

    Because the migration above guarantees that id exists,
    this no longer crashes on old Turso databases.
  */

  for (const adminId of ADMIN_IDS) {
    await db.execute({
      sql: `
        INSERT INTO admins (
          id,
          telegram_id,
          created_at
        )
        VALUES (?, ?, ?)
        ON CONFLICT(telegram_id) DO NOTHING
      `,
      args: [
        randomId("adm"),
        adminId,
        now()
      ]
    });
  }

  console.log("Database initialized.");
}

/* =========================================================
   TELEGRAM MINI APP AUTH
========================================================= */

function validateTelegramInitData(initData) {
  if (!BOT_TOKEN) {
    return null;
  }

  if (!initData) {
    return null;
  }

  const params = new URLSearchParams(initData);

  const hash = params.get("hash");

  if (!hash) {
    return null;
  }

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

  if (calculatedHash.length !== hash.length) {
    return null;
  }

  if (
    !crypto.timingSafeEqual(
      Buffer.from(calculatedHash),
      Buffer.from(hash)
    )
  ) {
    return null;
  }

  const authDate = Number(params.get("auth_date") || 0);

  /*
    Telegram init data should not be ancient.
    24 hours is enough for the store.
  */

  if (authDate) {
    const age = Math.floor(Date.now() / 1000) - authDate;

    if (age > 86400) {
      return null;
    }
  }

  const userRaw = params.get("user");

  if (!userRaw) {
    return null;
  }

  const user = safeJson(userRaw, null);

  if (!user || !user.id) {
    return null;
  }

  return user;
}

function getInitData(req) {
  return (
    req.headers["x-telegram-init-data"] ||
    req.headers["x-telegram-init-data".toLowerCase()] ||
    ""
  );
}

async function upsertUser(user) {
  if (!user?.id) return;

  const telegramId = String(user.id);

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
      ON CONFLICT(telegram_id)
      DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        updated_at = excluded.updated_at
    `,
    args: [
      randomId("usr"),
      telegramId,
      user.username || "",
      user.first_name || "",
      user.last_name || "",
      now(),
      now()
    ]
  });
}

async function requireTelegram(req, res, next) {
  try {
    const user = validateTelegramInitData(getInitData(req));

    if (!user) {
      return res.status(401).json({
        ok: false,
        error: "Invalid Telegram Mini App authorization"
      });
    }

    req.telegramUser = user;

    await upsertUser(user);

    next();
  } catch (error) {
    console.error("Telegram auth error:", error);

    return res.status(401).json({
      ok: false,
      error: "Invalid Telegram Mini App authorization"
    });
  }
}

async function requireAdmin(req, res, next) {
  try {
    const user = validateTelegramInitData(getInitData(req));

    if (!user) {
      return res.status(401).json({
        ok: false,
        error: "Invalid Telegram Mini App authorization"
      });
    }

    if (!ADMIN_IDS.has(String(user.id))) {
      return res.status(403).json({
        ok: false,
        error: "Admin access required"
      });
    }

    req.telegramUser = user;

    await upsertUser(user);

    next();
  } catch (error) {
    console.error("Admin auth error:", error);

    return res.status(401).json({
      ok: false,
      error: "Invalid Telegram Mini App authorization"
    });
  }
}

/* =========================================================
   BASIC ROUTES
========================================================= */

app.get("/health", async (req, res) => {
  try {
    await db.execute("SELECT 1");

    res.json({
      ok: true,
      app: "IRoom",
      version: "1.0.0",
      database: true,
      admins: [...ADMIN_IDS]
    });
  } catch (error) {
    console.error("Health error:", error);

    res.status(500).json({
      ok: false,
      app: "IRoom",
      database: false
    });
  }
});

app.get("/api/categories", async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT *
      FROM categories
      WHERE active = 1
      ORDER BY sort_order ASC, name ASC
    `);

    res.json({
      ok: true,
      categories: result.rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Failed to load categories"
    });
  }
});

app.get("/api/products", async (req, res) => {
  try {
    const category = normalize(req.query.category);
    const search = normalize(req.query.search);

    let sql = `
      SELECT
        p.*,
        c.name AS category_name,
        c.slug AS category_slug
      FROM products p
      LEFT JOIN categories c
        ON c.id = p.category_id
      WHERE p.active = 1
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
          LOWER(p.name) LIKE LOWER(?)
          OR LOWER(p.description) LIKE LOWER(?)
        )
      `;

      const q = `%${search}%`;

      args.push(q, q);
    }

    sql += `
      ORDER BY
        p.is_new DESC,
        p.sort_order ASC,
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
      error: "Failed to load products"
    });
  }
});

app.get("/api/products/new", async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT
        p.*,
        c.name AS category_name,
        c.slug AS category_slug
      FROM products p
      LEFT JOIN categories c
        ON c.id = p.category_id
      WHERE p.active = 1
        AND p.is_new = 1
      ORDER BY
        p.sort_order ASC,
        p.created_at DESC
      LIMIT 20
    `);

    res.json({
      ok: true,
      products: result.rows
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
          AND p.active = 1
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
          AND active = 1
        ORDER BY created_at ASC
      `,
      args: [product.id]
    });

    const images = await db.execute({
      sql: `
        SELECT *
        FROM images
        WHERE product_id = ?
        ORDER BY sort_order ASC, created_at ASC
      `,
      args: [product.id]
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
      error: "Failed to load product"
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
      settings
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Failed to load settings"
    });
  }
});

/* =========================================================
   IMAGES
========================================================= */

app.get("/api/images", async (req, res) => {
  try {
    const productId = normalize(req.query.product_id);

    if (!productId) {
      return res.json({
        ok: true,
        images: []
      });
    }

    const result = await db.execute({
      sql: `
        SELECT *
        FROM images
        WHERE product_id = ?
        ORDER BY sort_order ASC, created_at ASC
      `,
      args: [productId]
    });

    res.json({
      ok: true,
      images: result.rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Failed to load images"
    });
  }
});

/* =========================================================
   ORDERS
========================================================= */

app.post("/api/orders", requireTelegram, async (req, res) => {
  try {
    const user = req.telegramUser;

    const {
      product_id,
      product_name,
      variant_id,
      variant,
      price,
      comment
    } = req.body || {};

    const orderId = randomId("ord");

    await db.execute({
      sql: `
        INSERT INTO orders (
          id,
          telegram_id,
          username,
          product_id,
          product_name,
          variant_id,
          variant_json,
          price,
          status,
          comment,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)
      `,
      args: [
        orderId,
        String(user.id),
        user.username || "",
        product_id || null,
        product_name || "",
        variant_id || null,
        JSON.stringify(variant || {}),
        Number(price || 0),
        comment || "",
        now(),
        now()
      ]
    });

    await notifyAdmins(
      [
        "🛍 <b>Новая заявка IRoom</b>",
        "",
        `<b>Товар:</b> ${escapeHtml(product_name || "—")}`,
        `<b>Цена:</b> ${Number(price || 0).toLocaleString("ru-RU")} ₽`,
        `<b>Пользователь:</b> ${escapeHtml(
          user.username ? `@${user.username}` : String(user.id)
        )}`,
        "",
        `<b>ID заказа:</b> <code>${orderId}</code>`
      ].join("\n")
    );

    res.json({
      ok: true,
      order: {
        id: orderId
      }
    });
  } catch (error) {
    console.error("Create order error:", error);

    res.status(500).json({
      ok: false,
      error: "Failed to create order"
    });
  }
});

/* =========================================================
   TELEGRAM API
========================================================= */

async function telegramApi(method, body = {}) {
  if (!BOT_TOKEN) {
    throw new Error("BOT_TOKEN is not configured");
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
      `Telegram API ${method}: ${data.description || "Unknown error"}`
    );
  }

  return data.result;
}

async function notifyAdmins(text) {
  for (const adminId of ADMIN_IDS) {
    try {
      await telegramApi("sendMessage", {
        chat_id: adminId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
    } catch (error) {
      console.error(
        `Failed to notify admin ${adminId}:`,
        error.message
      );
    }
  }
}

/* =========================================================
   OPENAI CUSTOMER AI
========================================================= */

async function getCatalogForAI() {
  const products = await db.execute(`
    SELECT
      p.id,
      p.name,
      p.description,
      p.price,
      p.old_price,
      c.name AS category
    FROM products p
    LEFT JOIN categories c
      ON c.id = p.category_id
    WHERE p.active = 1
    ORDER BY
      p.sort_order ASC,
      p.created_at DESC
  `);

  const variants = await db.execute(`
    SELECT
      v.id,
      v.product_id,
      v.color,
      v.memory,
      v.country,
      v.sim,
      v.price,
      v.stock
    FROM product_variants v
    JOIN products p
      ON p.id = v.product_id
    WHERE v.active = 1
      AND p.active = 1
    ORDER BY v.created_at ASC
  `);

  return {
    products: products.rows,
    variants: variants.rows
  };
}

async function openAIResponse(input, instructions) {
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
        instructions,
        input
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        `OpenAI request failed with ${response.status}`
    );
  }

  return data;
}

function getOpenAIText(data) {
  if (typeof data?.output_text === "string") {
    return data.output_text.trim();
  }

  const parts = [];

  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (
        content?.type === "output_text" &&
        typeof content?.text === "string"
      ) {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}

app.post("/api/ai/chat", requireTelegram, async (req, res) => {
  try {
    const message = normalize(req.body?.message);

    if (!message) {
      return res.status(400).json({
        ok: false,
        error: "Message is required"
      });
    }

    const catalog = await getCatalogForAI();

    const instructions = `
Ты — консультант магазина IRoom.

Отвечай на русском языке.

Ты консультируешь покупателей по товарам IRoom.
Используй только информацию из переданного каталога.
Не придумывай товары, цены, характеристики или наличие.

Если пользователь хочет забронировать товар,
объясни, что бронь оформляется через кнопку «Забронировать».

Будь кратким, дружелюбным и понятным.

КАТАЛОГ:
${JSON.stringify(catalog)}
`;

    const data = await openAIResponse(message, instructions);

    res.json({
      ok: true,
      answer:
        getOpenAIText(data) ||
        "Не удалось получить ответ. Попробуйте ещё раз."
    });
  } catch (error) {
    console.error("Customer AI error:", error);

    res.status(500).json({
      ok: false,
      error: "AI temporarily unavailable"
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
    telegram_id: String(req.telegramUser.id),
    admins: [...ADMIN_IDS]
  });
});

/* =========================================================
   ADMIN UPLOAD
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
        Render filesystem is temporary.

        We return a data URL so the admin panel can store/use
        the uploaded image immediately without requiring another
        storage service.
      */

      const mime = req.file.mimetype || "application/octet-stream";

      const dataUrl = `data:${mime};base64,${req.file.buffer.toString(
        "base64"
      )}`;

      res.json({
        ok: true,
        url: dataUrl
      });
    } catch (error) {
      console.error("Upload error:", error);

      res.status(500).json({
        ok: false,
        error: "Upload failed"
      });
    }
  }
);

/* =========================================================
   ADMIN PRODUCTS
========================================================= */

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
      ORDER BY
        p.sort_order ASC,
        p.created_at DESC
    `);

    res.json({
      ok: true,
      products: result.rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Failed to load admin products"
    });
  }
});

app.post("/api/admin/products", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};

    const id = normalize(body.id) || randomId("prod");
    const productName = normalize(body.name);

    if (!productName) {
      return res.status(400).json({
        ok: false,
        error: "Product name is required"
      });
    }

    const existing = await db.execute({
      sql: `
        SELECT id
        FROM products
        WHERE id = ?
        LIMIT 1
      `,
      args: [id]
    });

    const timestamp = now();

    if (existing.rows.length) {
      await db.execute({
        sql: `
          UPDATE products
          SET
            category_id = ?,
            name = ?,
            slug = ?,
            description = ?,
            image_url = ?,
            price = ?,
            old_price = ?,
            active = ?,
            is_new = ?,
            sort_order = ?,
            updated_at = ?
          WHERE id = ?
        `,
        args: [
          body.category_id || null,
          productName,
          normalize(body.slug) ||
            productName
              .toLowerCase()
              .replace(/[^\p{L}\p{N}]+/gu, "-")
              .replace(/^-|-$/g, ""),
          body.description || "",
          body.image_url || "",
          Number(body.price || 0),
          body.old_price === null ||
          body.old_price === undefined ||
          body.old_price === ""
            ? null
            : Number(body.old_price),
          body.active === false || Number(body.active) === 0 ? 0 : 1,
          body.is_new ? 1 : 0,
          Number(body.sort_order || 0),
          timestamp,
          id
        ]
      });
    } else {
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
            old_price,
            active,
            is_new,
            sort_order,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          id,
          body.category_id || null,
          productName,
          normalize(body.slug) ||
            productName
              .toLowerCase()
              .replace(/[^\p{L}\p{N}]+/gu, "-")
              .replace(/^-|-$/g, ""),
          body.description || "",
          body.image_url || "",
          Number(body.price || 0),
          body.old_price === null ||
          body.old_price === undefined ||
          body.old_price === ""
            ? null
            : Number(body.old_price),
          body.active === false || Number(body.active) === 0 ? 0 : 1,
          body.is_new ? 1 : 0,
          Number(body.sort_order || 0),
          timestamp,
          timestamp
        ]
      });
    }

    res.json({
      ok: true,
      product_id: id
    });
  } catch (error) {
    console.error("Admin product save error:", error);

    res.status(500).json({
      ok: false,
      error: error.message || "Failed to save product"
    });
  }
});

app.delete(
  "/api/admin/products/:id",
  requireAdmin,
  async (req, res) => {
    try {
      await db.batch(
        [
          {
            sql: `
              DELETE FROM product_variants
              WHERE product_id = ?
            `,
            args: [req.params.id]
          },
          {
            sql: `
              DELETE FROM images
              WHERE product_id = ?
            `,
            args: [req.params.id]
          },
          {
            sql: `
              DELETE FROM products
              WHERE id = ?
            `,
            args: [req.params.id]
          }
        ],
        "write"
      );

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        error: "Failed to delete product"
      });
    }
  }
);

/* =========================================================
   ADMIN CATEGORIES
========================================================= */

app.get("/api/admin/categories", requireAdmin, async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT *
      FROM categories
      ORDER BY sort_order ASC, name ASC
    `);

    res.json({
      ok: true,
      categories: result.rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Failed to load categories"
    });
  }
});

app.post("/api/admin/categories", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};

    const id = normalize(body.id) || randomId("cat");
    const name = normalize(body.name);

    if (!name) {
      return res.status(400).json({
        ok: false,
        error: "Category name is required"
      });
    }

    const slug =
      normalize(body.slug) ||
      name
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-|-$/g, "");

    const existing = await db.execute({
      sql: `
        SELECT id
        FROM categories
        WHERE id = ?
        LIMIT 1
      `,
      args: [id]
    });

    if (existing.rows.length) {
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
          Number(body.sort_order || 0),
          body.active === false ? 0 : 1,
          id
        ]
      });
    } else {
      await db.execute({
        sql: `
          INSERT INTO categories (
            id,
            name,
            slug,
            sort_order,
            active,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        args: [
          id,
          name,
          slug,
          Number(body.sort_order || 0),
          body.active === false ? 0 : 1,
          now()
        ]
      });
    }

    res.json({
      ok: true,
      category_id: id
    });
  } catch (error) {
    console.error("Admin category save error:", error);

    res.status(500).json({
      ok: false,
      error: error.message || "Failed to save category"
    });
  }
});

app.delete(
  "/api/admin/categories/:id",
  requireAdmin,
  async (req, res) => {
    try {
      await db.execute({
        sql: `
          UPDATE categories
          SET active = 0
          WHERE id = ?
        `,
        args: [req.params.id]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        error: "Failed to delete category"
      });
    }
  }
);

/* =========================================================
   ADMIN ORDERS
========================================================= */

app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT *
      FROM orders
      ORDER BY created_at DESC
      LIMIT 500
    `);

    res.json({
      ok: true,
      orders: result.rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Failed to load orders"
    });
  }
});

/* =========================================================
   ADMIN AI
========================================================= */

async function adminAI(message) {
  const catalog = await getCatalogForAI();

  const instructions = `
Ты — AI-помощник администратора магазина IRoom.

Отвечай на русском.

Тебе разрешены следующие действия:

1. update_price
Изменить цену товара.

2. make_new
Сделать товар новинкой.

3. activate_product
Активировать товар.

4. remove_product
Деактивировать товар.

5. create_promo
Создать промокод.

6. none
Если действие не требуется.

Всегда возвращай JSON:

{
  "message": "ответ администратору",
  "action": {
    "type": "none | update_price | make_new | activate_product | remove_product | create_promo",
    "product_id": "",
    "price": 0,
    "promo_code": "",
    "discount": 0
  }
}

Не придумывай ID товаров.

КАТАЛОГ:
${JSON.stringify(catalog)}
`;

  const data = await openAIResponse(message, instructions);

  const text = getOpenAIText(data);

  try {
    return JSON.parse(text);
  } catch {
    return {
      message: text || "Не удалось обработать команду.",
      action: {
        type: "none"
      }
    };
  }
}

app.post("/api/admin/ai/chat", requireAdmin, async (req, res) => {
  try {
    const message = normalize(req.body?.message);

    if (!message) {
      return res.status(400).json({
        ok: false,
        error: "Message is required"
      });
    }

    const result = await adminAI(message);

    const action = result?.action || {
      type: "none"
    };

    if (action.type === "update_price" && action.product_id) {
      await db.execute({
        sql: `
          UPDATE products
          SET
            price = ?,
            updated_at = ?
          WHERE id = ?
        `,
        args: [
          Number(action.price || 0),
          now(),
          action.product_id
        ]
      ]);
    }

    if (action.type === "make_new" && action.product_id) {
      await db.execute({
        sql: `
          UPDATE products
          SET
            is_new = 1,
            updated_at = ?
          WHERE id = ?
        `,
        args: [now(), action.product_id]
      });
    }

    if (
      action.type === "activate_product" &&
      action.product_id
    ) {
      await db.execute({
        sql: `
          UPDATE products
          SET
            active = 1,
            updated_at = ?
          WHERE id = ?
        `,
        args: [now(), action.product_id]
      });
    }

    if (
      action.type === "remove_product" &&
      action.product_id
    ) {
      await db.execute({
        sql: `
          UPDATE products
          SET
            active = 0,
            updated_at = ?
          WHERE id = ?
        `,
        args: [now(), action.product_id]
      });
    }

    if (
      action.type === "create_promo" &&
      action.promo_code
    ) {
      await db.execute({
        sql: `
          INSERT INTO promo_codes (
            id,
            code,
            discount_type,
            discount_value,
            active,
            used_count,
            created_at
          )
          VALUES (?, ?, 'percent', ?, 1, 0, ?)
          ON CONFLICT(code)
          DO UPDATE SET
            discount_value = excluded.discount_value,
            active = 1
        `,
        args: [
          randomId("promo"),
          String(action.promo_code).toUpperCase(),
          Number(action.discount || 0),
          now()
        ]
      });
    }

    res.json({
      ok: true,
      message:
        result?.message ||
        "Команда обработана.",
      action
    });
  } catch (error) {
    console.error("Admin AI chat error:", error);

    res.status(500).json({
      ok: false,
      error: error.message || "Admin AI failed"
    });
  }
});

/* =========================================================
   ADMIN PRICE LIST
========================================================= */

app.post(
  "/api/admin/ai/parse",
  requireAdmin,
  async (req, res) => {
    try {
      const text = normalize(req.body?.text);

      if (!text) {
        return res.status(400).json({
          ok: false,
          error: "Text is required"
        });
      }

      const instructions = `
Ты обрабатываешь прайс-лист магазина IRoom.

Из текста выдели товары.

Верни JSON строго такого вида:

{
  "products": [
    {
      "name": "",
      "price": 0,
      "category": "",
      "description": ""
    }
  ]
}

Цена должна быть числом без валюты.
Не придумывай отсутствующие данные.
`;

      const data = await openAIResponse(text, instructions);

      const answer = getOpenAIText(data);

      let parsed;

      try {
        parsed = JSON.parse(answer);
      } catch {
        return res.status(400).json({
          ok: false,
          error: "AI returned invalid JSON",
          raw: answer
        });
      }

      res.json({
        ok: true,
        products: parsed.products || []
      });
    } catch (error) {
      console.error("AI parse error:", error);

      res.status(500).json({
        ok: false,
        error: error.message || "AI parse failed"
      });
    }
  }
);

app.post(
  "/api/admin/ai/import",
  requireAdmin,
  async (req, res) => {
    try {
      const products = Array.isArray(req.body?.products)
        ? req.body.products
        : [];

      let imported = 0;

      for (const item of products) {
        const name = normalize(item.name);

        if (!name) continue;

        const categoryName = normalize(item.category);

        let categoryId = null;

        if (categoryName) {
          const category = await db.execute({
            sql: `
              SELECT id
              FROM categories
              WHERE LOWER(name) = LOWER(?)
                 OR LOWER(slug) = LOWER(?)
              LIMIT 1
            `,
            args: [
              categoryName,
              categoryName
                .toLowerCase()
                .replace(/[^\p{L}\p{N}]+/gu, "-")
            ]
          });

          if (category.rows.length) {
            categoryId = category.rows[0].id;
          }
        }

        if (!categoryId) {
          const other = await db.execute({
            sql: `
              SELECT id
              FROM categories
              WHERE slug = 'other'
              LIMIT 1
            `
          });

          categoryId =
            other.rows[0]?.id || null;
        }

        const slug =
          name
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, "-")
            .replace(/^-|-$/g, "") +
          "-" +
          crypto.randomBytes(3).toString("hex");

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
            VALUES (?, ?, ?, ?, ?, '', ?, 1, 0, 0, ?, ?)
          `,
          args: [
            randomId("prod"),
            categoryId,
            name,
            slug,
            normalize(item.description),
            Number(item.price || 0),
            now(),
            now()
          ]
        });

        imported++;
      }

      res.json({
        ok: true,
        imported
      });
    } catch (error) {
      console.error("AI import error:", error);

      res.status(500).json({
        ok: false,
        error: error.message || "Import failed"
      });
    }
  }
);

/* =========================================================
   TELEGRAM BOT
========================================================= */

let telegramOffset = 0;
let telegramPolling = false;

async function handleTelegramUpdate(update) {
  const message = update?.message;

  if (!message) return;

  const chatId = message.chat?.id;

  if (!chatId) return;

  const text = normalize(message.text);

  if (text.startsWith("/start")) {
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text:
        "🍎 <b>IRoom</b>\n\nОткройте магазин через кнопку ниже.",
      parse_mode: "HTML",
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

  if (text === "/help") {
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text:
        "<b>IRoom</b>\n\n" +
        "/start — открыть магазин\n" +
        "/help — помощь\n" +
        "/ai — AI-помощник",
      parse_mode: "HTML"
    });

    return;
  }

  if (text.startsWith("/ai")) {
    if (!ADMIN_IDS.has(String(chatId))) {
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: "Эта команда доступна только администраторам."
      });

      return;
    }

    const command = text.replace(/^\/ai\s*/i, "").trim();

    if (!command) {
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: "Напишите команду после /ai."
      });

      return;
    }

    try {
      const result = await adminAI(command);

      await telegramApi("sendMessage", {
        chat_id: chatId,
        text:
          result?.message ||
          "Команда обработана.",
        parse_mode: "HTML"
      });
    } catch (error) {
      console.error("Telegram AI error:", error);

      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: "Не удалось обработать AI-команду."
      });
    }

    return;
  }

  /*
    Admin free-form AI commands.
  */

  if (ADMIN_IDS.has(String(chatId)) && text) {
    try {
      const result = await adminAI(text);

      const action = result?.action || {
        type: "none"
      };

      if (
        action.type === "update_price" &&
        action.product_id
      ) {
        await db.execute({
          sql: `
            UPDATE products
            SET price = ?, updated_at = ?
            WHERE id = ?
          `,
          args: [
            Number(action.price || 0),
            now(),
            action.product_id
          ]
        });
      }

      if (
        action.type === "make_new" &&
        action.product_id
      ) {
        await db.execute({
          sql: `
            UPDATE products
            SET is_new = 1, updated_at = ?
            WHERE id = ?
          `,
          args: [now(), action.product_id]
        });
      }

      if (
        action.type === "activate_product" &&
        action.product_id
      ) {
        await db.execute({
          sql: `
            UPDATE products
            SET active = 1, updated_at = ?
            WHERE id = ?
          `,
          args: [now(), action.product_id]
        });
      }

      if (
        action.type === "remove_product" &&
        action.product_id
      ) {
        await db.execute({
          sql: `
            UPDATE products
            SET active = 0, updated_at = ?
            WHERE id = ?
          `,
          args: [now(), action.product_id]
        });
      }

      await telegramApi("sendMessage", {
        chat_id: chatId,
        text:
          result?.message ||
          "Готово.",
        parse_mode: "HTML"
      });
    } catch (error) {
      console.error("Admin Telegram AI error:", error);

      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: "Не удалось обработать команду."
      });
    }
  }
}

async function pollTelegram() {
  if (!BOT_TOKEN || telegramPolling) {
    return;
  }

  telegramPolling = true;

  try {
    while (true) {
      try {
        const updates = await telegramApi("getUpdates", {
          offset: telegramOffset,
          timeout: 25,
          allowed_updates: ["message"]
        });

        for (const update of updates || []) {
          telegramOffset = Number(update.update_id) + 1;

          try {
            await handleTelegramUpdate(update);
          } catch (error) {
            console.error(
              "Telegram update error:",
              error
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
  } finally {
    telegramPolling = false;
  }
}

async function setupTelegramBot() {
  if (!BOT_TOKEN) {
    console.warn(
      "BOT_TOKEN is missing. Telegram bot polling disabled."
    );

    return;
  }

  try {
    await telegramApi("deleteWebhook", {
      drop_pending_updates: false
    });

    await telegramApi("setMyCommands", {
      commands: [
        {
          command: "start",
          description: "Открыть IRoom"
        },
        {
          command: "help",
          description: "Помощь"
        }
      ]
    });

    console.log("Telegram bot configured.");

    pollTelegram().catch((error) => {
      console.error("Telegram polling stopped:", error);
    });
  } catch (error) {
    console.error(
      "Telegram bot setup error:",
      error.message
    );
  }
}

/* =========================================================
   FRONTEND
========================================================= */

app.get("/admin", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "admin.html"));
});

app.use(express.static(PUBLIC_DIR));

app.use((req, res, next) => {
  if (
    req.method === "GET" &&
    !req.path.startsWith("/api/")
  ) {
    return res.sendFile(
      path.join(PUBLIC_DIR, "index.html")
    );
  }

  next();
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Not found"
  });
});

/* =========================================================
   START
========================================================= */

async function start() {
  try {
    await initDatabase();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(
        `IRoom server running on port ${PORT}`
      );

      console.log(
        `Mini App: ${MINIAPP_URL}`
      );

      console.log(
        `Admins: ${[...ADMIN_IDS].join(", ")}`
      );
    });

    await setupTelegramBot();
  } catch (error) {
    console.error(
      "Fatal startup error:",
      error
    );

    process.exit(1);
  }
}

start();