const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { createClient } = require("@libsql/client");

const app = express();

const PORT = Number(process.env.PORT || 10000);

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const ADMIN_ID = String(process.env.ADMIN_ID || "").trim();

const ADMIN_IDS = [
  "5082864281",
  "5975037118",
  ...(ADMIN_ID ? [ADMIN_ID] : [])
].filter(
  (value, index, array) =>
    value && array.indexOf(value) === index
);

const MINIAPP_URL =
  process.env.MINIAPP_URL ||
  "https://iroom-dww8.onrender.com";

const TURSO_DATABASE_URL =
  process.env.TURSO_DATABASE_URL || "";

const TURSO_AUTH_TOKEN =
  process.env.TURSO_AUTH_TOKEN || "";

const publicDir = path.join(__dirname, "public");
const uploadsDir = path.join(publicDir, "uploads");

fs.mkdirSync(uploadsDir, {
  recursive: true
});

const db = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN
});

app.use(
  express.json({
    limit: "10mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb"
  })
);

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

  return String(value).trim();
}

function safeJsonParse(value, fallback = null) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function getTelegramInitData(req) {
  return (
    req.headers["x-telegram-init-data"] ||
    req.headers["telegram-init-data"] ||
    ""
  );
}

function getTelegramUser(req) {
  const initData = getTelegramInitData(req);

  if (!initData) {
    return null;
  }

  try {
    const params = new URLSearchParams(initData);
    const userRaw = params.get("user");

    if (!userRaw) {
      return null;
    }

    return JSON.parse(userRaw);
  } catch {
    return null;
  }
}

function getTelegramUserId(req) {
  const user = getTelegramUser(req);

  if (
    !user ||
    user.id === undefined ||
    user.id === null
  ) {
    return null;
  }

  return String(user.id);
}

function isAdmin(req) {
  const userId = getTelegramUserId(req);

  return Boolean(
    userId && ADMIN_IDS.includes(userId)
  );
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) {
    return res.status(403).json({
      ok: false,
      error: "Доступ запрещён"
    });
  }

  next();
}

function customerName(user) {
  if (!user) {
    return "Покупатель";
  }

  const first = stringValue(user.first_name);
  const last = stringValue(user.last_name);

  const full = `${first} ${last}`.trim();

  return (
    full ||
    stringValue(user.username, "Покупатель")
  );
}

function customerUsername(user) {
  if (!user) {
    return "";
  }

  return stringValue(user.username);
}

function formatPrice(value) {
  return `${Math.round(numberValue(value))} ₽`;
}

function orderStatusLabel(status) {
  const labels = {
    new: "Новый",
    processing: "В обработке",
    awaiting_payment: "Ожидает оплаты",
    reserved: "Бронь подтверждена",
    completed: "Завершён",
    cancelled: "Отменён"
  };

  return (
    labels[status] ||
    status ||
    "Новый"
  );
}

function orderDisplayId(id) {
  return `IR-${1000 + Number(id || 0)}`;
}

function escapeTelegramHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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

function emptyPriceOptions() {
  return {
    colors: [],
    memories: [],
    sims: [],
    regions: []
  };
}

function normalizeOptionName(value) {
  return stringValue(value).slice(0, 150);
}

function normalizeOptionItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const name = normalizeOptionName(item.name);

  if (!name) {
    return null;
  }

  let surcharge = numberValue(
    item.surcharge,
    0
  );

  if (surcharge < 0) {
    surcharge = 0;
  }

  return {
    name,
    surcharge: Math.round(surcharge)
  };
}

function normalizeOptionGroup(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const result = [];

  for (const item of value) {
    const normalized =
      normalizeOptionItem(item);

    if (!normalized) {
      continue;
    }

    const exists = result.some(
      (current) =>
        current.name.toLowerCase() ===
        normalized.name.toLowerCase()
    );

    if (!exists) {
      result.push(normalized);
    }
  }

  return result;
}

function normalizePriceOptions(value) {
  const parsed = safeJsonParse(
    value,
    value
  );

  const source =
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed)
      ? parsed
      : {};

  return {
    colors: normalizeOptionGroup(
      source.colors
    ),
    memories: normalizeOptionGroup(
      source.memories
    ),
    sims: normalizeOptionGroup(
      source.sims
    ),
    regions: normalizeOptionGroup(
      source.regions
    )
  };
}

function priceOptionsForResponse(value) {
  return normalizePriceOptions(value);
}

function hasPriceOptions(options) {
  return PRICE_OPTION_GROUPS.some(
    (group) =>
      Array.isArray(options[group]) &&
      options[group].length > 0
  );
}

function getSelectedValue(
  source,
  keys
) {
  if (
    !source ||
    typeof source !== "object"
  ) {
    return "";
  }

  for (const key of keys) {
    if (
      source[key] !== undefined &&
      source[key] !== null &&
      String(source[key]).trim() !== ""
    ) {
      return String(source[key]).trim();
    }
  }

  return "";
}

function findOption(
  options,
  selectedValue
) {
  if (!selectedValue) {
    return null;
  }

  const normalized =
    selectedValue.toLowerCase();

  return (
    options.find(
      (option) =>
        option.name.toLowerCase() ===
        normalized
    ) || null
  );
}

function calculatePriceWithOptions(
  product,
  selectedInput
) {
  const basePrice = Math.round(
    numberValue(product.price, 0)
  );

  const options =
    normalizePriceOptions(
      product.price_options
    );

  if (!hasPriceOptions(options)) {
    return {
      ok: true,
      price: basePrice,
      selectedOptions: {},
      variantText: ""
    };
  }

  const input =
    selectedInput &&
    typeof selectedInput === "object"
      ? selectedInput
      : {};

  const selectedOptions = {};
  let total = basePrice;

  const groups = [
    {
      group: "colors",
      keys: ["color", "colors"],
      outputKey: "color",
      label: "цвет"
    },
    {
      group: "memories",
      keys: ["memory", "memories"],
      outputKey: "memory",
      label: "память"
    },
    {
      group: "sims",
      keys: [
        "sim",
        "sim_type",
        "simType",
        "sims"
      ],
      outputKey: "sim",
      label: "SIM"
    },
    {
      group: "regions",
      keys: ["region", "regions"],
      outputKey: "region",
      label: "регион"
    }
  ];

  const variantParts = [];

  for (const definition of groups) {
    const available =
      options[definition.group];

    if (
      !available ||
      available.length === 0
    ) {
      continue;
    }

    const selectedValue =
      getSelectedValue(
        input,
        definition.keys
      );

    if (!selectedValue) {
      return {
        ok: false,
        error:
          `Выберите ${definition.label}`
      };
    }

    const selected =
      findOption(
        available,
        selectedValue
      );

    if (!selected) {
      return {
        ok: false,
        error:
          `Недопустимое значение для ${definition.label}`
      };
    }

    selectedOptions[
      definition.outputKey
    ] = selected.name;

    total += selected.surcharge;

    variantParts.push(
      selected.name
    );
  }

  return {
    ok: true,
    price: Math.round(total),
    selectedOptions,
    variantText:
      variantParts.join(" • ")
  };
}

/* =========================================================
   OLD VARIANT SUPPORT
========================================================= */

function buildVariantName({
  color,
  memory,
  sim_type,
  region
}) {
  return [
    color,
    memory,
    sim_type,
    region
  ]
    .map((value) =>
      stringValue(value)
    )
    .filter(Boolean)
    .join(" • ");
}

function normalizeVariant(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    product_id: Number(row.product_id),
    color: stringValue(row.color),
    memory: stringValue(row.memory),
    sim_type: stringValue(row.sim_type),
    region: stringValue(row.region),
    price: numberValue(row.price),
    stock: Number(row.stock || 0),
    name:
      stringValue(row.name) ||
      buildVariantName({
        color: row.color,
        memory: row.memory,
        sim_type: row.sim_type,
        region: row.region
      })
  };
}

/* =========================================================
   DATABASE
   SAFE MIGRATIONS
========================================================= */

async function tableExists(
  tableName
) {
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

async function getColumns(
  tableName
) {
  if (
    !(await tableExists(tableName))
  ) {
    return [];
  }

  const result = await db.execute(
    `PRAGMA table_info(${tableName})`
  );

  return result.rows.map((row) =>
    String(row.name)
  );
}

async function ensureColumn(
  tableName,
  columnName,
  definition
) {
  const exists =
    await tableExists(tableName);

  if (!exists) {
    return;
  }

  const columns =
    await getColumns(tableName);

  if (!columns.includes(columnName)) {
    console.log(
      `Migration: adding ${tableName}.${columnName}`
    );

    await db.execute(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`
    );
  }
}

async function createMissingTables() {
  /*
   * ВАЖНО:
   * CREATE TABLE IF NOT EXISTS ничего не удаляет.
   * Если таблица уже существует, она остаётся
   * со всеми существующими данными.
   */

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
}

async function ensureAllColumns() {
  /* -------------------------
     CATEGORIES
  ------------------------- */

  await ensureColumn(
    "categories",
    "name",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "categories",
    "image_url",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "categories",
    "description",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "categories",
    "sort_order",
    "INTEGER DEFAULT 0"
  );

  await ensureColumn(
    "categories",
    "created_at",
    "TEXT DEFAULT CURRENT_TIMESTAMP"
  );

  await ensureColumn(
    "categories",
    "updated_at",
    "TEXT DEFAULT CURRENT_TIMESTAMP"
  );

  /* -------------------------
     PRODUCTS
  ------------------------- */

  await ensureColumn(
    "products",
    "name",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "products",
    "price",
    "REAL DEFAULT 0"
  );

  await ensureColumn(
    "products",
    "image_url",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "products",
    "description",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "products",
    "category_id",
    "INTEGER"
  );

  await ensureColumn(
    "products",
    "price_options",
    "TEXT DEFAULT '{}'"
  );

  await ensureColumn(
    "products",
    "created_at",
    "TEXT DEFAULT CURRENT_TIMESTAMP"
  );

  await ensureColumn(
    "products",
    "updated_at",
    "TEXT DEFAULT CURRENT_TIMESTAMP"
  );

  /* -------------------------
     PRODUCT VARIANTS
  ------------------------- */

  await ensureColumn(
    "product_variants",
    "product_id",
    "INTEGER"
  );

  await ensureColumn(
    "product_variants",
    "name",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "product_variants",
    "price",
    "REAL DEFAULT 0"
  );

  await ensureColumn(
    "product_variants",
    "stock",
    "INTEGER DEFAULT 0"
  );

  await ensureColumn(
    "product_variants",
    "color",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "product_variants",
    "memory",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "product_variants",
    "sim_type",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "product_variants",
    "region",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "product_variants",
    "created_at",
    "TEXT DEFAULT CURRENT_TIMESTAMP"
  );

  /* -------------------------
     ORDERS
  ------------------------- */

  await ensureColumn(
    "orders",
    "telegram_user_id",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "orders",
    "product_id",
    "INTEGER"
  );

  await ensureColumn(
    "orders",
    "variant_id",
    "INTEGER"
  );

  await ensureColumn(
    "orders",
    "product_name",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "orders",
    "variant_text",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "orders",
    "selected_options",
    "TEXT DEFAULT '{}'"
  );

  await ensureColumn(
    "orders",
    "price",
    "REAL DEFAULT 0"
  );

  await ensureColumn(
    "orders",
    "customer_name",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "orders",
    "customer_username",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "orders",
    "status",
    "TEXT DEFAULT 'new'"
  );

  await ensureColumn(
    "orders",
    "created_at",
    "TEXT DEFAULT CURRENT_TIMESTAMP"
  );

  await ensureColumn(
    "orders",
    "updated_at",
    "TEXT DEFAULT CURRENT_TIMESTAMP"
  );

  /* -------------------------
     USERS
  ------------------------- */

  await ensureColumn(
    "users",
    "telegram_user_id",
    "TEXT"
  );

  await ensureColumn(
    "users",
    "first_name",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "users",
    "last_name",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "users",
    "username",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "users",
    "created_at",
    "TEXT DEFAULT CURRENT_TIMESTAMP"
  );

  await ensureColumn(
    "users",
    "updated_at",
    "TEXT DEFAULT CURRENT_TIMESTAMP"
  );
}

async function runMigrations() {
  console.log(
    "Starting safe database migrations..."
  );

  await createMissingTables();

  await ensureAllColumns();

  console.log(
    "Safe database migrations completed."
  );
}

/* =========================================================
   TELEGRAM
========================================================= */

async function telegram(
  method,
  body = {}
) {
  if (!BOT_TOKEN) {
    return {
      ok: false,
      description:
        "BOT_TOKEN не задан"
    };
  }

  try {
    const response =
      await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify(body)
        }
      );

    return await response.json();
  } catch (error) {
    console.error(
      "Telegram error:",
      error
    );

    return {
      ok: false,
      description:
        error.message
    };
  }
}

function buildOrderKeyboard(
  orderId
) {
  return {
    inline_keyboard: [
      [
        {
          text:
            "⚙️ В обработке",
          callback_data:
            `order_status:${orderId}:processing`
        },
        {
          text:
            "💳 Ожидает оплаты",
          callback_data:
            `order_status:${orderId}:awaiting_payment`
        }
      ],
      [
        {
          text:
            "💰 Бронь подтверждена",
          callback_data:
            `order_status:${orderId}:reserved`
        }
      ],
      [
        {
          text:
            "✅ Завершён",
          callback_data:
            `order_status:${orderId}:completed`
        },
        {
          text:
            "❌ Отменён",
          callback_data:
            `order_status:${orderId}:cancelled`
        }
      ]
    ]
  };
}

function buildOrderTelegramText(
  order
) {
  const selectedOptions =
    safeJsonParse(
      order.selected_options,
      {}
    );

  const characteristics =
    Object.entries(
      selectedOptions
    )
      .filter(
        ([, value]) => value
      )
      .map(
        ([key, value]) =>
          `${key}: ${value}`
      )
      .join("\n");

  return [
    `<b>Новый заказ ${escapeTelegramHtml(
      orderDisplayId(order.id)
    )}</b>`,
    "",
    `<b>Товар:</b> ${escapeTelegramHtml(
      order.product_name
    )}`,
    order.variant_text
      ? `<b>Характеристики:</b> ${escapeTelegramHtml(
          order.variant_text
        )}`
      : "",
    characteristics
      ? `<b>Выбранные параметры:</b>\n${escapeTelegramHtml(
          characteristics
        )}`
      : "",
    "",
    `<b>Цена:</b> ${escapeTelegramHtml(
      formatPrice(order.price)
    )}`,
    "",
    `<b>Покупатель:</b> ${escapeTelegramHtml(
      order.customer_name
    )}`,
    order.customer_username
      ? `<b>Username:</b> @${escapeTelegramHtml(
          order.customer_username
        )}`
      : "",
    "",
    `<b>Статус:</b> ${escapeTelegramHtml(
      orderStatusLabel(
        order.status
      )
    )}`
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendAdminOrderNotification(
  order
) {
  if (!ADMIN_IDS.length) {
    return;
  }

  const text =
    buildOrderTelegramText(
      order
    );

  for (const adminId of ADMIN_IDS) {
    await telegram(
      "sendMessage",
      {
        chat_id: adminId,
        text,
        parse_mode: "HTML",
        reply_markup:
          buildOrderKeyboard(
            order.id
          )
      }
    );
  }
}

async function sendCustomerStatusNotification(
  order,
  status
) {
  const userId =
    order.telegram_user_id;

  if (!userId) {
    return;
  }

  let text =
    `Заказ ${orderDisplayId(
      order.id
    )}\n\n` +
    `Статус: ${orderStatusLabel(
      status
    )}`;

  if (status === "reserved") {
    text =
      `Заказ ${orderDisplayId(
        order.id
      )}\n\n` +
      "✅ Бронь подтверждена.\n\n" +
      `Товар: ${order.product_name}\n` +
      `Сумма: ${formatPrice(
        order.price
      )}`;
  }

  await telegram(
    "sendMessage",
    {
      chat_id: userId,
      text
    }
  );
}

/* =========================================================
   UPLOADS
========================================================= */

const storage =
  multer.diskStorage({
    destination: (
      _req,
      _file,
      callback
    ) => {
      callback(
        null,
        uploadsDir
      );
    },

    filename: (
      _req,
      file,
      callback
    ) => {
      const extension =
        path.extname(
          file.originalname || ""
        ).toLowerCase() ||
        ".jpg";

      const safeName =
        `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 10)}${extension}`;

      callback(
        null,
        safeName
      );
    }
  });

const upload = multer({
  storage,
  limits: {
    fileSize:
      15 * 1024 * 1024
  }
});

/* =========================================================
   HEALTH
========================================================= */

app.get(
  "/health",
  async (_req, res) => {
    try {
      await db.execute(
        "SELECT 1"
      );

      res.json({
        ok: true,
        app: "IRoom",
        database: true
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        app: "IRoom",
        database: false,
        error:
          error.message
      });
    }
  }
);

/* =========================================================
   PUBLIC CATEGORIES
========================================================= */

app.get(
  "/api/categories",
  async (_req, res) => {
    try {
      const result =
        await db.execute(`
          SELECT
            id,
            name,
            image_url,
            description
          FROM categories
          ORDER BY
            sort_order ASC,
            id DESC
        `);

      res.json({
        ok: true,
        categories:
          result.rows
      });
    } catch (error) {
      console.error(
        "GET categories:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

/* =========================================================
   PUBLIC PRODUCTS
========================================================= */

app.get(
  "/api/products",
  async (_req, res) => {
    try {
      const productsResult =
        await db.execute(`
          SELECT
            p.id,
            p.name,
            p.price,
            p.image_url,
            p.description,
            p.category_id,
            p.price_options,
            c.name AS category_name
          FROM products p
          LEFT JOIN categories c
            ON c.id = p.category_id
          ORDER BY p.id DESC
        `);

      const variantsResult =
        await db.execute(`
          SELECT *
          FROM product_variants
          ORDER BY id ASC
        `);

      const variantsByProduct =
        {};

      for (
        const row of
        variantsResult.rows
      ) {
        const variant =
          normalizeVariant(
            row
          );

        if (
          !variantsByProduct[
            variant.product_id
          ]
        ) {
          variantsByProduct[
            variant.product_id
          ] = [];
        }

        variantsByProduct[
          variant.product_id
        ].push(variant);
      }

      const products =
        productsResult.rows.map(
          (product) => ({
            ...product,
            price:
              numberValue(
                product.price
              ),
            price_options:
              priceOptionsForResponse(
                product.price_options
              ),
            variants:
              variantsByProduct[
                Number(product.id)
              ] || []
          })
        );

      res.json({
        ok: true,
        products
      });
    } catch (error) {
      console.error(
        "GET products:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

app.get(
  "/api/products/:id",
  async (req, res) => {
    try {
      const id =
        integerId(
          req.params.id
        );

      if (!id) {
        return res.status(400).json({
          ok: false,
          error:
            "Некорректный ID товара"
        });
      }

      const productResult =
        await db.execute({
          sql: `
            SELECT
              p.id,
              p.name,
              p.price,
              p.image_url,
              p.description,
              p.category_id,
              p.price_options,
              c.name AS category_name
            FROM products p
            LEFT JOIN categories c
              ON c.id = p.category_id
            WHERE p.id = ?
            LIMIT 1
          `,
          args: [id]
        });

      if (
        !productResult.rows.length
      ) {
        return res.status(404).json({
          ok: false,
          error:
            "Товар не найден"
        });
      }

      const variantsResult =
        await db.execute({
          sql: `
            SELECT *
            FROM product_variants
            WHERE product_id = ?
            ORDER BY id ASC
          `,
          args: [id]
        });

      const product =
        productResult.rows[0];

      res.json({
        ok: true,
        product: {
          ...product,
          price:
            numberValue(
              product.price
            ),
          price_options:
            priceOptionsForResponse(
              product.price_options
            ),
          variants:
            variantsResult.rows.map(
              normalizeVariant
            )
        }
      });
    } catch (error) {
      console.error(
        "GET product:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

/* =========================================================
   ME
========================================================= */

app.get(
  "/api/me",
  async (req, res) => {
    const user =
      getTelegramUser(req);

    res.json({
      ok: true,
      authenticated:
        Boolean(user),
      user:
        user || null,
      is_admin: Boolean(
        user &&
          ADMIN_IDS.includes(
            String(user.id)
          )
      )
    });
  }
);

/* =========================================================
   SETTINGS
========================================================= */

app.get(
  "/api/settings",
  async (_req, res) => {
    try {
      let settings = {};

      try {
        const result =
          await db.execute(`
            SELECT
              key,
              value
            FROM settings
          `);

        for (
          const row of
          result.rows
        ) {
          settings[
            row.key
          ] = row.value;
        }
      } catch {
        // Базовые настройки.
      }

      res.json({
        ok: true,
        settings
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

/* =========================================================
   CUSTOMER ORDERS
========================================================= */

app.get(
  "/api/orders",
  async (req, res) => {
    try {
      const telegramUserId =
        getTelegramUserId(
          req
        );

      if (!telegramUserId) {
        return res.json({
          ok: true,
          orders: []
        });
      }

      const result =
        await db.execute({
          sql: `
            SELECT
              id,
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
              created_at,
              updated_at
            FROM orders
            WHERE telegram_user_id = ?
            ORDER BY id DESC
          `,
          args: [
            telegramUserId
          ]
        });

      const orders =
        result.rows.map(
          (order) => ({
            ...order,
            price:
              numberValue(
                order.price
              ),
            selected_options:
              safeJsonParse(
                order.selected_options,
                {}
              )
          })
        );

      res.json({
        ok: true,
        orders
      });
    } catch (error) {
      console.error(
        "GET customer orders:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

app.get(
  "/api/orders/:id",
  async (req, res) => {
    try {
      const telegramUserId =
        getTelegramUserId(
          req
        );

      const id =
        integerId(
          req.params.id
        );

      if (
        !telegramUserId ||
        !id
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Некорректный запрос"
        });
      }

      const result =
        await db.execute({
          sql: `
            SELECT
              id,
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
              created_at,
              updated_at
            FROM orders
            WHERE id = ?
              AND telegram_user_id = ?
            LIMIT 1
          `,
          args: [
            id,
            telegramUserId
          ]
        });

      if (
        !result.rows.length
      ) {
        return res.status(404).json({
          ok: false,
          error:
            "Заказ не найден"
        });
      }

      const order =
        result.rows[0];

      order.price =
        numberValue(
          order.price
        );

      order.selected_options =
        safeJsonParse(
          order.selected_options,
          {}
        );

      res.json({
        ok: true,
        order
      });
    } catch (error) {
      console.error(
        "GET customer order:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

/* =========================================================
   CREATE ORDER
========================================================= */

app.post(
  "/api/orders",
  async (req, res) => {
    try {
      const user =
        getTelegramUser(req);

      if (!user) {
        return res.status(401).json({
          ok: false,
          error:
            "Telegram authorization required"
        });
      }

      const productId =
        integerId(
          req.body.product_id
        );

      if (!productId) {
        return res.status(400).json({
          ok: false,
          error:
            "Не указан товар"
        });
      }

      const productResult =
        await db.execute({
          sql: `
            SELECT
              id,
              name,
              price,
              image_url,
              description,
              category_id,
              price_options
            FROM products
            WHERE id = ?
            LIMIT 1
          `,
          args: [
            productId
          ]
        });

      if (
        !productResult.rows.length
      ) {
        return res.status(404).json({
          ok: false,
          error:
            "Товар не найден"
        });
      }

      const product =
        productResult.rows[0];

      const priceOptions =
        normalizePriceOptions(
          product.price_options
        );

      const selectedInput =
        req.body.selected_options ||
        req.body.options ||
        req.body.price_options_selection ||
        {};

      let finalPrice =
        numberValue(
          product.price
        );

      let selectedOptions = {};
      let variantText = "";
      let variantId = null;

      /*
       * НОВАЯ СИСТЕМА:
       * база + доплаты выбранных параметров
       */

      if (
        hasPriceOptions(
          priceOptions
        )
      ) {
        const calculated =
          calculatePriceWithOptions(
            product,
            selectedInput
          );

        if (!calculated.ok) {
          return res.status(400).json({
            ok: false,
            error:
              calculated.error
          });
        }

        finalPrice =
          calculated.price;

        selectedOptions =
          calculated.selectedOptions;

        variantText =
          calculated.variantText;
      } else {
        /*
         * СТАРАЯ СИСТЕМА:
         * product_variants
         */

        const requestedVariantId =
          integerId(
            req.body.variant_id
          );

        if (requestedVariantId) {
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
                requestedVariantId,
                productId
              ]
            });

          if (
            !variantResult.rows.length
          ) {
            return res.status(400).json({
              ok: false,
              error:
                "Выбранный вариант товара не найден"
            });
          }

          const variant =
            normalizeVariant(
              variantResult.rows[0]
            );

          if (
            Number(
              variant.stock
            ) <= 0
          ) {
            return res.status(400).json({
              ok: false,
              error:
                "Выбранного варианта сейчас нет в наличии"
            });
          }

          variantId =
            variant.id;

          finalPrice =
            numberValue(
              variant.price
            );

          variantText =
            variant.name ||
            buildVariantName(
              variant
            );

          selectedOptions = {
            color:
              variant.color ||
              "",
            memory:
              variant.memory ||
              "",
            sim:
              variant.sim_type ||
              "",
            region:
              variant.region ||
              ""
          };
        }
      }

      const customerNameValue =
        customerName(user);

      const customerUsernameValue =
        customerUsername(user);

      const selectedOptionsJson =
        JSON.stringify(
          selectedOptions
        );

      const now =
        new Date().toISOString();

      const result =
        await db.execute({
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
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            String(user.id),
            productId,
            variantId,
            String(
              product.name
            ),
            variantText,
            selectedOptionsJson,
            finalPrice,
            customerNameValue,
            customerUsernameValue,
            "new",
            now,
            now
          ]
        });

      const orderId =
        Number(
          result.lastInsertRowid
        );

      const orderResult =
        await db.execute({
          sql: `
            SELECT *
            FROM orders
            WHERE id = ?
            LIMIT 1
          `,
          args: [
            orderId
          ]
        });

      const order =
        orderResult.rows[0];

      try {
        await sendAdminOrderNotification(
          order
        );
      } catch (
        notificationError
      ) {
        console.error(
          "Admin notification error:",
          notificationError
        );
      }

      res.json({
        ok: true,
        order: {
          ...order,
          price:
            numberValue(
              order.price
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
        "POST order:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

/* =========================================================
   ADMIN AUTH
========================================================= */

app.get(
  "/api/admin/me",
  requireAdmin,
  async (req, res) => {
    const user =
      getTelegramUser(req);

    res.json({
      ok: true,
      is_admin: true,
      user:
        user || null
    });
  }
);

/* =========================================================
   ADMIN PRODUCTS
========================================================= */

app.get(
  "/api/admin/products",
  requireAdmin,
  async (_req, res) => {
    try {
      const productsResult =
        await db.execute(`
          SELECT
            p.id,
            p.name,
            p.price,
            p.image_url,
            p.description,
            p.category_id,
            p.price_options,
            c.name AS category_name
          FROM products p
          LEFT JOIN categories c
            ON c.id = p.category_id
          ORDER BY p.id DESC
        `);

      const variantsResult =
        await db.execute(`
          SELECT *
          FROM product_variants
          ORDER BY id ASC
        `);

      const variantsByProduct =
        {};

      for (
        const row of
        variantsResult.rows
      ) {
        const variant =
          normalizeVariant(
            row
          );

        if (
          !variantsByProduct[
            variant.product_id
          ]
        ) {
          variantsByProduct[
            variant.product_id
          ] = [];
        }

        variantsByProduct[
          variant.product_id
        ].push(variant);
      }

      const products =
        productsResult.rows.map(
          (product) => ({
            ...product,
            price:
              numberValue(
                product.price
              ),
            price_options:
              priceOptionsForResponse(
                product.price_options
              ),
            variants:
              variantsByProduct[
                Number(
                  product.id
                )
              ] || []
          })
        );

      res.json({
        ok: true,
        products
      });
    } catch (error) {
      console.error(
        "Admin products:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message
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
        stringValue(
          req.body.name
        );

      if (!name) {
        return res.status(400).json({
          ok: false,
          error:
            "Введите название товара"
        });
      }

      const price =
        Math.max(
          0,
          Math.round(
            numberValue(
              req.body.price,
              0
            )
          )
        );

      const imageUrl =
        stringValue(
          req.body.image ||
            req.body.image_url
        );

      const description =
        stringValue(
          req.body.description
        );

      const categoryId =
        integerId(
          req.body.category_id
        ) || null;

      const priceOptions =
        normalizePriceOptions(
          req.body.price_options
        );

      const result =
        await db.execute({
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
            JSON.stringify(
              priceOptions
            )
          ]
        });

      const id =
        Number(
          result.lastInsertRowid
        );

      const productResult =
        await db.execute({
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

      const product =
        productResult.rows[0];

      res.json({
        ok: true,
        product: {
          ...product,
          price:
            numberValue(
              product.price
            ),
          price_options:
            priceOptionsForResponse(
              product.price_options
            ),
          variants: []
        }
      });
    } catch (error) {
      console.error(
        "Admin create product:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message
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
        integerId(
          req.params.id
        );

      if (!id) {
        return res.status(400).json({
          ok: false,
          error:
            "Некорректный ID"
        });
      }

      const existingResult =
        await db.execute({
          sql: `
            SELECT *
            FROM products
            WHERE id = ?
            LIMIT 1
          `,
          args: [id]
        });

      if (
        !existingResult.rows.length
      ) {
        return res.status(404).json({
          ok: false,
          error:
            "Товар не найден"
        });
      }

      const existing =
        existingResult.rows[0];

      const name =
        req.body.name !==
        undefined
          ? stringValue(
              req.body.name
            )
          : stringValue(
              existing.name
            );

      const price =
        req.body.price !==
        undefined
          ? Math.max(
              0,
              Math.round(
                numberValue(
                  req.body.price,
                  0
                )
              )
            )
          : numberValue(
              existing.price
            );

      const imageUrl =
        req.body.image !==
          undefined ||
        req.body.image_url !==
          undefined
          ? stringValue(
              req.body.image ||
                req.body.image_url
            )
          : stringValue(
              existing.image_url
            );

      const description =
        req.body.description !==
        undefined
          ? stringValue(
              req.body.description
            )
          : stringValue(
              existing.description
            );

      const categoryId =
        req.body.category_id !==
        undefined
          ? integerId(
              req.body.category_id
            )
          : integerId(
              existing.category_id
            );

      const priceOptions =
        req.body.price_options !==
        undefined
          ? normalizePriceOptions(
              req.body.price_options
            )
          : normalizePriceOptions(
              existing.price_options
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
            updated_at = ?
          WHERE id = ?
        `,
        args: [
          name,
          price,
          imageUrl,
          description,
          categoryId,
          JSON.stringify(
            priceOptions
          ),
          new Date().toISOString(),
          id
        ]
      });

      const productResult =
        await db.execute({
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

      const product =
        productResult.rows[0];

      const variantsResult =
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
        ok: true,
        product: {
          ...product,
          price:
            numberValue(
              product.price
            ),
          price_options:
            priceOptionsForResponse(
              product.price_options
            ),
          variants:
            variantsResult.rows.map(
              normalizeVariant
            )
        }
      });
    } catch (error) {
      console.error(
        "Admin update product:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message
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
        integerId(
          req.params.id
        );

      if (!id) {
        return res.status(400).json({
          ok: false,
          error:
            "Некорректный ID"
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
        "Admin delete product:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

/* =========================================================
   OLD ADMIN VARIANTS API
========================================================= */

app.get(
  "/api/admin/products/:productId/variants",
  requireAdmin,
  async (req, res) => {
    try {
      const productId =
        integerId(
          req.params.productId
        );

      if (!productId) {
        return res.status(400).json({
          ok: false,
          error:
            "Некорректный ID товара"
        });
      }

      const result =
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

      res.json({
        ok: true,
        variants:
          result.rows.map(
            normalizeVariant
          )
      });
    } catch (error) {
      console.error(
        "GET variants:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

app.post(
  "/api/admin/products/:productId/variants",
  requireAdmin,
  async (req, res) => {
    try {
      const productId =
        integerId(
          req.params.productId
        );

      if (!productId) {
        return res.status(400).json({
          ok: false,
          error:
            "Некорректный ID товара"
        });
      }

      const color =
        stringValue(
          req.body.color
        );

      const memory =
        stringValue(
          req.body.memory
        );

      const simType =
        stringValue(
          req.body.sim_type ||
            req.body.sim
        );

      const region =
        stringValue(
          req.body.region
        );

      const price =
        Math.max(
          0,
          Math.round(
            numberValue(
              req.body.price,
              0
            )
          )
        );

      const stock =
        Math.max(
          0,
          Math.round(
            numberValue(
              req.body.stock,
              0
            )
          )
        );

      const name =
        stringValue(
          req.body.name
        ) ||
        buildVariantName({
          color,
          memory,
          sim_type:
            simType,
          region
        });

      const result =
        await db.execute({
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
            name,
            price,
            stock,
            color,
            memory,
            simType,
            region
          ]
        });

      const id =
        Number(
          result.lastInsertRowid
        );

      const variantResult =
        await db.execute({
          sql: `
            SELECT *
            FROM product_variants
            WHERE id = ?
            LIMIT 1
          `,
          args: [id]
        });

      res.json({
        ok: true,
        variant:
          normalizeVariant(
            variantResult.rows[0]
          )
      });
    } catch (error) {
      console.error(
        "POST variant:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

app.put(
  "/api/admin/product-variants/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const id =
        integerId(
          req.params.id
        );

      if (!id) {
        return res.status(400).json({
          ok: false,
          error:
            "Некорректный ID"
        });
      }

      const existingResult =
        await db.execute({
          sql: `
            SELECT *
            FROM product_variants
            WHERE id = ?
            LIMIT 1
          `,
          args: [id]
        });

      if (
        !existingResult.rows.length
      ) {
        return res.status(404).json({
          ok: false,
          error:
            "Вариант не найден"
        });
      }

      const existing =
        existingResult.rows[0];

      const color =
        req.body.color !==
        undefined
          ? stringValue(
              req.body.color
            )
          : stringValue(
              existing.color
            );

      const memory =
        req.body.memory !==
        undefined
          ? stringValue(
              req.body.memory
            )
          : stringValue(
              existing.memory
            );

      const simType =
        req.body.sim_type !==
          undefined ||
        req.body.sim !==
          undefined
          ? stringValue(
              req.body.sim_type ||
                req.body.sim
            )
          : stringValue(
              existing.sim_type
            );

      const region =
        req.body.region !==
        undefined
          ? stringValue(
              req.body.region
            )
          : stringValue(
              existing.region
            );

      const price =
        req.body.price !==
        undefined
          ? Math.max(
              0,
              Math.round(
                numberValue(
                  req.body.price,
                  0
                )
              )
            )
          : numberValue(
              existing.price
            );

      const stock =
        req.body.stock !==
        undefined
          ? Math.max(
              0,
              Math.round(
                numberValue(
                  req.body.stock,
                  0
                )
              )
            )
          : Number(
              existing.stock || 0
            );

      const name =
        req.body.name !==
        undefined
          ? stringValue(
              req.body.name
            )
          : buildVariantName({
              color,
              memory,
              sim_type:
                simType,
              region
            });

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
          name,
          price,
          stock,
          color,
          memory,
          simType,
          region,
          id
        ]
      });

      const result =
        await db.execute({
          sql: `
            SELECT *
            FROM product_variants
            WHERE id = ?
            LIMIT 1
          `,
          args: [id]
        });

      res.json({
        ok: true,
        variant:
          normalizeVariant(
            result.rows[0]
          )
      });
    } catch (error) {
      console.error(
        "PUT variant:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

app.delete(
  "/api/admin/product-variants/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const id =
        integerId(
          req.params.id
        );

      if (!id) {
        return res.status(400).json({
          ok: false,
          error:
            "Некорректный ID"
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
        "DELETE variant:",
        error
      );

      res.status(500).json({
        ok: false,
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
  async (_req, res) => {
    try {
      const result =
        await db.execute(`
          SELECT
            id,
            name,
            image_url,
            description,
            sort_order
          FROM categories
          ORDER BY
            sort_order ASC,
            id DESC
        `);

      res.json({
        ok: true,
        categories:
          result.rows
      });
    } catch (error) {
      console.error(
        "Admin categories:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message
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
        stringValue(
          req.body.name
        );

      if (!name) {
        return res.status(400).json({
          ok: false,
          error:
            "Введите название категории"
        });
      }

      const imageUrl =
        stringValue(
          req.body.image ||
            req.body.image_url
        );

      const description =
        stringValue(
          req.body.description
        );

      const result =
        await db.execute({
          sql: `
            INSERT INTO categories (
              name,
              image_url,
              description
            )
            VALUES (?, ?, ?)
          `,
          args: [
            name,
            imageUrl,
            description
          ]
        });

      const id =
        Number(
          result.lastInsertRowid
        );

      const categoryResult =
        await db.execute({
          sql: `
            SELECT *
            FROM categories
            WHERE id = ?
            LIMIT 1
          `,
          args: [id]
        });

      res.json({
        ok: true,
        category:
          categoryResult.rows[0]
      });
    } catch (error) {
      console.error(
        "Create category:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message
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
        integerId(
          req.params.id
        );

      if (!id) {
        return res.status(400).json({
          ok: false,
          error:
            "Некорректный ID"
        });
      }

      const existingResult =
        await db.execute({
          sql: `
            SELECT *
            FROM categories
            WHERE id = ?
            LIMIT 1
          `,
          args: [id]
        });

      if (
        !existingResult.rows.length
      ) {
        return res.status(404).json({
          ok: false,
          error:
            "Категория не найдена"
        });
      }

      const existing =
        existingResult.rows[0];

      const name =
        req.body.name !==
        undefined
          ? stringValue(
              req.body.name
            )
          : stringValue(
              existing.name
            );

      const imageUrl =
        req.body.image !==
            undefined ||
        req.body.image_url !==
            undefined
          ? stringValue(
              req.body.image ||
                req.body.image_url
            )
          : stringValue(
              existing.image_url
            );

      const description =
        req.body.description !==
        undefined
          ? stringValue(
              req.body.description
            )
          : stringValue(
              existing.description
            );

      await db.execute({
        sql: `
          UPDATE categories
          SET
            name = ?,
            image_url = ?,
            description = ?,
            updated_at = ?
          WHERE id = ?
        `,
        args: [
          name,
          imageUrl,
          description,
          new Date().toISOString(),
          id
        ]
      });

      const result =
        await db.execute({
          sql: `
            SELECT *
            FROM categories
            WHERE id = ?
            LIMIT 1
          `,
          args: [id]
        });

      res.json({
        ok: true,
        category:
          result.rows[0]
      });
    } catch (error) {
      console.error(
        "Update category:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message
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
        integerId(
          req.params.id
        );

      if (!id) {
        return res.status(400).json({
          ok: false,
          error:
            "Некорректный ID"
        });
      }

      /*
       * Сначала отвязываем товары от категории,
       * чтобы удаление категории не ломало товары.
       */

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
        "Delete category:",
        error
      );

      res.status(500).json({
        ok: false,
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
  async (_req, res) => {
    try {
      const result =
        await db.execute(`
          SELECT
            id,
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
            created_at,
            updated_at
          FROM orders
          ORDER BY id DESC
        `);

      const orders =
        result.rows.map(
          (order) => ({
            ...order,
            price:
              numberValue(
                order.price
              ),
            selected_options:
              safeJsonParse(
                order.selected_options,
                {}
              ),
            display_id:
              orderDisplayId(
                order.id
              ),
            status_label:
              orderStatusLabel(
                order.status
              )
          })
        );

      res.json({
        ok: true,
        orders
      });
    } catch (error) {
      console.error(
        "Admin orders:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message
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
        integerId(
          req.params.id
        );

      if (!id) {
        return res.status(400).json({
          ok: false,
          error:
            "Некорректный ID"
        });
      }

      const result =
        await db.execute({
          sql: `
            SELECT *
            FROM orders
            WHERE id = ?
            LIMIT 1
          `,
          args: [id]
        });

      if (
        !result.rows.length
      ) {
        return res.status(404).json({
          ok: false,
          error:
            "Заказ не найден"
        });
      }

      const order =
        result.rows[0];

      order.price =
        numberValue(
          order.price
        );

      order.selected_options =
        safeJsonParse(
          order.selected_options,
          {}
        );

      order.display_id =
        orderDisplayId(
          order.id
        );

      order.status_label =
        orderStatusLabel(
          order.status
        );

      res.json({
        ok: true,
        order
      });
    } catch (error) {
      console.error(
        "Admin order detail:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

app.put(
  "/api/admin/orders/:id/status",
  requireAdmin,
  async (req, res) => {
    try {
      const id =
        integerId(
          req.params.id
        );

      const status =
        stringValue(
          req.body.status
        );

      const allowedStatuses = [
        "new",
        "processing",
        "awaiting_payment",
        "reserved",
        "completed",
        "cancelled"
      ];

      if (!id) {
        return res.status(400).json({
          ok: false,
          error:
            "Некорректный ID заказа"
        });
      }

      if (
        !allowedStatuses.includes(
          status
        )
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Некорректный статус"
        });
      }

      const existingResult =
        await db.execute({
          sql: `
            SELECT *
            FROM orders
            WHERE id = ?
            LIMIT 1
          `,
          args: [id]
        });

      if (
        !existingResult.rows.length
      ) {
        return res.status(404).json({
          ok: false,
          error:
            "Заказ не найден"
        });
      }

      const now =
        new Date().toISOString();

      await db.execute({
        sql: `
          UPDATE orders
          SET
            status = ?,
            updated_at = ?
          WHERE id = ?
        `,
        args: [
          status,
          now,
          id
        ]
      });

      const result =
        await db.execute({
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

      try {
        await sendCustomerStatusNotification(
          order,
          status
        );
      } catch (
        notificationError
      ) {
        console.error(
          "Customer notification error:",
          notificationError
        );
      }

      res.json({
        ok: true,
        order: {
          ...order,
          price:
            numberValue(
              order.price
            ),
          selected_options:
            safeJsonParse(
              order.selected_options,
              {}
            ),
          display_id:
            orderDisplayId(
              order.id
            ),
          status_label:
            orderStatusLabel(
              order.status
            )
        }
      });
    } catch (error) {
      console.error(
        "Admin order status:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message
      });
    }
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
        return res.status(400).json({
          ok: false,
          error:
            "Файл не загружен"
        });
      }

      const url =
        `/uploads/${req.file.filename}`;

      res.json({
        ok: true,
        url,
        file: {
          filename:
            req.file.filename,
          originalname:
            req.file.originalname,
          mimetype:
            req.file.mimetype,
          size:
            req.file.size
        }
      });
    } catch (error) {
      console.error(
        "Upload:",
        error
      );

      res.status(500).json({
        ok: false,
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
  "/webhook",
  async (req, res) => {
    try {
      const update =
        req.body;

      if (
        update &&
        update.callback_query
      ) {
        const callbackQuery =
          update.callback_query;

        const data =
          callbackQuery.data ||
          "";

        if (
          data.startsWith(
            "order_status:"
          )
        ) {
          const parts =
            data.split(":");

          const orderId =
            integerId(
              parts[1]
            );

          const status =
            stringValue(
              parts[2]
            );

          const allowedStatuses = [
            "new",
            "processing",
            "awaiting_payment",
            "reserved",
            "completed",
            "cancelled"
          ];

          if (
            orderId &&
            allowedStatuses.includes(
              status
            )
          ) {
            const now =
              new Date().toISOString();

            await db.execute({
              sql: `
                UPDATE orders
                SET
                  status = ?,
                  updated_at = ?
                WHERE id = ?
              `,
              args: [
                status,
                now,
                orderId
              ]
            });

            const result =
              await db.execute({
                sql: `
                  SELECT *
                  FROM orders
                  WHERE id = ?
                  LIMIT 1
                `,
                args: [
                  orderId
                ]
              });

            if (
              result.rows.length
            ) {
              try {
                await sendCustomerStatusNotification(
                  result.rows[0],
                  status
                );
              } catch (
                error
              ) {
                console.error(
                  "Webhook customer notification:",
                  error
                );
              }
            }

            await telegram(
              "answerCallbackQuery",
              {
                callback_query_id:
                  callbackQuery.id,
                text:
                  `Статус: ${orderStatusLabel(
                    status
                  )}`
              }
            );
          }
        }

        return res.sendStatus(
          200
        );
      }

      if (
        update &&
        update.message
      ) {
        const message =
          update.message;

        const text =
          message.text || "";

        const chatId =
          message.chat &&
          message.chat.id;

        if (
          text === "/start" ||
          text === "/app"
        ) {
          await telegram(
            "sendMessage",
            {
              chat_id:
                chatId,
              text:
                "Добро пожаловать в IRoom.",
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text:
                        "🛍 Открыть IRoom",
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
        }
      }

      res.sendStatus(200);
    } catch (error) {
      console.error(
        "Webhook error:",
        error
      );

      res.sendStatus(200);
    }
  }
);

/* =========================================================
   WEBHOOK SETUP
========================================================= */

async function setupWebhook() {
  if (!BOT_TOKEN) {
    console.log(
      "BOT_TOKEN не задан — webhook не настраивается."
    );

    return;
  }

  const webhookUrl =
    `${MINIAPP_URL}/webhook`;

  try {
    const result =
      await telegram(
        "setWebhook",
        {
          url:
            webhookUrl,
          allowed_updates: [
            "message",
            "callback_query"
          ]
        }
      );

    console.log(
      "Webhook:",
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
   ADMIN PAGE
========================================================= */

app.get(
  "/admin",
  (_req, res) => {
    res.sendFile(
      path.join(
        publicDir,
        "admin.html"
      )
    );
  }
);

app.get(
  "/admin.html",
  (_req, res) => {
    res.sendFile(
      path.join(
        publicDir,
        "admin.html"
      )
    );
  }
);

/* =========================================================
   SPA FALLBACK
========================================================= */

app.use(
  (req, res, next) => {
    if (
      req.method !== "GET" ||
      req.path.startsWith(
        "/api/"
      ) ||
      req.path.startsWith(
        "/uploads/"
      ) ||
      req.path ===
        "/webhook"
    ) {
      return next();
    }

    res.sendFile(
      path.join(
        publicDir,
        "index.html"
      )
    );
  }
);

/* =========================================================
   START
========================================================= */

async function start() {
  try {
    if (!TURSO_DATABASE_URL) {
      throw new Error(
        "TURSO_DATABASE_URL не задан"
      );
    }

    if (!TURSO_AUTH_TOKEN) {
      throw new Error(
        "TURSO_AUTH_TOKEN не задан"
      );
    }

    await db.execute(
      "SELECT 1"
    );

    console.log(
      "Turso database connected."
    );

    /*
     * САМОЕ ВАЖНОЕ:
     * здесь выполняется безопасная миграция.
     *
     * Никаких DROP TABLE.
     * Никакого DELETE.
     * Никакого пересоздания существующих таблиц.
     */

    await runMigrations();

    console.log(
      "Database migrations completed."
    );

    app.listen(
      PORT,
      "0.0.0.0",
      async () => {
        console.log(
          `IRoom server started on port ${PORT}`
        );

        await setupWebhook();
      }
    );
  } catch (error) {
    console.error(
      "Startup error:",
      error
    );

    process.exit(1);
  }
}

start();