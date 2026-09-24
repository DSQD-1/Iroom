const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const { createClient } = require("@libsql/client");

const app = express();

const PORT = Number(process.env.PORT || 10000);

const BOT_TOKEN = String(
  process.env.BOT_TOKEN || ""
).trim();

const ADMIN_IDS = [
  "5082864281",
  "5975037118"
];

const MINIAPP_URL = String(
  process.env.MINIAPP_URL ||
  "https://iroom-dww8.onrender.com"
).replace(/\/+$/, "");

const TURSO_DATABASE_URL = String(
  process.env.TURSO_DATABASE_URL || ""
).trim();

const TURSO_AUTH_TOKEN = String(
  process.env.TURSO_AUTH_TOKEN || ""
).trim();

const publicDir = path.join(
  __dirname,
  "public"
);

const uploadsDir = path.join(
  publicDir,
  "uploads"
);

fs.mkdirSync(
  publicDir,
  { recursive: true }
);

fs.mkdirSync(
  uploadsDir,
  { recursive: true }
);

if (
  !TURSO_DATABASE_URL ||
  !TURSO_AUTH_TOKEN
) {
  console.error(
    "TURSO_DATABASE_URL / TURSO_AUTH_TOKEN missing"
  );

  process.exit(1);
}

if (!BOT_TOKEN) {
  console.error(
    "BOT_TOKEN missing"
  );

  process.exit(1);
}

const db = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN
});

app.use(
  express.json({
    limit: "20mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "20mb"
  })
);

app.use(
  express.static(publicDir, {
    extensions: ["html"]
  })
);

/* =========================================================
   HELPERS
========================================================= */

function stringValue(value) {
  return String(
    value ?? ""
  ).trim();
}

function normalizePromoCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

async function getPromoCode(code) {
  const normalized = normalizePromoCode(code);
  if (!normalized) return null;
  const result = await db.execute({
    sql: `SELECT * FROM promo_codes WHERE code = ? LIMIT 1`,
    args: [normalized]
  });
  return result.rows[0] || null;
}

function validatePromoCode(promo, orderAmount) {
  if (!promo) return { valid: false, error: "Промокод не найден" };
  if (Number(promo.active) !== 1) return { valid: false, error: "Промокод отключён" };
  if (promo.expires_at) {
    const expires = new Date(promo.expires_at);
    if (!Number.isNaN(expires.getTime()) && expires.getTime() <= Date.now()) {
      return { valid: false, error: "Срок действия промокода истёк" };
    }
  }
  const amount = Math.max(0, Number(orderAmount) || 0);
  const minOrder = Math.max(0, Number(promo.min_order_amount) || 0);
  if (amount < minOrder) {
    return { valid: false, error: `Минимальная сумма заказа для промокода — ${formatPrice(minOrder)}` };
  }
  const maxUses = Math.max(0, Number(promo.max_uses) || 0);
  const usedCount = Math.max(0, Number(promo.used_count) || 0);
  if (maxUses > 0 && usedCount >= maxUses) return { valid: false, error: "Лимит использований промокода исчерпан" };
  const type = stringValue(promo.discount_type).toLowerCase();
  const value = Number(promo.discount_value) || 0;
  if (!["percent", "fixed"].includes(type) || value <= 0) return { valid: false, error: "Промокод настроен некорректно" };
  if (type === "percent" && value > 100) return { valid: false, error: "Процент скидки не может быть больше 100%" };
  return { valid: true };
}

function calculatePromoDiscount(promo, orderAmount) {
  const amount = Math.max(0, Number(orderAmount) || 0);
  const value = Math.max(0, Number(promo?.discount_value) || 0);
  if (stringValue(promo?.discount_type).toLowerCase() === "fixed") return Math.min(amount, value);
  return Math.min(amount, amount * (Math.min(100, value) / 100));
}

function integerId(value) {
  const number = Number(value);

  if (
    !Number.isInteger(number) ||
    number <= 0
  ) {
    return null;
  }

  return number;
}

function numberValue(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeJsonParse(
  value,
  fallback = null
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  if (
    typeof value === "object"
  ) {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeTelegramId(value) {
  return String(
    value ?? ""
  ).trim();
}

function normalizeUrl(value) {
  const text =
    stringValue(value);

  if (!text) {
    return "";
  }

  if (
    text.startsWith("http://") ||
    text.startsWith("https://") ||
    text.startsWith("tg://")
  ) {
    return text;
  }

  return `https://${text}`;
}

function formatPrice(value) {
  const number =
    numberValue(value);

  return `${number.toLocaleString(
    "ru-RU"
  )} ₽`;
}

function orderDisplayId(id) {
  return `IR-${1000 + Number(id)}`;
}

function customerName(row) {
  const first =
    stringValue(
      row?.first_name
    );

  const last =
    stringValue(
      row?.last_name
    );

  return (
    [first, last]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    stringValue(
      row?.username
    ) ||
    "Покупатель"
  );
}

function customerUsername(row) {
  const username =
    stringValue(
      row?.username
    );

  return username
    ? `@${username}`
    : "без username";
}

function escapeTelegramHtml(value) {
  return String(
    value ?? ""
  )
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isAdminId(id) {
  return ADMIN_IDS.includes(
    normalizeTelegramId(id)
  );
}

/* =========================================================
   TELEGRAM MINI APP AUTH
========================================================= */

function validateTelegramInitData(
  initData
) {
  if (!initData) {
    return null;
  }

  const params =
    new URLSearchParams(
      initData
    );

  const hash =
    params.get("hash");

  if (!hash) {
    return null;
  }

  params.delete("hash");

  const dataCheckString =
    [...params.entries()]
      .sort(
        ([a], [b]) =>
          a.localeCompare(b)
      )
      .map(
        ([key, value]) =>
          `${key}=${value}`
      )
      .join("\n");

  const secretKey =
    crypto
      .createHmac(
        "sha256",
        "WebAppData"
      )
      .update(BOT_TOKEN)
      .digest();

  const calculatedHash =
    crypto
      .createHmac(
        "sha256",
        secretKey
      )
      .update(dataCheckString)
      .digest("hex");

  if (
    calculatedHash.length !==
    hash.length
  ) {
    return null;
  }

  try {
    if (
      !crypto.timingSafeEqual(
        Buffer.from(
          calculatedHash,
          "utf8"
        ),
        Buffer.from(
          hash,
          "utf8"
        )
      )
    ) {
      return null;
    }
  } catch {
    return null;
  }

  const authDate =
    Number(
      params.get("auth_date")
    );

  if (
    Number.isFinite(authDate)
  ) {
    const age =
      Math.floor(
        Date.now() / 1000
      ) - authDate;

    if (
      age >
      60 * 60 * 24
    ) {
      return null;
    }
  }

  const user =
    safeJsonParse(
      params.get("user"),
      null
    );

  if (!user?.id) {
    return null;
  }

  return user;
}

function requireTelegram(
  req,
  res,
  next
) {
  const initData =
    stringValue(
      req.headers[
        "x-telegram-init-data"
      ]
    );

  const user =
    validateTelegramInitData(
      initData
    );

  if (!user) {
    return res
      .status(401)
      .json({
        error:
          "Invalid Telegram Mini App authorization"
      });
  }

  req.telegramUser =
    user;

  next();
}

function requireAdmin(
  req,
  res,
  next
) {
  const initData =
    stringValue(
      req.headers[
        "x-telegram-init-data"
      ]
    );

  const user =
    validateTelegramInitData(
      initData
    );

  if (!user) {
    return res
      .status(401)
      .json({
        error:
          "Invalid Telegram Mini App authorization"
      });
  }

  if (
    !isAdminId(user.id)
  ) {
    return res
      .status(403)
      .json({
        error:
          "Admin access required"
      });
  }

  req.telegramUser =
    user;

  next();
}

/* =========================================================
   TELEGRAM BOT API
========================================================= */

async function telegramApi(
  method,
  body = {}
) {
  const response =
    await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify(
          body
        )
      }
    );

  let data = {};

  try {
    data =
      await response.json();
  } catch {}

  if (!response.ok) {
    throw new Error(
      data?.description ||
      `Telegram HTTP ${response.status}`
    );
  }

  if (!data.ok) {
    throw new Error(
      data.description ||
      "Telegram API error"
    );
  }

  return data.result;
}

async function sendTelegramMessage(
  chatId,
  text,
  options = {}
) {
  const body = {
    chat_id: chatId,
    text,
    parse_mode:
      options.parse_mode ||
      "HTML"
  };

  if (
    options.reply_markup
  ) {
    body.reply_markup =
      options.reply_markup;
  }

  return telegramApi(
    "sendMessage",
    body
  );
}

/* =========================================================
   STORE SETTINGS
========================================================= */

async function getSetting(
  key,
  fallback = ""
) {
  try {
    const result =
      await db.execute({
        sql: `
          SELECT value
          FROM store_settings
          WHERE key = ?
          LIMIT 1
        `,
        args: [key]
      });

    if (
      result.rows.length
    ) {
      return (
        result.rows[0].value ??
        fallback
      );
    }
  } catch {}

  try {
    const result =
      await db.execute({
        sql: `
          SELECT value
          FROM settings
          WHERE key = ?
          LIMIT 1
        `,
        args: [key]
      });

    if (
      result.rows.length
    ) {
      return (
        result.rows[0].value ??
        fallback
      );
    }
  } catch {}

  return fallback;
}

async function setSetting(
  key,
  value
) {
  const existing =
    await db.execute({
      sql: `
        SELECT key
        FROM store_settings
        WHERE key = ?
        LIMIT 1
      `,
      args: [key]
    });

  if (
    existing.rows.length
  ) {
    await db.execute({
      sql: `
        UPDATE store_settings
        SET value = ?
        WHERE key = ?
      `,
      args: [
        String(value ?? ""),
        key
      ]
    });

    return;
  }

  await db.execute({
    sql: `
      INSERT INTO store_settings
      (key, value)
      VALUES (?, ?)
    `,
    args: [
      key,
      String(value ?? "")
    ]
  });
}

async function getReservationAmount() {
  const value =
    await getSetting(
      "reservation_amount",
      "0"
    );

  return Math.max(
    0,
    numberValue(value)
  );
}

async function getDefaultReservationCard() {
  try {
    const result =
      await db.execute(`
        SELECT *
        FROM reservation_cards
        WHERE active = 1
        ORDER BY is_default DESC, id ASC
        LIMIT 1
      `);

    return (
      result.rows[0] ||
      null
    );
  } catch {
    return null;
  }
}

/* =========================================================
   USERS
========================================================= */

async function ensureUser(
  tgUser
) {
  const telegramUserId =
    normalizeTelegramId(
      tgUser.id
    );

  const existing =
    await db.execute({
      sql: `
        SELECT *
        FROM users
        WHERE telegram_user_id = ?
        LIMIT 1
      `,
      args: [
        telegramUserId
      ]
    });

  if (
    existing.rows.length
  ) {
    await db.execute({
      sql: `
        UPDATE users
        SET
          first_name = ?,
          last_name = ?,
          username = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE telegram_user_id = ?
      `,
      args: [
        stringValue(
          tgUser.first_name
        ),
        stringValue(
          tgUser.last_name
        ),
        stringValue(
          tgUser.username
        ),
        telegramUserId
      ]
    });

    const refreshed =
      await db.execute({
        sql: `
          SELECT *
          FROM users
          WHERE telegram_user_id = ?
          LIMIT 1
        `,
        args: [
          telegramUserId
        ]
      });

    return (
      refreshed.rows[0] ||
      existing.rows[0]
    );
  }

  await db.execute({
    sql: `
      INSERT INTO users
      (
        telegram_user_id,
        first_name,
        last_name,
        username,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    args: [
      telegramUserId,
      stringValue(
        tgUser.first_name
      ),
      stringValue(
        tgUser.last_name
      ),
      stringValue(
        tgUser.username
      )
    ]
  });

  const created =
    await db.execute({
      sql: `
        SELECT *
        FROM users
        WHERE telegram_user_id = ?
        LIMIT 1
      `,
      args: [
        telegramUserId
      ]
    });

  return (
    created.rows[0] ||
    null
  );
}

/* =========================================================
   OPTIONS
========================================================= */

function parsePriceOptions(
  value
) {
  const source =
    safeJsonParse(
      value,
      value
    );

  if (
    !source ||
    typeof source !==
      "object"
  ) {
    return {
      colors: [],
      memories: [],
      sims: [],
      regions: []
    };
  }

  function normalize(list) {
    if (!Array.isArray(list)) {
      return [];
    }

    return list
      .map(item => {
        if (
          typeof item ===
          "string"
        ) {
          return {
            name: item,
            surcharge: 0
          };
        }

        if (
          !item ||
          typeof item !==
            "object"
        ) {
          return null;
        }

        return {
          name: String(
            item.name ??
              item.title ??
              item.value ??
              item.label ??
              ""
          ).trim(),

          surcharge:
            numberValue(
              item.surcharge ??
                item.extra ??
                item.extra_price ??
                0
            )
        };
      })
      .filter(
        item =>
          item &&
          item.name
      );
  }

  return {
    colors: normalize(
      source.colors
    ),

    memories: normalize(
      source.memories
    ),

    sims: normalize(
      source.sims
    ),

    regions: normalize(
      source.regions
    )
  };
}

function normalizeSelectedOptions(
  value
) {
  const source =
    safeJsonParse(
      value,
      value
    );

  if (
    !source ||
    typeof source !==
      "object"
  ) {
    return {};
  }

  const result = {};

  for (
    const key of [
      "color",
      "memory",
      "sim",
      "region"
    ]
  ) {
    if (
      source[key] !==
        undefined &&
      source[key] !== null &&
      String(
        source[key]
      ).trim()
    ) {
      result[key] =
        String(
          source[key]
        ).trim();
    }
  }

  return result;
}

function calculatePrice(
  product,
  selected
) {
  const base =
    numberValue(
      product.price
    );

  const groups =
    parsePriceOptions(
      product.price_options
    );

  let price = base;

  const mapping = [
    [
      "color",
      groups.colors
    ],
    [
      "memory",
      groups.memories
    ],
    [
      "sim",
      groups.sims
    ],
    [
      "region",
      groups.regions
    ]
  ];

  for (
    const [key, list] of mapping
  ) {
    if (!list.length) {
      continue;
    }

    if (!selected[key]) {
      throw new Error(
        `Выберите вариант: ${key}`
      );
    }

    const option =
      list.find(
        item =>
          String(
            item.name
          ) ===
          String(
            selected[key]
          )
      );

    if (!option) {
      throw new Error(
        `Недопустимый вариант: ${key}`
      );
    }

    price +=
      numberValue(
        option.surcharge
      );
  }

  return price;
}

function buildVariantText(
  selected
) {
  const labels = {
    color: "Цвет",
    memory: "Память",
    sim: "SIM",
    region: "Регион"
  };

  return Object.entries(
    selected || {}
  )
    .filter(
      ([, value]) =>
        value !==
          undefined &&
        value !== null &&
        String(value).trim()
    )
    .map(
      ([key, value]) =>
        `${labels[key] || key}: ${value}`
    )
    .join(" • ");
}

/* =========================================================
   STATUS HELPERS
========================================================= */

function orderStatusLabel(
  status
) {
  switch (status) {
    case "new":
      return "🆕 Новый";

    case "confirmed":
      return "🔵 Подтверждён";

    case "processing":
      return "⚙️ В обработке";

    case "ready":
      return "📦 Готов к выдаче";

    case "completed":
      return "🏁 Завершён";

    case "cancelled":
    case "rejected":
      return "❌ Отменён";

    default:
      return status ||
        "Новый";
  }
}

function reservationStatusLabel(
  status
) {
  switch (status) {
    case "pending_payment":
    case "pending":
      return "🟡 Ожидает оплаты";

    case "awaiting_confirmation":
      return "🟠 Ожидает проверки";

    case "confirmed":
      return "🟢 Залог подтверждён";

    case "rejected":
      return "🔴 Залог отклонён";

    case "not_required":
      return "Без залога";

    default:
      return status ||
        "Без залога";
  }
}

function fulfillmentLabel(
  type
) {
  return type ===
    "delivery"
    ? "Доставка"
    : "Самовывоз";
}

/* =========================================================
   DATABASE MIGRATIONS
========================================================= */

async function addColumnIfMissing(
  table,
  column,
  definition
) {
  const result =
    await db.execute(
      `PRAGMA table_info(${table})`
    );

  const exists =
    result.rows.some(
      row =>
        String(
          row.name
        ) === column
    );

  if (!exists) {
    await db.execute(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
    );
  }
}

async function migrate() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      image_url TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price REAL DEFAULT 0,
      old_price REAL DEFAULT 0,
      image_url TEXT DEFAULT '',
      images TEXT DEFAULT '[]',
      price_options TEXT DEFAULT '{}',
      is_new INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      name TEXT DEFAULT '',
      price REAL DEFAULT 0,
      color TEXT DEFAULT '',
      memory TEXT DEFAULT '',
      sim_type TEXT DEFAULT '',
      region TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
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
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      telegram_user_id TEXT,
      product_id INTEGER,
      variant_id INTEGER,
      product_name TEXT DEFAULT '',
      variant_text TEXT DEFAULT '',
      selected_options TEXT DEFAULT '{}',
      price REAL DEFAULT 0,
      promo_code TEXT DEFAULT '',
      payment_method TEXT DEFAULT 'cash',
      reservation_amount REAL DEFAULT 0,
      reservation_status TEXT DEFAULT 'not_required',
      reservation_card_id INTEGER,
      fulfillment_type TEXT DEFAULT '',
      receiving_type TEXT DEFAULT '',
      delivery_type TEXT DEFAULT '',
      pickup_point_id INTEGER,
      delivery_city TEXT DEFAULT '',
      delivery_street TEXT DEFAULT '',
      delivery_house TEXT DEFAULT '',
      delivery_apartment TEXT DEFAULT '',
      address TEXT DEFAULT '',
      customer_comment TEXT DEFAULT '',
      comment TEXT DEFAULT '',
      reservation_paid_at TEXT,
      status TEXT DEFAULT 'new',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS promo_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      discount_type TEXT DEFAULT 'percent',
      discount_value REAL DEFAULT 0,
      min_order_amount REAL DEFAULT 0,
      max_uses INTEGER DEFAULT 0,
      used_count INTEGER DEFAULT 0,
      expires_at TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await addColumnIfMissing("orders", "promo_discount", "REAL DEFAULT 0");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT ''
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS store_settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT ''
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS banners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT DEFAULT '',
      subtitle TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      button_text TEXT DEFAULT '',
      button_url TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS reservation_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT DEFAULT '',
      card_number TEXT DEFAULT '',
      recipient TEXT DEFAULT '',
      requisites TEXT DEFAULT '',
      amount REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS pickup_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT DEFAULT '',
      address TEXT DEFAULT '',
      directions_url TEXT DEFAULT '',
      video_url TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await addColumnIfMissing(
    "products",
    "price_options",
    "TEXT DEFAULT '{}'"
  );

  await addColumnIfMissing(
    "products",
    "created_at",
    "TEXT DEFAULT CURRENT_TIMESTAMP"
  );

  await addColumnIfMissing(
    "products",
    "updated_at",
    "TEXT DEFAULT CURRENT_TIMESTAMP"
  );

  await addColumnIfMissing(
    "orders",
    "user_id",
    "INTEGER"
  );

  await addColumnIfMissing(
    "orders",
    "telegram_user_id",
    "TEXT"
  );

  await addColumnIfMissing(
    "orders",
    "reservation_amount",
    "REAL DEFAULT 0"
  );

  await addColumnIfMissing(
    "orders",
    "reservation_status",
    "TEXT DEFAULT 'not_required'"
  );

  await addColumnIfMissing(
    "orders",
    "reservation_card_id",
    "INTEGER"
  );

  await addColumnIfMissing(
    "orders",
    "fulfillment_type",
    "TEXT DEFAULT ''"
  );

  await addColumnIfMissing(
    "orders",
    "receiving_type",
    "TEXT DEFAULT ''"
  );

  await addColumnIfMissing(
    "orders",
    "delivery_type",
    "TEXT DEFAULT ''"
  );

  await addColumnIfMissing(
    "orders",
    "pickup_point_id",
    "INTEGER"
  );

  await addColumnIfMissing(
    "orders",
    "delivery_city",
    "TEXT DEFAULT ''"
  );

  await addColumnIfMissing(
    "orders",
    "delivery_street",
    "TEXT DEFAULT ''"
  );

  await addColumnIfMissing(
    "orders",
    "delivery_house",
    "TEXT DEFAULT ''"
  );

  await addColumnIfMissing(
    "orders",
    "delivery_apartment",
    "TEXT DEFAULT ''"
  );

  await addColumnIfMissing(
    "orders",
    "customer_comment",
    "TEXT DEFAULT ''"
  );

  await addColumnIfMissing(
    "orders",
    "reservation_paid_at",
    "TEXT"
  );

  await addColumnIfMissing(
    "orders",
    "updated_at",
    "TEXT DEFAULT CURRENT_TIMESTAMP"
  );

  await addColumnIfMissing(
    "users",
    "telegram_user_id",
    "TEXT"
  );

  await addColumnIfMissing(
    "users",
    "first_name",
    "TEXT DEFAULT ''"
  );

  await addColumnIfMissing(
    "users",
    "last_name",
    "TEXT DEFAULT ''"
  );

  await addColumnIfMissing(
    "users",
    "username",
    "TEXT DEFAULT ''"
  );

  console.log(
    "Database migration completed"
  );
}

/* =========================================================
   ORDER ACCESS
========================================================= */

async function getOrderById(
  id
) {
  const result =
    await db.execute({
      sql: `
        SELECT
          o.*,
          u.first_name AS user_first_name,
          u.last_name AS user_last_name,
          u.username AS user_username
        FROM orders o
        LEFT JOIN users u
          ON u.telegram_user_id = o.telegram_user_id
        WHERE o.id = ?
        LIMIT 1
      `,
      args: [id]
    });

  return (
    result.rows[0] ||
    null
  );
}

function isOrderOwnedByUser(
  order,
  telegramUser
) {
  const currentId =
    normalizeTelegramId(
      telegramUser.id
    );

  const orderTelegramId =
    normalizeTelegramId(
      order.telegram_user_id
    );

  if (
    orderTelegramId
  ) {
    return (
      orderTelegramId ===
      currentId
    );
  }

  if (
    order.user_id
  ) {
    return false;
  }

  return false;
}

/* =========================================================
   NOTIFICATIONS
========================================================= */

async function notifyAdminsAboutOrder(
  order
) {
  const customer =
    customerName({
      first_name:
        order.user_first_name ||
        order.first_name,

      last_name:
        order.user_last_name ||
        order.last_name,

      username:
        order.user_username ||
        order.username
    });

  const username =
    order.user_username ||
    order.username ||
    "";

  const text = `
🛒 <b>Новый заказ IRoom</b>

<b>Заказ:</b> ${escapeTelegramHtml(
    order.display_id ||
    orderDisplayId(order.id)
  )}

<b>Товар:</b> ${escapeTelegramHtml(
    order.product_name ||
    "Товар"
  )}

${
  order.variant_text
    ? `<b>Вариант:</b> ${escapeTelegramHtml(
        order.variant_text
      )}`
    : ""
}

<b>Стоимость:</b> ${formatPrice(
    order.price
  )}

<b>Залог:</b> ${formatPrice(
    order.reservation_amount
  )}

<b>Статус залога:</b> ${escapeTelegramHtml(
    reservationStatusLabel(
      order.reservation_status
    )
  )}

<b>Получение:</b> ${escapeTelegramHtml(
    fulfillmentLabel(
      order.fulfillment_type ||
        order.receiving_type
    )
  )}

<b>Клиент:</b> ${escapeTelegramHtml(
    customer
  )}

${
  username
    ? `<b>Username:</b> @${escapeTelegramHtml(
        username
      )}`
    : ""
}
  `.trim();

  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text:
            "Открыть заказ",
          web_app: {
            url:
              `${MINIAPP_URL}/admin.html?order=${order.id}`
          }
        }
      ]
    ]
  };

  for (
    const adminId of ADMIN_IDS
  ) {
    try {
      await sendTelegramMessage(
        adminId,
        text,
        {
          reply_markup:
            replyMarkup
        }
      );
    } catch (error) {
      console.error(
        "Admin order notification:",
        adminId,
        error.message
      );
    }
  }
}

async function notifyAdminsAboutReservationPayment(
  order
) {
  const customer =
    customerName({
      first_name:
        order.user_first_name ||
        order.first_name,

      last_name:
        order.user_last_name ||
        order.last_name,

      username:
        order.user_username ||
        order.username
    });

  const username =
    order.user_username ||
    order.username ||
    "";

  const text = `
⚠️ <b>Проверка залога</b>

<b>Заказ:</b> ${escapeTelegramHtml(
    order.display_id ||
    orderDisplayId(order.id)
  )}

<b>Товар:</b> ${escapeTelegramHtml(
    order.product_name ||
    "Товар"
  )}

<b>Сумма залога:</b> ${formatPrice(
    order.reservation_amount
  )}

<b>Статус:</b> 🟠 Ожидает проверки

<b>Клиент:</b> ${escapeTelegramHtml(
    customer
  )}

${
  username
    ? `<b>Username:</b> @${escapeTelegramHtml(
        username
      )}`
    : ""
}

<b>Время заявки:</b> ${escapeTelegramHtml(
    order.reservation_paid_at ||
    ""
  )}
  `.trim();

  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text:
            "Открыть заказ",
          web_app: {
            url:
              `${MINIAPP_URL}/admin.html?order=${order.id}`
          }
        }
      ]
    ]
  };

  for (
    const adminId of ADMIN_IDS
  ) {
    try {
      await sendTelegramMessage(
        adminId,
        text,
        {
          reply_markup:
            replyMarkup
        }
      );
    } catch (error) {
      console.error(
        "Reservation notification:",
        adminId,
        error.message
      );
    }
  }
}

async function notifyCustomerReservation(
  order
) {
  const telegramId =
    normalizeTelegramId(
      order.telegram_user_id
    );

  if (!telegramId) {
    return;
  }

  let text = "";

  if (
    order.reservation_status ===
    "confirmed"
  ) {
    text = `
🟢 <b>Залог подтверждён</b>

Заказ: <b>${escapeTelegramHtml(
      order.display_id ||
      orderDisplayId(order.id)
    )}</b>

Товар: <b>${escapeTelegramHtml(
      order.product_name ||
      "Товар"
    )}</b>

Залог: <b>${formatPrice(
      order.reservation_amount
    )}</b>

Остаток оплачивается наличными при получении.
    `.trim();
  } else if (
    order.reservation_status ===
    "rejected"
  ) {
    text = `
🔴 <b>Залог отклонён</b>

Заказ: <b>${escapeTelegramHtml(
      order.display_id ||
      orderDisplayId(order.id)
    )}</b>

Пожалуйста, проверьте реквизиты и свяжитесь с менеджером IRoom.
    `.trim();
  } else {
    return;
  }

  try {
    await sendTelegramMessage(
      telegramId,
      text,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text:
                  "Открыть мои заказы",
                web_app: {
                  url:
                    `${MINIAPP_URL}/index.html`
                }
              }
            ]
          ]
        }
      }
    );
  } catch (error) {
    console.error(
      "Customer reservation notification:",
      error.message
    );
  }
}

/* =========================================================
   UPLOADS
========================================================= */

const storage =
  multer.diskStorage({
    destination:
      uploadsDir,

    filename: (
      req,
      file,
      cb
    ) => {
      const ext =
        path.extname(
          file.originalname
        );

      const name =
        `${Date.now()}-${crypto
          .randomBytes(6)
          .toString("hex")}${ext}`;

      cb(
        null,
        name
      );
    }
  });

const upload =
  multer({
    storage,
    limits: {
      fileSize:
        100 * 1024 * 1024
    },

    fileFilter:
      (
        req,
        file,
        cb
      ) => {
        const allowed =
          [
            "image/",
            "video/mp4",
            "video/webm",
            "video/quicktime"
          ].some(
            type =>
              file.mimetype.startsWith(
                type
              )
          );

        if (!allowed) {
          return cb(
            new Error(
              "Недопустимый тип файла"
            )
          );
        }

        cb(
          null,
          true
        );
      }
  });

app.post(
  "/api/admin/upload",
  requireAdmin,
  upload.single("file"),
  (req, res) => {
    if (!req.file) {
      return res
        .status(400)
        .json({
          error:
            "Файл не загружен"
        });
    }

    const url =
      `/uploads/${encodeURIComponent(
        req.file.filename
      )}`;

    res.json({
      ok: true,
      url
    });
  }
);

/* =========================================================
   PUBLIC API
========================================================= */

app.get(
  "/api/categories",
  async (
    req,
    res
  ) => {
    try {
      const result =
        await db.execute(`
          SELECT *
          FROM categories
          ORDER BY id ASC
        `);

      res.json({
        categories:
          result.rows
      });
    } catch (error) {
      console.error(
        error
      );

      res
        .status(500)
        .json({
          error:
            "Не удалось загрузить категории"
        });
    }
  }
);

app.get(
  "/api/products",
  async (
    req,
    res
  ) => {
    try {
      const result =
        await db.execute(`
          SELECT *
          FROM products
          ORDER BY id DESC
        `);

      res.json({
        products:
          result.rows
      });
    } catch (error) {
      console.error(
        error
      );

      res
        .status(500)
        .json({
          error:
            "Не удалось загрузить товары"
        });
    }
  }
);

app.get(
  "/api/products/:id",
  async (
    req,
    res
  ) => {
    try {
      const id =
        integerId(
          req.params.id
        );

      if (!id) {
        return res
          .status(400)
          .json({
            error:
              "Некорректный ID"
          });
      }

      const productResult =
        await db.execute({
          sql: `
            SELECT *
            FROM products
            WHERE id = ?
            LIMIT 1
          `,
          args: [id]
        });

      const product =
        productResult.rows[0];

      if (!product) {
        return res
          .status(404)
          .json({
            error:
              "Товар не найден"
          });
      }

      const variants =
        await db.execute({
          sql: `
            SELECT *
            FROM product_variants
            WHERE product_id = ?
            ORDER BY id ASC
          `,
          args: [id]
        });

      res.json({
        product: {
          ...product,
          variants:
            variants.rows
        }
      });
    } catch (error) {
      console.error(
        error
      );

      res
        .status(500)
        .json({
          error:
            "Не удалось загрузить товар"
        });
    }
  }
);

app.get(
  "/api/banners",
  async (
    req,
    res
  ) => {
    try {
      const result =
        await db.execute(`
          SELECT *
          FROM banners
          WHERE active = 1
          ORDER BY sort_order ASC, id ASC
        `);

      res.json({
        banners:
          result.rows
      });
    } catch (error) {
      res
        .status(500)
        .json({
          error:
            "Не удалось загрузить баннеры"
        });
    }
  }
);

app.get(
  "/api/pickup-points",
  async (
    req,
    res
  ) => {
    try {
      const result =
        await db.execute(`
          SELECT *
          FROM pickup_points
          WHERE active = 1
          ORDER BY id ASC
        `);

      res.json({
        pickup_points:
          result.rows
      });
    } catch (error) {
      res
        .status(500)
        .json({
          error:
            "Не удалось загрузить точки выдачи"
        });
    }
  }
);

/* =========================================================
   STORE CONFIG
========================================================= */

app.get(
  "/api/store-config",
  async (
    req,
    res
  ) => {
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

      for (
        const key of keys
      ) {
        settings[key] =
          await getSetting(
            key,
            ""
          );
      }

      const reservationAmount =
        await getReservationAmount();

      const reservationCard =
        await getDefaultReservationCard();

      const pickupResult =
        await db.execute(`
          SELECT *
          FROM pickup_points
          WHERE active = 1
          ORDER BY id ASC
        `);

      res.json({
        ...settings,

        reservation_amount:
          reservationAmount,

        reservation_card:
          reservationCard,

        pickup_points:
          pickupResult.rows
      });
    } catch (error) {
      console.error(
        "store-config:",
        error
      );

      res
        .status(500)
        .json({
          error:
            "Не удалось загрузить настройки магазина"
        });
    }
  }
);

/* =========================================================
   ME
========================================================= */

app.get(
  "/api/me",
  requireTelegram,
  async (
    req,
    res
  ) => {
    try {
      const user =
        await ensureUser(
          req.telegramUser
        );

      res.json({
        user
      });
    } catch (error) {
      console.error(
        error
      );

      res
        .status(500)
        .json({
          error:
            "Не удалось загрузить пользователя"
        });
    }
  }
);

/* =========================================================
   ORDERS - LIST
========================================================= */

app.get(
  "/api/orders",
  requireTelegram,
  async (
    req,
    res
  ) => {
    try {
      const telegramId =
        normalizeTelegramId(
          req.telegramUser.id
        );

      const result =
        await db.execute({
          sql: `
            SELECT *
            FROM orders
            WHERE telegram_user_id = ?
            ORDER BY id DESC
          `,
          args: [
            telegramId
          ]
        });

      const orders =
        result.rows.map(
          order => ({
            ...order,

            display_id:
              orderDisplayId(
                order.id
              ),

            selected_options:
              safeJsonParse(
                order.selected_options,
                {}
              )
          })
        );

      res.json({
        orders
      });
    } catch (error) {
      console.error(
        "GET orders:",
        error
      );

      res
        .status(500)
        .json({
          error:
            "Не удалось загрузить заказы"
        });
    }
  }
);

/* =========================================================
   ORDERS - DETAIL
========================================================= */

app.get(
  "/api/orders/:id",
  requireTelegram,
  async (
    req,
    res
  ) => {
    try {
      const id =
        integerId(
          req.params.id
        );

      if (!id) {
        return res
          .status(400)
          .json({
            error:
              "Некорректный ID заказа"
          });
      }

      if (promo) {
        const promoUpdate = await db.execute({
          sql: `
            UPDATE promo_codes
            SET used_count = used_count + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE code = ?
              AND active = 1
              AND (max_uses = 0 OR used_count < max_uses)
          `,
          args: [promoCode]
        });

        if (Number(promoUpdate.rowsAffected || 0) !== 1) {
          await db.execute({ sql: `DELETE FROM orders WHERE id = ?`, args: [Number(result.lastInsertRowid)] });
          return res.status(400).json({ error: "Промокод больше недоступен" });
        }
      }

      const order =
        await getOrderById(
          id
        );

      if (!order) {
        return res
          .status(404)
          .json({
            error:
              "Заказ не найден"
          });
      }

      if (
        !isOrderOwnedByUser(
          order,
          req.telegramUser
        )
      ) {
        return res
          .status(403)
          .json({
            error:
              "Нет доступа к этому заказу"
          });
      }

      res.json({
        order: {
          ...order,

          display_id:
            orderDisplayId(
              order.id
            ),

          selected_options:
            safeJsonParse(
              order.selected_options,
              {}
            )
        }
      });
    } catch (error) {
      console.error(
        "GET order:",
        error
      );

      res
        .status(500)
        .json({
          error:
            "Не удалось загрузить заказ"
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
  async (
    req,
    res
  ) => {
    try {
      const user =
        await ensureUser(
          req.telegramUser
        );

      const productId =
        integerId(
          req.body.product_id
        );

      if (!productId) {
        return res
          .status(400)
          .json({
            error:
              "Не выбран товар"
          });
      }

      const productResult =
        await db.execute({
          sql: `
            SELECT *
            FROM products
            WHERE id = ?
            LIMIT 1
          `,
          args: [
            productId
          ]
        });

      const product =
        productResult.rows[0];

      if (!product) {
        return res
          .status(404)
          .json({
            error:
              "Товар не найден"
          });
      }

      const selectedOptions =
        normalizeSelectedOptions(
          req.body
            .selected_options
        );

      let price =
        calculatePrice(
          product,
          selectedOptions
        );

      const variantId =
        integerId(
          req.body.variant_id
        );

      let variantText =
        stringValue(
          req.body.variant_text
        );

      if (
        variantId
      ) {
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

        const variant =
          variantResult.rows[0];

        if (!variant) {
          return res
            .status(400)
            .json({
              error:
                "Вариант товара не найден"
            });
        }

        if (
          !Object.keys(
            selectedOptions
          ).length
        ) {
          price =
            numberValue(
              variant.price,
              numberValue(
                product.price
              )
            );
        }

        if (!variantText) {
          variantText =
            [
              variant.color
                ? `Цвет: ${variant.color}`
                : "",

              variant.memory
                ? `Память: ${variant.memory}`
                : "",

              variant.sim_type
                ? `SIM: ${variant.sim_type}`
                : "",

              variant.region
                ? `Регион: ${variant.region}`
                : "",

              variant.name
                ? variant.name
                : ""
            ]
              .filter(Boolean)
              .join(" • ");
        }
      }

      const fulfillmentType =
        stringValue(
          req.body
            .fulfillment_type ||
          req.body
            .receiving_type ||
          req.body
              .delivery_type
        ) ===
        "delivery"
          ? "delivery"
          : "pickup";

      const deliveryCity =
        stringValue(
          req.body
            .delivery_city
        );

      const deliveryStreet =
        stringValue(
          req.body
            .delivery_street
        );

      const deliveryHouse =
        stringValue(
          req.body
            .delivery_house
        );

      const deliveryApartment =
        stringValue(
          req.body
            .delivery_apartment
        );

      if (
        fulfillmentType ===
        "delivery"
      ) {
        if (
          !deliveryCity ||
          !deliveryStreet ||
          !deliveryHouse
        ) {
          return res
            .status(400)
            .json({
              error:
                "Для доставки укажите город, улицу и дом"
            });
        }
      }

      const pickupPointId =
        integerId(
          req.body
            .pickup_point_id
        );

      if (
        fulfillmentType ===
        "pickup" &&
        pickupPointId
      ) {
        const pickupResult =
          await db.execute({
            sql: `
              SELECT id
              FROM pickup_points
              WHERE id = ?
                AND active = 1
              LIMIT 1
            `,
            args: [
              pickupPointId
            ]
          });

        if (
          !pickupResult.rows.length
        ) {
          return res
            .status(400)
            .json({
              error:
                "Точка выдачи недоступна"
            });
        }
      }

      const reservationAmount =
        await getReservationAmount();

      const reservationCard =
        await getDefaultReservationCard();

      const reservationStatus =
        reservationAmount > 0
          ? "pending_payment"
          : "not_required";

      const promoCode = normalizePromoCode(req.body?.promo_code);
      let promo = null;
      let promoDiscount = 0;
      let finalOrderPrice = Number(price) || 0;

      if (promoCode) {
        promo = await getPromoCode(promoCode);
        const promoCheck = validatePromoCode(promo, finalOrderPrice);
        if (!promoCheck.valid) return res.status(400).json({ error: promoCheck.error });
        promoDiscount = calculatePromoDiscount(promo, finalOrderPrice);
        finalOrderPrice = Math.max(0, finalOrderPrice - promoDiscount);
      }

      const customerComment =
        stringValue(
          req.body
            .customer_comment ||
          req.body.comment
        );

      const address =
        fulfillmentType ===
        "delivery"
          ? [
              deliveryCity,
              deliveryStreet,
              deliveryHouse
                ? `д. ${deliveryHouse}`
                : "",
              deliveryApartment
                ? `кв. ${deliveryApartment}`
                : ""
            ]
              .filter(Boolean)
              .join(", ")
          : "Самовывоз";

      const result =
        await db.execute({
          sql: `
            INSERT INTO orders
            (
              user_id,
              telegram_user_id,
              product_id,
              variant_id,
              product_name,
              variant_text,
              selected_options,
              price,
              promo_code,
              promo_discount,
              payment_method,
              reservation_amount,
              reservation_status,
              reservation_card_id,
              fulfillment_type,
              receiving_type,
              delivery_type,
              pickup_point_id,
              delivery_city,
              delivery_street,
              delivery_house,
              delivery_apartment,
              address,
              customer_comment,
              comment,
              status,
              created_at,
              updated_at
            )
            VALUES
            (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
          `,
          args: [
            user?.id ||
              null,

            normalizeTelegramId(
              req.telegramUser.id
            ),

            productId,

            variantId,

            stringValue(
              req.body
                .product_name
            ) ||
              product.name,

            variantText,

            JSON.stringify(
              selectedOptions
            ),

            finalOrderPrice,

            promoCode,

            promoDiscount,

            "cash",

            reservationAmount,

            reservationStatus,

            reservationCard?.id ||
              null,

            fulfillmentType,

            fulfillmentType,

            fulfillmentType,

            pickupPointId,

            deliveryCity,

            deliveryStreet,

            deliveryHouse,

            deliveryApartment,

            address,

            customerComment,

            customerComment,

            "new"
          ]
        });

      const order =
        await getOrderById(
          Number(
            result.lastInsertRowid
          )
        );

      const responseOrder = {
        ...order,

        display_id:
          orderDisplayId(
            order.id
          ),

        selected_options:
          safeJsonParse(
            order.selected_options,
            {}
          )
      };

      await notifyAdminsAboutOrder(
        responseOrder
      );

      res.status(201).json({
        order:
          responseOrder
      });
    } catch (error) {
      console.error(
        "CREATE ORDER:",
        error
      );

      res
        .status(500)
        .json({
          error:
            error.message ||
            "Не удалось создать заказ"
        });
    }
  }
);

/* =========================================================
   ⭐ USER SAYS DEPOSIT WAS PAID
========================================================= */

app.post(
  "/api/promo/validate",
  requireTelegram,
  async (req, res, next) => {
    try {
      const code = normalizePromoCode(req.body?.code);
      const amount = Math.max(0, Number(req.body?.amount) || 0);
      if (!code) return res.status(400).json({ valid: false, error: "Введите промокод" });
      const promo = await getPromoCode(code);
      const check = validatePromoCode(promo, amount);
      if (!check.valid) return res.status(400).json({ valid: false, error: check.error });
      const discount = calculatePromoDiscount(promo, amount);
      return res.json({ valid: true, code, discount, final_amount: Math.max(0, amount - discount), discount_type: promo.discount_type, discount_value: Number(promo.discount_value) || 0 });
    } catch (error) { next(error); }
  }
);

app.post(
  "/api/orders/:id/reservation-paid",
  requireTelegram,
  async (
    req,
    res
  ) => {
    try {
      const id =
        integerId(
          req.params.id
        );

      if (!id) {
        return res
          .status(400)
          .json({
            error:
              "Некорректный ID заказа"
          });
      }

      const order =
        await getOrderById(
          id
        );

      if (!order) {
        return res
          .status(404)
          .json({
            error:
              "Заказ не найден"
          });
      }

      /*
       * ВАЖНО:
       * Проверяем, что заказ принадлежит
       * именно пользователю Telegram.
       */
      if (
        !isOrderOwnedByUser(
          order,
          req.telegramUser
        )
      ) {
        return res
          .status(403)
          .json({
            error:
              "Нет доступа к этому заказу"
          });
      }

      const reservationAmount =
        numberValue(
          order.reservation_amount
        );

      if (
        reservationAmount <= 0
      ) {
        return res
          .status(400)
          .json({
            error:
              "Для этого заказа залог не требуется"
          });
      }

      const currentStatus =
        stringValue(
          order.reservation_status
        );

      /*
       * Повторно нажать кнопку нельзя,
       * пока админ не отклонит заявку.
       */
      if (
        currentStatus ===
        "awaiting_confirmation"
      ) {
        return res
          .status(400)
          .json({
            error:
              "Заявка уже ожидает проверки"
          });
      }

      if (
        currentStatus ===
        "confirmed"
      ) {
        return res
          .status(400)
          .json({
            error:
              "Залог уже подтверждён"
          });
      }

      await db.execute({
        sql: `
          UPDATE orders
          SET
            reservation_status = 'awaiting_confirmation',
            reservation_paid_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        args: [id]
      });

      const updated =
        await getOrderById(
          id
        );

      const responseOrder = {
        ...updated,

        display_id:
          orderDisplayId(
            updated.id
          ),

        selected_options:
          safeJsonParse(
            updated.selected_options,
            {}
          )
      };

      /*
       * НИКАКОГО автоматического confirmed.
       *
       * Только уведомляем двух админов.
       */
      await notifyAdminsAboutReservationPayment(
        responseOrder
      );

      res.json({
        ok: true,

        message:
          "Заявка на проверку отправлена",

        order:
          responseOrder
      });
    } catch (error) {
      console.error(
        "RESERVATION PAID:",
        error
      );

      res
        .status(500)
        .json({
          error:
            error.message ||
            "Не удалось отправить заявку"
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
  async (
    req,
    res
  ) => {
    res.json({
      ok: true,
      is_admin: true,
      admin_id:
        normalizeTelegramId(
          req.telegramUser.id
        )
    });
  }
);

/* =========================================================
   ADMIN PRODUCTS
========================================================= */

app.get(
  "/api/admin/products",
  requireAdmin,
  async (
    req,
    res
  ) => {
    const result =
      await db.execute(`
        SELECT *
        FROM products
        ORDER BY id DESC
      `);

    res.json({
      products:
        result.rows
    });
  }
);

app.post(
  "/api/admin/products",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      const body =
        req.body;

      const result =
        await db.execute({
          sql: `
            INSERT INTO products
            (
              category_id,
              name,
              description,
              price,
              old_price,
              image_url,
              images,
              price_options,
              is_new,
              created_at,
              updated_at
            )
            VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `,
          args: [
            integerId(
              body.category_id
            ),

            stringValue(
              body.name
            ),

            stringValue(
              body.description
            ),

            numberValue(
              body.price
            ),

            numberValue(
              body.old_price
            ),

            stringValue(
              body.image_url
            ),

            JSON.stringify(
              body.images ||
                []
            ),

            JSON.stringify(
              body.price_options ||
                {}
            ),

            body.is_new
              ? 1
              : 0
          ]
        });

      const productId =
        Number(
          result.lastInsertRowid
        );

      res.json({
        ok: true,
        id: productId
      });
    } catch (error) {
      console.error(
        error
      );

      res
        .status(500)
        .json({
          error:
            error.message
        });
    }
  }
);

app.put(
  "/api/admin/products/:id",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      const id =
        integerId(
          req.params.id
        );

      if (!id) {
        return res
          .status(400)
          .json({
            error:
              "Некорректный ID"
          });
      }

      const body =
        req.body;

      await db.execute({
        sql: `
          UPDATE products
          SET
            category_id = ?,
            name = ?,
            description = ?,
            price = ?,
            old_price = ?,
            image_url = ?,
            images = ?,
            price_options = ?,
            is_new = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        args: [
          integerId(
            body.category_id
          ),

          stringValue(
            body.name
          ),

          stringValue(
            body.description
          ),

          numberValue(
            body.price
          ),

          numberValue(
            body.old_price
          ),

          stringValue(
            body.image_url
          ),

          JSON.stringify(
            body.images ||
              []
          ),

          JSON.stringify(
            body.price_options ||
              {}
          ),

          body.is_new
            ? 1
            : 0,

          id
        ]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        error
      );

      res
        .status(500)
        .json({
          error:
            error.message
        });
    }
  }
);

app.delete(
  "/api/admin/products/:id",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      const id =
        integerId(
          req.params.id
        );

      if (!id) {
        return res
          .status(400)
          .json({
            error:
              "Некорректный ID"
          });
      }

      await db.execute({
        sql: `
          DELETE FROM products
          WHERE id = ?
        `,
        args: [id]
      });

      await db.execute({
        sql: `
          DELETE FROM product_variants
          WHERE product_id = ?
        `,
        args: [id]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      res
        .status(500)
        .json({
          error:
            error.message
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
  async (
    req,
    res
  ) => {
    const result =
      await db.execute(`
        SELECT *
        FROM categories
        ORDER BY id ASC
      `);

    res.json({
      categories:
        result.rows
    });
  }
);

app.post(
  "/api/admin/categories",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      const result =
        await db.execute({
          sql: `
            INSERT INTO categories
            (name, image_url)
            VALUES (?, ?)
          `,
          args: [
            stringValue(
              req.body.name
            ),

            stringValue(
              req.body.image_url
            )
          ]
        });

      res.json({
        ok: true,
        id:
          Number(
            result.lastInsertRowid
          )
      });
    } catch (error) {
      res
        .status(500)
        .json({
          error:
            error.message
        });
    }
  }
);

app.put(
  "/api/admin/categories/:id",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      await db.execute({
        sql: `
          UPDATE categories
          SET
            name = ?,
            image_url = ?
          WHERE id = ?
        `,
        args: [
          stringValue(
            req.body.name
          ),

          stringValue(
            req.body.image_url
          ),

          integerId(
            req.params.id
          )
        ]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      res
        .status(500)
        .json({
          error:
            error.message
        });
    }
  }
);

app.delete(
  "/api/admin/categories/:id",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      await db.execute({
        sql: `
          DELETE FROM categories
          WHERE id = ?
        `,
        args: [
          integerId(
            req.params.id
          )
        ]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      res
        .status(500)
        .json({
          error:
            error.message
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
  async (
    req,
    res
  ) => {
    const result =
      await db.execute(`
        SELECT *
        FROM banners
        ORDER BY sort_order ASC, id ASC
      `);

    res.json({
      banners:
        result.rows
    });
  }
);

app.post(
  "/api/admin/banners",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      const result =
        await db.execute({
          sql: `
            INSERT INTO banners
            (
              title,
              subtitle,
              image_url,
              button_text,
              button_url,
              active,
              sort_order
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            stringValue(
              req.body.title
            ),

            stringValue(
              req.body.subtitle
            ),

            stringValue(
              req.body.image_url
            ),

            stringValue(
              req.body.button_text
            ),

            stringValue(
              req.body.button_url
            ),

            req.body.active ===
            false
              ? 0
              : 1,

            numberValue(
              req.body.sort_order
            )
          ]
        });

      res.json({
        ok: true,
        id:
          Number(
            result.lastInsertRowid
          )
      });
    } catch (error) {
      res
        .status(500)
        .json({
          error:
            error.message
        });
    }
  }
);

app.put(
  "/api/admin/banners/:id",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      await db.execute({
        sql: `
          UPDATE banners
          SET
            title = ?,
            subtitle = ?,
            image_url = ?,
            button_text = ?,
            button_url = ?,
            active = ?,
            sort_order = ?
          WHERE id = ?
        `,
        args: [
          stringValue(
            req.body.title
          ),

          stringValue(
            req.body.subtitle
          ),

          stringValue(
            req.body.image_url
          ),

          stringValue(
            req.body.button_text
          ),

          stringValue(
            req.body.button_url
          ),

          req.body.active ===
          false
            ? 0
            : 1,

          numberValue(
            req.body.sort_order
          ),

          integerId(
            req.params.id
          )
        ]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      res
        .status(500)
        .json({
          error:
            error.message
        });
    }
  }
);

app.delete(
  "/api/admin/banners/:id",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      await db.execute({
        sql: `
          DELETE FROM banners
          WHERE id = ?
        `,
        args: [
          integerId(
            req.params.id
          )
        ]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      res
        .status(500)
        .json({
          error:
            error.message
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
  async (
    req,
    res
  ) => {
    const result =
      await db.execute(`
        SELECT *
        FROM reservation_cards
        ORDER BY id ASC
      `);

    res.json({
      reservation_cards:
        result.rows
    });
  }
);

app.post(
  "/api/admin/reservation-cards",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      const result =
        await db.execute({
          sql: `
            INSERT INTO reservation_cards
            (
              title,
              card_number,
              recipient,
              requisites,
              amount,
              active,
              is_default
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            stringValue(
              req.body.title
            ),

            stringValue(
              req.body.card_number
            ),

            stringValue(
              req.body.recipient
            ),

            stringValue(
              req.body.requisites
            ),

            numberValue(
              req.body.amount
            ),

            req.body.active ===
            false
              ? 0
              : 1,

            req.body.is_default
              ? 1
              : 0
          ]
        });

      if (
        req.body.is_default
      ) {
        await db.execute({
          sql: `
            UPDATE reservation_cards
            SET is_default = 0
            WHERE id != ?
          `,
          args: [
            Number(
              result.lastInsertRowid
            )
          ]
        });
      }

      res.json({
        ok: true
      });
    } catch (error) {
      res
        .status(500)
        .json({
          error:
            error.message
        });
    }
  }
);

app.put(
  "/api/admin/reservation-cards/:id",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      const id =
        integerId(
          req.params.id
        );

      await db.execute({
        sql: `
          UPDATE reservation_cards
          SET
            title = ?,
            card_number = ?,
            recipient = ?,
            requisites = ?,
            amount = ?,
            active = ?,
            is_default = ?
          WHERE id = ?
        `,
        args: [
          stringValue(
            req.body.title
          ),

          stringValue(
            req.body.card_number
          ),

          stringValue(
            req.body.recipient
          ),

          stringValue(
            req.body.requisites
          ),

          numberValue(
            req.body.amount
          ),

          req.body.active ===
          false
            ? 0
            : 1,

          req.body.is_default
            ? 1
            : 0,

          id
        ]
      });

      if (
        req.body.is_default
      ) {
        await db.execute({
          sql: `
            UPDATE reservation_cards
            SET is_default = 0
            WHERE id != ?
          `,
          args: [id]
        });

        await db.execute({
          sql: `
            UPDATE reservation_cards
            SET is_default = 1
            WHERE id = ?
          `,
          args: [id]
        });
      }

      res.json({
        ok: true
      });
    } catch (error) {
      res
        .status(500)
        .json({
          error:
            error.message
        });
    }
  }
);

app.delete(
  "/api/admin/reservation-cards/:id",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      await db.execute({
        sql: `
          DELETE FROM reservation_cards
          WHERE id = ?
        `,
        args: [
          integerId(
            req.params.id
          )
        ]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      res
        .status(500)
        .json({
          error:
            error.message
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
  async (
    req,
    res
  ) => {
    const result =
      await db.execute(`
        SELECT *
        FROM pickup_points
        ORDER BY id ASC
      `);

    res.json({
      pickup_points:
        result.rows
    });
  }
);

app.post(
  "/api/admin/pickup-points",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      await db.execute({
        sql: `
          INSERT INTO pickup_points
          (
            title,
            address,
            directions_url,
            video_url,
            active
          )
          VALUES (?, ?, ?, ?, ?)
        `,
        args: [
          stringValue(
            req.body.title
          ),

          stringValue(
            req.body.address
          ),

          stringValue(
            req.body.directions_url
          ),

          stringValue(
            req.body.video_url
          ),

          req.body.active ===
          false
            ? 0
            : 1
        ]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      res
        .status(500)
        .json({
          error:
            error.message
        });
    }
  }
);

app.put(
  "/api/admin/pickup-points/:id",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      await db.execute({
        sql: `
          UPDATE pickup_points
          SET
            title = ?,
            address = ?,
            directions_url = ?,
            video_url = ?,
            active = ?
          WHERE id = ?
        `,
        args: [
          stringValue(
            req.body.title
          ),

          stringValue(
            req.body.address
          ),

          stringValue(
            req.body.directions_url
          ),

          stringValue(
            req.body.video_url
          ),

          req.body.active ===
          false
            ? 0
            : 1,

          integerId(
            req.params.id
          )
        ]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      res
        .status(500)
        .json({
          error:
            error.message
        });
    }
  }
);

app.delete(
  "/api/admin/pickup-points/:id",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      await db.execute({
        sql: `
          DELETE FROM pickup_points
          WHERE id = ?
        `,
        args: [
          integerId(
            req.params.id
          )
        ]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      res
        .status(500)
        .json({
          error:
            error.message
        });
    }
  }
);

/* =========================================================
   ADMIN SETTINGS
========================================================= */

app.get(
  "/api/admin/settings",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      const result =
        await db.execute(`
          SELECT *
          FROM store_settings
          ORDER BY key ASC
        `);

      const settings = {};

      for (
        const row of result.rows
      ) {
        settings[
          row.key
        ] = row.value;
      }

      res.json({
        settings
      });
    } catch (error) {
      res
        .status(500)
        .json({
          error:
            error.message
        });
    }
  }
);

app.put(
  "/api/admin/settings",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      const settings =
        req.body?.settings ||
        req.body ||
        {};

      for (
        const [key, value] of
        Object.entries(
          settings
        )
      ) {
        await setSetting(
          key,
          value
        );
      }

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        error
      );

      res
        .status(500)
        .json({
          error:
            error.message
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
  async (
    req,
    res
  ) => {
    try {
      const result =
        await db.execute(`
          SELECT
            o.*,
            u.first_name AS user_first_name,
            u.last_name AS user_last_name,
            u.username AS user_username
          FROM orders o
          LEFT JOIN users u
            ON u.telegram_user_id = o.telegram_user_id
          ORDER BY o.id DESC
        `);

      const orders =
        result.rows.map(
          order => ({
            ...order,

            display_id:
              orderDisplayId(
                order.id
              ),

            customer_name:
              customerName({
                first_name:
                  order.user_first_name,

                last_name:
                  order.user_last_name,

                username:
                  order.user_username
              }),

            customer_username:
              order.user_username
                ? `@${order.user_username}`
                : "",

            selected_options:
              safeJsonParse(
                order.selected_options,
                {}
              )
          })
        );

      res.json({
        orders
      });
    } catch (error) {
      console.error(
        error
      );

      res
        .status(500)
        .json({
          error:
            "Не удалось загрузить заказы"
        });
    }
  }
);

app.get(
  "/api/admin/orders/:id",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      const id =
        integerId(
          req.params.id
        );

      const order =
        await getOrderById(
          id
        );

      if (!order) {
        return res
          .status(404)
          .json({
            error:
              "Заказ не найден"
          });
      }

      res.json({
        order: {
          ...order,

          display_id:
            orderDisplayId(
              order.id
            ),

          customer_name:
            customerName({
              first_name:
                order.user_first_name,

              last_name:
                order.user_last_name,

              username:
                order.user_username
            }),

          customer_username:
            order.user_username
              ? `@${order.user_username}`
              : "",

          selected_options:
            safeJsonParse(
              order.selected_options,
              {}
            )
        }
      });
    } catch (error) {
      console.error(
        error
      );

      res
        .status(500)
        .json({
          error:
            error.message
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
  async (
    req,
    res
  ) => {
    try {
      const id =
        integerId(
          req.params.id
        );

      const allowed = [
        "new",
        "confirmed",
        "processing",
        "ready",
        "completed",
        "cancelled",
        "rejected"
      ];

      const status =
        stringValue(
          req.body.status
        );

      if (
        !allowed.includes(
          status
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              "Недопустимый статус заказа"
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
        args: [
          status,
          id
        ]
      });

      const order =
        await getOrderById(
          id
        );

      res.json({
        ok: true,

        order: {
          ...order,

          display_id:
            orderDisplayId(
              order.id
            )
        }
      });
    } catch (error) {
      console.error(
        error
      );

      res
        .status(500)
        .json({
          error:
            error.message
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
  async (
    req,
    res
  ) => {
    try {
      const id =
        integerId(
          req.params.id
        );

      const allowed = [
        "not_required",
        "pending_payment",
        "pending",
        "awaiting_confirmation",
        "confirmed",
        "rejected"
      ];

      const reservationStatus =
        stringValue(
          req.body
            .reservation_status ||
          req.body.status
        );

      if (
        !allowed.includes(
          reservationStatus
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              "Недопустимый статус залога"
          });
      }

      const existing =
        await getOrderById(
          id
        );

      if (!existing) {
        return res
          .status(404)
          .json({
            error:
              "Заказ не найден"
          });
      }

      await db.execute({
        sql: `
          UPDATE orders
          SET
            reservation_status = ?,
            reservation_paid_at =
              CASE
                WHEN ? = 'confirmed'
                THEN COALESCE(
                  reservation_paid_at,
                  CURRENT_TIMESTAMP
                )
                ELSE reservation_paid_at
              END,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        args: [
          reservationStatus,
          reservationStatus,
          id
        ]
      });

      const order =
        await getOrderById(
          id
        );

      const responseOrder = {
        ...order,

        display_id:
          orderDisplayId(
            order.id
          ),

        selected_options:
          safeJsonParse(
            order.selected_options,
            {}
          )
      };

      if (
        reservationStatus ===
          "confirmed" ||
        reservationStatus ===
          "rejected"
      ) {
        await notifyCustomerReservation(
          responseOrder
        );
      }

      res.json({
        ok: true,
        order:
          responseOrder
      });
    } catch (error) {
      console.error(
        "ADMIN RESERVATION:",
        error
      );

      res
        .status(500)
        .json({
          error:
            error.message
        });
    }
  }
);

/* =========================================================
   LEGACY VARIANTS
========================================================= */

app.get("/api/admin/promo-codes", requireAdmin, async (req, res, next) => {
  try {
    const result = await db.execute(`SELECT * FROM promo_codes ORDER BY id DESC`);
    res.json({ promo_codes: result.rows });
  } catch (error) { next(error); }
});

app.post("/api/admin/promo-codes", requireAdmin, async (req, res, next) => {
  try {
    const code = normalizePromoCode(req.body?.code);
    const discountType = stringValue(req.body?.discount_type).toLowerCase();
    const discountValue = Number(req.body?.discount_value) || 0;
    const minOrderAmount = Math.max(0, Number(req.body?.min_order_amount) || 0);
    const maxUses = Math.max(0, Math.floor(Number(req.body?.max_uses) || 0));
    const expiresAt = stringValue(req.body?.expires_at) || null;
    const active = req.body?.active === false || Number(req.body?.active) === 0 ? 0 : 1;
    if (!code) return res.status(400).json({ error: "Введите промокод" });
    if (!["percent", "fixed"].includes(discountType)) return res.status(400).json({ error: "Неверный тип скидки" });
    if (discountValue <= 0) return res.status(400).json({ error: "Скидка должна быть больше 0" });
    if (discountType === "percent" && discountValue > 100) return res.status(400).json({ error: "Процент не может быть больше 100" });
    const existing = await db.execute({ sql: `SELECT id FROM promo_codes WHERE code = ? LIMIT 1`, args: [code] });
    if (existing.rows.length) return res.status(409).json({ error: "Такой промокод уже существует" });
    const result = await db.execute({
      sql: `INSERT INTO promo_codes (code, discount_type, discount_value, min_order_amount, max_uses, used_count, expires_at, active) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      args: [code, discountType, discountValue, minOrderAmount, maxUses, expiresAt, active]
    });
    const created = await db.execute({ sql: `SELECT * FROM promo_codes WHERE id = ?`, args: [Number(result.lastInsertRowid)] });
    res.json({ promo_code: created.rows[0] });
  } catch (error) { next(error); }
});

app.put("/api/admin/promo-codes/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = integerId(req.params.id);
    const code = normalizePromoCode(req.body?.code);
    const discountType = stringValue(req.body?.discount_type).toLowerCase();
    const discountValue = Number(req.body?.discount_value) || 0;
    const minOrderAmount = Math.max(0, Number(req.body?.min_order_amount) || 0);
    const maxUses = Math.max(0, Math.floor(Number(req.body?.max_uses) || 0));
    const expiresAt = stringValue(req.body?.expires_at) || null;
    const active = req.body?.active === false || Number(req.body?.active) === 0 ? 0 : 1;
    if (!id) return res.status(400).json({ error: "Некорректный ID" });
    if (!code) return res.status(400).json({ error: "Введите промокод" });
    if (!["percent", "fixed"].includes(discountType)) return res.status(400).json({ error: "Неверный тип скидки" });
    if (discountValue <= 0) return res.status(400).json({ error: "Скидка должна быть больше 0" });
    if (discountType === "percent" && discountValue > 100) return res.status(400).json({ error: "Процент не может быть больше 100" });
    const duplicate = await db.execute({ sql: `SELECT id FROM promo_codes WHERE code = ? AND id != ? LIMIT 1`, args: [code, id] });
    if (duplicate.rows.length) return res.status(409).json({ error: "Такой промокод уже существует" });
    const result = await db.execute({
      sql: `UPDATE promo_codes SET code = ?, discount_type = ?, discount_value = ?, min_order_amount = ?, max_uses = ?, expires_at = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [code, discountType, discountValue, minOrderAmount, maxUses, expiresAt, active, id]
    });
    if (Number(result.rowsAffected || 0) !== 1) return res.status(404).json({ error: "Промокод не найден" });
    const updated = await db.execute({ sql: `SELECT * FROM promo_codes WHERE id = ?`, args: [id] });
    res.json({ promo_code: updated.rows[0] });
  } catch (error) { next(error); }
});

app.delete("/api/admin/promo-codes/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = integerId(req.params.id);
    if (!id) return res.status(400).json({ error: "Некорректный ID" });
    const result = await db.execute({ sql: `DELETE FROM promo_codes WHERE id = ?`, args: [id] });
    if (Number(result.rowsAffected || 0) !== 1) return res.status(404).json({ error: "Промокод не найден" });
    res.json({ success: true });
  } catch (error) { next(error); }
});

app.get(
  "/api/admin/variants",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      const productId =
        integerId(
          req.query.product_id
        );

      let result;

      if (productId) {
        result =
          await db.execute({
            sql: `
              SELECT *
              FROM product_variants
              WHERE product_id = ?
              ORDER BY id ASC
            `,
            args: [
              productId
            ]
          });
      } else {
        result =
          await db.execute(`
            SELECT *
            FROM product_variants
            ORDER BY id DESC
          `);
      }

      res.json({
        variants:
          result.rows
      });
    } catch (error) {
      res
        .status(500)
        .json({
          error:
            error.message
        });
    }
  }
);

app.post(
  "/api/admin/variants",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      const result =
        await db.execute({
          sql: `
            INSERT INTO product_variants
            (
              product_id,
              name,
              price,
              color,
              memory,
              sim_type,
              region,
              image_url
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            integerId(
              req.body.product_id
            ),

            stringValue(
              req.body.name
            ),

            numberValue(
              req.body.price
            ),

            stringValue(
              req.body.color
            ),

            stringValue(
              req.body.memory
            ),

            stringValue(
              req.body.sim_type
            ),

            stringValue(
              req.body.region
            ),

            stringValue(
              req.body.image_url
            )
          ]
        });

      res.json({
        ok: true,
        id:
          Number(
            result.lastInsertRowid
          )
      });
    } catch (error) {
      res
        .status(500)
        .json({
          error:
            error.message
        });
    }
  }
);

app.put(
  "/api/admin/variants/:id",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      await db.execute({
        sql: `
          UPDATE product_variants
          SET
            name = ?,
            price = ?,
            color = ?,
            memory = ?,
            sim_type = ?,
            region = ?,
            image_url = ?
          WHERE id = ?
        `,
        args: [
          stringValue(
            req.body.name
          ),

          numberValue(
            req.body.price
          ),

          stringValue(
            req.body.color
          ),

          stringValue(
            req.body.memory
          ),

          stringValue(
            req.body.sim_type
          ),

          stringValue(
            req.body.region
          ),

          stringValue(
            req.body.image_url
          ),

          integerId(
            req.params.id
          )
        ]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      res
        .status(500)
        .json({
          error:
            error.message
        });
    }
  }
);

app.delete(
  "/api/admin/variants/:id",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      await db.execute({
        sql: `
          DELETE FROM product_variants
          WHERE id = ?
        `,
        args: [
          integerId(
            req.params.id
          )
        ]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      res
        .status(500)
        .json({
          error:
            error.message
        });
    }
  }
);

/* =========================================================
   SETTINGS
========================================================= */

app.get(
  "/api/settings",
  async (
    req,
    res
  ) => {
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

      for (
        const key of keys
      ) {
        settings[key] =
          await getSetting(
            key,
            ""
          );
      }

      res.json({
        settings
      });
    } catch (error) {
      res
        .status(500)
        .json({
          error:
            error.message
        });
    }
  }
);

/* =========================================================
   TELEGRAM WEBHOOK
========================================================= */

app.post(
  "/telegram/webhook",
  async (
    req,
    res
  ) => {
    res.sendStatus(200);

    try {
      const update =
        req.body || {};

      if (
        update.callback_query
      ) {
        const callback =
          update.callback_query;

        const data =
          stringValue(
            callback.data
          );

        if (
          data.startsWith(
            "order_status:"
          )
        ) {
          await answerCallbackQuery(
            callback.id
          );
        }
      }

      if (
        update.message
      ) {
        const message =
          update.message;

        const text =
          stringValue(
            message.text
          );

        if (
          text === "/start" ||
          text === "/app"
        ) {
          await sendTelegramMessage(
            message.chat.id,
            "Откройте магазин IRoom:",
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text:
                        "Открыть IRoom",
                      web_app: {
                        url:
                          `${MINIAPP_URL}/index.html`
                      }
                    }
                  ]
                ]
              }
            }
          );
        }
      }
    } catch (error) {
      console.error(
        "Webhook:",
        error
      );
    }
  }
);

async function answerCallbackQuery(
  callbackQueryId
) {
  try {
    await telegramApi(
      "answerCallbackQuery",
      {
        callback_query_id:
          callbackQueryId
      }
    );
  } catch {}
}

async function setupWebhook() {
  try {
    const url =
      `${MINIAPP_URL}/telegram/webhook`;

    await telegramApi(
      "setWebhook",
      {
        url,
        allowed_updates: [
          "message",
          "callback_query"
        ]
      }
    );

    console.log(
      "Telegram webhook:",
      url
    );
  } catch (error) {
    console.error(
      "Webhook setup error:",
      error.message
    );
  }
}

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
      "Express error:",
      error
    );

    if (
      res.headersSent
    ) {
      return next(error);
    }

    res
      .status(500)
      .json({
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
    await migrate();

    app.listen(
      PORT,
      "0.0.0.0",
      async () => {
        console.log(
          `IRoom server started on port ${PORT}`
        );

        console.log(
          `Mini App: ${MINIAPP_URL}`
        );

        await setupWebhook();
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