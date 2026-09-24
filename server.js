const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const { createClient } = require("@libsql/client");

const app = express();

const PORT = Number(process.env.PORT || 10000);

const BOT_TOKEN = String(process.env.BOT_TOKEN || "").trim();

const ENV_ADMIN_ID = String(process.env.ADMIN_ID || "").trim();

const ADMIN_IDS = [
  "5082864281",
  "5975037118"
];

if (ENV_ADMIN_ID) {
  for (const id of ENV_ADMIN_ID.split(",")) {
    const clean = String(id).trim();
    if (clean && !ADMIN_IDS.includes(clean)) {
      ADMIN_IDS.push(clean);
    }
  }
}

const MINIAPP_URL = String(
  process.env.MINIAPP_URL || "https://iroom-dww8.onrender.com"
).replace(/\/+$/, "");

const TURSO_DATABASE_URL = String(
  process.env.TURSO_DATABASE_URL || ""
).trim();

const TURSO_AUTH_TOKEN = String(
  process.env.TURSO_AUTH_TOKEN || ""
).trim();

const publicDir = path.join(__dirname, "public");
const uploadsDir = path.join(publicDir, "uploads");

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  console.error("ERROR: TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are missing");
  process.exit(1);
}

if (!BOT_TOKEN) {
  console.error("ERROR: BOT_TOKEN is missing");
  process.exit(1);
}

const db = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN
});

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

app.use(
  express.static(publicDir, {
    extensions: ["html"]
  })
);

/* =========================================================
   HELPERS
========================================================= */

function stringValue(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

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

function safeJsonParse(value, fallback) {
  if (value === undefined || value === null || value === "") {
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

function normalizeTelegramId(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value);
}

function formatPrice(value) {
  return `${new Intl.NumberFormat("ru-RU").format(
    Math.round(numberValue(value))
  )} ₽`;
}

function orderDisplayId(id) {
  return `IR-${1000 + Number(id || 0)}`;
}

function customerName(user) {
  if (!user) return "Покупатель";

  const full = [
    user.first_name,
    user.last_name
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return full || user.username || "Покупатель";
}

function customerUsername(user) {
  if (!user || !user.username) return "";

  return String(user.username).startsWith("@")
    ? String(user.username)
    : `@${String(user.username)}`;
}

function escapeTelegramHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeUrl(value) {
  const text = String(value || "").trim();

  if (!text) return "";

  if (
    text.startsWith("/") ||
    text.startsWith("tg://") ||
    text.startsWith("https://") ||
    text.startsWith("http://")
  ) {
    return text;
  }

  return text;
}

function isAdminId(id) {
  return ADMIN_IDS.includes(String(id));
}

function getTelegramUserFromInitData(initData) {
  if (!initData) return null;

  try {
    const params = new URLSearchParams(
      initData.startsWith("?") ? initData.slice(1) : initData
    );

    const userRaw = params.get("user");

    if (!userRaw) return null;

    return JSON.parse(userRaw);
  } catch {
    return null;
  }
}

function validateTelegramInitData(initData) {
  if (!initData) {
    return {
      valid: false,
      user: null
    };
  }

  try {
    const params = new URLSearchParams(
      initData.startsWith("?") ? initData.slice(1) : initData
    );

    const receivedHash = params.get("hash");

    if (!receivedHash) {
      return {
        valid: false,
        user: null
      };
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

    const receivedBuffer = Buffer.from(receivedHash, "hex");
    const calculatedBuffer = Buffer.from(calculatedHash, "hex");

    if (
      receivedBuffer.length !== calculatedBuffer.length ||
      !crypto.timingSafeEqual(receivedBuffer, calculatedBuffer)
    ) {
      return {
        valid: false,
        user: null
      };
    }

    const user = getTelegramUserFromInitData(initData);

    return {
      valid: Boolean(user && user.id),
      user
    };
  } catch (error) {
    console.error("Telegram init data validation error:", error);

    return {
      valid: false,
      user: null
    };
  }
}

function getInitData(req) {
  return (
    req.headers["x-telegram-init-data"] ||
    req.headers["x-telegram-init-data".toLowerCase()] ||
    ""
  );
}

function requireTelegram(req, res, next) {
  const initData = getInitData(req);
  const result = validateTelegramInitData(initData);

  if (!result.valid || !result.user) {
    return res.status(401).json({
      ok: false,
      error: "Invalid Telegram Mini App authorization"
    });
  }

  req.telegramUser = result.user;
  next();
}

function requireAdmin(req, res, next) {
  const initData = getInitData(req);
  const result = validateTelegramInitData(initData);

  if (!result.valid || !result.user) {
    return res.status(401).json({
      ok: false,
      error: "Invalid Telegram Mini App authorization"
    });
  }

  if (!isAdminId(result.user.id)) {
    return res.status(403).json({
      ok: false,
      error: "Admin access required"
    });
  }

  req.telegramUser = result.user;
  next();
}

function parsePriceOptions(value) {
  const parsed = safeJsonParse(value, {});

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  const result = {};

  for (const [group, rawOptions] of Object.entries(parsed)) {
    if (!Array.isArray(rawOptions)) continue;

    result[group] = rawOptions
      .map((option) => {
        if (typeof option === "string") {
          return {
            name: option,
            surcharge: 0
          };
        }

        if (!option || typeof option !== "object") {
          return null;
        }

        const name = String(
          option.name ??
            option.title ??
            option.value ??
            ""
        ).trim();

        if (!name) return null;

        return {
          name,
          surcharge: numberValue(
            option.surcharge ??
              option.extra ??
              option.price ??
              0,
            0
          )
        };
      })
      .filter(Boolean);
  }

  return result;
}

function normalizeSelectedOptions(value) {
  const parsed = safeJsonParse(value, {});

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  const result = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (
      value === undefined ||
      value === null ||
      String(value).trim() === ""
    ) {
      continue;
    }

    result[String(key)] = String(value);
  }

  return result;
}

function calculatePrice(product, selectedOptions) {
  const basePrice = numberValue(product.price, 0);
  const priceOptions = parsePriceOptions(product.price_options);

  let finalPrice = basePrice;

  for (const [group, options] of Object.entries(priceOptions)) {
    if (!options.length) continue;

    const selected = selectedOptions[group];

    if (!selected) {
      return {
        ok: false,
        error: `Не выбран параметр: ${group}`
      };
    }

    const found = options.find(
      (option) => option.name === String(selected)
    );

    if (!found) {
      return {
        ok: false,
        error: `Недопустимое значение параметра: ${group}`
      };
    }

    finalPrice += numberValue(found.surcharge, 0);
  }

  return {
    ok: true,
    price: finalPrice
  };
}

function buildVariantText(selectedOptions) {
  const labels = {
    colors: "Цвет",
    memories: "Память",
    sims: "SIM",
    regions: "Регион"
  };

  return Object.entries(selectedOptions)
    .map(([key, value]) => {
      const label = labels[key] || key;
      return `${label}: ${value}`;
    })
    .join(", ");
}

function orderStatusLabel(status) {
  const labels = {
    new: "Новый",
    confirmed: "Подтверждён",
    processing: "В обработке",
    ready: "Готов к выдаче",
    completed: "Завершён",
    cancelled: "Отменён",
    rejected: "Отклонён"
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

  return labels[status] || status || "Ожидает проверки";
}

function fulfillmentLabel(type) {
  if (type === "delivery") return "Доставка";
  if (type === "pickup") return "Самовывоз";
  return "Не указан";
}

async function tableExists(tableName) {
  const allowed = [
    "categories",
    "products",
    "product_variants",
    "orders",
    "users",
    "settings",
    "banners",
    "reservation_cards",
    "pickup_points",
    "store_settings"
  ];

  if (!allowed.includes(tableName)) {
    return false;
  }

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
  const allowed = [
    "categories",
    "products",
    "product_variants",
    "orders",
    "users",
    "settings",
    "banners",
    "reservation_cards",
    "pickup_points",
    "store_settings"
  ];

  if (!allowed.includes(tableName)) {
    return [];
  }

  const result = await db.execute(
    `PRAGMA table_info(${tableName})`
  );

  return result.rows.map((row) => String(row.name));
}

async function ensureColumn(tableName, columnName, definition) {
  const columns = await getColumns(tableName);

  if (!columns.includes(columnName)) {
    await db.execute(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`
    );

    console.log(
      `Added column ${tableName}.${columnName}`
    );
  }
}

async function getSetting(key, fallback = "") {
  try {
    const storeTable = await tableExists("store_settings");

    if (storeTable) {
      const result = await db.execute({
        sql: `
          SELECT value
          FROM store_settings
          WHERE key = ?
          LIMIT 1
        `,
        args: [key]
      });

      if (result.rows.length) {
        return result.rows[0].value ?? fallback;
      }
    }

    const result = await db.execute({
      sql: `
        SELECT value
        FROM settings
        WHERE key = ?
        LIMIT 1
      `,
      args: [key]
    });

    if (result.rows.length) {
      return result.rows[0].value ?? fallback;
    }

    return fallback;
  } catch {
    return fallback;
  }
}

async function setSetting(key, value) {
  const exists = await db.execute({
    sql: `
      SELECT key
      FROM store_settings
      WHERE key = ?
      LIMIT 1
    `,
    args: [key]
  });

  if (exists.rows.length) {
    await db.execute({
      sql: `
        UPDATE store_settings
        SET value = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE key = ?
      `,
      args: [String(value ?? ""), key]
    });

    return;
  }

  await db.execute({
    sql: `
      INSERT INTO store_settings (
        key,
        value
      )
      VALUES (?, ?)
    `,
    args: [key, String(value ?? "")]
  });
}

async function getReservationAmount() {
  const value = await getSetting(
    "reservation_amount",
    "1000"
  );

  const amount = numberValue(value, 1000);

  return amount >= 0 ? amount : 1000;
}

async function getDefaultReservationCard() {
  const result = await db.execute(`
    SELECT
      id,
      card_number,
      recipient_name,
      bank_name,
      is_active,
      is_default
    FROM reservation_cards
    WHERE is_active = 1
    ORDER BY
      is_default DESC,
      id ASC
    LIMIT 1
  `);

  return result.rows[0] || null;
}

async function ensureUser(tgUser) {
  if (!tgUser || !tgUser.id) {
    return null;
  }

  const telegramUserId = String(tgUser.id);
  const firstName = String(tgUser.first_name || "");
  const lastName = String(tgUser.last_name || "");
  const username = String(tgUser.username || "");

  /*
    ВАЖНО:
    Здесь намеренно НЕТ:
    ON CONFLICT(telegram_user_id)

    Это позволяет работать со старой Turso-базой,
    где telegram_user_id может не иметь UNIQUE.
  */

  const existing = await db.execute({
    sql: `
      SELECT id
      FROM users
      WHERE telegram_user_id = ?
      LIMIT 1
    `,
    args: [telegramUserId]
  });

  if (existing.rows.length > 0) {
    const userId = Number(existing.rows[0].id);

    await db.execute({
      sql: `
        UPDATE users
        SET
          first_name = ?,
          last_name = ?,
          username = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      args: [
        firstName,
        lastName,
        username,
        userId
      ]
    });

    return userId;
  }

  const result = await db.execute({
    sql: `
      INSERT INTO users (
        telegram_user_id,
        first_name,
        last_name,
        username
      )
      VALUES (?, ?, ?, ?)
    `,
    args: [
      telegramUserId,
      firstName,
      lastName,
      username
    ]
  });

  return Number(result.lastInsertRowid);
}

/* =========================================================
   TELEGRAM
========================================================= */

async function telegramApi(method, payload = {}) {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();

    if (!data.ok) {
      console.error(
        `Telegram ${method} error:`,
        data
      );
    }

    return data;
  } catch (error) {
    console.error(
      `Telegram ${method} request error:`,
      error
    );

    return {
      ok: false,
      error: error.message
    };
  }
}

async function sendTelegramMessage(
  chatId,
  text,
  extra = {}
) {
  if (!chatId || !text) return null;

  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...extra
  });
}

async function answerCallbackQuery(callbackQueryId) {
  if (!callbackQueryId) return;

  await telegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId
  });
}

async function notifyAdminsAboutOrder(order) {
  const text = [
    `<b>Новый заказ ${escapeTelegramHtml(
      orderDisplayId(order.id)
    )}</b>`,
    "",
    `<b>Товар:</b> ${escapeTelegramHtml(
      order.product_name
    )}`,
    `<b>Характеристики:</b> ${escapeTelegramHtml(
      order.variant_text || "—"
    )}`,
    `<b>Цена:</b> ${escapeTelegramHtml(
      formatPrice(order.price)
    )}`,
    "",
    `<b>Клиент:</b> ${escapeTelegramHtml(
      order.customer_name || "—"
    )}`,
    `<b>Username:</b> ${escapeTelegramHtml(
      order.customer_username || "—"
    )}`,
    `<b>Telegram ID:</b> ${escapeTelegramHtml(
      order.telegram_user_id || "—"
    )}`,
    "",
    `<b>Получение:</b> ${escapeTelegramHtml(
      fulfillmentLabel(order.fulfillment_type)
    )}`,
    `<b>Бронирование:</b> ${escapeTelegramHtml(
      formatPrice(order.reservation_amount)
    )}`,
    `<b>Статус брони:</b> ${escapeTelegramHtml(
      reservationStatusLabel(order.reservation_status)
    )}`,
    "",
    `<b>Комментарий:</b> ${escapeTelegramHtml(
      order.customer_comment || "—"
    )}`
  ].join("\n");

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "Открыть заказ",
          web_app: {
            url: `${MINIAPP_URL}/admin.html?order=${order.id}`
          }
        }
      ]
    ]
  };

  for (const adminId of ADMIN_IDS) {
    await sendTelegramMessage(
      adminId,
      text,
      {
        reply_markup: keyboard
      }
    );
  }
}

async function notifyCustomerReservation(order) {
  if (!order.telegram_user_id) return;

  let text = "";

  if (order.reservation_status === "confirmed") {
    text = [
      `<b>Бронь подтверждена</b>`,
      "",
      `${escapeTelegramHtml(order.product_name)}`,
      `<b>Заказ:</b> ${escapeTelegramHtml(
        orderDisplayId(order.id)
      )}`,
      "",
      "Мы подтвердили вашу бронь."
    ].join("\n");
  }

  if (order.reservation_status === "rejected") {
    text = [
      `<b>Бронь отклонена</b>`,
      "",
      `${escapeTelegramHtml(order.product_name)}`,
      `<b>Заказ:</b> ${escapeTelegramHtml(
        orderDisplayId(order.id)
      )}`,
      "",
      "Свяжитесь с нами для уточнения деталей."
    ].join("\n");
  }

  if (!text) return;

  await sendTelegramMessage(
    order.telegram_user_id,
    text,
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
}

/* =========================================================
   UPLOADS
========================================================= */

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },

  filename: function (req, file, cb) {
    const extension = path.extname(
      file.originalname || ""
    );

    const safeExtension =
      extension.length <= 10
        ? extension.toLowerCase()
        : "";

    const randomName =
      `${Date.now()}-${crypto
        .randomBytes(8)
        .toString("hex")}${safeExtension}`;

    cb(null, randomName);
  }
});

const upload = multer({
  storage,

  limits: {
    fileSize: 100 * 1024 * 1024
  },

  fileFilter: function (req, file, cb) {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/avif",
      "video/mp4",
      "video/webm",
      "video/quicktime"
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(
        new Error(
          "Разрешены изображения JPG/PNG/WEBP/GIF/AVIF и видео MP4/WEBM/MOV"
        )
      );
    }

    cb(null, true);
  }
});

/* =========================================================
   DATABASE MIGRATIONS
========================================================= */

async function migrate() {
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
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_user_id TEXT,
      first_name TEXT DEFAULT '',
      last_name TEXT DEFAULT '',
      username TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
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

  /* -------------------------------------------------------
     SAFE MIGRATIONS
  ------------------------------------------------------- */

  const categoryColumns = await getColumns(
    "categories"
  );

  if (!categoryColumns.includes("image_url")) {
    await ensureColumn(
      "categories",
      "image_url",
      "TEXT DEFAULT ''"
    );
  }

  if (!categoryColumns.includes("description")) {
    await ensureColumn(
      "categories",
      "description",
      "TEXT DEFAULT ''"
    );
  }

  if (!categoryColumns.includes("sort_order")) {
    await ensureColumn(
      "categories",
      "sort_order",
      "INTEGER DEFAULT 0"
    );
  }

  if (!categoryColumns.includes("created_at")) {
    await ensureColumn(
      "categories",
      "created_at",
      "TEXT DEFAULT CURRENT_TIMESTAMP"
    );
  }

  if (!categoryColumns.includes("updated_at")) {
    await ensureColumn(
      "categories",
      "updated_at",
      "TEXT DEFAULT CURRENT_TIMESTAMP"
    );
  }

  const productColumns = await getColumns(
    "products"
  );

  if (!productColumns.includes("price_options")) {
    await ensureColumn(
      "products",
      "price_options",
      "TEXT DEFAULT '{}'"
    );
  }

  if (!productColumns.includes("created_at")) {
    await ensureColumn(
      "products",
      "created_at",
      "TEXT DEFAULT CURRENT_TIMESTAMP"
    );
  }

  if (!productColumns.includes("updated_at")) {
    await ensureColumn(
      "products",
      "updated_at",
      "TEXT DEFAULT CURRENT_TIMESTAMP"
    );
  }

  const orderColumns = await getColumns("orders");

  const orderMigrationColumns = [
    [
      "reservation_amount",
      "REAL DEFAULT 0"
    ],
    [
      "reservation_status",
      "TEXT DEFAULT 'not_required'"
    ],
    [
      "reservation_card_id",
      "INTEGER"
    ],
    [
      "fulfillment_type",
      "TEXT DEFAULT ''"
    ],
    [
      "pickup_point_id",
      "INTEGER"
    ],
    [
      "delivery_city",
      "TEXT DEFAULT ''"
    ],
    [
      "delivery_street",
      "TEXT DEFAULT ''"
    ],
    [
      "delivery_house",
      "TEXT DEFAULT ''"
    ],
    [
      "delivery_apartment",
      "TEXT DEFAULT ''"
    ],
    [
      "delivery_comment",
      "TEXT DEFAULT ''"
    ],
    [
      "customer_comment",
      "TEXT DEFAULT ''"
    ],
    [
      "reservation_paid_at",
      "TEXT"
    ]
  ];

  for (const [column, definition] of orderMigrationColumns) {
    if (!orderColumns.includes(column)) {
      await ensureColumn(
        "orders",
        column,
        definition
      );
    }
  }

  const userColumns = await getColumns("users");

  if (!userColumns.includes("telegram_user_id")) {
    await ensureColumn(
      "users",
      "telegram_user_id",
      "TEXT"
    );
  }

  if (!userColumns.includes("first_name")) {
    await ensureColumn(
      "users",
      "first_name",
      "TEXT DEFAULT ''"
    );
  }

  if (!userColumns.includes("last_name")) {
    await ensureColumn(
      "users",
      "last_name",
      "TEXT DEFAULT ''"
    );
  }

  if (!userColumns.includes("username")) {
    await ensureColumn(
      "users",
      "username",
      "TEXT DEFAULT ''"
    );
  }

  if (!userColumns.includes("created_at")) {
    await ensureColumn(
      "users",
      "created_at",
      "TEXT DEFAULT CURRENT_TIMESTAMP"
    );
  }

  if (!userColumns.includes("updated_at")) {
    await ensureColumn(
      "users",
      "updated_at",
      "TEXT DEFAULT CURRENT_TIMESTAMP"
    );
  }

  console.log("Database migrations completed");
}

/* =========================================================
   HEALTH
========================================================= */

app.get("/health", async (req, res) => {
  try {
    await db.execute("SELECT 1");

    res.json({
      ok: true,
      app: "IRoom",
      database: "connected",
      time: new Date().toISOString()
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
    const result = await db.execute(`
      SELECT
        id,
        name,
        image_url,
        description,
        sort_order
      FROM categories
      ORDER BY
        sort_order ASC,
        id ASC
    `);

    res.json({
      ok: true,
      categories: result.rows
    });
  } catch (error) {
    console.error("Categories error:", error);

    res.status(500).json({
      ok: false,
      error: "Не удалось загрузить категории"
    });
  }
});

/* =========================================================
   PUBLIC PRODUCTS
========================================================= */

app.get("/api/products", async (req, res) => {
  try {
    const categoryId = integerId(
      req.query.category_id
    );

    let result;

    if (categoryId) {
      result = await db.execute({
        sql: `
          SELECT
            p.*,
            c.name AS category_name
          FROM products p
          LEFT JOIN categories c
            ON c.id = p.category_id
          WHERE p.category_id = ?
          ORDER BY p.id DESC
        `,
        args: [categoryId]
      });
    } else {
      result = await db.execute(`
        SELECT
          p.*,
          c.name AS category_name
        FROM products p
        LEFT JOIN categories c
          ON c.id = p.category_id
        ORDER BY p.id DESC
      `);
    }

    const products = result.rows.map((product) => ({
      ...product,
      price: numberValue(product.price),
      price_options: parsePriceOptions(
        product.price_options
      )
    }));

    res.json({
      ok: true,
      products
    });
  } catch (error) {
    console.error("Products error:", error);

    res.status(500).json({
      ok: false,
      error: "Не удалось загрузить товары"
    });
  }
});

app.get(
  "/api/products/:id",
  async (req, res) => {
    try {
      const productId = integerId(req.params.id);

      if (!productId) {
        return res.status(400).json({
          ok: false,
          error: "Некорректный ID товара"
        });
      }

      const productResult = await db.execute({
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
        args: [productId]
      });

      if (!productResult.rows.length) {
        return res.status(404).json({
          ok: false,
          error: "Товар не найден"
        });
      }

      const product = {
        ...productResult.rows[0],
        price: numberValue(
          productResult.rows[0].price
        ),
        price_options: parsePriceOptions(
          productResult.rows[0].price_options
        )
      };

      const variantsResult = await db.execute({
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
        product,
        variants: variantsResult.rows
      });
    } catch (error) {
      console.error("Product details error:", error);

      res.status(500).json({
        ok: false,
        error: "Не удалось загрузить товар"
      });
    }
  }
);

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
      ORDER BY
        b.sort_order ASC,
        b.id ASC
    `);

    res.json({
      ok: true,
      banners: result.rows
    });
  } catch (error) {
    console.error("Banners error:", error);

    res.status(500).json({
      ok: false,
      error: "Не удалось загрузить баннеры"
    });
  }
});

/* =========================================================
   PUBLIC PICKUP POINTS
========================================================= */

app.get(
  "/api/pickup-points",
  async (req, res) => {
    try {
      const result = await db.execute(`
        SELECT *
        FROM pickup_points
        WHERE is_active = 1
        ORDER BY
          sort_order ASC,
          id ASC
      `);

      res.json({
        ok: true,
        pickup_points: result.rows
      });
    } catch (error) {
      console.error(
        "Pickup points error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Не удалось загрузить пункты выдачи"
      });
    }
  }
);

/* =========================================================
   PUBLIC RESERVATION
========================================================= */

app.get(
  "/api/reservation",
  async (req, res) => {
    try {
      const amount = await getReservationAmount();
      const card = await getDefaultReservationCard();

      res.json({
        ok: true,
        amount,
        card
      });
    } catch (error) {
      console.error(
        "Reservation error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Не удалось загрузить данные бронирования"
      });
    }
  }
);

/* =========================================================
   PUBLIC STORE CONFIG
========================================================= */

app.get(
  "/api/store-config",
  async (req, res) => {
    try {
      const keys = [
        "store_name",
        "contact_username",
        "contact_url",
        "channel_username",
        "channel_url",
        "telegram_username",
        "telegram_url",
        "reservation_amount",
        "reservation_text",
        "delivery_text",
        "pickup_text"
      ];

      const settings = {};

      for (const key of keys) {
        settings[key] = await getSetting(key, "");
      }

      settings.reservation_amount =
        await getReservationAmount();

      const card =
        await getDefaultReservationCard();

      const pickupResult = await db.execute(`
        SELECT *
        FROM pickup_points
        WHERE is_active = 1
        ORDER BY
          sort_order ASC,
          id ASC
      `);

      res.json({
        ok: true,
        settings,
        reservation: {
          amount: settings.reservation_amount,
          card
        },
        pickup_points: pickupResult.rows
      });
    } catch (error) {
      console.error(
        "Store config error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Не удалось загрузить настройки магазина"
      });
    }
  }
);

/* =========================================================
   PUBLIC SETTINGS — OLD COMPATIBILITY
========================================================= */

app.get(
  "/api/settings",
  async (req, res) => {
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
      console.error(
        "Settings error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Не удалось загрузить настройки"
      });
    }
  }
);

/* =========================================================
   CURRENT USER
========================================================= */

app.get(
  "/api/me",
  requireTelegram,
  async (req, res) => {
    try {
      const user = req.telegramUser;

      const userId = await ensureUser(user);

      res.json({
        ok: true,
        user: {
          id: userId,
          telegram_user_id: String(user.id),
          first_name: user.first_name || "",
          last_name: user.last_name || "",
          username: user.username || "",
          is_admin: isAdminId(user.id)
        }
      });
    } catch (error) {
      console.error("Me error:", error);

      res.status(500).json({
        ok: false,
        error: "Не удалось загрузить пользователя"
      });
    }
  }
);

/* =========================================================
   USER ORDERS
========================================================= */

app.get(
  "/api/orders",
  requireTelegram,
  async (req, res) => {
    try {
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
        args: [String(req.telegramUser.id)]
      });

      res.json({
        ok: true,
        orders: result.rows
      });
    } catch (error) {
      console.error(
        "User orders error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Не удалось загрузить заказы"
      });
    }
  }
);

app.get(
  "/api/orders/:id",
  requireTelegram,
  async (req, res) => {
    try {
      const orderId = integerId(req.params.id);

      if (!orderId) {
        return res.status(400).json({
          ok: false,
          error: "Некорректный ID заказа"
        });
      }

      const result = await db.execute({
        sql: `
          SELECT
            o.*,
            pp.name AS pickup_point_name,
            pp.address AS pickup_point_address,
            pp.working_hours AS pickup_point_working_hours,
            pp.map_url AS pickup_point_map_url
          FROM orders o
          LEFT JOIN pickup_points pp
            ON pp.id = o.pickup_point_id
          WHERE o.id = ?
            AND o.telegram_user_id = ?
          LIMIT 1
        `,
        args: [
          orderId,
          String(req.telegramUser.id)
        ]
      });

      if (!result.rows.length) {
        return res.status(404).json({
          ok: false,
          error: "Заказ не найден"
        });
      }

      res.json({
        ok: true,
        order: result.rows[0]
      });
    } catch (error) {
      console.error(
        "Order details error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Не удалось загрузить заказ"
      });
    }
  }
);

/* =========================================================
   CREATE ORDER
========================================================= */

app.post(
  "/api/orders",
  requireTelegram,
  async (req, res) => {
    try {
      const telegramUser = req.telegramUser;

      await ensureUser(telegramUser);

      const productId = integerId(
        req.body.product_id
      );

      const variantId = integerId(
        req.body.variant_id
      );

      if (!productId) {
        return res.status(400).json({
          ok: false,
          error: "Не выбран товар"
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
          error: "Товар не найден"
        });
      }

      const product = productResult.rows[0];

      const selectedOptions =
        normalizeSelectedOptions(
          req.body.selected_options
        );

      let finalPrice;
      let variantText =
        buildVariantText(selectedOptions);

      const priceOptions =
        parsePriceOptions(
          product.price_options
        );

      if (Object.keys(priceOptions).length) {
        const calculated =
          calculatePrice(
            product,
            selectedOptions
          );

        if (!calculated.ok) {
          return res.status(400).json({
            ok: false,
            error: calculated.error
          });
        }

        finalPrice = calculated.price;
      } else if (variantId) {
        const variantResult =
          await db.execute({
            sql: `
              SELECT *
              FROM product_variants
              WHERE id = ?
                AND product_id = ?
              LIMIT 1
            `,
            args: [
              variantId,
              productId
            ]
          });

        if (!variantResult.rows.length) {
          return res.status(400).json({
            ok: false,
            error: "Вариант товара не найден"
          });
        }

        const variant =
          variantResult.rows[0];

        finalPrice = numberValue(
          variant.price,
          numberValue(product.price)
        );

        variantText =
          variant.name ||
          [
            variant.color,
            variant.memory,
            variant.sim_type,
            variant.region
          ]
            .filter(Boolean)
            .join(", ");
      } else {
        finalPrice =
          numberValue(product.price);
      }

      const fulfillmentType =
        String(
          req.body.fulfillment_type ||
            req.body.fulfillment ||
            ""
        ).trim();

      if (
        fulfillmentType !== "pickup" &&
        fulfillmentType !== "delivery"
      ) {
        return res.status(400).json({
          ok: false,
          error: "Выберите способ получения"
        });
      }

      let pickupPointId = null;

      if (fulfillmentType === "pickup") {
        pickupPointId = integerId(
          req.body.pickup_point_id
        );

        if (!pickupPointId) {
          return res.status(400).json({
            ok: false,
            error: "Выберите пункт выдачи"
          });
        }

        const pickupResult =
          await db.execute({
            sql: `
              SELECT id
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
            error: "Пункт выдачи недоступен"
          });
        }
      }

      const deliveryCity =
        String(
          req.body.delivery_city || ""
        ).trim();

      const deliveryStreet =
        String(
          req.body.delivery_street || ""
        ).trim();

      const deliveryHouse =
        String(
          req.body.delivery_house || ""
        ).trim();

      const deliveryApartment =
        String(
          req.body.delivery_apartment || ""
        ).trim();

      const deliveryComment =
        String(
          req.body.delivery_comment || ""
        ).trim();

      if (fulfillmentType === "delivery") {
        if (
          !deliveryCity ||
          !deliveryStreet ||
          !deliveryHouse
        ) {
          return res.status(400).json({
            ok: false,
            error:
              "Для доставки укажите город, улицу и дом"
          });
        }
      }

      const customerComment =
        String(
          req.body.customer_comment ||
            req.body.comment ||
            ""
        ).trim();

      const reservationAmount =
        await getReservationAmount();

      const reservationCard =
        await getDefaultReservationCard();

      const reservationStatus =
        reservationAmount > 0
          ? "pending"
          : "not_required";

      const firstName =
        String(
          telegramUser.first_name || ""
        );

      const lastName =
        String(
          telegramUser.last_name || ""
        );

      const username =
        telegramUser.username
          ? `@${String(
              telegramUser.username
            ).replace(/^@/, "")}`
          : "";

      const customerFullName = [
        firstName,
        lastName
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

      const result = await db.execute({
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
            customer_comment
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          String(telegramUser.id),
          productId,
          variantId,
          String(product.name || ""),
          variantText,
          JSON.stringify(selectedOptions),
          finalPrice,
          customerFullName,
          username,
          "new",
          reservationAmount,
          reservationStatus,
          reservationCard
            ? Number(reservationCard.id)
            : null,
          fulfillmentType,
          pickupPointId,
          deliveryCity,
          deliveryStreet,
          deliveryHouse,
          deliveryApartment,
          deliveryComment,
          customerComment
        ]
      });

      const orderId =
        Number(result.lastInsertRowid);

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

      const order =
        orderResult.rows[0];

      try {
        await notifyAdminsAboutOrder(order);
      } catch (notificationError) {
        console.error(
          "Admin order notification error:",
          notificationError
        );
      }

      res.json({
        ok: true,
        order
      });
    } catch (error) {
      console.error(
        "Create order error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message ||
          "Не удалось создать заказ"
      });
    }
  }
);

/* =========================================================
   ADMIN ME
========================================================= */

app.get(
  "/api/admin/me",
  requireTelegram,
  async (req, res) => {
    res.json({
      ok: true,
      is_admin: isAdminId(
        req.telegramUser.id
      ),
      user: req.telegramUser
    });
  }
);

/* =========================================================
   ADMIN UPLOAD
========================================================= */

app.post(
  "/api/admin/upload",
  requireAdmin,
  (req, res) => {
    upload.single("file")(
      req,
      res,
      (error) => {
        if (error) {
          console.error(
            "Upload error:",
            error
          );

          return res.status(400).json({
            ok: false,
            error:
              error.message ||
              "Ошибка загрузки файла"
          });
        }

        if (!req.file) {
          return res.status(400).json({
            ok: false,
            error: "Файл не выбран"
          });
        }

        const url =
          `/uploads/${encodeURIComponent(
            req.file.filename
          )}`;

        res.json({
          ok: true,
          url,
          filename: req.file.filename,
          original_name:
            req.file.originalname,
          mimetype:
            req.file.mimetype,
          size: req.file.size
        });
      }
    );
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
      const result = await db.execute(`
        SELECT
          p.*,
          c.name AS category_name
        FROM products p
        LEFT JOIN categories c
          ON c.id = p.category_id
        ORDER BY p.id DESC
      `);

      const products =
        result.rows.map((product) => ({
          ...product,
          price_options:
            parsePriceOptions(
              product.price_options
            )
        }));

      res.json({
        ok: true,
        products
      });
    } catch (error) {
      console.error(
        "Admin products error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Не удалось загрузить товары"
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
        String(req.body.name || "").trim();

      if (!name) {
        return res.status(400).json({
          ok: false,
          error: "Введите название товара"
        });
      }

      const price =
        numberValue(
          req.body.price,
          0
        );

      const categoryId =
        integerId(
          req.body.category_id
        );

      const imageUrl =
        String(
          req.body.image_url || ""
        );

      const description =
        String(
          req.body.description || ""
        );

      const priceOptions =
        parsePriceOptions(
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
            price_options
          )
          VALUES (?, ?, ?, ?, ?, ?)
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
        id: Number(
          result.lastInsertRowid
        )
      });
    } catch (error) {
      console.error(
        "Admin create product error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Не удалось создать товар"
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
          error: "Некорректный ID товара"
        });
      }

      const name =
        String(req.body.name || "").trim();

      if (!name) {
        return res.status(400).json({
          ok: false,
          error: "Введите название товара"
        });
      }

      const price =
        numberValue(
          req.body.price,
          0
        );

      const categoryId =
        integerId(
          req.body.category_id
        );

      const imageUrl =
        String(
          req.body.image_url || ""
        );

      const description =
        String(
          req.body.description || ""
        );

      const priceOptions =
        parsePriceOptions(
          req.body.price_options
        );

      await db.execute({
        sql: `
          UPDATE products
          SET
            name = ?,
            price = ?,
            image_url = ?,
            description = ?,
            category_id = ?,
            price_options = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        args: [
          name,
          price,
          imageUrl,
          description,
          categoryId,
          JSON.stringify(priceOptions),
          id
        ]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        "Admin update product error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Не удалось обновить товар"
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
          error: "Некорректный ID товара"
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
      console.error(
        "Admin delete product error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Не удалось удалить товар"
      });
    }
  }
);

/* =========================================================
   ADMIN VARIANTS — LEGACY SUPPORT
========================================================= */

app.get(
  "/api/admin/products/:id/variants",
  requireAdmin,
  async (req, res) => {
    try {
      const productId =
        integerId(req.params.id);

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
        error: "Не удалось загрузить варианты"
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
          error: "Некорректный товар"
        });
      }

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
          String(req.body.name || ""),
          numberValue(
            req.body.price,
            0
          ),
          Math.max(
            0,
            Math.trunc(
              numberValue(
                req.body.stock,
                0
              )
            )
          ),
          String(
            req.body.color || ""
          ),
          String(
            req.body.memory || ""
          ),
          String(
            req.body.sim_type || ""
          ),
          String(
            req.body.region || ""
          )
        ]
      });

      res.json({
        ok: true,
        id: Number(
          result.lastInsertRowid
        )
      });
    } catch (error) {
      console.error(
        "Admin create variant error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Не удалось создать вариант"
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
          String(req.body.name || ""),
          numberValue(
            req.body.price,
            0
          ),
          Math.max(
            0,
            Math.trunc(
              numberValue(
                req.body.stock,
                0
              )
            )
          ),
          String(
            req.body.color || ""
          ),
          String(
            req.body.memory || ""
          ),
          String(
            req.body.sim_type || ""
          ),
          String(
            req.body.region || ""
          ),
          id
        ]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        "Admin update variant error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Не удалось обновить вариант"
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
        "Admin delete variant error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Не удалось удалить вариант"
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
        ORDER BY
          sort_order ASC,
          id ASC
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
        error: "Не удалось загрузить категории"
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
        String(req.body.name || "").trim();

      if (!name) {
        return res.status(400).json({
          ok: false,
          error: "Введите название категории"
        });
      }

      const result = await db.execute({
        sql: `
          INSERT INTO categories (
            name,
            image_url,
            description,
            sort_order
          )
          VALUES (?, ?, ?, ?)
        `,
        args: [
          name,
          String(
            req.body.image_url || ""
          ),
          String(
            req.body.description || ""
          ),
          Math.trunc(
            numberValue(
              req.body.sort_order,
              0
            )
          )
        ]
      });

      res.json({
        ok: true,
        id: Number(
          result.lastInsertRowid
        )
      });
    } catch (error) {
      console.error(
        "Admin create category error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Не удалось создать категорию"
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

      const name =
        String(req.body.name || "").trim();

      if (!id || !name) {
        return res.status(400).json({
          ok: false,
          error: "Некорректные данные"
        });
      }

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
          name,
          String(
            req.body.image_url || ""
          ),
          String(
            req.body.description || ""
          ),
          Math.trunc(
            numberValue(
              req.body.sort_order,
              0
            )
          ),
          id
        ]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        "Admin update category error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Не удалось обновить категорию"
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
          error: "Некорректный ID категории"
        });
      }

      await db.execute({
        sql: `
          UPDATE products
          SET category_id = NULL
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
        "Admin delete category error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Не удалось удалить категорию"
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
        ORDER BY
          b.sort_order ASC,
          b.id ASC
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
        error: "Не удалось загрузить баннеры"
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
            is_active
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          String(req.body.title || ""),
          String(req.body.text || ""),
          String(
            req.body.button_text || ""
          ),
          normalizeUrl(
            req.body.button_link
          ),
          integerId(
            req.body.product_id
          ),
          String(
            req.body.image_url || ""
          ),
          Math.trunc(
            numberValue(
              req.body.sort_order,
              0
            )
          ),
          req.body.is_active === false ||
          String(req.body.is_active) === "0"
            ? 0
            : 1
        ]
      });

      res.json({
        ok: true,
        id: Number(
          result.lastInsertRowid
        )
      });
    } catch (error) {
      console.error(
        "Admin create banner error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Не удалось создать баннер"
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
          error: "Некорректный ID баннера"
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
          String(req.body.title || ""),
          String(req.body.text || ""),
          String(
            req.body.button_text || ""
          ),
          normalizeUrl(
            req.body.button_link
          ),
          integerId(
            req.body.product_id
          ),
          String(
            req.body.image_url || ""
          ),
          Math.trunc(
            numberValue(
              req.body.sort_order,
              0
            )
          ),
          req.body.is_active === false ||
          String(req.body.is_active) === "0"
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
        "Admin update banner error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Не удалось обновить баннер"
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
        "Admin delete banner error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Не удалось удалить баннер"
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
        ORDER BY
          is_default DESC,
          id ASC
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
          "Не удалось загрузить карты бронирования"
      });
    }
  }
);

app.post(
  "/api/admin/reservation-cards",
  requireAdmin,
  async (req, res) => {
    try {
      const isDefault =
        req.body.is_default === false ||
        String(req.body.is_default) === "0"
          ? 0
          : 1;

      if (isDefault) {
        await db.execute(`
          UPDATE reservation_cards
          SET is_default = 0
        `);
      }

      const result = await db.execute({
        sql: `
          INSERT INTO reservation_cards (
            card_number,
            recipient_name,
            bank_name,
            is_active,
            is_default
          )
          VALUES (?, ?, ?, ?, ?)
        `,
        args: [
          String(
            req.body.card_number || ""
          ),
          String(
            req.body.recipient_name || ""
          ),
          String(
            req.body.bank_name || ""
          ),
          req.body.is_active === false ||
          String(req.body.is_active) === "0"
            ? 0
            : 1,
          isDefault
        ]
      });

      res.json({
        ok: true,
        id: Number(
          result.lastInsertRowid
        )
      });
    } catch (error) {
      console.error(
        "Admin create reservation card error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Не удалось создать карту бронирования"
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

      const isDefault =
        req.body.is_default === false ||
        String(req.body.is_default) === "0"
          ? 0
          : 1;

      if (isDefault) {
        await db.execute({
          sql: `
            UPDATE reservation_cards
            SET is_default = 0
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
          String(
            req.body.card_number || ""
          ),
          String(
            req.body.recipient_name || ""
          ),
          String(
            req.body.bank_name || ""
          ),
          req.body.is_active === false ||
          String(req.body.is_active) === "0"
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
        "Admin update reservation card error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Не удалось обновить карту бронирования"
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
        "Admin delete reservation card error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Не удалось удалить карту бронирования"
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
        ORDER BY
          sort_order ASC,
          id ASC
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
          "Не удалось загрузить пункты выдачи"
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
            is_active
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          String(
            req.body.name || ""
          ),
          String(
            req.body.address || ""
          ),
          String(
            req.body.working_hours || ""
          ),
          normalizeUrl(
            req.body.map_url
          ),
          normalizeUrl(
            req.body.video_url
          ),
          String(
            req.body.description || ""
          ),
          Math.trunc(
            numberValue(
              req.body.sort_order,
              0
            )
          ),
          req.body.is_active === false ||
          String(req.body.is_active) === "0"
            ? 0
            : 1
        ]
      });

      res.json({
        ok: true,
        id: Number(
          result.lastInsertRowid
        )
      });
    } catch (error) {
      console.error(
        "Admin create pickup point error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Не удалось создать пункт выдачи"
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
          String(
            req.body.name || ""
          ),
          String(
            req.body.address || ""
          ),
          String(
            req.body.working_hours || ""
          ),
          normalizeUrl(
            req.body.map_url
          ),
          normalizeUrl(
            req.body.video_url
          ),
          String(
            req.body.description || ""
          ),
          Math.trunc(
            numberValue(
              req.body.sort_order,
              0
            )
          ),
          req.body.is_active === false ||
          String(req.body.is_active) === "0"
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
        "Admin update pickup point error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Не удалось обновить пункт выдачи"
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
        "Admin delete pickup point error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Не удалось удалить пункт выдачи"
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
        SELECT key, value, updated_at
        FROM store_settings
        ORDER BY key ASC
      `);

      const settings = {};

      for (const row of result.rows) {
        settings[row.key] =
          row.value;
      }

      settings.reservation_amount =
        await getReservationAmount();

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
        error:
          "Не удалось загрузить настройки"
      });
    }
  }
);

app.put(
  "/api/admin/settings",
  requireAdmin,
  async (req, res) => {
    try {
      let settings =
        req.body.settings;

      if (
        !settings ||
        typeof settings !== "object" ||
        Array.isArray(settings)
      ) {
        settings = req.body;
      }

      const ignoredKeys = new Set([
        "settings"
      ]);

      for (const [
        key,
        value
      ] of Object.entries(settings)) {
        if (ignoredKeys.has(key)) {
          continue;
        }

        if (
          typeof value === "object" &&
          value !== null
        ) {
          continue;
        }

        await setSetting(
          String(key),
          String(value ?? "")
        );
      }

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        "Admin save settings error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Не удалось сохранить настройки"
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
          pp.address AS pickup_point_address
        FROM orders o
        LEFT JOIN pickup_points pp
          ON pp.id = o.pickup_point_id
        ORDER BY o.id DESC
      `);

      res.json({
        ok: true,
        orders: result.rows
      });
    } catch (error) {
      console.error(
        "Admin orders error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Не удалось загрузить заказы"
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

      const result = await db.execute({
        sql: `
          SELECT
            o.*,
            pp.name AS pickup_point_name,
            pp.address AS pickup_point_address,
            pp.working_hours AS pickup_point_working_hours,
            pp.map_url AS pickup_point_map_url,
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
          error: "Заказ не найден"
        });
      }

      res.json({
        ok: true,
        order: result.rows[0]
      });
    } catch (error) {
      console.error(
        "Admin order details error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Не удалось загрузить заказ"
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

      const status =
        String(
          req.body.status || ""
        ).trim();

      const allowedStatuses = [
        "new",
        "confirmed",
        "processing",
        "ready",
        "completed",
        "cancelled",
        "rejected"
      ];

      if (
        !id ||
        !allowedStatuses.includes(status)
      ) {
        return res.status(400).json({
          ok: false,
          error: "Недопустимый статус заказа"
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

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        "Admin order status error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Не удалось изменить статус заказа"
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

      const reservationStatus =
        String(
          req.body.reservation_status ||
            req.body.status ||
            ""
        ).trim();

      const allowedStatuses = [
        "not_required",
        "pending",
        "confirmed",
        "rejected"
      ];

      if (
        !id ||
        !allowedStatuses.includes(
          reservationStatus
        )
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Недопустимый статус бронирования"
        });
      }

      if (
        reservationStatus === "confirmed"
      ) {
        await db.execute({
          sql: `
            UPDATE orders
            SET
              reservation_status = ?,
              reservation_paid_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
          args: [
            reservationStatus,
            id
          ]
        });
      } else {
        await db.execute({
          sql: `
            UPDATE orders
            SET
              reservation_status = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
          args: [
            reservationStatus,
            id
          ]
        });
      }

      const result = await db.execute({
        sql: `
          SELECT *
          FROM orders
          WHERE id = ?
          LIMIT 1
        `,
        args: [id]
      });

      const order =
        result.rows[0];

      if (order) {
        try {
          await notifyCustomerReservation(
            order
          );
        } catch (notificationError) {
          console.error(
            "Customer reservation notification error:",
            notificationError
          );
        }
      }

      res.json({
        ok: true,
        order
      });
    } catch (error) {
      console.error(
        "Reservation status error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Не удалось изменить статус бронирования"
      });
    }
  }
);

/* =========================================================
   TELEGRAM WEBHOOK
========================================================= */

app.post(
  "/webhook",
  async (req, res) => {
    res.sendStatus(200);

    try {
      const update = req.body || {};

      if (update.callback_query) {
        const callback =
          update.callback_query;

        await answerCallbackQuery(
          callback.id
        );

        const data =
          String(callback.data || "");

        if (
          data.startsWith(
            "order_status:"
          )
        ) {
          const parts =
            data.split(":");

          const orderId =
            integerId(parts[1]);

          const status =
            parts[2];

          if (
            orderId &&
            [
              "new",
              "confirmed",
              "processing",
              "ready",
              "completed",
              "cancelled",
              "rejected"
            ].includes(status)
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
          }
        }

        return;
      }

      const message =
        update.message;

      if (!message) {
        return;
      }

      const chatId =
        message.chat?.id;

      const text =
        String(
          message.text || ""
        ).trim();

      if (text === "/start") {
        await sendTelegramMessage(
          chatId,
          "<b>IRoom</b>\n\nДобро пожаловать в магазин.",
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

      if (text === "/app") {
        await sendTelegramMessage(
          chatId,
          "Откройте IRoom:",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "Открыть магазин",
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
    } catch (error) {
      console.error(
        "Webhook processing error:",
        error
      );
    }
  }
);

/* =========================================================
   WEBHOOK SETUP
========================================================= */

async function setupWebhook() {
  const webhookUrl =
    `${MINIAPP_URL}/webhook`;

  const result =
    await telegramApi(
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
}

/* =========================================================
   SPA FALLBACK
========================================================= */

app.get(
  /^\/(?!api(?:\/|$)|webhook$).*/,
  (req, res) => {
    const indexPath =
      path.join(
        publicDir,
        "index.html"
      );

    if (
      fs.existsSync(indexPath)
    ) {
      return res.sendFile(
        indexPath
      );
    }

    res.status(404).send(
      "IRoom frontend not found"
    );
  }
);

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
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
        error.message ||
        "Internal server error"
    });
  }
);

/* =========================================================
   START
========================================================= */

async function start() {
  try {
    await db.execute(
      "SELECT 1"
    );

    console.log(
      "Turso database connection OK"
    );

    await migrate();

    app.listen(
      PORT,
      "0.0.0.0",
      async () => {
        console.log(
          `IRoom server running on port ${PORT}`
        );

        console.log(
          `Mini App: ${MINIAPP_URL}/`
        );

        try {
          await setupWebhook();
        } catch (error) {
          console.error(
            "Webhook setup failed:",
            error
          );
        }
      }
    );
  } catch (error) {
    console.error(
      "STARTUP ERROR:",
      error
    );

    process.exit(1);
  }
}

start();