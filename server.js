const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { createClient } = require("@libsql/client");

const app = express();

const PORT = Number(process.env.PORT || 10000);

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const ADMIN_ID = String(process.env.ADMIN_ID || "");

const ADMIN_IDS = [
  "5082864281",
  "5975037118"
];

const MINIAPP_URL =
  process.env.MINIAPP_URL || "https://iroom-dww8.onrender.com";

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL || "";
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || "";

const db = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN
});

const publicDir = path.join(__dirname, "public");
const uploadsDir = path.join(publicDir, "uploads");

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use(express.static(publicDir));

/* =========================================================
   HELPERS
========================================================= */

function integerId(value) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return null;
  }

  return number;
}

function numberValue(value, fallback = 0) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return number;
}

function stringValue(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value);
}

function safeJsonParse(value, fallback = {}) {
  if (!value) {
    return fallback;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function formatPrice(value) {
  return `${numberValue(value).toLocaleString("ru-RU")} ₽`;
}

function orderDisplayId(id) {
  return `IR-${1000 + Number(id || 0)}`;
}

function escapeTelegramHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function customerName(user) {
  if (!user) {
    return "Покупатель";
  }

  const first = stringValue(user.first_name).trim();
  const last = stringValue(user.last_name).trim();

  return `${first} ${last}`.trim() || "Покупатель";
}

function customerUsername(user) {
  if (!user) {
    return "";
  }

  return stringValue(user.username).trim();
}

function isAdmin(userId) {
  if (!userId) {
    return false;
  }

  const id = String(userId);

  return ADMIN_IDS.includes(id) || (ADMIN_ID && ADMIN_ID === id);
}

function getTelegramInitData(req) {
  return (
    req.headers["x-telegram-init-data"] ||
    req.headers["x-telegram-webapp-data"] ||
    req.body?.initData ||
    ""
  );
}

function parseTelegramInitData(initData) {
  if (!initData) {
    return null;
  }

  try {
    const params = new URLSearchParams(initData);
    const rawUser = params.get("user");

    if (!rawUser) {
      return null;
    }

    return JSON.parse(rawUser);
  } catch {
    return null;
  }
}

function getTelegramUser(req) {
  return parseTelegramInitData(getTelegramInitData(req));
}

function getTelegramUserId(req) {
  const user = getTelegramUser(req);

  if (!user?.id) {
    return null;
  }

  return String(user.id);
}

function requireTelegram(req, res, next) {
  const user = getTelegramUser(req);

  if (!user?.id) {
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

  if (!user?.id) {
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

function orderStatusLabel(status) {
  const labels = {
    new: "Новый",
    confirmed: "Подтверждён",
    processing: "В обработке",
    ready: "Готов к выдаче",
    completed: "Завершён",
    cancelled: "Отменён"
  };

  return labels[status] || status || "Новый";
}

function reservationStatusLabel(status) {
  const labels = {
    not_required: "Не требуется",
    pending: "Ожидает проверки",
    confirmed: "Бронь подтверждена",
    rejected: "Бронь отклонена"
  };

  return labels[status] || status || "Не указано";
}

/* =========================================================
   PRICE OPTIONS
========================================================= */

const PRICE_OPTION_GROUPS = [
  "colors",
  "memories",
  "sims",
  "regions"
];

function normalizePriceOptionGroup(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const name = stringValue(item.name).trim();

      if (!name) {
        return null;
      }

      return {
        name,
        surcharge: numberValue(item.surcharge, 0)
      };
    })
    .filter(Boolean);
}

function normalizePriceOptions(value) {
  const source = safeJsonParse(value, {});

  const result = {};

  for (const group of PRICE_OPTION_GROUPS) {
    result[group] = normalizePriceOptionGroup(source[group]);
  }

  return result;
}

function hasPriceOptions(priceOptions) {
  return PRICE_OPTION_GROUPS.some(
    (group) => Array.isArray(priceOptions[group]) && priceOptions[group].length
  );
}

function calculatePriceWithOptions(product, selectedOptions) {
  const basePrice = numberValue(product.price, 0);

  const options = normalizePriceOptions(product.price_options);

  const selected = selectedOptions || {};

  let finalPrice = basePrice;

  const normalizedSelected = {};

  for (const group of PRICE_OPTION_GROUPS) {
    const groupOptions = options[group] || [];

    if (!groupOptions.length) {
      continue;
    }

    const selectedName = stringValue(selected[group]).trim();

    if (!selectedName) {
      throw new Error(`Не выбран параметр: ${group}`);
    }

    const found = groupOptions.find(
      (option) => option.name === selectedName
    );

    if (!found) {
      throw new Error(`Недопустимое значение параметра: ${selectedName}`);
    }

    finalPrice += numberValue(found.surcharge, 0);

    normalizedSelected[group] = found.name;
  }

  return {
    price: finalPrice,
    selectedOptions: normalizedSelected
  };
}

/* =========================================================
   DATABASE HELPERS
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

async function getColumns(tableName) {
  const result = await db.execute({
    sql: `PRAGMA table_info(${tableName})`
  });

  return result.rows.map((row) => String(row.name));
}

async function ensureColumn(tableName, columnName, definition) {
  const columns = await getColumns(tableName);

  if (columns.includes(columnName)) {
    return;
  }

  await db.execute({
    sql: `
      ALTER TABLE ${tableName}
      ADD COLUMN ${columnName} ${definition}
    `
  });
}

/* =========================================================
   MIGRATIONS
========================================================= */

async function runMigrations() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      image_url TEXT DEFAULT '',
      description TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      image_url TEXT DEFAULT '',
      description TEXT DEFAULT '',
      category_id INTEGER,
      price_options TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      name TEXT DEFAULT '',
      price REAL DEFAULT 0,
      stock INTEGER DEFAULT 0,
      color TEXT DEFAULT '',
      memory TEXT DEFAULT '',
      sim_type TEXT DEFAULT '',
      region TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_user_id TEXT DEFAULT '',
      product_id INTEGER,
      variant_id INTEGER,
      product_name TEXT DEFAULT '',
      variant_text TEXT DEFAULT '',
      selected_options TEXT DEFAULT '{}',
      price REAL DEFAULT 0,
      customer_name TEXT DEFAULT '',
      customer_username TEXT DEFAULT '',
      status TEXT DEFAULT 'new',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_user_id TEXT UNIQUE,
      first_name TEXT DEFAULT '',
      last_name TEXT DEFAULT '',
      username TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT ''
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS banners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT DEFAULT '',
      text TEXT DEFAULT '',
      button_text TEXT DEFAULT '',
      button_link TEXT DEFAULT '',
      product_id INTEGER,
      image_url TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS reservation_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_number TEXT DEFAULT '',
      recipient_name TEXT DEFAULT '',
      bank_name TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS pickup_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT DEFAULT '',
      address TEXT DEFAULT '',
      working_hours TEXT DEFAULT '',
      map_url TEXT DEFAULT '',
      video_url TEXT DEFAULT '',
      description TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS store_settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT '',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  /* Existing columns */

  await ensureColumn(
    "products",
    "price_options",
    `TEXT DEFAULT '{}'`
  );

  await ensureColumn(
    "categories",
    "image_url",
    `TEXT DEFAULT ''`
  );

  await ensureColumn(
    "categories",
    "description",
    `TEXT DEFAULT ''`
  );

  await ensureColumn(
    "categories",
    "sort_order",
    `INTEGER DEFAULT 0`
  );

  await ensureColumn(
    "orders",
    "selected_options",
    `TEXT DEFAULT '{}'`
  );

  await ensureColumn(
    "orders",
    "variant_text",
    `TEXT DEFAULT ''`
  );

  /* New order columns */

  await ensureColumn(
    "orders",
    "reservation_amount",
    `REAL DEFAULT 0`
  );

  await ensureColumn(
    "orders",
    "reservation_status",
    `TEXT DEFAULT 'not_required'`
  );

  await ensureColumn(
    "orders",
    "reservation_card_id",
    `INTEGER`
  );

  await ensureColumn(
    "orders",
    "fulfillment_type",
    `TEXT DEFAULT 'pickup'`
  );

  await ensureColumn(
    "orders",
    "pickup_point_id",
    `INTEGER`
  );

  await ensureColumn(
    "orders",
    "delivery_city",
    `TEXT DEFAULT ''`
  );

  await ensureColumn(
    "orders",
    "delivery_street",
    `TEXT DEFAULT ''`
  );

  await ensureColumn(
    "orders",
    "delivery_house",
    `TEXT DEFAULT ''`
  );

  await ensureColumn(
    "orders",
    "delivery_apartment",
    `TEXT DEFAULT ''`
  );

  await ensureColumn(
    "orders",
    "delivery_comment",
    `TEXT DEFAULT ''`
  );

  await ensureColumn(
    "orders",
    "customer_comment",
    `TEXT DEFAULT ''`
  );

  await ensureColumn(
    "orders",
    "reservation_paid_at",
    `TEXT`
  );

  await ensureColumn(
    "orders",
    "reservation_rejected_reason",
    `TEXT DEFAULT ''`
  );

  /* Defaults */

  await db.execute({
    sql: `
      INSERT OR IGNORE INTO store_settings
      (key, value)
      VALUES (?, ?)
    `,
    args: ["reservation_amount", "1000"]
  });

  await db.execute({
    sql: `
      INSERT OR IGNORE INTO store_settings
      (key, value)
      VALUES (?, ?)
    `,
    args: ["contact_username", "iroom_24"]
  });

  await db.execute({
    sql: `
      INSERT OR IGNORE INTO store_settings
      (key, value)
      VALUES (?, ?)
    `,
    args: ["channel_username", "iroom_market"]
  });

  await db.execute({
    sql: `
      INSERT OR IGNORE INTO store_settings
      (key, value)
      VALUES (?, ?)
    `,
    args: ["store_name", "IRoom"]
  });

  console.log("Database migrations completed");
}

/* =========================================================
   TELEGRAM
========================================================= */

async function telegram(method, body = {}) {
  if (!BOT_TOKEN) {
    console.warn("BOT_TOKEN is not configured");
    return null;
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

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    console.error("Telegram HTTP error:", response.status, data);
  }

  return data;
}

function buildOrderKeyboard(orderId) {
  return {
    inline_keyboard: [
      [
        {
          text: "Подтвердить заказ",
          callback_data: `order_status:${orderId}:confirmed`
        }
      ],
      [
        {
          text: "В обработке",
          callback_data: `order_status:${orderId}:processing`
        },
        {
          text: "Готов",
          callback_data: `order_status:${orderId}:ready`
        }
      ],
      [
        {
          text: "Завершён",
          callback_data: `order_status:${orderId}:completed`
        },
        {
          text: "Отменить",
          callback_data: `order_status:${orderId}:cancelled`
        }
      ]
    ]
  };
}

function buildReservationKeyboard(orderId) {
  return {
    inline_keyboard: [
      [
        {
          text: "Подтвердить бронь",
          callback_data: `reservation:${orderId}:confirmed`
        },
        {
          text: "Отклонить бронь",
          callback_data: `reservation:${orderId}:rejected`
        }
      ]
    ]
  };
}

async function notifyAdminsAboutOrder(order) {
  const admins = ADMIN_IDS.filter(Boolean);

  if (ADMIN_ID && !admins.includes(String(ADMIN_ID))) {
    admins.push(String(ADMIN_ID));
  }

  const selectedOptions = safeJsonParse(
    order.selected_options,
    {}
  );

  const optionsText = Object.entries(selectedOptions)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  let fulfillmentText = "";

  if (order.fulfillment_type === "delivery") {
    fulfillmentText =
      `Доставка\n` +
      `Город: ${order.delivery_city || "-"}\n` +
      `Улица: ${order.delivery_street || "-"}\n` +
      `Дом: ${order.delivery_house || "-"}\n` +
      `Квартира: ${order.delivery_apartment || "-"}\n` +
      `Комментарий: ${order.delivery_comment || "-"}`;
  } else {
    fulfillmentText =
      `Самовывоз\n` +
      `Точка: ${order.pickup_point_name || "-"}\n` +
      `Адрес: ${order.pickup_point_address || "-"}`;
  }

  const reservationText =
    Number(order.reservation_amount) > 0
      ? `Бронь: ${formatPrice(order.reservation_amount)}\n` +
        `Статус брони: ${reservationStatusLabel(order.reservation_status)}`
      : "Бронь: не требуется";

  const text =
    `<b>Новый заказ ${escapeTelegramHtml(orderDisplayId(order.id))}</b>\n\n` +
    `<b>Товар:</b> ${escapeTelegramHtml(order.product_name)}\n` +
    `<b>Вариант:</b> ${escapeTelegramHtml(order.variant_text || "-")}\n` +
    (optionsText
      ? `\n<b>Характеристики:</b>\n${escapeTelegramHtml(optionsText)}\n`
      : "\n") +
    `<b>Итоговая цена:</b> ${escapeTelegramHtml(formatPrice(order.price))}\n` +
    `${escapeTelegramHtml(reservationText)}\n\n` +
    `<b>Покупатель:</b> ${escapeTelegramHtml(order.customer_name)}\n` +
    `<b>Username:</b> ${escapeTelegramHtml(
      order.customer_username
        ? `@${order.customer_username}`
        : "-"
    )}\n` +
    `<b>Telegram ID:</b> ${escapeTelegramHtml(order.telegram_user_id)}\n\n` +
    `${escapeTelegramHtml(fulfillmentText)}\n\n` +
    `<b>Комментарий:</b> ${escapeTelegramHtml(
      order.customer_comment || "-"
    )}`;

  for (const adminId of admins) {
    try {
      await telegram("sendMessage", {
        chat_id: adminId,
        text,
        parse_mode: "HTML",
        reply_markup: buildOrderKeyboard(order.id)
      });

      if (Number(order.reservation_amount) > 0) {
        await telegram("sendMessage", {
          chat_id: adminId,
          text:
            `<b>Проверка брони ${escapeTelegramHtml(
              orderDisplayId(order.id)
            )}</b>\n\n` +
            `Сумма брони: <b>${escapeTelegramHtml(
              formatPrice(order.reservation_amount)
            )}</b>\n` +
            `Статус: ${escapeTelegramHtml(
              reservationStatusLabel(order.reservation_status)
            )}`,
          parse_mode: "HTML",
          reply_markup: buildReservationKeyboard(order.id)
        });
      }
    } catch (error) {
      console.error("Admin notification error:", error);
    }
  }
}

async function notifyCustomerOrderStatus(order) {
  if (!order.telegram_user_id) {
    return;
  }

  const text =
    `<b>Заказ ${escapeTelegramHtml(
      orderDisplayId(order.id)
    )}</b>\n\n` +
    `Статус: <b>${escapeTelegramHtml(
      orderStatusLabel(order.status)
    )}</b>\n\n` +
    `${escapeTelegramHtml(order.product_name)}\n` +
    `Сумма: ${escapeTelegramHtml(formatPrice(order.price))}`;

  try {
    await telegram("sendMessage", {
      chat_id: order.telegram_user_id,
      text,
      parse_mode: "HTML"
    });
  } catch (error) {
    console.error("Customer notification error:", error);
  }
}

async function notifyCustomerReservation(order) {
  if (!order.telegram_user_id) {
    return;
  }

  let text = "";

  if (order.reservation_status === "confirmed") {
    text =
      `<b>Бронь подтверждена</b>\n\n` +
      `Заказ: ${escapeTelegramHtml(orderDisplayId(order.id))}\n` +
      `Товар: ${escapeTelegramHtml(order.product_name)}\n` +
      `Сумма брони: ${escapeTelegramHtml(
        formatPrice(order.reservation_amount)
      )}`;
  } else if (order.reservation_status === "rejected") {
    text =
      `<b>Бронь отклонена</b>\n\n` +
      `Заказ: ${escapeTelegramHtml(orderDisplayId(order.id))}\n` +
      `Если вы считаете, что это ошибка, свяжитесь с менеджером.`;
  } else {
    return;
  }

  try {
    await telegram("sendMessage", {
      chat_id: order.telegram_user_id,
      text,
      parse_mode: "HTML"
    });
  } catch (error) {
    console.error("Reservation notification error:", error);
  }
}

/* =========================================================
   UPLOADS
========================================================= */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase();

    const safeExtension =
      extension && extension.length <= 10
        ? extension
        : "";

    const filename =
      `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}${safeExtension}`;

    cb(null, filename);
  }
});

const upload = multer({
  storage,

  limits: {
    fileSize: 100 * 1024 * 1024
  }
});

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

      const url = `/uploads/${req.file.filename}`;

      res.json({
        ok: true,
        url,
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size
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
   HEALTH
========================================================= */

app.get("/health", async (req, res) => {
  try {
    await db.execute("SELECT 1");

    res.json({
      ok: true,
      app: "IRoom",
      database: true,
      version: "2.0.0"
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

/* =========================================================
   PUBLIC CATEGORIES
========================================================= */

app.get("/api/categories", async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT
        id,
        name,
        image_url,
        description,
        sort_order
      FROM categories
      ORDER BY sort_order ASC, id ASC
    `);

    res.json({
      ok: true,
      categories: result.rows
    });
  } catch (error) {
    console.error("Categories error:", error);

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
    const result = await db.execute(`
      SELECT
        p.*,
        c.name AS category_name
      FROM products p
      LEFT JOIN categories c
        ON c.id = p.category_id
      ORDER BY p.created_at DESC, p.id DESC
    `);

    const products = result.rows.map((product) => ({
      ...product,
      price_options: normalizePriceOptions(product.price_options)
    }));

    res.json({
      ok: true,
      products
    });
  } catch (error) {
    console.error("Products error:", error);

    res.status(500).json({
      ok: false,
      error: "Failed to load products"
    });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const id = integerId(req.params.id);

    if (!id) {
      return res.status(400).json({
        ok: false,
        error: "Invalid product id"
      });
    }

    const result = await db.execute({
      sql: `
        SELECT
          p.*,
          c.name AS category_name
        FROM products p
        LEFT JOIN categories c
          ON c.id = p.category_id
        WHERE p.id = ?
        LIMIT 1
      `,
      args: [id]
    });

    if (!result.rows.length) {
      return res.status(404).json({
        ok: false,
        error: "Product not found"
      });
    }

    const product = result.rows[0];

    const variantsResult = await db.execute({
      sql: `
        SELECT *
        FROM product_variants
        WHERE product_id = ?
        ORDER BY id ASC
      `,
      args: [id]
    });

    res.json({
      ok: true,
      product: {
        ...product,
        price_options: normalizePriceOptions(product.price_options),
        variants: variantsResult.rows
      }
    });
  } catch (error) {
    console.error("Product details error:", error);

    res.status(500).json({
      ok: false,
      error: "Failed to load product"
    });
  }
});

/* =========================================================
   PUBLIC BANNERS
========================================================= */

app.get("/api/banners", async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT
        b.*,
        p.name AS product_name
      FROM banners b
      LEFT JOIN products p
        ON p.id = b.product_id
      WHERE b.is_active = 1
      ORDER BY b.sort_order ASC, b.id ASC
    `);

    res.json({
      ok: true,
      banners: result.rows
    });
  } catch (error) {
    console.error("Banners error:", error);

    res.status(500).json({
      ok: false,
      error: "Failed to load banners"
    });
  }
});

/* =========================================================
   PUBLIC PICKUP POINTS
========================================================= */

app.get("/api/pickup-points", async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT *
      FROM pickup_points
      WHERE is_active = 1
      ORDER BY sort_order ASC, id ASC
    `);

    res.json({
      ok: true,
      pickup_points: result.rows
    });
  } catch (error) {
    console.error("Pickup points error:", error);

    res.status(500).json({
      ok: false,
      error: "Failed to load pickup points"
    });
  }
});

/* =========================================================
   PUBLIC RESERVATION
========================================================= */

app.get("/api/reservation", async (req, res) => {
  try {
    const amountResult = await db.execute({
      sql: `
        SELECT value
        FROM store_settings
        WHERE key = ?
        LIMIT 1
      `,
      args: ["reservation_amount"]
    });

    const reservationAmount = numberValue(
      amountResult.rows[0]?.value,
      1000
    );

    const cardResult = await db.execute(`
      SELECT
        id,
        card_number,
        recipient_name,
        bank_name
      FROM reservation_cards
      WHERE is_active = 1
      ORDER BY is_default DESC, id ASC
      LIMIT 1
    `);

    res.json({
      ok: true,
      reservation_amount: reservationAmount,
      card: cardResult.rows[0] || null
    });
  } catch (error) {
    console.error("Reservation error:", error);

    res.status(500).json({
      ok: false,
      error: "Failed to load reservation settings"
    });
  }
});

/* =========================================================
   PUBLIC STORE CONFIG
========================================================= */

app.get("/api/store-config", async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT key, value
      FROM store_settings
    `);

    const settings = {};

    for (const row of result.rows) {
      settings[row.key] = row.value;
    }

    res.json({
      ok: true,
      settings,
      store_name: settings.store_name || "IRoom",
      contact_username: settings.contact_username || "iroom_24",
      channel_username: settings.channel_username || "iroom_market",
      reservation_amount: numberValue(
        settings.reservation_amount,
        1000
      )
    });
  } catch (error) {
    console.error("Store config error:", error);

    res.status(500).json({
      ok: false,
      error: "Failed to load store config"
    });
  }
});

/* =========================================================
   PUBLIC ME
========================================================= */

app.get("/api/me", requireTelegram, async (req, res) => {
  try {
    const user = req.telegramUser;

    await db.execute({
      sql: `
        INSERT INTO users (
          telegram_user_id,
          first_name,
          last_name,
          username,
          updated_at
        )
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(telegram_user_id)
        DO UPDATE SET
          first_name = excluded.first_name,
          last_name = excluded.last_name,
          username = excluded.username,
          updated_at = CURRENT_TIMESTAMP
      `,
      args: [
        String(user.id),
        stringValue(user.first_name),
        stringValue(user.last_name),
        stringValue(user.username)
      ]
    });

    res.json({
      ok: true,
      user: {
        id: String(user.id),
        first_name: stringValue(user.first_name),
        last_name: stringValue(user.last_name),
        username: stringValue(user.username)
      },
      is_admin: isAdmin(user.id)
    });
  } catch (error) {
    console.error("Me error:", error);

    res.status(500).json({
      ok: false,
      error: "Failed to load user"
    });
  }
});

/* =========================================================
   PUBLIC SETTINGS
========================================================= */

app.get("/api/settings", async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT key, value
      FROM store_settings
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
    console.error("Settings error:", error);

    res.status(500).json({
      ok: false,
      error: "Failed to load settings"
    });
  }
});

/* =========================================================
   ORDERS — CUSTOMER
========================================================= */

app.get("/api/orders", requireTelegram, async (req, res) => {
  try {
    const userId = String(req.telegramUser.id);

    const result = await db.execute({
      sql: `
        SELECT
          o.*,
          pp.name AS pickup_point_name,
          pp.address AS pickup_point_address
        FROM orders o
        LEFT JOIN pickup_points pp
          ON pp.id = o.pickup_point_id
        WHERE o.telegram_user_id = ?
        ORDER BY o.id DESC
      `,
      args: [userId]
    });

    res.json({
      ok: true,
      orders: result.rows.map((order) => ({
        ...order,
        display_id: orderDisplayId(order.id),
        status_label: orderStatusLabel(order.status),
        reservation_status_label: reservationStatusLabel(
          order.reservation_status
        ),
        selected_options: safeJsonParse(
          order.selected_options,
          {}
        )
      }))
    });
  } catch (error) {
    console.error("Customer orders error:", error);

    res.status(500).json({
      ok: false,
      error: "Failed to load orders"
    });
  }
});

app.get("/api/orders/:id", requireTelegram, async (req, res) => {
  try {
    const id = integerId(req.params.id);

    if (!id) {
      return res.status(400).json({
        ok: false,
        error: "Invalid order id"
      });
    }

    const userId = String(req.telegramUser.id);

    const result = await db.execute({
      sql: `
        SELECT
          o.*,
          pp.name AS pickup_point_name,
          pp.address AS pickup_point_address,
          pp.working_hours AS pickup_point_working_hours,
          pp.map_url AS pickup_point_map_url,
          pp.video_url AS pickup_point_video_url
        FROM orders o
        LEFT JOIN pickup_points pp
          ON pp.id = o.pickup_point_id
        WHERE o.id = ?
          AND o.telegram_user_id = ?
        LIMIT 1
      `,
      args: [id, userId]
    });

    if (!result.rows.length) {
      return res.status(404).json({
        ok: false,
        error: "Order not found"
      });
    }

    const order = result.rows[0];

    res.json({
      ok: true,
      order: {
        ...order,
        display_id: orderDisplayId(order.id),
        status_label: orderStatusLabel(order.status),
        reservation_status_label: reservationStatusLabel(
          order.reservation_status
        ),
        selected_options: safeJsonParse(
          order.selected_options,
          {}
        )
      }
    });
  } catch (error) {
    console.error("Order details error:", error);

    res.status(500).json({
      ok: false,
      error: "Failed to load order"
    });
  }
});

/* =========================================================
   CREATE ORDER
========================================================= */

app.post("/api/orders", requireTelegram, async (req, res) => {
  try {
    const user = req.telegramUser;

    const productId = integerId(req.body.product_id);

    if (!productId) {
      return res.status(400).json({
        ok: false,
        error: "Product is required"
      });
    }

    const productResult = await db.execute({
      sql: `
        SELECT *
        FROM products
        WHERE id = ?
        LIMIT 1
      `,
      args: [productId]
    });

    if (!productResult.rows.length) {
      return res.status(404).json({
        ok: false,
        error: "Product not found"
      });
    }

    const product = productResult.rows[0];

    const selectedOptions =
      req.body.selected_options ||
      req.body.options ||
      {};

    let finalPrice = numberValue(product.price, 0);
    let normalizedSelectedOptions = {};

    const productPriceOptions = normalizePriceOptions(
      product.price_options
    );

    if (hasPriceOptions(productPriceOptions)) {
      const calculated = calculatePriceWithOptions(
        product,
        selectedOptions
      );

      finalPrice = calculated.price;
      normalizedSelectedOptions =
        calculated.selectedOptions;
    }

    let variantId = integerId(req.body.variant_id);
    let variantText = stringValue(
      req.body.variant_text
    ).trim();

    /* Old variants support */

    if (!hasPriceOptions(productPriceOptions) && variantId) {
      const variantResult = await db.execute({
        sql: `
          SELECT *
          FROM product_variants
          WHERE id = ?
            AND product_id = ?
          LIMIT 1
        `,
        args: [variantId, productId]
      });

      if (!variantResult.rows.length) {
        return res.status(400).json({
          ok: false,
          error: "Invalid product variant"
        });
      }

      const variant = variantResult.rows[0];

      finalPrice = numberValue(
        variant.price,
        finalPrice
      );

      if (!variantText) {
        variantText = buildVariantName(variant);
      }

      normalizedSelectedOptions = {
        color: variant.color || "",
        memory: variant.memory || "",
        sim_type: variant.sim_type || "",
        region: variant.region || ""
      };
    }

    const fulfillmentType =
      req.body.fulfillment_type === "delivery"
        ? "delivery"
        : "pickup";

    let pickupPointId = null;
    let pickupPointName = "";
    let pickupPointAddress = "";

    if (fulfillmentType === "pickup") {
      pickupPointId = integerId(
        req.body.pickup_point_id
      );

      if (!pickupPointId) {
        return res.status(400).json({
          ok: false,
          error: "Выберите точку самовывоза"
        });
      }

      const pickupResult = await db.execute({
        sql: `
          SELECT *
          FROM pickup_points
          WHERE id = ?
            AND is_active = 1
          LIMIT 1
        `,
        args: [pickupPointId]
      });

      if (!pickupResult.rows.length) {
        return res.status(400).json({
          ok: false,
          error: "Точка самовывоза недоступна"
        });
      }

      pickupPointName =
        pickupResult.rows[0].name || "";

      pickupPointAddress =
        pickupResult.rows[0].address || "";
    }

    const deliveryCity =
      stringValue(req.body.delivery_city).trim();

    const deliveryStreet =
      stringValue(req.body.delivery_street).trim();

    const deliveryHouse =
      stringValue(req.body.delivery_house).trim();

    const deliveryApartment =
      stringValue(req.body.delivery_apartment).trim();

    const deliveryComment =
      stringValue(req.body.delivery_comment).trim();

    if (fulfillmentType === "delivery") {
      if (
        !deliveryCity ||
        !deliveryStreet ||
        !deliveryHouse
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Для доставки заполните город, улицу и дом"
        });
      }
    }

    /* Reservation settings */

    const reservationAmountResult =
      await db.execute({
        sql: `
          SELECT value
          FROM store_settings
          WHERE key = ?
          LIMIT 1
        `,
        args: ["reservation_amount"]
      });

    const reservationAmount = Math.max(
      0,
      numberValue(
        reservationAmountResult.rows[0]?.value,
        1000
      )
    );

    let reservationCardId = null;

    if (reservationAmount > 0) {
      const cardResult = await db.execute(`
        SELECT id
        FROM reservation_cards
        WHERE is_active = 1
        ORDER BY is_default DESC, id ASC
        LIMIT 1
      `);

      if (cardResult.rows.length) {
        reservationCardId =
          Number(cardResult.rows[0].id);
      }
    }

    const reservationStatus =
      reservationAmount > 0
        ? "pending"
        : "not_required";

    const name = customerName(user);
    const username = customerUsername(user);

    await db.execute({
      sql: `
        INSERT INTO users (
          telegram_user_id,
          first_name,
          last_name,
          username,
          updated_at
        )
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(telegram_user_id)
        DO UPDATE SET
          first_name = excluded.first_name,
          last_name = excluded.last_name,
          username = excluded.username,
          updated_at = CURRENT_TIMESTAMP
      `,
      args: [
        String(user.id),
        stringValue(user.first_name),
        stringValue(user.last_name),
        username
      ]
    });

    const insertResult = await db.execute({
      sql: `
        INSERT INTO orders (
          telegram_user_id,
          product_id,
          variant_id,
          product_name,
          variant_text,
          selected_options,
          price,
          customer_name,
          customer_username,
          status,
          reservation_amount,
          reservation_status,
          reservation_card_id,
          fulfillment_type,
          pickup_point_id,
          delivery_city,
          delivery_street,
          delivery_house,
          delivery_apartment,
          delivery_comment,
          customer_comment,
          updated_at
        )
        VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
        )
      `,
      args: [
        String(user.id),
        productId,
        variantId,
        product.name,
        variantText,
        JSON.stringify(normalizedSelectedOptions),
        finalPrice,
        name,
        username,
        "new",
        reservationAmount,
        reservationStatus,
        reservationCardId,
        fulfillmentType,
        pickupPointId,
        deliveryCity,
        deliveryStreet,
        deliveryHouse,
        deliveryApartment,
        deliveryComment,
        stringValue(req.body.customer_comment).trim()
      ]
    });

    const orderId = Number(
      insertResult.lastInsertRowid
    );

    const orderResult = await db.execute({
      sql: `
        SELECT
          o.*,
          pp.name AS pickup_point_name,
          pp.address AS pickup_point_address
        FROM orders o
        LEFT JOIN pickup_points pp
          ON pp.id = o.pickup_point_id
        WHERE o.id = ?
        LIMIT 1
      `,
      args: [orderId]
    });

    const order = orderResult.rows[0];

    await notifyAdminsAboutOrder(order);

    res.json({
      ok: true,
      order: {
        ...order,
        display_id: orderDisplayId(order.id),
        status_label: orderStatusLabel(order.status),
        reservation_status_label:
          reservationStatusLabel(
            order.reservation_status
          ),
        selected_options: safeJsonParse(
          order.selected_options,
          {}
        )
      }
    });
  } catch (error) {
    console.error("Create order error:", error);

    res.status(500).json({
      ok: false,
      error:
        error?.message ||
        "Failed to create order"
    });
  }
});

/* =========================================================
   OLD VARIANT HELPERS
========================================================= */

function buildVariantName(variant) {
  const parts = [];

  if (variant.color) {
    parts.push(variant.color);
  }

  if (variant.memory) {
    parts.push(variant.memory);
  }

  if (variant.sim_type) {
    parts.push(variant.sim_type);
  }

  if (variant.region) {
    parts.push(variant.region);
  }

  return (
    variant.name ||
    parts.join(" / ") ||
    "Вариант"
  );
}

function normalizeVariant(body) {
  return {
    name: stringValue(body.name).trim(),
    price: numberValue(body.price, 0),
    stock: Math.max(
      0,
      Math.floor(numberValue(body.stock, 0))
    ),
    color: stringValue(body.color).trim(),
    memory: stringValue(body.memory).trim(),
    sim_type: stringValue(body.sim_type).trim(),
    region: stringValue(body.region).trim()
  };
}

/* =========================================================
   ADMIN ME
========================================================= */

app.get("/api/admin/me", requireAdmin, async (req, res) => {
  res.json({
    ok: true,
    is_admin: true,
    user: {
      id: String(req.telegramUser.id),
      first_name: stringValue(
        req.telegramUser.first_name
      ),
      last_name: stringValue(
        req.telegramUser.last_name
      ),
      username: stringValue(
        req.telegramUser.username
      )
    }
  });
});

/* =========================================================
   ADMIN PRODUCTS
========================================================= */

app.get(
  "/api/admin/products",
  requireAdmin,
  async (req, res) => {
    try {
      const result = await db.execute(`
        SELECT
          p.*,
          c.name AS category_name
        FROM products p
        LEFT JOIN categories c
          ON c.id = p.category_id
        ORDER BY p.id DESC
      `);

      const products = [];

      for (const product of result.rows) {
        const variantsResult = await db.execute({
          sql: `
            SELECT *
            FROM product_variants
            WHERE product_id = ?
            ORDER BY id ASC
          `,
          args: [product.id]
        });

        products.push({
          ...product,
          price_options: normalizePriceOptions(
            product.price_options
          ),
          variants: variantsResult.rows
        });
      }

      res.json({
        ok: true,
        products
      });
    } catch (error) {
      console.error("Admin products error:", error);

      res.status(500).json({
        ok: false,
        error: "Failed to load products"
      });
    }
  }
);

app.post(
  "/api/admin/products",
  requireAdmin,
  async (req, res) => {
    try {
      const name =
        stringValue(req.body.name).trim();

      if (!name) {
        return res.status(400).json({
          ok: false,
          error: "Product name is required"
        });
      }

      const price =
        numberValue(req.body.price, 0);

      const categoryId =
        integerId(req.body.category_id);

      const imageUrl =
        stringValue(req.body.image_url).trim();

      const description =
        stringValue(req.body.description).trim();

      const priceOptions =
        normalizePriceOptions(
          req.body.price_options
        );

      const result = await db.execute({
        sql: `
          INSERT INTO products (
            name,
            price,
            image_url,
            description,
            category_id,
            price_options,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
        args: [
          name,
          price,
          imageUrl,
          description,
          categoryId,
          JSON.stringify(priceOptions)
        ]
      });

      res.json({
        ok: true,
        id: Number(result.lastInsertRowid)
      });
    } catch (error) {
      console.error("Create product error:", error);

      res.status(500).json({
        ok: false,
        error: "Failed to create product"
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
        integerId(req.params.id);

      if (!id) {
        return res.status(400).json({
          ok: false,
          error: "Invalid product id"
        });
      }

      const existing = await db.execute({
        sql: `
          SELECT *
          FROM products
          WHERE id = ?
          LIMIT 1
        `,
        args: [id]
      });

      if (!existing.rows.length) {
        return res.status(404).json({
          ok: false,
          error: "Product not found"
        });
      }

      const old = existing.rows[0];

      const name =
        req.body.name !== undefined
          ? stringValue(req.body.name).trim()
          : old.name;

      const price =
        req.body.price !== undefined
          ? numberValue(req.body.price, 0)
          : numberValue(old.price, 0);

      const categoryId =
        req.body.category_id !== undefined
          ? integerId(req.body.category_id)
          : old.category_id;

      const imageUrl =
        req.body.image_url !== undefined
          ? stringValue(req.body.image_url).trim()
          : old.image_url;

      const description =
        req.body.description !== undefined
          ? stringValue(req.body.description).trim()
          : old.description;

      const priceOptions =
        req.body.price_options !== undefined
          ? normalizePriceOptions(
              req.body.price_options
            )
          : normalizePriceOptions(
              old.price_options
            );

      await db.execute({
        sql: `
          UPDATE products
          SET
            name = ?,
            price = ?,
            category_id = ?,
            image_url = ?,
            description = ?,
            price_options = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        args: [
          name,
          price,
          categoryId,
          imageUrl,
          description,
          JSON.stringify(priceOptions),
          id
        ]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      console.error("Update product error:", error);

      res.status(500).json({
        ok: false,
        error: "Failed to update product"
      });
    }
  }
);

app.delete(
  "/api/admin/products/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const id =
        integerId(req.params.id);

      if (!id) {
        return res.status(400).json({
          ok: false,
          error: "Invalid product id"
        });
      }

      await db.execute({
        sql: `
          DELETE FROM product_variants
          WHERE product_id = ?
        `,
        args: [id]
      });

      await db.execute({
        sql: `
          DELETE FROM products
          WHERE id = ?
        `,
        args: [id]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      console.error("Delete product error:", error);

      res.status(500).json({
        ok: false,
        error: "Failed to delete product"
      });
    }
  }
);

/* =========================================================
   ADMIN PRODUCT VARIANTS
========================================================= */

app.get(
  "/api/admin/products/:id/variants",
  requireAdmin,
  async (req, res) => {
    try {
      const productId =
        integerId(req.params.id);

      if (!productId) {
        return res.status(400).json({
          ok: false,
          error: "Invalid product id"
        });
      }

      const result = await db.execute({
        sql: `
          SELECT *
          FROM product_variants
          WHERE product_id = ?
          ORDER BY id ASC
        `,
        args: [productId]
      });

      res.json({
        ok: true,
        variants: result.rows
      });
    } catch (error) {
      console.error(
        "Admin variants error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Failed to load variants"
      });
    }
  }
);

app.post(
  "/api/admin/products/:id/variants",
  requireAdmin,
  async (req, res) => {
    try {
      const productId =
        integerId(req.params.id);

      if (!productId) {
        return res.status(400).json({
          ok: false,
          error: "Invalid product id"
        });
      }

      const variant =
        normalizeVariant(req.body);

      const result = await db.execute({
        sql: `
          INSERT INTO product_variants (
            product_id,
            name,
            price,
            stock,
            color,
            memory,
            sim_type,
            region
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          productId,
          variant.name,
          variant.price,
          variant.stock,
          variant.color,
          variant.memory,
          variant.sim_type,
          variant.region
        ]
      });

      res.json({
        ok: true,
        id: Number(result.lastInsertRowid)
      });
    } catch (error) {
      console.error(
        "Create variant error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Failed to create variant"
      });
    }
  }
);

app.put(
  "/api/admin/variants/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const id =
        integerId(req.params.id);

      if (!id) {
        return res.status(400).json({
          ok: false,
          error: "Invalid variant id"
        });
      }

      const variant =
        normalizeVariant(req.body);

      await db.execute({
        sql: `
          UPDATE product_variants
          SET
            name = ?,
            price = ?,
            stock = ?,
            color = ?,
            memory = ?,
            sim_type = ?,
            region = ?
          WHERE id = ?
        `,
        args: [
          variant.name,
          variant.price,
          variant.stock,
          variant.color,
          variant.memory,
          variant.sim_type,
          variant.region,
          id
        ]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        "Update variant error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Failed to update variant"
      });
    }
  }
);

app.delete(
  "/api/admin/variants/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const id =
        integerId(req.params.id);

      if (!id) {
        return res.status(400).json({
          ok: false,
          error: "Invalid variant id"
        });
      }

      await db.execute({
        sql: `
          DELETE FROM product_variants
          WHERE id = ?
        `,
        args: [id]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        "Delete variant error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Failed to delete variant"
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
      const result = await db.execute(`
        SELECT *
        FROM categories
        ORDER BY sort_order ASC, id ASC
      `);

      res.json({
        ok: true,
        categories: result.rows
      });
    } catch (error) {
      console.error(
        "Admin categories error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Failed to load categories"
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
        stringValue(req.body.name).trim();

      if (!name) {
        return res.status(400).json({
          ok: false,
          error: "Category name is required"
        });
      }

      const result = await db.execute({
        sql: `
          INSERT INTO categories (
            name,
            image_url,
            description,
            sort_order,
            updated_at
          )
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
        args: [
          name,
          stringValue(req.body.image_url).trim(),
          stringValue(req.body.description).trim(),
          Math.floor(
            numberValue(req.body.sort_order, 0)
          )
        ]
      });

      res.json({
        ok: true,
        id: Number(result.lastInsertRowid)
      });
    } catch (error) {
      console.error(
        "Create category error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Failed to create category"
      });
    }
  }
);

app.put(
  "/api/admin/categories/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const id =
        integerId(req.params.id);

      if (!id) {
        return res.status(400).json({
          ok: false,
          error: "Invalid category id"
        });
      }

      const existing = await db.execute({
        sql: `
          SELECT *
          FROM categories
          WHERE id = ?
          LIMIT 1
        `,
        args: [id]
      });

      if (!existing.rows.length) {
        return res.status(404).json({
          ok: false,
          error: "Category not found"
        });
      }

      const old = existing.rows[0];

      await db.execute({
        sql: `
          UPDATE categories
          SET
            name = ?,
            image_url = ?,
            description = ?,
            sort_order = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        args: [
          req.body.name !== undefined
            ? stringValue(req.body.name).trim()
            : old.name,

          req.body.image_url !== undefined
            ? stringValue(req.body.image_url).trim()
            : old.image_url,

          req.body.description !== undefined
            ? stringValue(req.body.description).trim()
            : old.description,

          req.body.sort_order !== undefined
            ? Math.floor(
                numberValue(
                  req.body.sort_order,
                  0
                )
              )
            : numberValue(
                old.sort_order,
                0
              ),

          id
        ]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        "Update category error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Failed to update category"
      });
    }
  }
);

app.delete(
  "/api/admin/categories/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const id =
        integerId(req.params.id);

      if (!id) {
        return res.status(400).json({
          ok: false,
          error: "Invalid category id"
        });
      }

      await db.execute({
        sql: `
          UPDATE products
          SET
            category_id = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE category_id = ?
        `,
        args: [id]
      });

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
      console.error(
        "Delete category error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Failed to delete category"
      });
    }
  }
);

/* =========================================================
   ADMIN BANNERS
========================================================= */

app.get(
  "/api/admin/banners",
  requireAdmin,
  async (req, res) => {
    try {
      const result = await db.execute(`
        SELECT
          b.*,
          p.name AS product_name
        FROM banners b
        LEFT JOIN products p
          ON p.id = b.product_id
        ORDER BY b.sort_order ASC, b.id ASC
      `);

      res.json({
        ok: true,
        banners: result.rows
      });
    } catch (error) {
      console.error(
        "Admin banners error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Failed to load banners"
      });
    }
  }
);

app.post(
  "/api/admin/banners",
  requireAdmin,
  async (req, res) => {
    try {
      const result = await db.execute({
        sql: `
          INSERT INTO banners (
            title,
            text,
            button_text,
            button_link,
            product_id,
            image_url,
            sort_order,
            is_active,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
        args: [
          stringValue(req.body.title).trim(),
          stringValue(req.body.text).trim(),
          stringValue(req.body.button_text).trim(),
          stringValue(req.body.button_link).trim(),
          integerId(req.body.product_id),
          stringValue(req.body.image_url).trim(),
          Math.floor(
            numberValue(req.body.sort_order, 0)
          ),
          req.body.is_active === false ||
          req.body.is_active === 0
            ? 0
            : 1
        ]
      });

      res.json({
        ok: true,
        id: Number(result.lastInsertRowid)
      });
    } catch (error) {
      console.error(
        "Create banner error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Failed to create banner"
      });
    }
  }
);

app.put(
  "/api/admin/banners/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const id =
        integerId(req.params.id);

      if (!id) {
        return res.status(400).json({
          ok: false,
          error: "Invalid banner id"
        });
      }

      await db.execute({
        sql: `
          UPDATE banners
          SET
            title = ?,
            text = ?,
            button_text = ?,
            button_link = ?,
            product_id = ?,
            image_url = ?,
            sort_order = ?,
            is_active = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        args: [
          stringValue(req.body.title).trim(),
          stringValue(req.body.text).trim(),
          stringValue(req.body.button_text).trim(),
          stringValue(req.body.button_link).trim(),
          integerId(req.body.product_id),
          stringValue(req.body.image_url).trim(),
          Math.floor(
            numberValue(req.body.sort_order, 0)
          ),
          req.body.is_active === false ||
          req.body.is_active === 0
            ? 0
            : 1,
          id
        ]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        "Update banner error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Failed to update banner"
      });
    }
  }
);

app.delete(
  "/api/admin/banners/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const id =
        integerId(req.params.id);

      if (!id) {
        return res.status(400).json({
          ok: false,
          error: "Invalid banner id"
        });
      }

      await db.execute({
        sql: `
          DELETE FROM banners
          WHERE id = ?
        `,
        args: [id]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        "Delete banner error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Failed to delete banner"
      });
    }
  }
);

/* =========================================================
   ADMIN RESERVATION CARDS
========================================================= */

app.get(
  "/api/admin/reservation-cards",
  requireAdmin,
  async (req, res) => {
    try {
      const result = await db.execute(`
        SELECT *
        FROM reservation_cards
        ORDER BY is_default DESC, id DESC
      `);

      res.json({
        ok: true,
        cards: result.rows
      });
    } catch (error) {
      console.error(
        "Admin reservation cards error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Failed to load reservation cards"
      });
    }
  }
);

app.post(
  "/api/admin/reservation-cards",
  requireAdmin,
  async (req, res) => {
    try {
      const cardNumber =
        stringValue(
          req.body.card_number
        ).trim();

      if (!cardNumber) {
        return res.status(400).json({
          ok: false,
          error: "Card number is required"
        });
      }

      const isDefault =
        req.body.is_default === true ||
        req.body.is_default === 1
          ? 1
          : 0;

      if (isDefault) {
        await db.execute(`
          UPDATE reservation_cards
          SET
            is_default = 0,
            updated_at = CURRENT_TIMESTAMP
        `);
      }

      const result = await db.execute({
        sql: `
          INSERT INTO reservation_cards (
            card_number,
            recipient_name,
            bank_name,
            is_active,
            is_default,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
        args: [
          cardNumber,
          stringValue(
            req.body.recipient_name
          ).trim(),
          stringValue(
            req.body.bank_name
          ).trim(),
          req.body.is_active === false ||
          req.body.is_active === 0
            ? 0
            : 1,
          isDefault
        ]
      });

      res.json({
        ok: true,
        id: Number(result.lastInsertRowid)
      });
    } catch (error) {
      console.error(
        "Create reservation card error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Failed to create reservation card"
      });
    }
  }
);

app.put(
  "/api/admin/reservation-cards/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const id =
        integerId(req.params.id);

      if (!id) {
        return res.status(400).json({
          ok: false,
          error: "Invalid card id"
        });
      }

      const isDefault =
        req.body.is_default === true ||
        req.body.is_default === 1
          ? 1
          : 0;

      if (isDefault) {
        await db.execute({
          sql: `
            UPDATE reservation_cards
            SET
              is_default = 0,
              updated_at = CURRENT_TIMESTAMP
            WHERE id != ?
          `,
          args: [id]
        });
      }

      await db.execute({
        sql: `
          UPDATE reservation_cards
          SET
            card_number = ?,
            recipient_name = ?,
            bank_name = ?,
            is_active = ?,
            is_default = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        args: [
          stringValue(
            req.body.card_number
          ).trim(),
          stringValue(
            req.body.recipient_name
          ).trim(),
          stringValue(
            req.body.bank_name
          ).trim(),
          req.body.is_active === false ||
          req.body.is_active === 0
            ? 0
            : 1,
          isDefault,
          id
        ]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        "Update reservation card error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Failed to update reservation card"
      });
    }
  }
);

app.delete(
  "/api/admin/reservation-cards/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const id =
        integerId(req.params.id);

      if (!id) {
        return res.status(400).json({
          ok: false,
          error: "Invalid card id"
        });
      }

      await db.execute({
        sql: `
          DELETE FROM reservation_cards
          WHERE id = ?
        `,
        args: [id]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        "Delete reservation card error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Failed to delete reservation card"
      });
    }
  }
);

/* =========================================================
   ADMIN PICKUP POINTS
========================================================= */

app.get(
  "/api/admin/pickup-points",
  requireAdmin,
  async (req, res) => {
    try {
      const result = await db.execute(`
        SELECT *
        FROM pickup_points
        ORDER BY sort_order ASC, id ASC
      `);

      res.json({
        ok: true,
        pickup_points: result.rows
      });
    } catch (error) {
      console.error(
        "Admin pickup points error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Failed to load pickup points"
      });
    }
  }
);

app.post(
  "/api/admin/pickup-points",
  requireAdmin,
  async (req, res) => {
    try {
      const result = await db.execute({
        sql: `
          INSERT INTO pickup_points (
            name,
            address,
            working_hours,
            map_url,
            video_url,
            description,
            sort_order,
            is_active,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
        args: [
          stringValue(req.body.name).trim(),
          stringValue(req.body.address).trim(),
          stringValue(
            req.body.working_hours
          ).trim(),
          stringValue(req.body.map_url).trim(),
          stringValue(req.body.video_url).trim(),
          stringValue(
            req.body.description
          ).trim(),
          Math.floor(
            numberValue(req.body.sort_order, 0)
          ),
          req.body.is_active === false ||
          req.body.is_active === 0
            ? 0
            : 1
        ]
      });

      res.json({
        ok: true,
        id: Number(result.lastInsertRowid)
      });
    } catch (error) {
      console.error(
        "Create pickup point error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Failed to create pickup point"
      });
    }
  }
);

app.put(
  "/api/admin/pickup-points/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const id =
        integerId(req.params.id);

      if (!id) {
        return res.status(400).json({
          ok: false,
          error: "Invalid pickup point id"
        });
      }

      await db.execute({
        sql: `
          UPDATE pickup_points
          SET
            name = ?,
            address = ?,
            working_hours = ?,
            map_url = ?,
            video_url = ?,
            description = ?,
            sort_order = ?,
            is_active = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        args: [
          stringValue(req.body.name).trim(),
          stringValue(req.body.address).trim(),
          stringValue(
            req.body.working_hours
          ).trim(),
          stringValue(req.body.map_url).trim(),
          stringValue(req.body.video_url).trim(),
          stringValue(
            req.body.description
          ).trim(),
          Math.floor(
            numberValue(req.body.sort_order, 0)
          ),
          req.body.is_active === false ||
          req.body.is_active === 0
            ? 0
            : 1,
          id
        ]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        "Update pickup point error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Failed to update pickup point"
      });
    }
  }
);

app.delete(
  "/api/admin/pickup-points/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const id =
        integerId(req.params.id);

      if (!id) {
        return res.status(400).json({
          ok: false,
          error: "Invalid pickup point id"
        });
      }

      await db.execute({
        sql: `
          DELETE FROM pickup_points
          WHERE id = ?
        `,
        args: [id]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        "Delete pickup point error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Failed to delete pickup point"
      });
    }
  }
);

/* =========================================================
   ADMIN STORE SETTINGS
========================================================= */

app.get(
  "/api/admin/settings",
  requireAdmin,
  async (req, res) => {
    try {
      const result = await db.execute(`
        SELECT key, value
        FROM store_settings
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
      console.error(
        "Admin settings error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Failed to load settings"
      });
    }
  }
);

app.put(
  "/api/admin/settings",
  requireAdmin,
  async (req, res) => {
    try {
      const settings =
        req.body.settings &&
        typeof req.body.settings === "object"
          ? req.body.settings
          : req.body;

      for (const [key, value] of Object.entries(
        settings
      )) {
        if (!key) {
          continue;
        }

        await db.execute({
          sql: `
            INSERT INTO store_settings (
              key,
              value,
              updated_at
            )
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key)
            DO UPDATE SET
              value = excluded.value,
              updated_at = CURRENT_TIMESTAMP
          `,
          args: [
            String(key),
            String(
              value === null ||
              value === undefined
                ? ""
                : value
            )
          ]
        });
      }

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        "Update settings error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Failed to update settings"
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
          pp.name AS pickup_point_name,
          pp.address AS pickup_point_address,
          rc.card_number AS reservation_card_number,
          rc.recipient_name AS reservation_recipient_name,
          rc.bank_name AS reservation_bank_name
        FROM orders o
        LEFT JOIN pickup_points pp
          ON pp.id = o.pickup_point_id
        LEFT JOIN reservation_cards rc
          ON rc.id = o.reservation_card_id
        ORDER BY o.id DESC
      `);

      res.json({
        ok: true,
        orders: result.rows.map((order) => ({
          ...order,
          display_id: orderDisplayId(order.id),
          status_label: orderStatusLabel(
            order.status
          ),
          reservation_status_label:
            reservationStatusLabel(
              order.reservation_status
            ),
          selected_options: safeJsonParse(
            order.selected_options,
            {}
          )
        }))
      });
    } catch (error) {
      console.error(
        "Admin orders error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Failed to load orders"
      });
    }
  }
);

app.get(
  "/api/admin/orders/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const id =
        integerId(req.params.id);

      if (!id) {
        return res.status(400).json({
          ok: false,
          error: "Invalid order id"
        });
      }

      const result = await db.execute({
        sql: `
          SELECT
            o.*,
            pp.name AS pickup_point_name,
            pp.address AS pickup_point_address,
            pp.working_hours AS pickup_point_working_hours,
            pp.map_url AS pickup_point_map_url,
            pp.video_url AS pickup_point_video_url,
            rc.card_number AS reservation_card_number,
            rc.recipient_name AS reservation_recipient_name,
            rc.bank_name AS reservation_bank_name
          FROM orders o
          LEFT JOIN pickup_points pp
            ON pp.id = o.pickup_point_id
          LEFT JOIN reservation_cards rc
            ON rc.id = o.reservation_card_id
          WHERE o.id = ?
          LIMIT 1
        `,
        args: [id]
      });

      if (!result.rows.length) {
        return res.status(404).json({
          ok: false,
          error: "Order not found"
        });
      }

      const order = result.rows[0];

      res.json({
        ok: true,
        order: {
          ...order,
          display_id: orderDisplayId(order.id),
          status_label: orderStatusLabel(
            order.status
          ),
          reservation_status_label:
            reservationStatusLabel(
              order.reservation_status
            ),
          selected_options: safeJsonParse(
            order.selected_options,
            {}
          )
        }
      });
    } catch (error) {
      console.error(
        "Admin order details error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Failed to load order details"
      });
    }
  }
);

/* =========================================================
   ADMIN ORDER STATUS
========================================================= */

app.put(
  "/api/admin/orders/:id/status",
  requireAdmin,
  async (req, res) => {
    try {
      const id =
        integerId(req.params.id);

      if (!id) {
        return res.status(400).json({
          ok: false,
          error: "Invalid order id"
        });
      }

      const allowedStatuses = [
        "new",
        "confirmed",
        "processing",
        "ready",
        "completed",
        "cancelled"
      ];

      const status =
        stringValue(
          req.body.status
        ).trim();

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          ok: false,
          error: "Invalid order status"
        });
      }

      await db.execute({
        sql: `
          UPDATE orders
          SET
            status = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        args: [status, id]
      });

      const result = await db.execute({
        sql: `
          SELECT *
          FROM orders
          WHERE id = ?
          LIMIT 1
        `,
        args: [id]
      });

      if (result.rows.length) {
        await notifyCustomerOrderStatus(
          result.rows[0]
        );
      }

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        "Update order status error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Failed to update order status"
      });
    }
  }
);

/* =========================================================
   ADMIN RESERVATION STATUS
========================================================= */

app.put(
  "/api/admin/orders/:id/reservation",
  requireAdmin,
  async (req, res) => {
    try {
      const id =
        integerId(req.params.id);

      if (!id) {
        return res.status(400).json({
          ok: false,
          error: "Invalid order id"
        });
      }

      const allowedStatuses = [
        "not_required",
        "pending",
        "confirmed",
        "rejected"
      ];

      const reservationStatus =
        stringValue(
          req.body.reservation_status
        ).trim();

      if (
        !allowedStatuses.includes(
          reservationStatus
        )
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Invalid reservation status"
        });
      }

      const rejectionReason =
        stringValue(
          req.body.rejection_reason
        ).trim();

      let paidAt = null;

      if (
        reservationStatus === "confirmed"
      ) {
        paidAt = new Date().toISOString();
      }

      await db.execute({
        sql: `
          UPDATE orders
          SET
            reservation_status = ?,
            reservation_paid_at = ?,
            reservation_rejected_reason = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        args: [
          reservationStatus,
          paidAt,
          reservationStatus === "rejected"
            ? rejectionReason
            : "",
          id
        ]
      });

      const result = await db.execute({
        sql: `
          SELECT *
          FROM orders
          WHERE id = ?
          LIMIT 1
        `,
        args: [id]
      });

      if (result.rows.length) {
        await notifyCustomerReservation(
          result.rows[0]
        );
      }

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        "Reservation status error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Failed to update reservation status"
      });
    }
  }
);

/* =========================================================
   TELEGRAM WEBHOOK
========================================================= */

app.post("/telegram/webhook", async (req, res) => {
  try {
    const update = req.body || {};

    if (update.callback_query) {
      const callback = update.callback_query;

      const callbackData =
        callback.data || "";

      const callbackFromId =
        String(callback.from?.id || "");

      if (
        callbackData.startsWith(
          "order_status:"
        )
      ) {
        if (!isAdmin(callbackFromId)) {
          await telegram(
            "answerCallbackQuery",
            {
              callback_query_id:
                callback.id,
              text:
                "Нет доступа",
              show_alert: true
            }
          );

          return res.sendStatus(200);
        }

        const parts =
          callbackData.split(":");

        const orderId =
          integerId(parts[1]);

        const status =
          parts[2];

        const allowedStatuses = [
          "new",
          "confirmed",
          "processing",
          "ready",
          "completed",
          "cancelled"
        ];

        if (
          orderId &&
          allowedStatuses.includes(status)
        ) {
          await db.execute({
            sql: `
              UPDATE orders
              SET
                status = ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `,
            args: [
              status,
              orderId
            ]
          });

          const orderResult =
            await db.execute({
              sql: `
                SELECT *
                FROM orders
                WHERE id = ?
                LIMIT 1
              `,
              args: [orderId]
            });

          if (orderResult.rows.length) {
            await notifyCustomerOrderStatus(
              orderResult.rows[0]
            );
          }

          await telegram(
            "answerCallbackQuery",
            {
              callback_query_id:
                callback.id,
              text:
                `Статус: ${orderStatusLabel(
                  status
                )}`
            }
          );

          await telegram(
            "editMessageReplyMarkup",
            {
              chat_id:
                callback.message?.chat?.id,
              message_id:
                callback.message?.message_id,
              reply_markup: {
                inline_keyboard: []
              }
            }
          );
        }
      }

      if (
        callbackData.startsWith(
          "reservation:"
        )
      ) {
        if (!isAdmin(callbackFromId)) {
          await telegram(
            "answerCallbackQuery",
            {
              callback_query_id:
                callback.id,
              text:
                "Нет доступа",
              show_alert: true
            }
          );

          return res.sendStatus(200);
        }

        const parts =
          callbackData.split(":");

        const orderId =
          integerId(parts[1]);

        const reservationStatus =
          parts[2];

        if (
          orderId &&
          [
            "confirmed",
            "rejected"
          ].includes(
            reservationStatus
          )
        ) {
          const paidAt =
            reservationStatus ===
            "confirmed"
              ? new Date().toISOString()
              : null;

          await db.execute({
            sql: `
              UPDATE orders
              SET
                reservation_status = ?,
                reservation_paid_at = ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `,
            args: [
              reservationStatus,
              paidAt,
              orderId
            ]
          });

          const orderResult =
            await db.execute({
              sql: `
                SELECT *
                FROM orders
                WHERE id = ?
                LIMIT 1
              `,
              args: [orderId]
            });

          if (orderResult.rows.length) {
            await notifyCustomerReservation(
              orderResult.rows[0]
            );
          }

          await telegram(
            "answerCallbackQuery",
            {
              callback_query_id:
                callback.id,
              text:
                reservationStatus ===
                "confirmed"
                  ? "Бронь подтверждена"
                  : "Бронь отклонена"
            }
          );

          await telegram(
            "editMessageReplyMarkup",
            {
              chat_id:
                callback.message?.chat?.id,
              message_id:
                callback.message?.message_id,
              reply_markup: {
                inline_keyboard: []
              }
            }
          );
        }
      }
    }

    if (update.message) {
      const message = update.message;

      if (
        message.text === "/start" ||
        message.text === "/app"
      ) {
        const chatId =
          message.chat?.id;

        if (chatId) {
          await telegram(
            "sendMessage",
            {
              chat_id: chatId,
              text:
                "Добро пожаловать в IRoom.",
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
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error(
      "Telegram webhook error:",
      error
    );

    res.sendStatus(200);
  }
});

/* =========================================================
   TELEGRAM WEBHOOK SETUP
========================================================= */

async function setupTelegramWebhook() {
  if (!BOT_TOKEN) {
    console.warn(
      "BOT_TOKEN is missing. Telegram webhook was not configured."
    );

    return;
  }

  try {
    const webhookUrl =
      `${MINIAPP_URL}/telegram/webhook`;

    const result = await telegram(
      "setWebhook",
      {
        url: webhookUrl,
        allowed_updates: [
          "message",
          "callback_query"
        ]
      }
    );

    console.log(
      "Telegram webhook setup:",
      result
    );
  } catch (error) {
    console.error(
      "Webhook setup error:",
      error
    );
  }
}

/* =========================================================
   ADMIN / SPA
========================================================= */

app.get("/admin", (req, res) => {
  res.sendFile(
    path.join(publicDir, "admin.html")
  );
});

app.get("/admin.html", (req, res) => {
  res.sendFile(
    path.join(publicDir, "admin.html")
  );
});

/*
  SPA fallback.

  API routes are already handled above,
  so this only catches frontend routes.
*/

app.get("*", (req, res, next) => {
  if (
    req.path.startsWith("/api/") ||
    req.path.startsWith("/uploads/") ||
    req.path === "/telegram/webhook" ||
    req.path === "/health"
  ) {
    return next();
  }

  const indexPath =
    path.join(publicDir, "index.html");

  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }

  res.status(404).send("IRoom");
});

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use((error, req, res, next) => {
  console.error(
    "Unhandled server error:",
    error
  );

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    ok: false,
    error:
      error?.message ||
      "Internal server error"
  });
});

/* =========================================================
   START
========================================================= */

async function start() {
  try {
    if (!TURSO_DATABASE_URL) {
      throw new Error(
        "TURSO_DATABASE_URL is not configured"
      );
    }

    if (!TURSO_AUTH_TOKEN) {
      throw new Error(
        "TURSO_AUTH_TOKEN is not configured"
      );
    }

    await db.execute("SELECT 1");

    console.log(
      "Turso database connection OK"
    );

    await runMigrations();

    app.listen(PORT, "0.0.0.0", async () => {
      console.log(
        `IRoom server running on port ${PORT}`
      );

      console.log(
        `Mini App: ${MINIAPP_URL}`
      );

      await setupTelegramWebhook();
    });
  } catch (error) {
    console.error(
      "Failed to start IRoom:",
      error
    );

    process.exit(1);
  }
}

start();