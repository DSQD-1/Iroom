import express from "express";
import crypto from "crypto";
import multer from "multer";
import { createClient } from "@libsql/client";

const app = express();

const PORT = Number(process.env.PORT || 10000);

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const ADMIN_ID = String(process.env.ADMIN_ID || "");
const MINIAPP_URL =
  process.env.MINIAPP_URL || "https://iroom-dww8.onrender.com";

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL || "";
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || "";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL =
  process.env.OPENAI_MODEL || "gpt-5.6-luna";

const SECOND_ADMIN_ID = "5975037118";

const ADMIN_IDS = new Set(
  [ADMIN_ID, SECOND_ADMIN_ID]
    .map((id) => String(id || "").trim())
    .filter(Boolean)
);

if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  console.warn("Turso environment variables are missing.");
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

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.use(express.static("public"));

/* =========================================================
   HELPERS
========================================================= */

function now() {
  return new Date().toISOString();
}

function normalize(value) {
  return String(value ?? "").trim();
}

function bool(value) {
  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true"
  );
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function json(res, status, data) {
  return res.status(status).json(data);
}

function randomId(prefix = "") {
  return prefix + crypto.randomBytes(12).toString("hex");
}

function formatPrice(value, currency = "RUB") {
  const amount = Number(value || 0);

  if (!Number.isFinite(amount)) {
    return "";
  }

  const symbols = {
    RUB: "₽",
    USD: "$",
    EUR: "€"
  };

  const symbol = symbols[currency] || currency || "";

  return `${new Intl.NumberFormat("ru-RU").format(amount)} ${symbol}`.trim();
}

/* =========================================================
   TELEGRAM INIT DATA
========================================================= */

function validateTelegramInitData(initData) {
  if (!BOT_TOKEN || !initData) {
    return null;
  }

  try {
    const params = new URLSearchParams(initData);

    const receivedHash = params.get("hash");

    if (!receivedHash) {
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

    const a = Buffer.from(calculatedHash, "hex");
    const b = Buffer.from(receivedHash, "hex");

    if (
      a.length !== b.length ||
      !crypto.timingSafeEqual(a, b)
    ) {
      return null;
    }

    const userRaw = params.get("user");

    if (!userRaw) {
      return null;
    }

    const user = JSON.parse(userRaw);

    return {
      user,
      authDate: Number(params.get("auth_date") || 0)
    };
  } catch {
    return null;
  }
}

function getInitData(req) {
  return (
    req.headers["x-telegram-init-data"] ||
    req.headers["x-telegram-web-app-init-data"] ||
    req.body?.initData ||
    ""
  );
}

function telegramUser(req) {
  const initData = getInitData(req);

  if (!initData) {
    return null;
  }

  const result = validateTelegramInitData(initData);

  return result?.user || null;
}

function requireTelegram(req, res, next) {
  const user = telegramUser(req);

  if (!user) {
    return json(res, 401, {
      ok: false,
      error: "Invalid Telegram Mini App authorization"
    });
  }

  req.telegramUser = user;

  next();
}

function isAdminUser(user) {
  if (!user?.id) {
    return false;
  }

  return ADMIN_IDS.has(String(user.id));
}

function requireAdmin(req, res, next) {
  const user = telegramUser(req);

  if (!user) {
    return json(res, 401, {
      ok: false,
      error: "Invalid Telegram Mini App authorization"
    });
  }

  if (!isAdminUser(user)) {
    return json(res, 403, {
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

async function initDatabase() {
  /*
   * Создаём новые таблицы, если их ещё нет.
   * Существующие таблицы НЕ удаляем.
   */

  await db.batch(
    [
      {
        sql: `
          CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            sort_order INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `
      },
      {
        sql: `
          CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category_id TEXT,
            description TEXT DEFAULT '',
            image_id TEXT,
            image_url TEXT DEFAULT '',
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
            id TEXT PRIMARY KEY,
            product_id TEXT NOT NULL,
            memory TEXT DEFAULT '',
            color TEXT DEFAULT '',
            country TEXT DEFAULT '',
            sim_type TEXT DEFAULT '',
            price REAL NOT NULL DEFAULT 0,
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
            id TEXT PRIMARY KEY,
            mime_type TEXT NOT NULL,
            data BLOB NOT NULL,
            created_at TEXT NOT NULL
          )
        `
      },
      {
        sql: `
          CREATE TABLE IF NOT EXISTS admins (
            id TEXT PRIMARY KEY,
            telegram_id TEXT NOT NULL UNIQUE,
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
            telegram_id TEXT,
            username TEXT DEFAULT '',
            customer_name TEXT DEFAULT '',
            product_id TEXT,
            variant_id TEXT,
            product_name TEXT NOT NULL,
            configuration TEXT DEFAULT '',
            price REAL DEFAULT 0,
            currency TEXT DEFAULT 'RUB',
            status TEXT DEFAULT 'new',
            created_at TEXT NOT NULL
          )
        `
      },
      {
        sql: `
          CREATE TABLE IF NOT EXISTS promo_codes (
            id TEXT PRIMARY KEY,
            code TEXT NOT NULL UNIQUE,
            discount_type TEXT DEFAULT 'percent',
            discount_value REAL DEFAULT 0,
            max_uses INTEGER DEFAULT 0,
            used_count INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
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

  /* =======================================================
     MIGRATION: ADMINS
  ======================================================= */

  const adminsInfo = await db.execute(`
    PRAGMA table_info(admins)
  `);

  const adminColumns = new Set(
    adminsInfo.rows.map((row) => String(row.name))
  );

  /*
   * Старая таблица admins могла выглядеть примерно так:
   *
   * telegram_id
   * created_at
   *
   * Новый код требует ещё id.
   *
   * Добавляем id без удаления существующих админов.
   */

  if (!adminColumns.has("id")) {
    console.log(
      "Migrating admins table: adding missing id column..."
    );

    await db.execute(`
      ALTER TABLE admins
      ADD COLUMN id TEXT
    `);

    const existingAdmins = await db.execute(`
      SELECT telegram_id
      FROM admins
      WHERE id IS NULL OR id = ''
    `);

    for (const admin of existingAdmins.rows) {
      const telegramId =
        String(admin.telegram_id || "").trim();

      if (!telegramId) {
        continue;
      }

      await db.execute({
        sql: `
          UPDATE admins
          SET id = ?
          WHERE telegram_id = ?
        `,
        args: [
          randomId("adm_"),
          telegramId
        ]
      });
    }

    console.log(
      "Admins table migration completed."
    );
  }

  /*
   * Добавляем всех администраторов из конфигурации.
   */

  for (const adminId of ADMIN_IDS) {
    const existingAdmin = await db.execute({
      sql: `
        SELECT telegram_id
        FROM admins
        WHERE telegram_id = ?
        LIMIT 1
      `,
      args: [adminId]
    });

    if (existingAdmin.rows[0]) {
      continue;
    }

    await db.execute({
      sql: `
        INSERT INTO admins (
          id,
          telegram_id,
          created_at
        )
        VALUES (?, ?, ?)
      `,
      args: [
        randomId("adm_"),
        adminId,
        now()
      ]
    });
  }

  /* =======================================================
     DEFAULT CATEGORIES
  ======================================================= */

  const defaultCategories = [
    ["iPhone", "iphone"],
    ["iPad", "ipad"],
    ["Mac", "mac"],
    ["Apple Watch", "apple-watch"],
    ["AirPods", "airpods"],
    ["Другое", "other"]
  ];

  for (let i = 0; i < defaultCategories.length; i++) {
    const [name, slug] = defaultCategories[i];

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
        ON CONFLICT(slug) DO NOTHING
      `,
      args: [
        randomId("cat_"),
        name,
        slug,
        i,
        now(),
        now()
      ]
    });
  }

  console.log(
    "Database initialization completed."
  );
}

/* =========================================================
   USER
========================================================= */

async function upsertUser(user) {
  if (!user?.id) {
    return;
  }

  await db.execute({
    sql: `
      INSERT INTO users (
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
   HEALTH
========================================================= */

app.get("/api/health", async (req, res) => {
  try {
    await db.execute("SELECT 1");

    return json(res, 200, {
      ok: true,
      app: "IRoom",
      version: "2.0.0",
      database: "connected",
      time: now()
    });
  } catch (error) {
    console.error("Health error:", error);

    return json(res, 500, {
      ok: false,
      app: "IRoom",
      database: "error"
    });
  }
});

/* =========================================================
   CATEGORIES
========================================================= */

app.get("/api/categories", async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT
        id,
        name,
        slug,
        sort_order,
        active
      FROM categories
      WHERE active = 1
      ORDER BY sort_order ASC, name ASC
    `);

    return json(res, 200, {
      ok: true,
      categories: result.rows
    });
  } catch (error) {
    console.error("Categories error:", error);

    return json(res, 500, {
      ok: false,
      error: "Failed to load categories"
    });
  }
});

/* =========================================================
   PRODUCT MAPPER
========================================================= */

function mapVariant(row) {
  return {
    id: row.id,
    product_id: row.product_id,
    memory: row.memory || "",
    color: row.color || "",
    country: row.country || "",
    sim_type: row.sim_type || "",
    price: Number(row.price || 0),
    currency: row.currency || "RUB",
    stock: Number(row.stock || 0),
    active: bool(row.active),
    price_formatted: formatPrice(
      row.price,
      row.currency || "RUB"
    )
  };
}

function mapProduct(row, variants = []) {
  return {
    id: row.id,
    name: row.name,
    category_id: row.category_id || "",
    category_name: row.category_name || "",
    category_slug: row.category_slug || "",
    description: row.description || "",
    image_id: row.image_id || "",
    image_url: row.image_url || "",
    is_new: bool(row.is_new),
    active: bool(row.active),
    variants
  };
}

async function getVariantsForProduct(
  productId,
  onlyActive = false
) {
  const result = await db.execute({
    sql: `
      SELECT
        id,
        product_id,
        memory,
        color,
        country,
        sim_type,
        price,
        currency,
        stock,
        active
      FROM product_variants
      WHERE product_id = ?
      ${onlyActive ? "AND active = 1" : ""}
      ORDER BY price ASC
    `,
    args: [productId]
  });

  return result.rows.map(mapVariant);
}

/* =========================================================
   PRODUCTS
========================================================= */

app.get("/api/products", async (req, res) => {
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
      ORDER BY p.created_at DESC
    `);

    const products = [];

    for (const row of result.rows) {
      const variants =
        await getVariantsForProduct(
          row.id,
          true
        );

      products.push(
        mapProduct(row, variants)
      );
    }

    return json(res, 200, {
      ok: true,
      products
    });
  } catch (error) {
    console.error("Products error:", error);

    return json(res, 500, {
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
      WHERE
        p.active = 1
        AND p.is_new = 1
      ORDER BY p.created_at DESC
    `);

    const products = [];

    for (const row of result.rows) {
      const variants =
        await getVariantsForProduct(
          row.id,
          true
        );

      products.push(
        mapProduct(row, variants)
      );
    }

    return json(res, 200, {
      ok: true,
      products
    });
  } catch (error) {
    console.error(
      "New products error:",
      error
    );

    return json(res, 500, {
      ok: false,
      error: "Failed to load new products"
    });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const result = await db.execute({
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

    const row = result.rows[0];

    if (!row) {
      return json(res, 404, {
        ok: false,
        error: "Product not found"
      });
    }

    const variants =
      await getVariantsForProduct(
        row.id,
        true
      );

    return json(res, 200, {
      ok: true,
      product: mapProduct(
        row,
        variants
      )
    });
  } catch (error) {
    console.error(
      "Product error:",
      error
    );

    return json(res, 500, {
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
      ORDER BY key
    `);

    const settings = {};

    for (const row of result.rows) {
      settings[row.key] = row.value;
    }

    return json(res, 200, {
      ok: true,
      settings
    });
  } catch (error) {
    console.error(
      "Settings error:",
      error
    );

    return json(res, 500, {
      ok: false,
      error: "Failed to load settings"
    });
  }
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
      args: [req.params.id]
    });

    const image = result.rows[0];

    if (!image) {
      return res.status(404).end();
    }

    res.setHeader(
      "Content-Type",
      image.mime_type
    );

    res.setHeader(
      "Cache-Control",
      "public, max-age=31536000, immutable"
    );

    return res.send(
      Buffer.from(image.data)
    );
  } catch (error) {
    console.error(
      "Image error:",
      error
    );

    return res.status(500).end();
  }
});

/* =========================================================
   ORDERS
========================================================= */

app.post(
  "/api/orders",
  requireTelegram,
  async (req, res) => {
    try {
      const user = req.telegramUser;

      await upsertUser(user);

      const {
        product_id,
        variant_id,
        product_name,
        configuration,
        price,
        currency
      } = req.body || {};

      if (!product_name) {
        return json(res, 400, {
          ok: false,
          error: "Product name is required"
        });
      }

      const orderId =
        randomId("ord_");

      await db.execute({
        sql: `
          INSERT INTO orders (
            id,
            telegram_id,
            username,
            customer_name,
            product_id,
            variant_id,
            product_name,
            configuration,
            price,
            currency,
            status,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)
        `,
        args: [
          orderId,
          String(user.id),
          user.username || "",
          [
            user.first_name || "",
            user.last_name || ""
          ]
            .join(" ")
            .trim(),
          product_id || "",
          variant_id || "",
          product_name,
          configuration || "",
          num(price),
          currency || "RUB",
          now()
        ]
      });

      const message = [
        "🛍 Новый заказ IRoom",
        "",
        `Товар: ${product_name}`,
        configuration
          ? `Конфигурация: ${configuration}`
          : "",
        price
          ? `Цена: ${formatPrice(
              price,
              currency || "RUB"
            )}`
          : "",
        "",
        `Telegram ID: ${user.id}`,
        user.username
          ? `Username: @${user.username}`
          : "",
        `Имя: ${[
          user.first_name || "",
          user.last_name || ""
        ]
          .join(" ")
          .trim()}`,
        "",
        `ID заказа: ${orderId}`
      ]
        .filter(Boolean)
        .join("\n");

      await notifyAdmins(message);

      return json(res, 201, {
        ok: true,
        order: {
          id: orderId
        }
      });
    } catch (error) {
      console.error(
        "Order error:",
        error
      );

      return json(res, 500, {
        ok: false,
        error: "Failed to create order"
      });
    }
  }
);

/* =========================================================
   TELEGRAM
========================================================= */

async function telegramApi(method, body) {
  if (!BOT_TOKEN) {
    throw new Error(
      "BOT_TOKEN is not configured"
    );
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

  const data =
    await response.json();

  if (!data.ok) {
    throw new Error(
      data.description ||
      "Telegram API error"
    );
  }

  return data;
}

async function notifyAdmins(message) {
  for (const adminId of ADMIN_IDS) {
    try {
      await telegramApi(
        "sendMessage",
        {
          chat_id: adminId,
          text: message
        }
      );
    } catch (error) {
      console.error(
        `Failed to notify admin ${adminId}:`,
        error.message
      );
    }
  }
}

/* =========================================================
   CUSTOMER AI
========================================================= */

async function getCatalogForAI() {
  const productsResult =
    await db.execute(`
      SELECT
        p.id,
        p.name,
        p.description,
        p.is_new,
        c.name AS category_name
      FROM products p
      LEFT JOIN categories c
        ON c.id = p.category_id
      WHERE p.active = 1
      ORDER BY p.name ASC
    `);

  const catalog = [];

  for (
    const product of productsResult.rows
  ) {
    const variants =
      await getVariantsForProduct(
        product.id,
        true
      );

    catalog.push({
      id: product.id,
      name: product.name,
      category:
        product.category_name || "",
      description:
        product.description || "",
      is_new:
        bool(product.is_new),
      variants
    });
  }

  return catalog;
}

async function callOpenAI({
  system,
  user
}) {
  if (!OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not configured"
    );
  }

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        instructions: system,
        input: user
      })
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    console.error(
      "OpenAI error:",
      JSON.stringify(data)
    );

    throw new Error(
      data?.error?.message ||
      "OpenAI request failed"
    );
  }

  let text = "";

  if (
    typeof data.output_text ===
    "string"
  ) {
    text = data.output_text;
  } else if (
    Array.isArray(data.output)
  ) {
    for (
      const item of data.output
    ) {
      if (!Array.isArray(item.content)) {
        continue;
      }

      for (
        const content of item.content
      ) {
        if (
          content.type ===
            "output_text" &&
          typeof content.text ===
            "string"
        ) {
          text += content.text;
        }
      }
    }
  }

  return text.trim();
}

app.post(
  "/api/ai/chat",
  requireTelegram,
  async (req, res) => {
    try {
      await upsertUser(
        req.telegramUser
      );

      const message =
        normalize(
          req.body?.message
        );

      if (!message) {
        return json(res, 400, {
          ok: false,
          error:
            "Message is required"
        });
      }

      const catalog =
        await getCatalogForAI();

      const system = `
Ты — консультант магазина IRoom.

Отвечай только на русском языке.

Твоя задача — помогать покупателю выбрать технику Apple.

КРИТИЧЕСКОЕ ПРАВИЛО:
Используй только товары и варианты из переданного каталога.

Нельзя придумывать:
- товары;
- цены;
- цвета;
- память;
- страны;
- тип SIM;
- наличие;
- характеристики, которых нет в каталоге.

Если информации нет в каталоге — прямо скажи, что такой информации сейчас нет.

Если stock равен 0, не говори, что товар есть в наличии.

Если пользователь спрашивает цену, используй конкретную цену соответствующего варианта.

Если пользователь не указал параметры, предложи существующие варианты из каталога.

Будь кратким, понятным и полезным.

Каталог IRoom:

${JSON.stringify(
  catalog,
  null,
  2
)}
`;

      const answer =
        await callOpenAI({
          system,
          user: message
        });

      return json(res, 200, {
        ok: true,
        answer
      });
    } catch (error) {
      console.error(
        "Customer AI error:",
        error
      );

      return json(res, 500, {
        ok: false,
        error:
          error.message ||
          "AI temporarily unavailable"
      });
    }
  }
);

/* =========================================================
   ADMIN
========================================================= */

app.get(
  "/api/admin/me",
  requireAdmin,
  async (req, res) => {
    return json(res, 200, {
      ok: true,
      admin: {
        id: req.telegramUser.id,
        username:
          req.telegramUser.username ||
          "",
        first_name:
          req.telegramUser.first_name ||
          ""
      }
    });
  }
);

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
        return json(res, 400, {
          ok: false,
          error: "File is required"
        });
      }

      if (
        !req.file.mimetype.startsWith(
          "image/"
        )
      ) {
        return json(res, 400, {
          ok: false,
          error:
            "Only images are allowed"
        });
      }

      const imageId =
        randomId("img_");

      await db.execute({
        sql: `
          INSERT INTO images (
            id,
            mime_type,
            data,
            created_at
          )
          VALUES (?, ?, ?, ?)
        `,
        args: [
          imageId,
          req.file.mimetype,
          req.file.buffer,
          now()
        ]
      });

      return json(res, 201, {
        ok: true,
        id: imageId,
        url: `/api/images/${imageId}`,
        image_url:
          `/api/images/${imageId}`,
        imageUrl:
          `/api/images/${imageId}`
      });
    } catch (error) {
      console.error(
        "Upload error:",
        error
      );

      return json(res, 500, {
        ok: false,
        error:
          "Failed to upload image"
      });
    }
  }
);

/* =========================================================
   ADMIN PRODUCTS
========================================================= */

app.get(
  "/api/admin/products",
  requireAdmin,
  async (req, res) => {
    try {
      const result =
        await db.execute(`
          SELECT
            p.*,
            c.name AS category_name,
            c.slug AS category_slug
          FROM products p
          LEFT JOIN categories c
            ON c.id = p.category_id
          ORDER BY p.created_at DESC
        `);

      const products = [];

      for (
        const row of result.rows
      ) {
        const variants =
          await getVariantsForProduct(
            row.id
          );

        products.push(
          mapProduct(
            row,
            variants
          )
        );
      }

      return json(res, 200, {
        ok: true,
        products
      });
    } catch (error) {
      console.error(
        "Admin products error:",
        error
      );

      return json(res, 500, {
        ok: false,
        error:
          "Failed to load admin products"
      });
    }
  }
);

app.get(
  "/api/admin/products/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const result =
        await db.execute({
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
          args: [
            req.params.id
          ]
        });

      const row =
        result.rows[0];

      if (!row) {
        return json(res, 404, {
          ok: false,
          error:
            "Product not found"
        });
      }

      const variants =
        await getVariantsForProduct(
          row.id
        );

      return json(res, 200, {
        ok: true,
        product:
          mapProduct(
            row,
            variants
          )
      });
    } catch (error) {
      console.error(
        "Admin product error:",
        error
      );

      return json(res, 500, {
        ok: false,
        error:
          "Failed to load product"
      });
    }
  }
);

/* =========================================================
   PRODUCT SAVE
========================================================= */

function normalizeVariants(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((variant) => ({
      memory:
        normalize(
          variant.memory
        ),
      color:
        normalize(
          variant.color
        ),
      country:
        normalize(
          variant.country
        ),
      sim_type:
        normalize(
          variant.sim_type
        ),
      price:
        num(variant.price),
      currency:
        normalize(
          variant.currency
        ) || "RUB",
      stock:
        Math.max(
          0,
          Math.floor(
            num(variant.stock)
          )
        ),
      active:
        variant.active !== false &&
        variant.active !== 0 &&
        variant.active !== "0"
    }))
    .filter(
      (variant) =>
        variant.price >= 0
    );
}

async function saveProduct({
  productId,
  body
}) {
  const name =
    normalize(body.name);

  if (!name) {
    throw new Error(
      "Product name is required"
    );
  }

  const variants =
    normalizeVariants(
      body.variants
    );

  if (!variants.length) {
    throw new Error(
      "At least one variant is required"
    );
  }

  const id =
    productId ||
    randomId("prd_");

  const createdAt =
    now();

  const updatedAt =
    now();

  await db.execute({
    sql: `
      INSERT INTO products (
        id,
        name,
        category_id,
        description,
        image_id,
        image_url,
        is_new,
        active,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id)
      DO UPDATE SET
        name = excluded.name,
        category_id = excluded.category_id,
        description = excluded.description,
        image_id = excluded.image_id,
        image_url = excluded.image_url,
        is_new = excluded.is_new,
        active = excluded.active,
        updated_at = excluded.updated_at
    `,
    args: [
      id,
      name,
      normalize(
        body.category_id
      ),
      normalize(
        body.description
      ),
      normalize(
        body.image_id
      ),
      normalize(
        body.image_url
      ),
      body.is_new ? 1 : 0,
      body.active === false
        ? 0
        : 1,
      createdAt,
      updatedAt
    ]
  });

  await db.execute({
    sql: `
      DELETE FROM product_variants
      WHERE product_id = ?
    `,
    args: [id]
  });

  for (
    const variant of variants
  ) {
    await db.execute({
      sql: `
        INSERT INTO product_variants (
          id,
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        randomId("var_"),
        id,
        variant.memory,
        variant.color,
        variant.country,
        variant.sim_type,
        variant.price,
        variant.currency,
        variant.stock,
        variant.active
          ? 1
          : 0,
        createdAt,
        updatedAt
      ]
    });
  }

  return id;
}

app.post(
  "/api/admin/products",
  requireAdmin,
  async (req, res) => {
    try {
      const id =
        await saveProduct({
          body: req.body
        });

      return json(res, 201, {
        ok: true,
        id
      });
    } catch (error) {
      console.error(
        "Create product error:",
        error
      );

      return json(res, 400, {
        ok: false,
        error: error.message
      });
    }
  }
);

app.put(
  "/api/admin/products/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const id =
        await saveProduct({
          productId:
            req.params.id,
          body: req.body
        });

      return json(res, 200, {
        ok: true,
        id
      });
    } catch (error) {
      console.error(
        "Update product error:",
        error
      );

      return json(res, 400, {
        ok: false,
        error: error.message
      });
    }
  }
);

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
            args: [
              req.params.id
            ]
          },
          {
            sql: `
              DELETE FROM products
              WHERE id = ?
            `,
            args: [
              req.params.id
            ]
          }
        ],
        "write"
      );

      return json(res, 200, {
        ok: true
      });
    } catch (error) {
      console.error(
        "Delete product error:",
        error
      );

      return json(res, 500, {
        ok: false,
        error:
          "Failed to delete product"
      });
    }
  }
);

/* =========================================================
   ADMIN CATEGORIES
========================================================= */

app.get(
  "/api/admin/categories",
  requireAdmin,
  async (req, res) => {
    try {
      const result =
        await db.execute(`
          SELECT
            id,
            name,
            slug,
            sort_order,
            active,
            created_at,
            updated_at
          FROM categories
          ORDER BY
            sort_order ASC,
            name ASC
        `);

      return json(res, 200, {
        ok: true,
        categories:
          result.rows
      });
    } catch (error) {
      console.error(
        "Admin categories error:",
        error
      );

      return json(res, 500, {
        ok: false,
        error:
          "Failed to load categories"
      });
    }
  }
);

app.post(
  "/api/admin/categories",
  requireAdmin,
  async (req, res) => {
    try {
      const name =
        normalize(
          req.body?.name
        );

      let slug =
        normalize(
          req.body?.slug
        );

      if (!name) {
        return json(res, 400, {
          ok: false,
          error:
            "Category name is required"
        });
      }

      if (!slug) {
        slug =
          name
            .toLowerCase()
            .replace(
              /[^a-zа-яё0-9]+/gi,
              "-"
            )
            .replace(
              /^-+|-+$/g,
              ""
            );
      }

      const id =
        randomId("cat_");

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
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          id,
          name,
          slug,
          Math.floor(
            num(
              req.body?.sort_order
            )
          ),
          req.body?.active === false
            ? 0
            : 1,
          now(),
          now()
        ]
      });

      return json(res, 201, {
        ok: true,
        id
      });
    } catch (error) {
      console.error(
        "Create category error:",
        error
      );

      return json(res, 400, {
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
      const name =
        normalize(
          req.body?.name
        );

      const slug =
        normalize(
          req.body?.slug
        );

      if (!name || !slug) {
        return json(res, 400, {
          ok: false,
          error:
            "Category name and slug are required"
        });
      }

      await db.execute({
        sql: `
          UPDATE categories
          SET
            name = ?,
            slug = ?,
            sort_order = ?,
            active = ?,
            updated_at = ?
          WHERE id = ?
        `,
        args: [
          name,
          slug,
          Math.floor(
            num(
              req.body?.sort_order
            )
          ),
          req.body?.active === false
            ? 0
            : 1,
          now(),
          req.params.id
        ]
      });

      return json(res, 200, {
        ok: true
      });
    } catch (error) {
      console.error(
        "Update category error:",
        error
      );

      return json(res, 400, {
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
      await db.execute({
        sql: `
          DELETE FROM categories
          WHERE id = ?
        `,
        args: [
          req.params.id
        ]
      });

      return json(res, 200, {
        ok: true
      });
    } catch (error) {
      console.error(
        "Delete category error:",
        error
      );

      return json(res, 500, {
        ok: false,
        error:
          "Failed to delete category"
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
      const result =
        await db.execute(`
          SELECT *
          FROM orders
          ORDER BY created_at DESC
          LIMIT 500
        `);

      const orders =
        result.rows.map(
          (row) => ({
            ...row,
            price:
              Number(
                row.price || 0
              ),
            price_formatted:
              formatPrice(
                row.price,
                row.currency ||
                  "RUB"
              )
          })
        );

      return json(res, 200, {
        ok: true,
        orders
      });
    } catch (error) {
      console.error(
        "Admin orders error:",
        error
      );

      return json(res, 500, {
        ok: false,
        error:
          "Failed to load orders"
      });
    }
  }
);

/* =========================================================
   AI PRICE LIST PARSER
========================================================= */

const priceListSchema = {
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
          active: {
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
                  type: "number"
                },
                currency: {
                  type: "string"
                },
                stock: {
                  type: "integer"
                },
                active: {
                  type: "boolean"
                }
              },
              required: [
                "memory",
                "color",
                "country",
                "sim_type",
                "price",
                "currency",
                "stock",
                "active"
              ]
            }
          }
        },
        required: [
          "name",
          "category",
          "description",
          "is_new",
          "active",
          "variants"
        ]
      }
    }
  },
  required: [
    "products"
  ]
};

async function parsePriceListWithAI(text) {
  if (!OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not configured"
    );
  }

  const response =
    await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Authorization:
            `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,

          instructions: `
Ты парсер прайс-листов магазина IRoom.

Преобразуй переданный текст в строгий JSON.

Нельзя придумывать данные.

Если значение неизвестно:
- строка = ""
- stock = 0
- active = true

Валюта по умолчанию:
RUB

Каждый отдельный набор:
память + цвет + страна + SIM + цена
должен стать отдельным variant.

Если в тексте один товар имеет несколько конфигураций,
создай один product и несколько variants.

Категорию определи по названию товара,
но не придумывай новую категорию,
если она явно не указана.

Ответ должен соответствовать JSON Schema.
`,

          input: text,

          text: {
            format: {
              type: "json_schema",
              name:
                "iroom_price_list",
              strict: true,
              schema:
                priceListSchema
            }
          }
        })
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    console.error(
      "OpenAI parser error:",
      JSON.stringify(data)
    );

    throw new Error(
      data?.error?.message ||
      "Price list parsing failed"
    );
  }

  let output = "";

  if (
    typeof data.output_text ===
    "string"
  ) {
    output =
      data.output_text;
  }

  if (
    !output &&
    Array.isArray(data.output)
  ) {
    for (
      const item of data.output
    ) {
      if (
        !Array.isArray(
          item.content
        )
      ) {
        continue;
      }

      for (
        const content of
          item.content
      ) {
        if (
          content.type ===
            "output_text" &&
          content.text
        ) {
          output +=
            content.text;
        }
      }
    }
  }

  if (!output) {
    throw new Error(
      "AI returned empty result"
    );
  }

  return JSON.parse(output);
}

app.post(
  "/api/admin/ai/parse",
  requireAdmin,
  async (req, res) => {
    try {
      const text =
        normalize(
          req.body?.text
        );

      if (!text) {
        return json(res, 400, {
          ok: false,
          error:
            "Price list text is required"
        });
      }

      const parsed =
        await parsePriceListWithAI(
          text
        );

      return json(res, 200, {
        ok: true,
        ...parsed
      });
    } catch (error) {
      console.error(
        "Price list parse error:",
        error
      );

      return json(res, 500, {
        ok: false,
        error:
          error.message ||
          "Failed to parse price list"
      });
    }
  }
);

/* =========================================================
   ADMIN AI IMPORT
========================================================= */

async function findOrCreateCategory(
  name
) {
  const categoryName =
    normalize(name) ||
    "Другое";

  const existing =
    await db.execute({
      sql: `
        SELECT id
        FROM categories
        WHERE lower(name) = lower(?)
        LIMIT 1
      `,
      args: [
        categoryName
      ]
    });

  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const slug =
    categoryName
      .toLowerCase()
      .replace(
        /[^a-zа-яё0-9]+/gi,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      ) ||
    `category-${Date.now()}`;

  const id =
    randomId("cat_");

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
      VALUES (?, ?, ?, 0, 1, ?, ?)
    `,
    args: [
      id,
      categoryName,
      slug,
      now(),
      now()
    ]
  });

  return id;
}

app.post(
  "/api/admin/ai/import",
  requireAdmin,
  async (req, res) => {
    try {
      const products =
        Array.isArray(
          req.body?.products
        )
          ? req.body.products
          : [];

      if (!products.length) {
        return json(res, 400, {
          ok: false,
          error:
            "No products to import"
        });
      }

      const imported = [];

      for (
        const product of products
      ) {
        const categoryId =
          await findOrCreateCategory(
            product.category
          );

        const id =
          await saveProduct({
            body: {
              name:
                product.name,
              category_id:
                categoryId,
              description:
                product.description ||
                "",
              image_id: "",
              image_url: "",
              is_new:
                product.is_new ===
                true,
              active:
                product.active !==
                false,
              variants:
                product.variants ||
                []
            }
          });

        imported.push(id);
      }

      return json(res, 200, {
        ok: true,
        imported:
          imported.length,
        ids: imported
      });
    } catch (error) {
      console.error(
        "AI import error:",
        error
      );

      return json(res, 500, {
        ok: false,
        error:
          error.message ||
          "Failed to import products"
      });
    }
  }
);

/* =========================================================
   ADMIN AI CHAT
========================================================= */

async function getAdminCatalog() {
  const result =
    await db.execute(`
      SELECT
        p.id,
        p.name,
        p.description,
        p.is_new,
        p.active,
        c.name AS category_name
      FROM products p
      LEFT JOIN categories c
        ON c.id = p.category_id
      ORDER BY p.name ASC
    `);

  const products = [];

  for (
    const row of result.rows
  ) {
    const variants =
      await getVariantsForProduct(
        row.id
      );

    products.push({
      id: row.id,
      name: row.name,
      description:
        row.description || "",
      category:
        row.category_name ||
        "",
      is_new:
        bool(row.is_new),
      active:
        bool(row.active),
      variants
    });
  }

  return products;
}

async function executeAdminAIAction(
  action
) {
  if (
    !action ||
    typeof action !== "object"
  ) {
    return {
      message:
        "Не удалось определить действие."
    };
  }

  switch (action.type) {
    case "update_price": {
      const productId =
        normalize(
          action.product_id
        );

      const variantId =
        normalize(
          action.variant_id
        );

      const price =
        num(action.price);

      if (
        !productId ||
        !variantId
      ) {
        return {
          message:
            "Не указан товар или вариант."
        };
      }

      await db.execute({
        sql: `
          UPDATE product_variants
          SET
            price = ?,
            updated_at = ?
          WHERE
            id = ?
            AND product_id = ?
        `,
        args: [
          price,
          now(),
          variantId,
          productId
        ]
      });

      return {
        message:
          `Цена изменена на ${formatPrice(
            price,
            action.currency ||
              "RUB"
          )}.`
      };
    }

    case "make_new": {
      const productId =
        normalize(
          action.product_id
        );

      if (!productId) {
        return {
          message:
            "Не указан товар."
        };
      }

      await db.execute({
        sql: `
          UPDATE products
          SET
            is_new = ?,
            updated_at = ?
          WHERE id = ?
        `,
        args: [
          action.value === false
            ? 0
            : 1,
          now(),
          productId
        ]
      });

      return {
        message:
          action.value === false
            ? "Товар убран из новинок."
            : "Товар добавлен в новинки."
      };
    }

    case "activate_product": {
      const productId =
        normalize(
          action.product_id
        );

      if (!productId) {
        return {
          message:
            "Не указан товар."
        };
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
          action.value === false
            ? 0
            : 1,
          now(),
          productId
        ]
      });

      return {
        message:
          action.value === false
            ? "Товар деактивирован."
            : "Товар активирован."
      };
    }

    case "remove_product": {
      const productId =
        normalize(
          action.product_id
        );

      if (!productId) {
        return {
          message:
            "Не указан товар."
        };
      }

      await db.batch(
        [
          {
            sql: `
              DELETE FROM product_variants
              WHERE product_id = ?
            `,
            args: [
              productId
            ]
          },
          {
            sql: `
              DELETE FROM products
              WHERE id = ?
            `,
            args: [
              productId
            ]
          }
        ],
        "write"
      );

      return {
        message:
          "Товар удалён."
      };
    }

    case "create_promo": {
      const code =
        normalize(
          action.code
        ).toUpperCase();

      if (!code) {
        return {
          message:
            "Не указан промокод."
        };
      }

      const id =
        randomId("promo_");

      await db.execute({
        sql: `
          INSERT INTO promo_codes (
            id,
            code,
            discount_type,
            discount_value,
            max_uses,
            used_count,
            active,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?)
        `,
        args: [
          id,
          code,
          action.discount_type ||
            "percent",
          num(
            action.discount_value
          ),
          Math.max(
            0,
            Math.floor(
              num(
                action.max_uses
              )
            )
          ),
          now(),
          now()
        ]
      });

      return {
        message:
          `Промокод ${code} создан.`
      };
    }

    default:
      return {
        message:
          "Действие не поддерживается."
      };
  }
}

app.post(
  "/api/admin/ai/chat",
  requireAdmin,
  async (req, res) => {
    try {
      const message =
        normalize(
          req.body?.message
        );

      if (!message) {
        return json(res, 400, {
          ok: false,
          error:
            "Message is required"
        });
      }

      const catalog =
        await getAdminCatalog();

      const ordersResult =
        await db.execute(`
          SELECT
            id,
            product_name,
            configuration,
            price,
            currency,
            status,
            created_at
          FROM orders
          ORDER BY created_at DESC
          LIMIT 30
        `);

      const system = `
Ты — AI-администратор магазина IRoom.

Администратор пишет тебе обычным русским языком.

Ты должен:
- помогать управлять товарами;
- менять цены;
- делать товары новинками;
- активировать/деактивировать товары;
- удалять товары;
- создавать промокоды;
- показывать информацию о заказах;
- объяснять состояние каталога.

У тебя есть реальный каталог и реальные заказы.

НЕ ПРИДУМЫВАЙ ID товаров или вариантов.
Используй только существующие ID.

Если администратор просит выполнить действие,
верни JSON:

{
  "message": "короткий ответ",
  "action": {
    "type": "..."
  }
}

Если действие не требуется:

{
  "message": "ответ",
  "action": null
}

Допустимые действия:

update_price:
{
  "type": "update_price",
  "product_id": "...",
  "variant_id": "...",
  "price": 100000,
  "currency": "RUB"
}

make_new:
{
  "type": "make_new",
  "product_id": "...",
  "value": true
}

activate_product:
{
  "type": "activate_product",
  "product_id": "...",
  "value": true
}

remove_product:
{
  "type": "remove_product",
  "product_id": "..."
}

create_promo:
{
  "type": "create_promo",
  "code": "IR10",
  "discount_type": "percent",
  "discount_value": 10,
  "max_uses": 100
}

Каталог:

${JSON.stringify(
  catalog,
  null,
  2
)}

Последние заказы:

${JSON.stringify(
  ordersResult.rows,
  null,
  2
)}
`;

      const raw =
        await callOpenAI({
          system,
          user: message
        });

      let parsed;

      try {
        parsed =
          JSON.parse(raw);
      } catch {
        return json(res, 200, {
          ok: true,
          message: raw
        });
      }

      let actionResult = null;

      if (parsed.action) {
        actionResult =
          await executeAdminAIAction(
            parsed.action
          );
      }

      return json(res, 200, {
        ok: true,
        message:
          actionResult?.message ||
          parsed.message ||
          "Готово.",
        action:
          parsed.action || null
      });
    } catch (error) {
      console.error(
        "Admin AI error:",
        error
      );

      return json(res, 500, {
        ok: false,
        error:
          error.message ||
          "Admin AI unavailable"
      });
    }
  }
);

/* =========================================================
   TELEGRAM BOT
========================================================= */

async function setupTelegramBot() {
  if (!BOT_TOKEN) {
    console.warn(
      "BOT_TOKEN is not configured. Telegram bot disabled."
    );

    return;
  }

  try {
    await telegramApi(
      "deleteWebhook",
      {
        drop_pending_updates:
          false
      }
    );

    let offset = 0;

    console.log(
      "Telegram bot polling started."
    );

    async function poll() {
      try {
        const data =
          await telegramApi(
            "getUpdates",
            {
              offset,
              timeout: 25,
              allowed_updates: [
                "message"
              ]
            }
          );

        for (
          const update of
            data.result || []
        ) {
          offset =
            Math.max(
              offset,
              update.update_id + 1
            );

          await handleTelegramUpdate(
            update
          );
        }
      } catch (error) {
        console.error(
          "Telegram polling error:",
          error.message
        );
      }

      setImmediate(poll);
    }

    poll();
  } catch (error) {
    console.error(
      "Telegram setup error:",
      error
    );
  }
}

async function handleTelegramUpdate(
  update
) {
  const message =
    update.message;

  if (!message) {
    return;
  }

  const chatId =
    message.chat?.id;

  const text =
    normalize(message.text);

  if (!chatId) {
    return;
  }

  if (text === "/start") {
    await telegramApi(
      "sendMessage",
      {
        chat_id: chatId,
        text:
          "Добро пожаловать в IRoom.\n\nОткройте магазин:",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text:
                  "Открыть IRoom",
                web_app: {
                  url:
                    MINIAPP_URL
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
    await telegramApi(
      "sendMessage",
      {
        chat_id: chatId,
        text:
          "IRoom — магазин техники Apple.\n\nИспользуйте /start для открытия Mini App."
      }
    );

    return;
  }

  const senderId =
    String(
      message.from?.id || ""
    );

  const isAdmin =
    ADMIN_IDS.has(
      senderId
    );

  if (!isAdmin) {
    return;
  }

  if (text === "/ai") {
    await telegramApi(
      "sendMessage",
      {
        chat_id: chatId,
        text:
          "AI-режим активирован.\n\nНапишите команду обычным языком."
      }
    );

    return;
  }

  if (
    text.startsWith("/") ||
    !text
  ) {
    return;
  }

  try {
    const catalog =
      await getAdminCatalog();

    const system = `
Ты помощник администратора IRoom.

Нужно обработать команду администратора.

Каталог:

${JSON.stringify(
  catalog,
  null,
  2
)}

Верни JSON:

{
  "message": "ответ",
  "action": null
}

или с action в формате:
{
  "type": "update_price",
  "product_id": "...",
  "variant_id": "...",
  "price": 100000,
  "currency": "RUB"
}

либо:
{
  "type": "make_new",
  "product_id": "...",
  "value": true
}

либо:
{
  "type": "activate_product",
  "product_id": "...",
  "value": true
}

либо:
{
  "type": "remove_product",
  "product_id": "..."
}

либо:
{
  "type": "create_promo",
  "code": "IR10",
  "discount_type": "percent",
  "discount_value": 10,
  "max_uses": 100
}

Не придумывай ID.
`;

    const raw =
      await callOpenAI({
        system,
        user: text
      });

    let parsed;

    try {
      parsed =
        JSON.parse(raw);
    } catch {
      await telegramApi(
        "sendMessage",
        {
          chat_id: chatId,
          text: raw
        }
      );

      return;
    }

    let resultMessage =
      parsed.message ||
      "Готово.";

    if (parsed.action) {
      const result =
        await executeAdminAIAction(
          parsed.action
        );

      resultMessage =
        result.message;
    }

    await telegramApi(
      "sendMessage",
      {
        chat_id: chatId,
        text:
          resultMessage
      }
    );
  } catch (error) {
    await telegramApi(
      "sendMessage",
      {
        chat_id: chatId,
        text:
          `Ошибка: ${error.message}`
      }
    );
  }
}

/* =========================================================
   FRONTEND ROUTES
========================================================= */

app.get(
  "/admin",
  (req, res) => {
    res.sendFile(
      "admin.html",
      {
        root: "public"
      }
    );
  }
);

app.use(
  (req, res, next) => {
    if (
      req.method !== "GET" ||
      req.path.startsWith("/api/")
    ) {
      return next();
    }

    return res.sendFile(
      "index.html",
      {
        root: "public"
      }
    );
  }
);

/* =========================================================
   STARTUP
========================================================= */

async function start() {
  try {
    await initDatabase();

    app.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log(
          `IRoom server running on port ${PORT}`
        );

        console.log(
          `Mini App: ${MINIAPP_URL}`
        );

        console.log(
          `Admins: ${[
            ...ADMIN_IDS
          ].join(", ")}`
        );
      }
    );

    setupTelegramBot();
  } catch (error) {
    console.error(
      "Fatal startup error:",
      error
    );

    process.exit(1);
  }
}

start();