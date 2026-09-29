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

const OPENAI_API_KEY = String(
  process.env.OPENAI_API_KEY || ""
).trim();

const OPENAI_MODEL = "gpt-5.6-luna";

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

// Explicit admin routes prevent a renamed/missing extension from producing
// a confusing "Cannot GET /admin.html" on Render/Telegram WebView.
app.get("/admin.html", (req, res) => {
  res.sendFile(path.join(publicDir, "admin.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(publicDir, "admin.html"));
});

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
  const numericId = Number(id);

  if (!Number.isFinite(numericId)) {
    return "IR-1001";
  }

  // Global order numbering for every customer: IR-1001, IR-1002, IR-1003...
  return `IR-${1001 + Math.max(0, Math.trunc(numericId) - 1)}`;
}

function normalizeOrderId(value) {
  const raw = stringValue(value);
  if (/^IR-\d+$/i.test(raw)) {
    const publicNumber = Number(raw.replace(/[^0-9]/g, ""));
    if (Number.isFinite(publicNumber)) return Math.max(1, Math.trunc(publicNumber) - 1000);
  }
  return integerId(raw);
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

let cachedBotUsername = "";

async function getBotUsername() {
  if (cachedBotUsername) return cachedBotUsername;

  const bot = await telegramApi("getMe");
  cachedBotUsername = String(bot?.username || "").trim();

  if (!cachedBotUsername) {
    throw new Error("У бота не указан username");
  }

  return cachedBotUsername;
}

async function getOrderBotLink(orderId) {
  const username = await getBotUsername();
  return `https://t.me/${username}?start=order_${Number(orderId)}`;
}

function orderStatusLabel(order) {
  const status = stringValue(order?.status || "").toLowerCase();
  const reservation = stringValue(order?.reservation_status || "").toLowerCase();

  if (reservation === "confirmed") return "🟢 Залог подтверждён";
  if (reservation === "awaiting_confirmation") return "🟠 Залог ожидает проверки";
  if (reservation === "rejected") return "🔴 Залог отклонён";

  const labels = {
    new: "🟡 Новый заказ",
    confirmed: "🔵 Заказ подтверждён",
    pending: "🟡 Заказ создан",
    pending_payment: "🟡 Ожидается залог",
    processing: "🔵 Заказ в обработке",
    ready: "🟢 Заказ готов к получению",
    completed: "✅ Заказ завершён",
    cancelled: "🔴 Заказ отменён",
    rejected: "🔴 Заказ отклонён",
    canceled: "🔴 Заказ отменён"
  };

  return labels[status] || "🟡 Заказ создан";
}

async function sendCustomerOrderStatus(order, chatId) {
  const displayId = order.display_id || orderDisplayId(order.id);
  const paymentComment = stringValue(order.payment_comment);
  const text = `
📦 <b>Заказ IRoom</b>

<b>Заказ:</b> ${escapeTelegramHtml(displayId)}
<b>Товар:</b> ${escapeTelegramHtml(order.product_name || "Товар")}
<b>Статус:</b> ${escapeTelegramHtml(orderStatusLabel(order))}

<b>Стоимость:</b> ${formatPrice(order.price)}
<b>Залог:</b> ${formatPrice(order.reservation_amount)}

${paymentComment ? `<b>Комментарий к переводу:</b> <code>${escapeTelegramHtml(paymentComment)}</code>

` : ""}Никаких кнопок открытия заказа здесь нет — вся информация по заказу находится прямо в чате с ботом.
  `.trim();

  await sendTelegramMessage(chatId, text);
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
      slug TEXT NOT NULL DEFAULT '',
      image_url TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await addColumnIfMissing("categories", "slug", "TEXT NOT NULL DEFAULT ''");
  await repairCategorySlugs();

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

  await addColumnIfMissing("products", "import_key", "TEXT DEFAULT ''");
  await addColumnIfMissing("products", "price_text", "TEXT DEFAULT ''");

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

  await addColumnIfMissing("product_variants", "import_key", "TEXT DEFAULT ''");
  await addColumnIfMissing("product_variants", "price_text", "TEXT DEFAULT ''");
  await addColumnIfMissing("product_variants", "updated_at", "TEXT DEFAULT CURRENT_TIMESTAMP");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_user_id TEXT UNIQUE,
      first_name TEXT DEFAULT '',
      last_name TEXT DEFAULT '',
      username TEXT DEFAULT '',
      phone TEXT DEFAULT '',
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

  // Global public order numbering.
  // If an old database contains id=0, shift the public numbering
  // so the first visible order is still IR-1001.
  try {
    const minOrder = await db.execute(`SELECT MIN(id) AS min_id FROM orders`);
    const minId = Number(minOrder.rows?.[0]?.min_id);
    ORDER_DISPLAY_OFFSET = Number.isFinite(minId) && minId === 0 ? 1001 : 1000;
  } catch {
    ORDER_DISPLAY_OFFSET = 1000;
  }

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

  await db.execute(`
    CREATE TABLE IF NOT EXISTS ai_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_text TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      requested_by TEXT NOT NULL,
      approvals_json TEXT NOT NULL DEFAULT '[]',
      result_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      executed_at TEXT
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
    "users",
    "phone",
    "TEXT DEFAULT ''"
  );

  await addColumnIfMissing(
    "orders",
    "customer_phone",
    "TEXT DEFAULT ''"
  );

  await addColumnIfMissing(
    "orders",
    "customer_username",
    "TEXT DEFAULT ''"
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
    "payment_method",
    "TEXT DEFAULT ''"
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
          u.username AS user_username,
          u.phone AS user_phone
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

<b>Покупатель:</b> ${escapeTelegramHtml(
    username ? `@${username}` : customer
  )}
  `.trim();

  const replyMarkup = undefined;

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

<b>Комментарий к переводу:</b> <code>${escapeTelegramHtml(order.payment_comment || "—")}</code>

<b>Статус:</b> 🟠 Ожидает проверки

<b>Покупатель:</b> ${escapeTelegramHtml(
    username ? `@${username}` : customer
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
        { text: "💰 Залог получен", callback_data: `reservation_confirm:${order.id}` },
        { text: "❌ Отклонить", callback_data: `reservation_reject:${order.id}` }
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

const storage = multer.memoryStorage();

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

    // Render's local filesystem is ephemeral. Store uploaded product photos
    // as compact data URLs so they survive redeploys/restarts and remain
    // directly usable by the Mini App without a separate storage service.
    if (!String(req.file.mimetype || "").startsWith("image/")) {
      return res.status(400).json({ error: "Для галереи нужен файл изображения" });
    }

    if (Number(req.file.size || 0) > 8 * 1024 * 1024) {
      return res.status(413).json({ error: "Фото слишком большое" });
    }

    const url = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;

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

        // The selected variant is the server-side source of truth for price.
        // Never trust a price sent by the client.
        price = numberValue(
          variant.price,
          numberValue(product.price)
        );

        // Prevent a client from combining a variant with unrelated options.
        const optionVariantPairs = [
          ["color", variant.color],
          ["memory", variant.memory],
          ["sim", variant.sim_type],
          ["region", variant.region]
        ];

        for (const [key, variantValue] of optionVariantPairs) {
          if (variantValue && selectedOptions[key] && String(selectedOptions[key]) !== String(variantValue)) {
            return res.status(400).json({ error: "Выбранные характеристики не соответствуют варианту товара" });
          }
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

      const rawContact = stringValue(req.body?.contact) ||
        (customerComment.match(/^Контакт:\s*(.+)$/im)?.[1] || "");
      const contactValue = rawContact.trim();
      const customerUsername = contactValue.startsWith("@")
        ? contactValue.slice(1).trim()
        : stringValue(user?.username);
      const customerPhone = /^\+?[0-9][0-9\s().-]{6,}$/.test(contactValue)
        ? contactValue
        : stringValue(user?.phone);

      if (customerPhone) {
        await db.execute({
          sql: `UPDATE users SET phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          args: [customerPhone, user?.id || null]
        });
      }

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
              customer_phone,
              customer_username,
              status,
              created_at,
              updated_at
            )
            VALUES
            (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
            RETURNING *
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

            customerPhone,

            customerUsername,

            "new"
          ]
        });

      /* =====================================================
         CREATED ORDER
         Do not immediately re-read the row from the database.
         Turso/libSQL can return the inserted row through
         RETURNING even when a follow-up read is not immediately
         visible. This was the reason for:
         "Созданный заказ не найден".
      ===================================================== */

      const returnedOrder =
        result.rows?.[0] || null;

      const insertedOrderId =
        integerId(
          returnedOrder?.id
        ) ||
        integerId(
          result.lastInsertRowid
        );

      if (!insertedOrderId) {
        throw new Error(
          "Не удалось получить ID созданного заказа"
        );
      }

      /*
        Prefer the exact row returned by INSERT ... RETURNING.
        Only fall back to SELECT if the driver did not return
        the row itself.
      */
      let order =
        returnedOrder || null;

      if (!order) {
        order =
          await getOrderById(
            insertedOrderId
          );
      }

      if (!order) {
        /* Last-resort direct lookup. */
        const directResult =
          await db.execute({
            sql: `
              SELECT *
              FROM orders
              WHERE id = ?
              LIMIT 1
            `,
            args: [
              insertedOrderId
            ]
          });

        order =
          directResult.rows?.[0] ||
          null;
      }

      if (!order) {
        throw new Error(
          `Созданный заказ не найден (ID: ${insertedOrderId})`
        );
      }

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

      if (promoCode) {
        const used = await db.execute({
          sql: `UPDATE promo_codes SET used_count = used_count + 1, updated_at = CURRENT_TIMESTAMP WHERE code = ? AND active = 1 AND (max_uses = 0 OR used_count < max_uses)`,
          args: [promoCode]
        });
        if (Number(used.rowsAffected || 0) !== 1) {
          // The order exists, but the promo limit was reached concurrently.
          // Revert the just-created order rather than allowing a free extra use.
          await db.execute({ sql: `DELETE FROM orders WHERE id = ?`, args: [insertedOrderId] });
          return res.status(409).json({ error: "Лимит использований промокода исчерпан" });
        }
      }

      await notifyAdminsAboutOrder(responseOrder);

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
        const responseOrder = {
          ...order,
          display_id: orderDisplayId(order.id),
          selected_options: safeJsonParse(order.selected_options, {})
        };

        return res.json({
          ok: true,
          already_submitted: true,
          message: "Заявка уже отправлена на проверку",
          order: responseOrder
        });
      }

      if (
        currentStatus ===
        "confirmed"
      ) {
        const responseOrder = {
          ...order,
          display_id: orderDisplayId(order.id),
          selected_options: safeJsonParse(order.selected_options, {})
        };

        return res.json({
          ok: true,
          already_confirmed: true,
          message: "Залог уже подтверждён",
          order: responseOrder
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

      let botChatUrl = "";

      try {
        botChatUrl = await getOrderBotLink(id);
      } catch (error) {
        console.error("Order bot link:", error.message);
      }

      responseOrder.bot_chat_url = botChatUrl;

      /*
       * НИКАКОГО автоматического confirmed.
       *
       * Уведомление админов не должно ломать уже сохранённый заказ.
       */
      try {
        await notifyAdminsAboutReservationPayment(
          responseOrder
        );
      } catch (error) {
        console.error(
          "Reservation admin notification:",
          error.message
        );
      }

      res.json({
        ok: true,
        message: "Заявка на проверку отправлена",
        order: responseOrder,
        bot_chat_url: botChatUrl
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

/* Compatibility: existing admin clients may still use PUT for reservation status. */
app.put(
  "/api/admin/orders/:id/reservation",
  requireAdmin,
  async (req, res) => {
    try {
      const id = integerId(req.params.id);
      const reservationStatus = stringValue(req.body?.reservation_status || req.body?.status);
      const allowed = ["not_required", "pending_payment", "pending", "awaiting_confirmation", "confirmed", "rejected"];
      if (!id || !allowed.includes(reservationStatus)) return res.status(400).json({ error: "Недопустимый статус залога" });
      const existing = await getOrderById(id);
      if (!existing) return res.status(404).json({ error: "Заказ не найден" });
      const result = await db.execute({
        sql: `UPDATE orders SET reservation_status = ?, reservation_paid_at = CASE WHEN ? = 'confirmed' THEN COALESCE(reservation_paid_at, CURRENT_TIMESTAMP) ELSE reservation_paid_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [reservationStatus, reservationStatus, id]
      });
      if (Number(result.rowsAffected || 0) !== 1) return res.status(404).json({ error: "Заказ не найден" });
      const order = await getOrderById(id);
      if (reservationStatus === "confirmed" || reservationStatus === "rejected") { try { await notifyCustomerReservation(order); } catch (error) { console.error("Customer reservation notification:", error.message); } }
      return res.json({ ok: true, order: { ...order, display_id: orderDisplayId(order.id), selected_options: safeJsonParse(order.selected_options, {}) } });
    } catch (error) { return res.status(500).json({ error: error.message || "Не удалось изменить статус залога" }); }
  }
);

/* =========================================================
   IROOM AI ASSISTANT
========================================================= */

function aiActionLabel(action) {
  if (action === "create_product") return "создание товара";
  if (action === "update_price") return "изменение цены";
  return "изменение магазина";
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();

  try {
    return JSON.parse(raw);
  } catch {}

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {}
  }

  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");

  if (first >= 0 && last > first) {
    try {
      return JSON.parse(raw.slice(first, last + 1));
    } catch {}
  }

  return null;
}

function cleanAiProductAction(action, categories) {
  if (!action || action.type !== "create_product") return null;

  const p = action.product && typeof action.product === "object"
    ? action.product
    : {};

  const categoryId = Number(p.category_id || 0);
  const category = categories.find(c => Number(c.id) === categoryId);

  if (!String(p.name || "").trim()) {
    throw new Error("ИИ не указал название товара");
  }

  if (!category) {
    throw new Error("ИИ не указал существующую категорию товара");
  }

  const price = Number(p.price);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error("ИИ указал некорректную цену");
  }

  return {
    type: "create_product",
    product: {
      category_id: categoryId,
      name: String(p.name).trim().slice(0, 180),
      description: String(p.description || "").trim().slice(0, 5000),
      price,
      old_price: Math.max(0, Number(p.old_price) || 0),
      image_url: String(p.image_url || "").trim(),
      images: Array.isArray(p.images) ? p.images.slice(0, 20) : [],
      price_options: p.price_options && typeof p.price_options === "object" ? p.price_options : {},
      is_new: Boolean(p.is_new)
    }
  };
}

function cleanAiPriceAction(action, products) {
  if (!action || action.type !== "update_price") return null;

  const productId = Number(action.product_id || 0);
  const product = products.find(p => Number(p.id) === productId);

  if (!product) {
    throw new Error("ИИ не указал существующий товар");
  }

  const price = Number(action.price);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error("ИИ указал некорректную цену");
  }

  return {
    type: "update_price",
    product_id: productId,
    price,
    reason: String(action.reason || "").trim().slice(0, 500)
  };
}

async function getAiStoreContext() {
  const [productsResult, categoriesResult] = await Promise.all([
    db.execute(`SELECT id, category_id, name, description, price, old_price, price_options, is_new FROM products ORDER BY id DESC LIMIT 300`),
    db.execute(`SELECT id, name FROM categories ORDER BY id ASC`)
  ]);

  return {
    products: productsResult.rows.map(p => ({
      id: Number(p.id),
      category_id: Number(p.category_id || 0),
      name: p.name,
      price: Number(p.price || 0),
      old_price: Number(p.old_price || 0),
      description: p.description || "",
      price_options: safeJsonParse(p.price_options, {}),
      is_new: Boolean(p.is_new)
    })),
    categories: categoriesResult.rows.map(c => ({
      id: Number(c.id),
      name: c.name
    }))
  };
}

async function askOpenAIForStoreAction(message, context) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY не задан в Render → Environment");
  }

  const system = `Ты — ИИ-ассистент магазина IRoom. Отвечай по-русски.
Ты можешь помогать администраторам управлять каталогом.
ВАЖНО: никогда не выполняй изменения сам. Ты только предлагаешь одно действие, которое сервер отправит на двойное подтверждение двух разных администраторов.
Если пользователь просит обычную информацию — action_type должен быть none.
Если просит создать товар — action_type create_product.
Если просит изменить цену существующего товара — action_type update_price.
Для создания товара используй только category_id из списка категорий.
Не выдумывай product_id.
Если для действия не хватает данных, action_type none и в answer попроси недостающие данные.
Верни ТОЛЬКО JSON без markdown.
Формат:
{
  "answer":"краткий ответ",
  "action_type":"none|create_product|update_price",
  "action":{}
}`;

  const user = JSON.stringify({
    request: String(message || "").slice(0, 4000),
    categories: context.categories,
    products: context.products
  });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      max_output_tokens: 1800
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error?.message || "Ошибка OpenAI API");
  }

  const output = String(data.output_text || "").trim();
  const parsed = extractJsonObject(output);

  if (!parsed) {
    throw new Error("ИИ вернул некорректный ответ");
  }

  return parsed;
}

async function executeAiAction(action) {
  if (action.type === "update_price") {
    const result = await db.execute({
      sql: `UPDATE products SET price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [Number(action.price), Number(action.product_id)]
    });

    if (Number(result.rowsAffected || 0) !== 1) {
      throw new Error("Товар не найден при выполнении изменения цены");
    }

    return {
      type: action.type,
      product_id: Number(action.product_id),
      price: Number(action.price),
      message: "Цена товара изменена"
    };
  }

  if (action.type === "create_product") {
    const p = action.product;
    const result = await db.execute({
      sql: `
        INSERT INTO products
        (category_id, name, description, price, old_price, image_url, images, price_options, is_new, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      args: [
        Number(p.category_id),
        String(p.name),
        String(p.description || ""),
        Number(p.price),
        Number(p.old_price || 0),
        String(p.image_url || ""),
        JSON.stringify(p.images || []),
        JSON.stringify(p.price_options || {}),
        p.is_new ? 1 : 0
      ]
    });

    return {
      type: action.type,
      product_id: Number(result.lastInsertRowid),
      name: p.name,
      price: Number(p.price),
      message: "Товар создан"
    };
  }

  throw new Error("Неизвестное AI-действие");
}

app.post("/api/ai/chat", requireTelegram, async (req, res) => {
  try {
    const message = stringValue(req.body?.message).trim();
    if (!message) return res.status(400).json({ error: "Введите сообщение" });

    const context = await getAiStoreContext();
    const ai = await askOpenAIForStoreAction(message, context);
    const answer = String(ai.answer || "").trim() || "Готово.";

    let action = null;

    if (ai.action_type === "create_product") {
      action = cleanAiProductAction({ type: "create_product", product: ai.action }, context.categories);
    } else if (ai.action_type === "update_price") {
      action = cleanAiPriceAction({ type: "update_price", ...ai.action }, context.products);
    }

    if (!action) {
      return res.json({ ok: true, answer, action: null });
    }

    if (!isAdminId(req.telegramUser.id)) {
      return res.json({
        ok: true,
        answer: `${answer}\n\nИзменения каталога доступны только администраторам и требуют подтверждения двух администраторов.`,
        action: null
      });
    }

    const result = await db.execute({
      sql: `
        INSERT INTO ai_actions
        (request_text, action_type, action_json, status, requested_by, approvals_json)
        VALUES (?, ?, ?, 'pending', ?, '[]')
      `,
      args: [
        message,
        action.type,
        JSON.stringify(action),
        normalizeTelegramId(req.telegramUser.id)
      ]
    });

    const id = Number(result.lastInsertRowid);

    res.json({
      ok: true,
      answer: `${answer}\n\n⚠️ Предложено действие: ${aiActionLabel(action.type)}. Нужно подтверждение ОБОИХ администраторов.`,
      action: {
        id,
        type: action.type,
        status: "pending",
        requested_by: normalizeTelegramId(req.telegramUser.id),
        data: action
      }
    });
  } catch (error) {
    console.error("AI CHAT:", error);
    res.status(500).json({ error: error.message || "Ошибка ИИ" });
  }
});

app.get("/api/admin/ai/actions", requireAdmin, async (req, res) => {
  try {
    const result = await db.execute(`SELECT * FROM ai_actions ORDER BY id DESC LIMIT 50`);
    res.json({
      actions: result.rows.map(row => ({
        ...row,
        action: safeJsonParse(row.action_json, {}),
        approvals: safeJsonParse(row.approvals_json, [])
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/ai/actions/:id/approve", requireAdmin, async (req, res) => {
  try {
    const id = integerId(req.params.id);
    if (!id) return res.status(400).json({ error: "Некорректный ID действия" });

    const result = await db.execute({
      sql: `SELECT * FROM ai_actions WHERE id = ? LIMIT 1`,
      args: [id]
    });
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: "Действие не найдено" });
    if (row.status !== "pending") return res.status(400).json({ error: "Действие уже обработано" });

    const adminId = normalizeTelegramId(req.telegramUser.id);
    const approvals = safeJsonParse(row.approvals_json, []);
    const nextApprovals = Array.isArray(approvals) ? approvals.map(String) : [];

    if (!nextApprovals.includes(adminId)) nextApprovals.push(adminId);

    if (nextApprovals.length < 2) {
      await db.execute({
        sql: `UPDATE ai_actions SET approvals_json = ? WHERE id = ?`,
        args: [JSON.stringify(nextApprovals), id]
      });

      return res.json({
        ok: true,
        status: "pending",
        approvals: nextApprovals,
        message: "Первое подтверждение принято. Нужно подтверждение второго администратора."
      });
    }

    const action = safeJsonParse(row.action_json, null);
    if (!action) return res.status(400).json({ error: "Данные AI-действия повреждены" });

    const executed = await executeAiAction(action);

    await db.execute({
      sql: `UPDATE ai_actions SET status = 'executed', approvals_json = ?, result_json = ?, executed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [JSON.stringify(nextApprovals), JSON.stringify(executed), id]
    });

    res.json({
      ok: true,
      status: "executed",
      approvals: nextApprovals,
      result: executed,
      message: "Действие подтверждено двумя администраторами и выполнено"
    });
  } catch (error) {
    console.error("AI APPROVE:", error);
    res.status(500).json({ error: error.message || "Не удалось подтвердить действие" });
  }
});

app.post("/api/admin/ai/actions/:id/reject", requireAdmin, async (req, res) => {
  try {
    const id = integerId(req.params.id);
    if (!id) return res.status(400).json({ error: "Некорректный ID действия" });

    const result = await db.execute({
      sql: `UPDATE ai_actions SET status = 'rejected' WHERE id = ? AND status = 'pending'`,
      args: [id]
    });

    if (Number(result.rowsAffected || 0) !== 1) {
      return res.status(400).json({ error: "Действие уже обработано или не найдено" });
    }

    res.json({ ok: true, status: "rejected" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
              order.customer_username ||
              (order.user_username
                ? `@${order.user_username}`
                : ""),

            customer_phone:
              order.customer_phone ||
              order.user_phone ||
              "",

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
      const id = normalizeOrderId(req.params.id);

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
   ADMIN USERS
========================================================= */

app.get(
  "/api/admin/users",
  requireAdmin,
  async (req, res) => {
    try {
      const result = await db.execute(`
        SELECT
          u.*,
          COUNT(o.id) AS orders_count,
          MAX(o.created_at) AS last_order_at
        FROM users u
        LEFT JOIN orders o ON o.user_id = u.id
        GROUP BY u.id
        ORDER BY u.id DESC
      `);

      res.json({ users: result.rows || [] });
    } catch (error) {
      console.error("ADMIN USERS:", error);
      res.status(500).json({ error: error.message || "Не удалось загрузить клиентов" });
    }
  }
);

/* =========================================================
   ADMIN CLEAR ORDERS
   Deletes only orders and resets the public order sequence.
========================================================= */
app.post(
  "/api/admin/orders/clear",
  requireAdmin,
  async (req, res) => {
    try {
      const countResult = await db.execute(`SELECT COUNT(*) AS count FROM orders`);
      const deletedCount = Number(countResult.rows?.[0]?.count || 0);

      await db.execute(`DELETE FROM orders`);

      // orders.id is AUTOINCREMENT, so resetting sqlite_sequence makes
      // the next order ID 1 and therefore the public number IR-1001.
      try {
        await db.execute(`DELETE FROM sqlite_sequence WHERE name = 'orders'`);
      } catch (sequenceError) {
        console.warn("ORDER SEQUENCE RESET:", sequenceError.message);
      }

      return res.json({
        ok: true,
        deleted: deletedCount,
        next_order_number: "IR-1001"
      });
    } catch (error) {
      console.error("ADMIN CLEAR ORDERS:", error);
      return res.status(500).json({
        error: error.message || "Не удалось очистить заказы"
      });
    }
  }
);

/* =========================================================
   ADMIN ORDER STATUS
========================================================= */
/* Compatibility: existing admin clients may still use PUT. */
app.post(
  "/api/admin/orders/:id/status",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      const id = normalizeOrderId(req.params.id);

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

      const result = await db.execute({
        sql: `
          UPDATE orders
          SET
            status = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        args: [status, id]
      });

      const order =
        await getOrderById(
          id
        );

      if (!order) {
        return res.status(404).json({ error: "Заказ не найден" });
      }

      try {
        await notifyCustomerOrderStatus(order, order.telegram_user_id);
      } catch (error) {
        console.error("Customer order status notification:", error.message);
      }

      res.json({
        ok: true,
        order: {
          ...order,
          display_id: orderDisplayId(order.id),
          selected_options: safeJsonParse(order.selected_options, {})
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
   ADMIN ORDER STATUS PUT COMPATIBILITY
========================================================= */
app.put(
  "/api/admin/orders/:id/status",
  requireAdmin,
  async (req, res) => {
    try {
      const id = normalizeOrderId(req.params.id);
      const status = stringValue(req.body?.status);
      const allowed = [
        "new",
        "confirmed",
        "processing",
        "ready",
        "completed",
        "cancelled",
        "rejected"
      ];

      if (!id || !allowed.includes(status)) {
        return res.status(400).json({ error: "Недопустимый статус заказа" });
      }

      const result = await db.execute({
        sql: `UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [status, id]
      });

      const order = await getOrderById(id);
      if (!order) {
        return res.status(404).json({ error: "Заказ не найден" });
      }
      try {
        await notifyCustomerOrderStatus(order, order.telegram_user_id);
      } catch (error) {
        console.error("Customer order status notification:", error.message);
      }

      return res.json({
        ok: true,
        order: {
          ...order,
          display_id: orderDisplayId(order.id),
          selected_options: safeJsonParse(order.selected_options, {})
        }
      });
    } catch (error) {
      console.error("ADMIN ORDER STATUS PUT:", error);
      return res.status(500).json({
        error: error.message || "Не удалось изменить статус заказа"
      });
    }
  }
);

/* =========================================================
   ADMIN RESERVATION STATUS
========================================================= */

app.post(
  "/api/admin/orders/:id/reservation",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      const id = normalizeOrderId(req.params.id);

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

      const updateResult = await db.execute({
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
        args: [reservationStatus, reservationStatus, id]
      });

      const order =
        await getOrderById(
          id
        );

      if (!order) {
        return res.status(404).json({ error: "Заказ не найден" });
      }

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

      if (reservationStatus === "confirmed" || reservationStatus === "rejected") {
        try {
          await notifyCustomerReservation(responseOrder);
        } catch (error) {
          console.error("Reservation customer notification:", error.message);
        }
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
              image_url,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
   ADMIN PRICE-LIST IMPORT FROM TELEGRAM
   Trigger: authorized admin in private chat; optional first line "ТОЛЬКО АДМИН".
========================================================= */

const PRICE_LIST_MODELS = [
  "iPhone 18 Pro Max", "iPhone 18 Pro", "iPhone 18 Air", "iPhone 18",
  "iPhone 17 Pro Max", "iPhone 17 Pro", "iPhone 17 Air", "iPhone 17e", "iPhone 17",
  "iPhone 16 Pro Max", "iPhone 16 Pro", "iPhone 16 Plus", "iPhone 16",
  "iPhone 15 Pro Max", "iPhone 15 Pro", "iPhone 15 Plus", "iPhone 15",
  "iPhone 14 Pro Max", "iPhone 14 Pro", "iPhone 14 Plus", "iPhone 14",
  "iPhone 13 Pro Max", "iPhone 13 Pro", "iPhone 13", "iPhone 13 mini",
  "iPhone 12 Pro Max", "iPhone 12 Pro", "iPhone 12", "iPhone 12 mini",
  "iPhone 11 Pro Max", "iPhone 11 Pro", "iPhone 11",
  "AirPods Pro", "AirPods Max", "AirPods",
  "Apple Watch Ultra", "Apple Watch Series", "Apple Watch",
  "iPad Pro", "iPad Air", "iPad mini", "iPad",
  "MacBook Pro", "MacBook Air", "MacBook",
  "Dyson", "PlayStation", "Xbox", "Nintendo", "Samsung", "Xiaomi", "Google Pixel"
];

function parseImportPrice(value) {
  const raw = String(value || "").trim();
  if (!raw) return { numeric: null, text: "По запросу" };
  if (/по\s+запросу/i.test(raw)) return { numeric: null, text: "По запросу" };
  const m = raw.match(/от\s*([\d\s.,]+)/i);
  const candidate = m ? `от ${m[1].trim()}` : raw;
  const n = parsePriceListNumber(candidate.replace(/^от\s*/i, ""));
  if (n) return { numeric: n, text: /^от\s/i.test(raw) ? `От ${n.toLocaleString("ru-RU")} ₽` : `${n.toLocaleString("ru-RU")} ₽` };
  return { numeric: null, text: raw.replace(/\s+/g, " ").trim() || "По запросу" };
}

function parsePriceListNumber(value) {
  const normalized = String(value || "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function categoryNameForImport(model, descriptor = "") {
  const text = `${model} ${descriptor}`.toLowerCase();
  if (/iphone/.test(text)) return "iPhone";
  if (/airpods/.test(text)) return "AirPods";
  if (/apple\s*watch|watch/.test(text)) return "Apple Watch";
  if (/ipad/.test(text)) return "iPad";
  if (/macbook|mac mini|mac studio|imac/.test(text)) return "MacBook";
  if (/dyson/.test(text)) return "Dyson";
  if (/playstation|ps5|ps4/.test(text)) return "PlayStation";
  if (/xbox/.test(text)) return "Xbox";
  if (/nintendo|switch/.test(text)) return "Nintendo";
  if (/samsung/.test(text)) return "Samsung";
  if (/xiaomi/.test(text)) return "Xiaomi";
  if (/pixel/.test(text)) return "Android";
  return "Другое";
}

function makeCategorySlug(name) {
  return String(name || 'category')
    .toLowerCase()
    .replace(/[ё]/g, 'е')
    .replace(/[^a-z0-9а-я]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'category';
}

async function repairCategorySlugs() {
  const result = await db.execute(`SELECT id, name, slug FROM categories ORDER BY id ASC`);
  const used = new Set();
  for (const row of result.rows || []) {
    const id = Number(row.id);
    const name = String(row.name || "Категория").trim() || "Категория";
    const base = makeCategorySlug(name);
    let candidate = String(row.slug || "").trim().toLowerCase() || base;
    if (used.has(candidate)) candidate = base;
    let n = 2;
    while (used.has(candidate)) candidate = `${base}-${n++}`;
    while (true) {
      const conflict = await db.execute({ sql: `SELECT id FROM categories WHERE slug = ? AND id <> ? LIMIT 1`, args: [candidate, id] });
      if (!conflict.rows.length) break;
      candidate = `${base}-${n++}`;
    }
    if (String(row.slug || "").trim().toLowerCase() !== candidate) {
      await db.execute({ sql: `UPDATE categories SET slug = ? WHERE id = ?`, args: [candidate, id] });
    }
    used.add(candidate);
  }
}

async function findOrCreateImportCategory(name) {
  const cleanName = String(name || 'Другое').trim() || 'Другое';

  // First reuse the category by its human-readable name.
  const byName = await db.execute({
    sql: `SELECT id FROM categories WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1`,
    args: [cleanName]
  });
  if (byName.rows.length) return Number(byName.rows[0].id);

  const baseSlug = makeCategorySlug(cleanName);

  // SQLite/Turso may have a UNIQUE(slug) index. Do not rely on a
  // separate SELECT+INSERT pair because two admin actions can race.
  for (let suffix = 0; suffix < 1000; suffix++) {
    const slug = suffix === 0 ? baseSlug : `${baseSlug}-${suffix + 1}`;

    const existing = await db.execute({
      sql: `SELECT id, name FROM categories WHERE slug = ? LIMIT 1`,
      args: [slug]
    });

    if (existing.rows.length) {
      // If this slug already belongs to the requested category, reuse it.
      if (String(existing.rows[0].name || '').trim().toLowerCase() === cleanName.toLowerCase()) {
        return Number(existing.rows[0].id);
      }
      continue;
    }

    try {
      const created = await db.execute({
        sql: `INSERT OR IGNORE INTO categories (name, slug, image_url, created_at) VALUES (?, ?, '', CURRENT_TIMESTAMP)`,
        args: [cleanName, slug]
      });

      if (created.rowsAffected) return Number(created.lastInsertRowid);

      // Another request inserted the same slug between SELECT and INSERT.
      const afterRace = await db.execute({
        sql: `SELECT id, name FROM categories WHERE slug = ? LIMIT 1`,
        args: [slug]
      });
      if (afterRace.rows.length && String(afterRace.rows[0].name || '').trim().toLowerCase() === cleanName.toLowerCase()) {
        return Number(afterRace.rows[0].id);
      }
    } catch (error) {
      // A concurrent UNIQUE conflict should simply move to the next slug.
      if (!/unique.*categories\.slug|unique constraint.*slug/i.test(String(error?.message || error))) {
        throw error;
      }
    }
  }

  throw new Error(`Не удалось создать категорию «${cleanName}»: не удалось подобрать уникальный slug.`);
}

function splitPricePart(raw) {
  const text = String(raw || "").trim();
  // Keep slash-separated prices as separate price variants when possible.
  return text.split(/\s*\/\s*/).map(x => x.trim()).filter(Boolean);
}

function normalizeImportKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[ё]/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeSimType(value) {
  const s = String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!s) return '';
  if (/^1\s*sim\s*\+\s*e\s*sim$/.test(s)) return '1 SIM + eSIM';
  if (/^sim\s*\+\s*e\s*sim$/.test(s)) return 'SIM + eSIM';
  if (/^sim\s*\+\s*sim$/.test(s) || /^2\s*sim$/.test(s)) return 'SIM + SIM';
  if (/^e\s*sim\s*\+\s*e\s*sim$/.test(s)) return 'eSIM + eSIM';
  if (/^e\s*sim$/.test(s)) return 'eSIM';
  return String(value || '').replace(/eSim/ig, 'eSIM').replace(/\s+/g, ' ').trim();
}

function detectIphoneModel(text) {
  const s = String(text || '').replace(/🇯🇵|🇮🇳|🇭🇰|🇨🇳|🇺🇸|🇦🇪|🇪🇺|🇰🇷/gu, '').trim();
  const m = s.match(/^(?:iPhone\s*)?(11|12|13|14|15|16|17|18)(?:\s*(Pro\s*Max|Pro|Plus|Air|e))?(?=\s|$)/i);
  if (!m) return '';
  const suffix = m[2] ? ` ${m[2].replace(/\s+/g, ' ').trim()}` : '';
  return `iPhone ${m[1]}${suffix}`.replace(/\be$/i, 'e');
}

function parseAdminPriceList(text) {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const items = [];
  const skipped = [];
  let currentModel = '';

  for (const originalLine of lines) {
    let line = originalLine.replace(/^[-•*🔹🆕🟠🎧]\s*/, '').trim();
    const cleanLine = line.replace(/🇯🇵|🇮🇳|🇭🇰|🇨🇳|🇺🇸|🇦🇪|🇪🇺|🇰🇷/gu, '').trim();

    // Explicit section headers.
    const header = cleanLine.replace(/[:：]$/, '').trim();
    const exactHeader = PRICE_LIST_MODELS.find(name => header.toLowerCase() === name.toLowerCase());
    if (exactHeader) {
      currentModel = exactHeader;
      continue;
    }

    const iphoneHeader = detectIphoneModel(header);
    if (iphoneHeader && !/\b(?:GB|TB)\b/i.test(header) && !/[-–—]/.test(header)) {
      currentModel = iphoneHeader;
      continue;
    }

    // Ignore explanatory SIM mapping lines such as "🇺🇸 - eSim+eSim".
    if (/^[-–—+\s]+$/.test(cleanLine)) continue;
    if (/^(?:e\s*sim|1\s*sim\s*\+\s*e\s*sim|sim\s*\+\s*e\s*sim)$/i.test(cleanLine)) continue;

    // The price is always after the LAST dash. Some rows have an additional
    // dash between the color and SIM type, e.g.
    // `17 Pro 256GB Silver — eSIM+eSIM — 105.000`.
    const dash = line.match(/^(.+?)\s*[-–—]\s*((?:от\s*)?[\d\s.,]+(?:\s*\/\s*(?:от\s*)?[\d\s.,]+)*|по\s+запросу.*)$/iu);
    if (!dash) continue;

    let descriptor = dash[1].trim();
    const priceRaw = dash[2].trim();
    const priceParts = splitPricePart(priceRaw);

    // Detect model directly from a priced line. This is important for lines
    // like "18 Pro 256GB Black eSim - 122.000" and "🇮🇳 13 128GB Midnight - 50.000".
    const lineModel = detectIphoneModel(descriptor);
    if (lineModel) {
      currentModel = lineModel;
    }

    if (!currentModel) {
      // Non-iPhone one-line products can use their own header as model.
      const genericName = descriptor.replace(/🇯🇵|🇮🇳|🇭🇰|🇨🇳|🇺🇸|🇦🇪|🇪🇺|🇰🇷/gu, '').trim();
      if (!genericName) { skipped.push(originalLine); continue; }
      currentModel = genericName;
    }

    descriptor = descriptor
      .replace(/🇯🇵|🇮🇳|🇭🇰|🇨🇳|🇺🇸|🇦🇪|🇪🇺|🇰🇷/gu, '')
      .trim();

    // Remove the explicit model prefix from the variant descriptor.
    const modelWithoutIphone = currentModel.replace(/^iPhone\s+/i, '');
    const prefixes = [currentModel, modelWithoutIphone];
    for (const prefix of prefixes) {
      const escapedPrefix = prefix.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
      const re = new RegExp(`^${escapedPrefix}\\s*`, 'i');
      if (re.test(descriptor)) {
        descriptor = descriptor.replace(re, '').trim();
        break;
      }
    }

    const simMatch = descriptor.match(/\b(1\s*SIM\s*\+\s*e\s*SIM|e\s*SIM\s*\+\s*e\s*SIM|e\s*SIM|SIM\s*\+\s*e\s*SIM|SIM\s*\+\s*SIM|2\s*SIM)\b/i);
    const explicitSim = normalizeSimType(simMatch?.[1] || '');
    descriptor = descriptor.replace(simMatch?.[0] || '', '').trim();

    const memoryMatch = descriptor.match(/\b(64GB|128GB|256GB|512GB|1TB|2TB|3TB|4TB)\b/i);
    const memory = memoryMatch?.[1]?.toUpperCase() || '';
    descriptor = descriptor.replace(memoryMatch?.[0] || '', '').trim();

    const regionFlags = [...originalLine.matchAll(/🇯🇵|🇮🇳|🇭🇰|🇨🇳|🇺🇸|🇦🇪|🇪🇺|🇰🇷/gu)].map(m => m[0]);
    const inferredSim = explicitSim || (
      regionFlags.some(flag => flag === '🇯🇵' || flag === '🇺🇸') ? 'eSIM + eSIM' :
      regionFlags.some(flag => flag === '🇮🇳' || flag === '🇭🇰' || flag === '🇦🇪' || flag === '🇪🇺' || flag === '🇰🇷') ? 'SIM + eSIM' :
      regionFlags.some(flag => flag === '🇨🇳') ? 'SIM + SIM' : ''
    );

    const color = descriptor.replace(/[-–—]\s*$/u, '').replace(/\s+/g, ' ').trim();

    for (const priceRawPart of priceParts) {
      const parsed = parseImportPrice(priceRawPart);
      const variantKey = normalizeImportKey([currentModel, memory, color, inferredSim].join('|'));
      items.push({
        model: currentModel,
        category: categoryNameForImport(currentModel, color),
        region: '',
        memory,
        color,
        sim_type: inferredSim,
        price: parsed.numeric,
        price_text: parsed.text,
        import_key: variantKey,
        source_line: originalLine
      });
    }
  }

  // Regions are intentionally hidden. If two source rows collapse to the same
  // visible variant, keep the lowest numeric price instead of creating duplicates.
  const unique = new Map();
  for (const item of items) {
    const key = item.import_key;
    const previous = unique.get(key);
    if (!previous) {
      unique.set(key, item);
      continue;
    }
    if (Number.isFinite(item.price) && (!Number.isFinite(previous.price) || item.price < previous.price)) {
      unique.set(key, item);
    }
  }

  return { items: [...unique.values()], skipped };
}

async function clearCatalogOnly() {
  await db.execute(`UPDATE orders SET product_id = NULL, variant_id = NULL WHERE product_id IS NOT NULL OR variant_id IS NOT NULL`);
  await db.execute(`DELETE FROM product_variants`);
  await db.execute(`DELETE FROM products`);
}

async function readPriceFile() {
  const filePath = path.join(__dirname, "price.txt");
  if (!fs.existsSync(filePath)) throw new Error("Файл price.txt не найден в корне проекта.");
  const text = fs.readFileSync(filePath, "utf8");
  if (!text.trim()) throw new Error("Файл price.txt пустой.");
  return text;
}

async function syncCatalogFromFile(requestedBy = "automatic") {
  const text = await readPriceFile();
  return syncCatalogText(text, requestedBy);
}

async function syncCatalogText(text, requestedBy = "automatic") {
  const parsed = parseAdminPriceList(text);
  const items = parsed.items;
  if (!items.length) throw new Error("Не удалось распознать ни одной позиции из price.txt.");
  await repairCategorySlugs();

  const oldProducts = await db.execute(`SELECT id, name, import_key FROM products`);
  const oldVariants = await db.execute(`SELECT id, import_key FROM product_variants`);
  const productByKey = new Map();
  const productByName = new Map();
  const variantByKey = new Map();
  for (const row of oldProducts.rows || []) {
    if (row.import_key) productByKey.set(normalizeImportKey(row.import_key), row);
    productByName.set(normalizeImportKey(row.name), row);
  }
  for (const row of oldVariants.rows || []) if (row.import_key) variantByKey.set(normalizeImportKey(row.import_key), row);

  const result = { created_products: [], updated_products: [], deleted_products: 0, created_variants: 0, updated_variants: 0, deleted_variants: 0, skipped: parsed.skipped || [], total_prices: items.length };
  const grouped = new Map();
  for (const item of items) {
    const key = normalizeImportKey(item.model);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }
  const keepProductIds = new Set();
  const keepVariantKeys = new Set();

  for (const variants of grouped.values()) {
    const first = variants[0];
    const categoryId = await findOrCreateImportCategory(first.category);
    const modelKey = normalizeImportKey(first.model);
    const existing = productByKey.get(modelKey) || productByName.get(modelKey) || null;
    const numericPrices = variants.map(v => v.price).filter(v => Number.isFinite(v) && v > 0);
    const minPrice = numericPrices.length ? Math.min(...numericPrices) : 0;
    const priceText = variants.length === 1 ? first.price_text : (minPrice ? `От ${minPrice.toLocaleString("ru-RU")} ₽` : "По запросу");
    const priceOptions = {
      base_price: minPrice, pricing_mode: "price_matrix",
      colors: [...new Set(variants.map(v => v.color).filter(Boolean))].map(name => ({ name, surcharge: 0 })),
      memories: [...new Set(variants.map(v => v.memory).filter(Boolean))].map(name => ({ name, surcharge: 0 })),
      sims: [...new Set(variants.map(v => v.sim_type).filter(Boolean))].map(name => ({ name, surcharge: 0 })),
      regions: [],
      price_matrix: variants.map(v => ({ memory: v.memory, color: v.color, sim: v.sim_type, price: v.price, price_text: v.price_text }))
    };
    let productId;
    if (existing) {
      productId = Number(existing.id);
      await db.execute({ sql: `UPDATE products SET category_id = ?, name = ?, price = ?, price_text = ?, price_options = ?, import_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, args: [categoryId, first.model, minPrice, priceText, JSON.stringify(priceOptions), modelKey, productId] });
      result.updated_products.push(first.model);
    } else {
      const created = await db.execute({ sql: `INSERT INTO products (category_id, name, description, price, old_price, image_url, images, price_options, is_new, import_key, price_text, created_at, updated_at) VALUES (?, ?, '', ?, 0, '', '[]', ?, 1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, args: [categoryId, first.model, minPrice, JSON.stringify(priceOptions), modelKey, priceText] });
      productId = Number(created.lastInsertRowid);
      result.created_products.push(first.model);
    }
    keepProductIds.add(productId);

    for (const item of variants) {
      const variantKey = normalizeImportKey([modelKey, item.memory, item.color, item.sim_type].join("|"));
      keepVariantKeys.add(variantKey);
      const variantName = [first.model.replace(/^iPhone\s+/i, ""), item.memory, item.color, item.sim_type].filter(Boolean).join(" ").trim() || first.model;
      const existingVariant = variantByKey.get(variantKey);
      if (existingVariant) {
        await db.execute({ sql: `UPDATE product_variants SET product_id = ?, name = ?, price = ?, price_text = ?, color = ?, memory = ?, sim_type = ?, region = '', import_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, args: [productId, variantName, item.price || 0, item.price_text, item.color, item.memory, item.sim_type, variantKey, Number(existingVariant.id)] });
        result.updated_variants++;
      } else {
        await db.execute({ sql: `INSERT INTO product_variants (product_id, name, price, price_text, color, memory, sim_type, region, image_url, import_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, '', '', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, args: [productId, variantName, item.price || 0, item.price_text, item.color, item.memory, item.sim_type, variantKey] });
        result.created_variants++;
      }
    }
  }

  const staleVariants = await db.execute(`SELECT id, import_key FROM product_variants`);
  for (const row of staleVariants.rows || []) {
    if (!keepVariantKeys.has(normalizeImportKey(row.import_key))) {
      await db.execute({ sql: `UPDATE orders SET variant_id = NULL WHERE variant_id = ?`, args: [Number(row.id)] });
      await db.execute({ sql: `DELETE FROM product_variants WHERE id = ?`, args: [Number(row.id)] });
      result.deleted_variants++;
    }
  }
  const staleProducts = await db.execute(`SELECT id FROM products`);
  for (const row of staleProducts.rows || []) {
    if (!keepProductIds.has(Number(row.id))) {
      await db.execute({ sql: `UPDATE orders SET product_id = NULL WHERE product_id = ?`, args: [Number(row.id)] });
      await db.execute({ sql: `DELETE FROM products WHERE id = ?`, args: [Number(row.id)] });
      result.deleted_products++;
    }
  }
  return { ...result, requested_by: String(requestedBy || "") };
}

async function importCatalogFromFile(requestedBy) {
  return syncCatalogFromFile(requestedBy);
}

app.post("/api/admin/price-import", requireAdmin, async (req, res) => {
  try {
    const result = await syncCatalogFromFile(req.telegramUser.id);
    return res.json({ ok: true, result });
  } catch (error) {
    console.error("ADMIN PRICE FILE SYNC:", error);
    return res.status(500).json({ error: error.message || "Ошибка синхронизации каталога" });
  }
});


/* =========================================================
   TELEGRAM CHAT ADMIN PANEL
   The admin UI is intentionally rendered inside the bot chat.
   No Mini App / web_app buttons are used here.
========================================================= */

const adminChatState = new Map();

function adminStateKey(chatId) {
  return normalizeTelegramId(chatId);
}

function adminSetState(chatId, state) {
  adminChatState.set(adminStateKey(chatId), state);
}

function adminGetState(chatId) {
  return adminChatState.get(adminStateKey(chatId)) || null;
}

function adminClearState(chatId) {
  adminChatState.delete(adminStateKey(chatId));
}

function adminMainKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "📦 Заказы", callback_data: "adm:orders" },
        { text: "🛍 Товары", callback_data: "adm:products" }
      ],
      [
        { text: "🎟 Промокоды", callback_data: "adm:promos" }
      ],
      [
        { text: "ℹ️ Информация", callback_data: "adm:info" },
        { text: "⚙️ Настройки", callback_data: "adm:settings" }
      ],
      [
        { text: "🔄 Обновить", callback_data: "adm:home" }
      ]
    ]
  };
}

function adminInfoKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "📢 Telegram-канал", url: "https://t.me/iroom_market" }],
      [{ text: "💬 Связаться", url: "https://t.me/iroom_24" }],
      [{ text: "❓ FAQ", url: "https://telegra.ph/FAQ-02-09-11" }],
      [{ text: "▶️ YouTube", url: "https://youtube.com/@iRoom.market" }],
      [{ text: "VK", url: "https://vk.ru/club226763206" }],
      [{ text: "MAX", url: "https://max.ru/join/4KILAkyTPtoHvnwyRo5UUVEPYLvpybTyc-09hGVlVa4" }],
      [{ text: "📝 Оформление заказа", url: "https://telegra.ph/Dlya-oformleniya-zakaza-02-09" }],
      [{ text: "⬅️ В админку", callback_data: "adm:home" }]
    ]
  };
}

function adminSettingsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "📍 Адрес и получение", callback_data: "adm:pickup" }],
      [{ text: "💳 Оплата", callback_data: "adm:payment" }],
      [{ text: "ℹ️ Информация магазина", callback_data: "adm:info" }],
      [{ text: "⬅️ В админку", callback_data: "adm:home" }]
    ]
  };
}

function adminOrderKeyboard(order) {
  const id = Number(order.id);
  return {
    inline_keyboard: [
      [{ text: "⬅️ Заказы", callback_data: "adm:orders" }]
    ]
  };
}

async function adminDashboardText() {
  const [orders, products, users] = await Promise.all([
    db.execute(`SELECT COUNT(*) AS count FROM orders`),
    db.execute(`SELECT COUNT(*) AS count FROM products`),
    db.execute(`SELECT COUNT(*) AS count FROM users`)
  ]);

  return [
    "🛠 <b>IRoom ADMIN</b>",
    "",
    `📦 Заказов: <b>${Number(orders.rows?.[0]?.count || 0)}</b>`,
    `🛍 Товаров: <b>${Number(products.rows?.[0]?.count || 0)}</b>`,
    `👤 Пользователей: <b>${Number(users.rows?.[0]?.count || 0)}</b>`,
    "",
    "Выберите действие ниже."
  ].join("\n");
}

async function adminOrdersMessage() {
  const result = await db.execute(`
    SELECT
      o.*,
      u.first_name AS user_first_name,
      u.last_name AS user_last_name,
      u.username AS user_username
    FROM orders o
    LEFT JOIN users u ON u.telegram_user_id = o.telegram_user_id
    ORDER BY o.id DESC
    LIMIT 15
  `);

  if (!result.rows.length) {
    return {
      text: "📦 <b>Заказы</b>\n\nЗаказов пока нет.",
      reply_markup: { inline_keyboard: [[{ text: "⬅️ В админку", callback_data: "adm:home" }]] }
    };
  }

  const rows = result.rows.map((order) => {
    const username = order.user_username ? `@${order.user_username}` : "без username";
    const product = escapeTelegramHtml(order.product_name || order.variant_text || "Товар");
    return [{
      text: `${orderDisplayId(order.id)} · ${username} · ${product}`.slice(0, 64),
      callback_data: `adm:order:${Number(order.id)}`
    }];
  });

  rows.push([{ text: "⬅️ В админку", callback_data: "adm:home" }]);

  return {
    text: "📦 <b>Последние заказы</b>\n\nНажмите на заказ для просмотра заказа.",
    reply_markup: { inline_keyboard: rows }
  };
}

async function adminProductsMessage() {
  const result = await db.execute(`
    SELECT id, name, price, price_text
    FROM products
    ORDER BY id DESC
    LIMIT 15
  `);

  if (!result.rows.length) {
    return {
      text: "🛍 <b>Товары</b>\n\nКаталог пуст.",
      reply_markup: { inline_keyboard: [[{ text: "⬅️ В админку", callback_data: "adm:home" }]] }
    };
  }

  const rows = result.rows.map((product) => {
    const price = product.price_text || (Number(product.price) ? formatPrice(product.price) : "По запросу");
    return [{
      text: `${Number(product.id)} · ${String(product.name || "Товар").slice(0, 42)} · ${price}`.slice(0, 64),
      callback_data: `adm:product:${Number(product.id)}`
    }];
  });

  rows.push([{ text: "⬅️ В админку", callback_data: "adm:home" }]);

  return {
    text: "🛍 <b>Товары</b>\n\nПоследние позиции каталога:",
    reply_markup: { inline_keyboard: rows }
  };
}

async function adminProductMessage(productId) {
  const result = await db.execute({
    sql: `
      SELECT p.*, c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = ?
      LIMIT 1
    `,
    args: [productId]
  });

  const product = result.rows?.[0];
  if (!product) {
    return {
      text: "❌ Товар не найден.",
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Товары", callback_data: "adm:products" }]] }
    };
  }

  const variants = await db.execute({
    sql: `SELECT id, name, price, price_text FROM product_variants WHERE product_id = ? ORDER BY id ASC LIMIT 20`,
    args: [productId]
  });

  const price = product.price_text || (Number(product.price) ? formatPrice(product.price) : "По запросу");
  const lines = [
    `🛍 <b>${escapeTelegramHtml(product.name)}</b>`,
    "",
    `Категория: ${escapeTelegramHtml(product.category_name || "—")}`,
    `Цена: <b>${escapeTelegramHtml(price)}</b>`,
    `ID: <code>${product.id}</code>`
  ];

  if (variants.rows.length) {
    lines.push("", "Варианты:");
    for (const variant of variants.rows) {
      const vp = variant.price_text || (Number(variant.price) ? formatPrice(variant.price) : "По запросу");
      lines.push(`• ${escapeTelegramHtml(variant.name || "Вариант")} — ${escapeTelegramHtml(vp)}`);
    }
  }

  return {
    text: lines.join("\n"),
    reply_markup: {
      inline_keyboard: [
        [{ text: "⬅️ Товары", callback_data: "adm:products" }]
      ]
    }
  };
}

async function adminOrderMessage(orderId) {
  const normalizedId = normalizeOrderId(orderId);
  const order = normalizedId ? await getOrderById(normalizedId) : null;
  if (!order) {
    return {
      text: "❌ Заказ не найден.",
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Заказы", callback_data: "adm:orders" }]] }
    };
  }

  const username = order.user_username || order.customer_username;
  const buyer = username ? `@${String(username).replace(/^@/, "")}` : "без username";
  const options = safeJsonParse(order.selected_options, {});
  const optionText = Object.entries(options || {})
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
    .map(([key, value]) => `${escapeTelegramHtml(key)}: ${escapeTelegramHtml(value)}`)
    .join("\n");

  const lines = [
    `📦 <b>${escapeTelegramHtml(orderDisplayId(order.id))}</b>`,
    "",
    `👤 <b>Клиент:</b> ${escapeTelegramHtml(buyer)}`,
    `📱 <b>Товар:</b> ${escapeTelegramHtml(order.product_name || "—")}`,
    `🔧 <b>Вариант:</b> ${escapeTelegramHtml(order.variant_text || "—")}`,
    `💰 <b>Цена:</b> ${escapeTelegramHtml(formatPrice(order.price))}`,
    `🚚 <b>Получение:</b> ${escapeTelegramHtml(order.fulfillment_type || order.receiving_type || order.delivery_type || "—")}`,
    `📍 <b>Адрес:</b> ${escapeTelegramHtml(order.address || "—")}`
  ];

  if (order.customer_phone) lines.push(`☎️ <b>Телефон:</b> ${escapeTelegramHtml(order.customer_phone)}`);
  if (order.customer_comment || order.comment) lines.push(`💬 <b>Комментарий:</b> ${escapeTelegramHtml(order.customer_comment || order.comment)}`);
  if (optionText) lines.push("", "<b>Параметры:</b>", optionText);

  return {
    text: lines.join("\n"),
    reply_markup: adminOrderKeyboard(order)
  };
}

async function sendAdminHome(chatId, messageId = null) {
  const text = await adminDashboardText();
  const markup = adminMainKeyboard();
  if (messageId) {
    try {
      return await telegramApi("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
        reply_markup: markup
      });
    } catch {}
  }
  return sendTelegramMessage(chatId, text, { reply_markup: markup });
}

async function sendAdminSection(chatId, messageId, payload) {
  try {
    await telegramApi("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: payload.text,
      parse_mode: "HTML",
      reply_markup: payload.reply_markup
    });
  } catch {
    await sendTelegramMessage(chatId, payload.text, {
      reply_markup: payload.reply_markup
    });
  }
}

function adminImportPrompt() {
  return {
    text: [
      "📥 <b>Импорт прайса</b>",
      "",
      "Отправьте следующим сообщением большой прайс обычным текстом.",
      "",
      "Например:",
      "<code>18 Pro 256GB Black eSim - 122.000</code>",
      "<code>18 Pro 256GB Glacier eSim - 122.000</code>",
      "",
      "⚠️ Существующий каталог не очищается.",
      "Товары, которых нет в прайсе, не удаляются.",
      "Повторный импорт одинаковых позиций не создаёт дубли."
    ].join("\n"),
    reply_markup: {
      inline_keyboard: [[{ text: "❌ Отмена", callback_data: "adm:cancel" }]]
    }
  };
}

async function processAdminTextMessage(message) {
  const chatId = normalizeTelegramId(message.chat?.id);
  if (!chatId || !isAdminId(message.from?.id) || String(message.chat?.type || "") !== "private") return false;

  const state = adminGetState(chatId);
  const text = stringValue(message.text);

  if (/^\/adminpanel101(?:@\w+)?$/i.test(text)) {
    adminClearState(chatId);
    await sendAdminHome(chatId);
    return true;
  }

  if (/^\/adminclear101(?:@\w+)?$/i.test(text)) {
    adminClearState(chatId);
    try {
      await clearCatalogOnly();
      await sendTelegramMessage(chatId, "🧹 <b>Каталог очищен</b>\n\nЗаказы, пользователи и промокоды сохранены.", { reply_markup: adminMainKeyboard() });
    } catch (error) {
      await sendTelegramMessage(chatId, `❌ <b>Очистка не выполнена</b>\n\n${escapeTelegramHtml(error.message || "Ошибка")}`, { reply_markup: adminMainKeyboard() });
    }
    return true;
  }

  return false;
}

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

        if (data.startsWith("adm:")) {
          const adminId = normalizeTelegramId(callback.from?.id);
          const chatId = normalizeTelegramId(callback.message?.chat?.id);

          if (!isAdminId(adminId) || !chatId || String(callback.message?.chat?.type || "") !== "private") {
            await answerCallbackQuery(callback.id, "Нет доступа");
            return;
          }

          const parts = data.split(":");
          const action = parts[1] || "home";
          await answerCallbackQuery(callback.id);

          try {
            if (action === "home") {
              adminClearState(chatId);
              await sendAdminHome(chatId, callback.message.message_id);
              return;
            }

            if (action === "cancel") {
              adminClearState(chatId);
              await sendAdminHome(chatId, callback.message.message_id);
              return;
            }

            if (action === "orders") {
              adminClearState(chatId);
              await sendAdminSection(chatId, callback.message.message_id, await adminOrdersMessage());
              return;
            }

            if (action === "order") {
              const orderId = normalizeOrderId(parts[2]);
              await sendAdminSection(chatId, callback.message.message_id, await adminOrderMessage(orderId));
              return;
            }

            if (action === "products") {
              adminClearState(chatId);
              await sendAdminSection(chatId, callback.message.message_id, await adminProductsMessage());
              return;
            }

            if (action === "product") {
              const productId = integerId(parts[2]);
              await sendAdminSection(chatId, callback.message.message_id, await adminProductMessage(productId));
              return;
            }

            if (action === "promos") {
              const result = await db.execute(`SELECT id, code, discount_type, discount_value, active, used_count, max_uses, expires_at FROM promo_codes ORDER BY id DESC LIMIT 20`);
              const lines = ["🎟 <b>Промокоды</b>", ""];
              if (!result.rows.length) {
                lines.push("Промокодов пока нет.");
              } else {
                for (const promo of result.rows) {
                  const discount = promo.discount_type === "percent"
                    ? `${Number(promo.discount_value || 0)}%`
                    : formatPrice(promo.discount_value || 0);
                  const active = Number(promo.active) ? "🟢" : "🔴";
                  lines.push(`${active} <code>${escapeTelegramHtml(promo.code)}</code> — ${escapeTelegramHtml(discount)} — использований ${Number(promo.used_count || 0)}/${Number(promo.max_uses || 0) || "∞"}`);
                }
              }
              await sendAdminSection(chatId, callback.message.message_id, {
                text: lines.join("\n"),
                reply_markup: { inline_keyboard: [[{ text: "⬅️ В админку", callback_data: "adm:home" }]] }
              });
              return;
            }

            if (action === "info") {
              await sendAdminSection(chatId, callback.message.message_id, {
                text: [
                  "ℹ️ <b>Информация IRoom</b>",
                  "",
                  "📍 <b>Адрес:</b>",
                  "г. Москва",
                  "Багратионовский пр. 7 к.3",
                  "Павильон: С1-032",
                  "Ежедневно с 11:00 до 20:00",
                  "",
                  "🚚 <b>Доставка:</b>",
                  "ТК — СДЭК / Боксберри / Почта России и т.д.",
                  "Вокзал — по договорённости.",
                  "По Москве — нашими курьерами, время бронируется заранее.",
                  "",
                  "💳 <b>Оплата:</b>",
                  "Самовывоз — наличные",
                  "Регионы — QR Сбер / Тинькофф",
                  "Перевод +2%",
                  "Карта через Авито +2%",
                  "Терминал +15%",
                  "Счёт на ИП/ООО +15%",
                  "Рассрочка от Авито"
                ].join("\n"),
                reply_markup: adminInfoKeyboard()
              });
              return;
            }

            if (action === "settings") {
              await sendAdminSection(chatId, callback.message.message_id, {
                text: "⚙️ <b>Настройки IRoom</b>\n\nВыберите раздел:",
                reply_markup: adminSettingsKeyboard()
              });
              return;
            }

            if (action === "pickup") {
              await sendAdminSection(chatId, callback.message.message_id, {
                text: "📍 <b>Получение</b>\n\nг. Москва\nБагратионовский пр. 7 к.3\nПавильон: С1-032\nЕжедневно с 11:00 до 20:00",
                reply_markup: { inline_keyboard: [[{ text: "⬅️ Настройки", callback_data: "adm:settings" }]] }
              });
              return;
            }

            if (action === "payment") {
              await sendAdminSection(chatId, callback.message.message_id, {
                text: "💳 <b>Оплата</b>\n\nСамовывоз — только наличные\nРегионы — QR Сбер/Тинькофф\nПеревод +2%\nКарта через Авито +2%\nТерминал +15%\nСчёт на ИП/ООО +15%\nРассрочка от Авито",
                reply_markup: { inline_keyboard: [[{ text: "⬅️ Настройки", callback_data: "adm:settings" }]] }
              });
              return;
            }
          } catch (error) {
            console.error("ADMIN CHAT CALLBACK:", error);
            await sendTelegramMessage(chatId, `❌ ${escapeTelegramHtml(error.message || "Ошибка")}`, { reply_markup: adminMainKeyboard() });
          }
          return;
        }

        if (data.startsWith("reservation_confirm:") || data.startsWith("reservation_reject:")) {
          const [action, rawId] = data.split(":");
          const orderId = integerId(rawId);
          const adminId = normalizeTelegramId(callback.from?.id);

          if (!orderId || !isAdminId(adminId)) {
            await answerCallbackQuery(callback.id, "Нет доступа");
          } else {
            const order = await getOrderById(orderId);

            if (!order) {
              await answerCallbackQuery(callback.id, "Заказ не найден");
            } else if (order.reservation_status === "confirmed" && action === "reservation_confirm") {
              await answerCallbackQuery(callback.id, "Залог уже подтверждён");
            } else if (order.reservation_status === "rejected" && action === "reservation_reject") {
              await answerCallbackQuery(callback.id, "Залог уже отклонён");
            } else {
              const nextStatus = action === "reservation_confirm" ? "confirmed" : "rejected";

              await db.execute({
                sql: `
                  UPDATE orders
                  SET reservation_status = ?,
                      reservation_paid_at = CASE
                        WHEN ? = 'confirmed' THEN COALESCE(reservation_paid_at, CURRENT_TIMESTAMP)
                        ELSE reservation_paid_at
                      END,
                      updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?
                `,
                args: [nextStatus, nextStatus, orderId]
              });

              const updated = await getOrderById(orderId);
              await notifyCustomerReservation({
                ...updated,
                display_id: orderDisplayId(orderId)
              });

              try {
                await telegramApi("editMessageReplyMarkup", {
                  chat_id: callback.message?.chat?.id,
                  message_id: callback.message?.message_id,
                  reply_markup: { inline_keyboard: [] }
                });
              } catch {}

              await answerCallbackQuery(
                callback.id,
                nextStatus === "confirmed" ? "Залог подтверждён" : "Залог отклонён"
              );
            }
          }
        } else if (data.startsWith("order_status:")) {
          await answerCallbackQuery(callback.id);
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

        if (await processAdminTextMessage(message)) {
          return;
        }

        const startMatch = text.match(/^\/start(?:\s+|=)?order_(\d+)$/i);

        if (startMatch) {
          const orderId = normalizeOrderId(startMatch[1]);
          const order = orderId ? await getOrderById(orderId) : null;

          if (!order) {
            await sendTelegramMessage(
              message.chat.id,
              "❌ Заказ не найден."
            );
            return;
          }

          const ownerId = normalizeTelegramId(order.telegram_user_id);
          const chatId = normalizeTelegramId(message.chat.id);

          if (!ownerId || ownerId !== chatId) {
            await sendTelegramMessage(
              message.chat.id,
              "❌ Этот заказ не принадлежит вашему Telegram-аккаунту."
            );
            return;
          }

          const responseOrder = {
            ...order,
            display_id: orderDisplayId(order.id),
            selected_options: safeJsonParse(order.selected_options, {})
          };

          await sendCustomerOrderStatus(
            responseOrder,
            message.chat.id
          );
          return;
        }

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
                      text: "Открыть IRoom",
                      web_app: {
                        url: `${MINIAPP_URL}/index.html`
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

let catalogSyncRunning = false;

async function runAutomaticCatalogSync(reason = "hourly") {
  if (catalogSyncRunning) return;
  catalogSyncRunning = true;
  try {
    const result = await syncCatalogFromFile(reason);
    console.log(`[CATALOG SYNC] ${reason}: ${result.total_prices} prices, ${result.created_products.length} new products, ${result.updated_products.length} updated products, ${result.created_variants} new variants, ${result.updated_variants} updated variants, ${result.deleted_products} deleted products, ${result.deleted_variants} deleted variants`);
  } catch (error) {
    console.error(`[CATALOG SYNC] ${reason} failed:`, error.message);
  } finally {
    catalogSyncRunning = false;
  }
}

/* =========================================================
   START
========================================================= */

async function start() {
  try {
    await migrate();
    await runAutomaticCatalogSync("startup");
    setInterval(() => {
      runAutomaticCatalogSync("hourly").catch(error => console.error("[CATALOG SYNC TIMER]", error.message));
    }, 60 * 60 * 1000);

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