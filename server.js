const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { createClient } = require("@libsql/client");

const app = express();

const PORT = Number(process.env.PORT || 10000);

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const ADMIN_ID = String(process.env.ADMIN_ID || "5082864281");

const ADMIN_IDS = [
  "5082864281",
  "5975037118",
  ADMIN_ID
].filter((value, index, array) => value && array.indexOf(value) === index);

const MINIAPP_URL =
  process.env.MINIAPP_URL ||
  "https://iroom-dww8.onrender.com";

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  console.error("❌ TURSO_DATABASE_URL / TURSO_AUTH_TOKEN не заданы");
}

const db = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN
});

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

const publicDir = path.join(__dirname, "public");
const uploadsDir = path.join(publicDir, "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(express.static(publicDir));

/* =========================================================
   HELPERS
========================================================= */

function integerId(value) {
  const number = Number(value);

  if (!Number.isInteger(number)) {
    return null;
  }

  return number;
}

function numberValue(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function stringValue(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value);
}

function getTelegramInitData(req) {
  return (
    req.headers["x-telegram-init-data"] ||
    req.headers["x-telegram-web-app-init-data"] ||
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

function getTelegramId(req) {
  const user = getTelegramUser(req);

  if (!user || !user.id) {
    return null;
  }

  return String(user.id);
}

function isAdminId(id) {
  return ADMIN_IDS.includes(String(id));
}

function isAdminRequest(req) {
  const telegramId = getTelegramId(req);

  if (telegramId && isAdminId(telegramId)) {
    return true;
  }

  /*
   * Для админки допускаем ADMIN_ID из заголовка,
   * если frontend уже авторизовал Telegram WebApp.
   */
  const requestedAdminId =
    req.headers["x-admin-id"] ||
    req.query.admin_id ||
    req.body?.admin_id;

  return requestedAdminId
    ? isAdminId(requestedAdminId)
    : false;
}

function getCustomerName(user) {
  if (!user) {
    return "Покупатель";
  }

  const fullName = [
    user.first_name,
    user.last_name
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || user.username || `ID ${user.id}`;
}

function getUsername(user) {
  if (!user || !user.username) {
    return "";
  }

  return String(user.username).replace(/^@/, "");
}

function formatPrice(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0 ₽";
  }

  return `${number.toLocaleString("ru-RU")} ₽`;
}

function orderStatusLabel(status) {
  const labels = {
    new: "🟡 Новый",
    processing: "🔵 В обработке",
    awaiting_payment: "🟣 Ожидает оплаты",
    reserved: "🟢 Забронирован",
    completed: "⚫ Завершён",
    cancelled: "🔴 Отменён"
  };

  return labels[status] || status || "🟡 Новый";
}

function orderStatusText(status) {
  const labels = {
    new: "Новый",
    processing: "В обработке",
    awaiting_payment: "Ожидает оплаты",
    reserved: "Забронирован",
    completed: "Завершён",
    cancelled: "Отменён"
  };

  return labels[status] || status || "Новый";
}

function generateOrderDisplayId(id) {
  const value = String(id || "");

  /*
   * Внутренний ID может быть ord_xxx.
   * Показываем человеку короткий номер.
   */
  if (value.length <= 10) {
    return `#${value}`;
  }

  return `#${value.slice(-8).toUpperCase()}`;
}

/* =========================================================
   TELEGRAM BOT API
========================================================= */

async function telegram(method, payload = {}) {
  if (!BOT_TOKEN) {
    console.warn(`Telegram API пропущен: ${method}, BOT_TOKEN отсутствует`);
    return null;
  }

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
        `Telegram API ${method}:`,
        data.description || data
      );
    }

    return data;
  } catch (error) {
    console.error(`Telegram ${method} error:`, error);
    return null;
  }
}

async function sendAdminOrderNotification(order, action = "new") {
  if (!BOT_TOKEN) {
    console.warn("BOT_TOKEN отсутствует — уведомление админу не отправлено");
    return;
  }

  const orderId = order.id;
  const displayId = generateOrderDisplayId(orderId);

  let title = "🛍 Новый заказ";

  if (action === "status") {
    title = "🔄 Изменение статуса заказа";
  }

  const text = [
    `<b>${title}</b>`,
    "",
    `<b>Заказ:</b> ${displayId}`,
    `<b>Товар:</b> ${escapeTelegramHtml(order.product_name)}`,
    order.variant_text
      ? `<b>Вариант:</b> ${escapeTelegramHtml(order.variant_text)}`
      : "",
    `<b>Цена:</b> ${formatPrice(order.price)}`,
    "",
    `<b>Клиент:</b> ${escapeTelegramHtml(
      order.customer_name || "Не указано"
    )}`,
    order.customer_username
      ? `<b>Username:</b> @${escapeTelegramHtml(
          order.customer_username.replace(/^@/, "")
        )}`
      : "",
    `<b>Telegram ID:</b> <code>${escapeTelegramHtml(
      order.telegram_id
    )}</code>`,
    "",
    `<b>Статус:</b> ${orderStatusLabel(order.status)}`,
    `<b>Создан:</b> ${escapeTelegramHtml(
      order.created_at || new Date().toISOString()
    )}`
  ]
    .filter(Boolean)
    .join("\n");

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "🔵 В обработку",
          callback_data: `order_status:${orderId}:processing`
        },
        {
          text: "🟣 Ожидает оплаты",
          callback_data: `order_status:${orderId}:awaiting_payment`
        }
      ],
      [
        {
          text: "🟢 Забронировать",
          callback_data: `order_status:${orderId}:reserved`
        },
        {
          text: "⚫ Завершить",
          callback_data: `order_status:${orderId}:completed`
        }
      ],
      [
        {
          text: "🔴 Отменить",
          callback_data: `order_status:${orderId}:cancelled`
        }
      ],
      [
        {
          text: "🌐 Открыть магазин",
          url: MINIAPP_URL
        }
      ]
    ]
  };

  for (const adminId of ADMIN_IDS) {
    await telegram("sendMessage", {
      chat_id: adminId,
      text,
      parse_mode: "HTML",
      reply_markup: keyboard
    });
  }
}

async function sendCustomerStatusNotification(order) {
  if (!BOT_TOKEN || !order?.telegram_id) {
    return;
  }

  const status = orderStatusText(order.status);

  const text = [
    "📦 <b>Статус заказа изменён</b>",
    "",
    `<b>Заказ:</b> ${generateOrderDisplayId(order.id)}`,
    `<b>Товар:</b> ${escapeTelegramHtml(order.product_name)}`,
    "",
    `<b>Новый статус:</b> ${orderStatusLabel(order.status)}`,
    "",
    "Открыть заказ можно в приложении IRoom."
  ].join("\n");

  await telegram("sendMessage", {
    chat_id: order.telegram_id,
    text,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "📦 Открыть мои заказы",
            web_app: {
              url: MINIAPP_URL
            }
          }
        ]
      ]
    }
  });
}

function escapeTelegramHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =========================================================
   UPLOADS
========================================================= */

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },

  filename: (_req, file, cb) => {
    const extension =
      path.extname(file.originalname || "").toLowerCase() || ".jpg";

    const safeExtension = extension.replace(/[^a-z0-9.]/gi, "");

    const filename =
      `${Date.now()}-${Math.random().toString(36).slice(2, 9)}` +
      safeExtension;

    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

/* =========================================================
   HEALTH
========================================================= */

app.get("/health", async (_req, res) => {
  try {
    await db.execute("SELECT 1");

    res.json({
      ok: true,
      app: "IRoom",
      database: true,
      time: new Date().toISOString()
    });
  } catch (error) {
    console.error("Health DB error:", error);

    res.status(500).json({
      ok: false,
      app: "IRoom",
      database: false,
      error: "Database unavailable"
    });
  }
});

/* =========================================================
   CATEGORIES
========================================================= */

app.get("/api/categories", async (_req, res) => {
  try {
    const result = await db.execute(`
      SELECT *
      FROM categories
      ORDER BY id ASC
    `);

    res.json({
      categories: result.rows
    });
  } catch (error) {
    console.error("GET categories:", error);

    res.status(500).json({
      error: "Не удалось загрузить категории"
    });
  }
});

/* =========================================================
   PRODUCTS
========================================================= */

app.get("/api/products", async (_req, res) => {
  try {
    const productsResult = await db.execute(`
      SELECT *
      FROM products
      ORDER BY id DESC
    `);

    const variantsResult = await db.execute(`
      SELECT *
      FROM product_variants
      ORDER BY id ASC
    `);

    const variantsByProduct = {};

    for (const variant of variantsResult.rows) {
      const productId = String(variant.product_id);

      if (!variantsByProduct[productId]) {
        variantsByProduct[productId] = [];
      }

      variantsByProduct[productId].push(variant);
    }

    const products = productsResult.rows.map((product) => ({
      ...product,
      variants:
        variantsByProduct[String(product.id)] || []
    }));

    res.json({
      products
    });
  } catch (error) {
    console.error("GET products:", error);

    res.status(500).json({
      error: "Не удалось загрузить товары"
    });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const productId = integerId(req.params.id);

    if (productId === null) {
      return res.status(400).json({
        error: "Некорректный ID товара"
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
        error: "Товар не найден"
      });
    }

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
      product: {
        ...productResult.rows[0],
        variants: variantsResult.rows
      }
    });
  } catch (error) {
    console.error("GET product:", error);

    res.status(500).json({
      error: "Не удалось загрузить товар"
    });
  }
});

/* =========================================================
   CURRENT USER
========================================================= */

app.get("/api/me", async (req, res) => {
  try {
    const telegramId = getTelegramId(req);

    if (!telegramId) {
      return res.json({
        user: null
      });
    }

    const telegramUser = getTelegramUser(req);

    const result = await db.execute({
      sql: `
        SELECT *
        FROM users
        WHERE telegram_id = ?
        LIMIT 1
      `,
      args: [telegramId]
    });

    res.json({
      user: result.rows[0] || {
        telegram_id: telegramId,
        first_name: telegramUser?.first_name || "",
        last_name: telegramUser?.last_name || "",
        username: telegramUser?.username || ""
      }
    });
  } catch (error) {
    console.error("GET me:", error);

    res.status(500).json({
      error: "Не удалось загрузить пользователя"
    });
  }
});

/* =========================================================
   SETTINGS
========================================================= */

app.get("/api/settings", async (_req, res) => {
  try {
    const result = await db.execute(`
      SELECT *
      FROM settings
    `);

    const settings = {};

    for (const row of result.rows) {
      if (row.key !== undefined) {
        settings[row.key] = row.value;
      }
    }

    res.json({
      settings
    });
  } catch (error) {
    console.error("GET settings:", error);

    res.json({
      settings: {}
    });
  }
});

/* =========================================================
   ORDERS — CLIENT
========================================================= */

/*
 * Получить все заказы текущего Telegram-пользователя.
 */
app.get("/api/orders", async (req, res) => {
  try {
    const telegramId = getTelegramId(req);

    if (!telegramId) {
      return res.status(401).json({
        error: "Telegram authorization required"
      });
    }

    const result = await db.execute({
      sql: `
        SELECT *
        FROM orders
        WHERE telegram_id = ?
        ORDER BY created_at DESC
      `,
      args: [telegramId]
    });

    const orders = result.rows.map((order) => ({
      ...order,
      display_id: generateOrderDisplayId(order.id),
      status_label: orderStatusLabel(order.status),
      status_text: orderStatusText(order.status)
    }));

    res.json({
      orders
    });
  } catch (error) {
    console.error("GET my orders:", error);

    res.status(500).json({
      error: "Не удалось загрузить заказы"
    });
  }
});

/*
 * Получить один заказ текущего пользователя.
 */
app.get("/api/orders/:id", async (req, res) => {
  try {
    const telegramId = getTelegramId(req);

    if (!telegramId) {
      return res.status(401).json({
        error: "Telegram authorization required"
      });
    }

    const orderId = String(req.params.id);

    const result = await db.execute({
      sql: `
        SELECT *
        FROM orders
        WHERE id = ?
          AND telegram_id = ?
        LIMIT 1
      `,
      args: [orderId, telegramId]
    });

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Заказ не найден"
      });
    }

    const order = result.rows[0];

    res.json({
      order: {
        ...order,
        display_id: generateOrderDisplayId(order.id),
        status_label: orderStatusLabel(order.status),
        status_text: orderStatusText(order.status)
      }
    });
  } catch (error) {
    console.error("GET my order:", error);

    res.status(500).json({
      error: "Не удалось загрузить заказ"
    });
  }
});

/*
 * Создать заказ.
 */
app.post("/api/orders", async (req, res) => {
  try {
    const telegramUser = getTelegramUser(req);

    if (!telegramUser?.id) {
      return res.status(401).json({
        error: "Telegram authorization required"
      });
    }

    const telegramId = String(telegramUser.id);

    const productId = integerId(req.body.product_id);
    const variantId =
      req.body.variant_id === null ||
      req.body.variant_id === undefined ||
      req.body.variant_id === ""
        ? null
        : integerId(req.body.variant_id);

    const productName = stringValue(
      req.body.product_name,
      "Товар"
    );

    const variantText = stringValue(
      req.body.variant_text,
      ""
    );

    const price = numberValue(
      req.body.price,
      0
    );

    if (productId === null) {
      return res.status(400).json({
        error: "Некорректный product_id"
      });
    }

    /*
     * Проверяем, что товар действительно существует.
     */
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
        error: "Товар не найден"
      });
    }

    /*
     * Если передан variant_id — проверяем его принадлежность товару.
     */
    if (variantId !== null) {
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
          error: "Выбранный вариант товара не найден"
        });
      }
    }

    const customerName = getCustomerName(telegramUser);
    const customerUsername = getUsername(telegramUser);

    const now = new Date().toISOString();

    /*
     * Существующая таблица orders использует текстовый ID,
     * поэтому оставляем совместимый ord_... формат.
     */
    const orderId =
      `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        orderId,
        telegramId,
        productId,
        variantId,
        productName,
        variantText,
        price,
        customerName,
        customerUsername,
        "new",
        now,
        now
      ]
    });

    const createdResult = await db.execute({
      sql: `
        SELECT *
        FROM orders
        WHERE id = ?
        LIMIT 1
      `,
      args: [orderId]
    });

    const order = createdResult.rows[0];

    /*
     * Уведомляем админов.
     * Ошибка Telegram не должна ломать создание заказа.
     */
    try {
      await sendAdminOrderNotification(order, "new");
    } catch (telegramError) {
      console.error(
        "Admin order notification error:",
        telegramError
      );
    }

    res.status(201).json({
      ok: true,
      message: "Заказ создан",
      order: {
        ...order,
        display_id: generateOrderDisplayId(order.id),
        status_label: orderStatusLabel(order.status),
        status_text: orderStatusText(order.status)
      }
    });
  } catch (error) {
    console.error("CREATE ORDER:", error);

    res.status(500).json({
      error: "Не удалось создать заказ"
    });
  }
});

/* =========================================================
   ADMIN AUTH
========================================================= */

app.get("/api/admin/me", async (req, res) => {
  try {
    const telegramId = getTelegramId(req);

    if (!telegramId || !isAdminId(telegramId)) {
      return res.status(403).json({
        ok: false,
        is_admin: false
      });
    }

    res.json({
      ok: true,
      is_admin: true,
      telegram_id: telegramId
    });
  } catch (error) {
    console.error("ADMIN ME:", error);

    res.status(500).json({
      ok: false,
      is_admin: false
    });
  }
});

/* =========================================================
   ADMIN PRODUCTS
========================================================= */

app.get("/api/admin/products", async (req, res) => {
  try {
    if (!isAdminRequest(req)) {
      return res.status(403).json({
        error: "Доступ запрещён"
      });
    }

    const productsResult = await db.execute(`
      SELECT *
      FROM products
      ORDER BY id DESC
    `);

    const variantsResult = await db.execute(`
      SELECT *
      FROM product_variants
      ORDER BY id ASC
    `);

    const variantsByProduct = {};

    for (const variant of variantsResult.rows) {
      const productId = String(variant.product_id);

      if (!variantsByProduct[productId]) {
        variantsByProduct[productId] = [];
      }

      variantsByProduct[productId].push(variant);
    }

    const products = productsResult.rows.map((product) => ({
      ...product,
      variants:
        variantsByProduct[String(product.id)] || []
    }));

    res.json({
      products
    });
  } catch (error) {
    console.error("ADMIN GET products:", error);

    res.status(500).json({
      error: "Не удалось загрузить товары"
    });
  }
});

app.post(
  "/api/admin/products",
  upload.single("image"),
  async (req, res) => {
    try {
      if (!isAdminRequest(req)) {
        return res.status(403).json({
          error: "Доступ запрещён"
        });
      }

      const name = stringValue(req.body.name, "Новый товар");
      const description = stringValue(
        req.body.description,
        ""
      );
      const categoryId =
        req.body.category_id === undefined ||
        req.body.category_id === "" ||
        req.body.category_id === null
          ? null
          : integerId(req.body.category_id);

      const price = numberValue(req.body.price, 0);
      const oldPrice =
        req.body.old_price === undefined ||
        req.body.old_price === ""
          ? null
          : numberValue(req.body.old_price, 0);

      const imageUrl = req.file
        ? `/uploads/${req.file.filename}`
        : stringValue(req.body.image_url, "");

      const result = await db.execute({
        sql: `
          INSERT INTO products (
            name,
            description,
            category_id,
            price,
            old_price,
            image_url
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        args: [
          name,
          description,
          categoryId,
          price,
          oldPrice,
          imageUrl
        ]
      });

      const productId = result.lastInsertRowid;

      /*
       * Варианты приходят JSON-массивом.
       */
      let variants = [];

      try {
        variants = req.body.variants
          ? JSON.parse(req.body.variants)
          : [];
      } catch {
        variants = [];
      }

      if (Array.isArray(variants)) {
        for (const variant of variants) {
          const variantName = stringValue(
            variant.name || variant.title,
            ""
          );

          if (!variantName) {
            continue;
          }

          await db.execute({
            sql: `
              INSERT INTO product_variants (
                product_id,
                name,
                price
              )
              VALUES (?, ?, ?)
            `,
            args: [
              productId,
              variantName,
              numberValue(variant.price, price)
            ]
          });
        }
      }

      const created = await db.execute({
        sql: `
          SELECT *
          FROM products
          WHERE id = ?
          LIMIT 1
        `,
        args: [productId]
      });

      res.status(201).json({
        ok: true,
        product: created.rows[0]
      });
    } catch (error) {
      console.error("ADMIN CREATE product:", error);

      res.status(500).json({
        error: "Не удалось создать товар"
      });
    }
  }
);

app.put(
  "/api/admin/products/:id",
  upload.single("image"),
  async (req, res) => {
    try {
      if (!isAdminRequest(req)) {
        return res.status(403).json({
          error: "Доступ запрещён"
        });
      }

      const productId = integerId(req.params.id);

      if (productId === null) {
        return res.status(400).json({
          error: "Некорректный ID товара"
        });
      }

      const existing = await db.execute({
        sql: `
          SELECT *
          FROM products
          WHERE id = ?
          LIMIT 1
        `,
        args: [productId]
      });

      if (!existing.rows.length) {
        return res.status(404).json({
          error: "Товар не найден"
        });
      }

      const current = existing.rows[0];

      const name = stringValue(
        req.body.name,
        current.name
      );

      const description = stringValue(
        req.body.description,
        current.description || ""
      );

      const categoryId =
        req.body.category_id === undefined ||
        req.body.category_id === ""
          ? current.category_id
          : integerId(req.body.category_id);

      const price =
        req.body.price === undefined ||
        req.body.price === ""
          ? current.price
          : numberValue(req.body.price, current.price);

      const oldPrice =
        req.body.old_price === undefined ||
        req.body.old_price === ""
          ? current.old_price
          : numberValue(req.body.old_price, current.old_price);

      let imageUrl =
        req.body.image_url !== undefined
          ? stringValue(req.body.image_url)
          : current.image_url || "";

      if (req.file) {
        imageUrl = `/uploads/${req.file.filename}`;
      }

      await db.execute({
        sql: `
          UPDATE products
          SET
            name = ?,
            description = ?,
            category_id = ?,
            price = ?,
            old_price = ?,
            image_url = ?
          WHERE id = ?
        `,
        args: [
          name,
          description,
          categoryId,
          price,
          oldPrice,
          imageUrl,
          productId
        ]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      console.error("ADMIN UPDATE product:", error);

      res.status(500).json({
        error: "Не удалось обновить товар"
      });
    }
  }
);

app.delete("/api/admin/products/:id", async (req, res) => {
  try {
    if (!isAdminRequest(req)) {
      return res.status(403).json({
        error: "Доступ запрещён"
      });
    }

    const productId = integerId(req.params.id);

    if (productId === null) {
      return res.status(400).json({
        error: "Некорректный ID товара"
      });
    }

    await db.execute({
      sql: `
        DELETE FROM product_variants
        WHERE product_id = ?
      `,
      args: [productId]
    });

    await db.execute({
      sql: `
        DELETE FROM products
        WHERE id = ?
      `,
      args: [productId]
    });

    res.json({
      ok: true
    });
  } catch (error) {
    console.error("ADMIN DELETE product:", error);

    res.status(500).json({
      error: "Не удалось удалить товар"
    });
  }
});

/* =========================================================
   ADMIN CATEGORIES
========================================================= */

app.get("/api/admin/categories", async (req, res) => {
  try {
    if (!isAdminRequest(req)) {
      return res.status(403).json({
        error: "Доступ запрещён"
      });
    }

    const result = await db.execute(`
      SELECT *
      FROM categories
      ORDER BY id ASC
    `);

    res.json({
      categories: result.rows
    });
  } catch (error) {
    console.error("ADMIN GET categories:", error);

    res.status(500).json({
      error: "Не удалось загрузить категории"
    });
  }
});

app.post("/api/admin/categories", async (req, res) => {
  try {
    if (!isAdminRequest(req)) {
      return res.status(403).json({
        error: "Доступ запрещён"
      });
    }

    const name = stringValue(
      req.body.name,
      "Новая категория"
    );

    const imageUrl = stringValue(
      req.body.image_url,
      ""
    );

    const result = await db.execute({
      sql: `
        INSERT INTO categories (
          name,
          image_url
        )
        VALUES (?, ?)
      `,
      args: [
        name,
        imageUrl
      ]
    });

    res.status(201).json({
      ok: true,
      id: result.lastInsertRowid
    });
  } catch (error) {
    console.error("ADMIN CREATE category:", error);

    res.status(500).json({
      error: "Не удалось создать категорию"
    });
  }
});

app.put("/api/admin/categories/:id", async (req, res) => {
  try {
    if (!isAdminRequest(req)) {
      return res.status(403).json({
        error: "Доступ запрещён"
      });
    }

    const categoryId = integerId(req.params.id);

    if (categoryId === null) {
      return res.status(400).json({
        error: "Некорректный ID категории"
      });
    }

    await db.execute({
      sql: `
        UPDATE categories
        SET
          name = ?,
          image_url = ?
        WHERE id = ?
      `,
      args: [
        stringValue(req.body.name, ""),
        stringValue(req.body.image_url, ""),
        categoryId
      ]
    });

    res.json({
      ok: true
    });
  } catch (error) {
    console.error("ADMIN UPDATE category:", error);

    res.status(500).json({
      error: "Не удалось обновить категорию"
    });
  }
});

app.delete("/api/admin/categories/:id", async (req, res) => {
  try {
    if (!isAdminRequest(req)) {
      return res.status(403).json({
        error: "Доступ запрещён"
      });
    }

    const categoryId = integerId(req.params.id);

    if (categoryId === null) {
      return res.status(400).json({
        error: "Некорректный ID категории"
      });
    }

    await db.execute({
      sql: `
        DELETE FROM categories
        WHERE id = ?
      `,
      args: [categoryId]
    });

    res.json({
      ok: true
    });
  } catch (error) {
    console.error("ADMIN DELETE category:", error);

    res.status(500).json({
      error: "Не удалось удалить категорию"
    });
  }
});

/* =========================================================
   ADMIN ORDERS
========================================================= */

/*
 * Все заказы для админки.
 */
app.get("/api/admin/orders", async (req, res) => {
  try {
    if (!isAdminRequest(req)) {
      return res.status(403).json({
        error: "Доступ запрещён"
      });
    }

    const result = await db.execute(`
      SELECT *
      FROM orders
      ORDER BY created_at DESC
    `);

    const orders = result.rows.map((order) => ({
      ...order,
      display_id: generateOrderDisplayId(order.id),
      status_label: orderStatusLabel(order.status),
      status_text: orderStatusText(order.status)
    }));

    res.json({
      orders
    });
  } catch (error) {
    console.error("ADMIN GET orders:", error);

    res.status(500).json({
      error: "Не удалось загрузить заказы"
    });
  }
});

/*
 * Один заказ для админа.
 */
app.get("/api/admin/orders/:id", async (req, res) => {
  try {
    if (!isAdminRequest(req)) {
      return res.status(403).json({
        error: "Доступ запрещён"
      });
    }

    const orderId = String(req.params.id);

    const result = await db.execute({
      sql: `
        SELECT *
        FROM orders
        WHERE id = ?
        LIMIT 1
      `,
      args: [orderId]
    });

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Заказ не найден"
      });
    }

    const order = result.rows[0];

    res.json({
      order: {
        ...order,
        display_id: generateOrderDisplayId(order.id),
        status_label: orderStatusLabel(order.status),
        status_text: orderStatusText(order.status)
      }
    });
  } catch (error) {
    console.error("ADMIN GET order:", error);

    res.status(500).json({
      error: "Не удалось загрузить заказ"
    });
  }
});

/*
 * Изменить статус заказа администратором.
 */
app.put("/api/admin/orders/:id/status", async (req, res) => {
  try {
    if (!isAdminRequest(req)) {
      return res.status(403).json({
        error: "Доступ запрещён"
      });
    }

    const orderId = String(req.params.id);

    const allowedStatuses = [
      "new",
      "processing",
      "awaiting_payment",
      "reserved",
      "completed",
      "cancelled"
    ];

    const status = stringValue(
      req.body.status,
      ""
    );

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: "Некорректный статус заказа"
      });
    }

    const currentResult = await db.execute({
      sql: `
        SELECT *
        FROM orders
        WHERE id = ?
        LIMIT 1
      `,
      args: [orderId]
    });

    if (!currentResult.rows.length) {
      return res.status(404).json({
        error: "Заказ не найден"
      });
    }

    const currentOrder = currentResult.rows[0];
    const now = new Date().toISOString();

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

    const updatedResult = await db.execute({
      sql: `
        SELECT *
        FROM orders
        WHERE id = ?
        LIMIT 1
      `,
      args: [orderId]
    });

    const updatedOrder = updatedResult.rows[0];

    /*
     * Сообщаем админам о смене статуса.
     */
    try {
      await sendAdminOrderNotification(
        updatedOrder,
        "status"
      );
    } catch (error) {
      console.error(
        "Admin status notification error:",
        error
      );
    }

    /*
     * Сообщаем клиенту.
     */
    if (String(currentOrder.status) !== status) {
      try {
        await sendCustomerStatusNotification(
          updatedOrder
        );
      } catch (error) {
        console.error(
          "Customer status notification error:",
          error
        );
      }
    }

    res.json({
      ok: true,
      order: {
        ...updatedOrder,
        display_id: generateOrderDisplayId(
          updatedOrder.id
        ),
        status_label: orderStatusLabel(
          updatedOrder.status
        ),
        status_text: orderStatusText(
          updatedOrder.status
        )
      }
    });
  } catch (error) {
    console.error("ADMIN UPDATE order status:", error);

    res.status(500).json({
      error: "Не удалось изменить статус заказа"
    });
  }
});

/* =========================================================
   ADMIN UPLOAD
========================================================= */

app.post(
  "/api/admin/upload",
  upload.single("file"),
  async (req, res) => {
    try {
      if (!isAdminRequest(req)) {
        return res.status(403).json({
          error: "Доступ запрещён"
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error: "Файл не загружен"
        });
      }

      const url = `/uploads/${req.file.filename}`;

      res.json({
        ok: true,
        url,
        image_url: url,
        path: url,
        file: {
          url
        }
      });
    } catch (error) {
      console.error("ADMIN UPLOAD:", error);

      res.status(500).json({
        error: "Не удалось загрузить изображение"
      });
    }
  }
);

/* =========================================================
   TELEGRAM WEBHOOK
========================================================= */

app.post("/webhook", async (req, res) => {
  try {
    const update = req.body;

    /*
     * Обычные сообщения.
     */
    if (update?.message) {
      const message = update.message;

      if (
        message.text === "/start" ||
        message.text === "/app"
      ) {
        await telegram("sendMessage", {
          chat_id: message.chat.id,
          text: "Добро пожаловать в IRoom 🩷",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🛍 Открыть IRoom",
                  web_app: {
                    url: MINIAPP_URL
                  }
                }
              ]
            ]
          }
        });
      }
    }

    /*
     * Нажатия на inline-кнопки заказа.
     */
    if (update?.callback_query) {
      const callback = update.callback_query;

      const adminTelegramId =
        String(callback.from?.id || "");

      if (!isAdminId(adminTelegramId)) {
        await telegram("answerCallbackQuery", {
          callback_query_id: callback.id,
          text: "Доступ запрещён",
          show_alert: true
        });
      } else {
        const data = String(
          callback.data || ""
        );

        const match = data.match(
          /^order_status:(.+):([a-z_]+)$/
        );

        if (!match) {
          await telegram("answerCallbackQuery", {
            callback_query_id: callback.id,
            text: "Неизвестная команда"
          });
        } else {
          const orderId = match[1];
          const status = match[2];

          const allowedStatuses = [
            "new",
            "processing",
            "awaiting_payment",
            "reserved",
            "completed",
            "cancelled"
          ];

          if (!allowedStatuses.includes(status)) {
            await telegram("answerCallbackQuery", {
              callback_query_id: callback.id,
              text: "Некорректный статус",
              show_alert: true
            });
          } else {
            const currentResult = await db.execute({
              sql: `
                SELECT *
                FROM orders
                WHERE id = ?
                LIMIT 1
              `,
              args: [orderId]
            });

            if (!currentResult.rows.length) {
              await telegram("answerCallbackQuery", {
                callback_query_id: callback.id,
                text: "Заказ не найден",
                show_alert: true
              });
            } else {
              const currentOrder =
                currentResult.rows[0];

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

              const updatedResult =
                await db.execute({
                  sql: `
                    SELECT *
                    FROM orders
                    WHERE id = ?
                    LIMIT 1
                  `,
                  args: [orderId]
                });

              const updatedOrder =
                updatedResult.rows[0];

              await telegram(
                "answerCallbackQuery",
                {
                  callback_query_id:
                    callback.id,
                  text:
                    `Статус: ${orderStatusText(status)}`
                }
              );

              /*
               * Обновляем сообщение самого админа,
               * чтобы он сразу видел новый статус.
               */
              if (
                callback.message?.chat?.id &&
                callback.message?.message_id
              ) {
                const updatedText = [
                  "🛍 <b>Заказ IRoom</b>",
                  "",
                  `<b>Заказ:</b> ${generateOrderDisplayId(
                    updatedOrder.id
                  )}`,
                  `<b>Товар:</b> ${escapeTelegramHtml(
                    updatedOrder.product_name
                  )}`,
                  updatedOrder.variant_text
                    ? `<b>Вариант:</b> ${escapeTelegramHtml(
                        updatedOrder.variant_text
                      )}`
                    : "",
                  `<b>Цена:</b> ${formatPrice(
                    updatedOrder.price
                  )}`,
                  "",
                  `<b>Клиент:</b> ${escapeTelegramHtml(
                    updatedOrder.customer_name ||
                      "Не указано"
                  )}`,
                  updatedOrder.customer_username
                    ? `<b>Username:</b> @${escapeTelegramHtml(
                        String(
                          updatedOrder.customer_username
                        ).replace(/^@/, "")
                      )}`
                    : "",
                  "",
                  `<b>Статус:</b> ${orderStatusLabel(
                    updatedOrder.status
                  )}`
                ]
                  .filter(Boolean)
                  .join("\n");

                await telegram(
                  "editMessageText",
                  {
                    chat_id:
                      callback.message.chat.id,
                    message_id:
                      callback.message.message_id,
                    text: updatedText,
                    parse_mode: "HTML",
                    reply_markup: {
                      inline_keyboard: [
                        [
                          {
                            text: "🔵 В обработку",
                            callback_data:
                              `order_status:${orderId}:processing`
                          },
                          {
                            text: "🟣 Ожидает оплаты",
                            callback_data:
                              `order_status:${orderId}:awaiting_payment`
                          }
                        ],
                        [
                          {
                            text: "🟢 Забронировать",
                            callback_data:
                              `order_status:${orderId}:reserved`
                          },
                          {
                            text: "⚫ Завершить",
                            callback_data:
                              `order_status:${orderId}:completed`
                          }
                        ],
                        [
                          {
                            text: "🔴 Отменить",
                            callback_data:
                              `order_status:${orderId}:cancelled`
                          }
                        ],
                        [
                          {
                            text: "🌐 Открыть магазин",
                            url: MINIAPP_URL
                          }
                        ]
                      ]
                    }
                  }
                );
              }

              /*
               * Уведомление клиенту только если статус
               * реально изменился.
               */
              if (
                String(currentOrder.status) !==
                String(status)
              ) {
                try {
                  await sendCustomerStatusNotification(
                    updatedOrder
                  );
                } catch (error) {
                  console.error(
                    "Customer callback notification:",
                    error
                  );
                }
              }
            }
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("WEBHOOK ERROR:", error);

    /*
     * Telegram должен получить 200,
     * иначе будет повторять webhook.
     */
    res.sendStatus(200);
  }
});

/* =========================================================
   TELEGRAM WEBHOOK SETUP
========================================================= */

async function setupWebhook() {
  if (!BOT_TOKEN) {
    console.warn(
      "⚠️ BOT_TOKEN отсутствует — webhook не настраиваем"
    );
    return;
  }

  const webhookUrl =
    `${MINIAPP_URL.replace(/\/$/, "")}/webhook`;

  await telegram("setWebhook", {
    url: webhookUrl,
    allowed_updates: [
      "message",
      "callback_query"
    ]
  });

  console.log(
    `Telegram webhook: ${webhookUrl}`
  );
}

/* =========================================================
   ADMIN / APP ROUTES
========================================================= */

app.get("/admin", (_req, res) => {
  res.sendFile(
    path.join(publicDir, "admin.html")
  );
});

app.get("/admin.html", (_req, res) => {
  res.sendFile(
    path.join(publicDir, "admin.html")
  );
});

/*
 * SPA fallback.
 */
app.get("*", (req, res) => {
  if (
    req.path.startsWith("/api/") ||
    req.path.startsWith("/uploads/")
  ) {
    return res.status(404).json({
      error: "Not found"
    });
  }

  res.sendFile(
    path.join(publicDir, "index.html")
  );
});

/* =========================================================
   START
========================================================= */

async function start() {
  try {
    await db.execute("SELECT 1");

    console.log("✅ Turso connected");
  } catch (error) {
    console.error(
      "❌ Turso connection error:",
      error
    );
  }

  app.listen(PORT, async () => {
    console.log(
      `🚀 IRoom server started on port ${PORT}`
    );

    try {
      await setupWebhook();
    } catch (error) {
      console.error(
        "Webhook setup error:",
        error
      );
    }
  });
}

start();