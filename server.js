import express from "express";
import crypto from "crypto";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@libsql/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = Number(process.env.PORT || 10000);

const BOT_TOKEN = String(process.env.BOT_TOKEN || "").trim();
const ADMIN_ID = String(process.env.ADMIN_ID || "").trim();
const SECOND_ADMIN_ID = "5975037118";

const ADMIN_IDS = new Set(
  [ADMIN_ID, SECOND_ADMIN_ID]
    .map((x) => String(x).trim())
    .filter(Boolean)
);

const MINIAPP_URL =
  process.env.MINIAPP_URL ||
  "https://iroom-dww8.onrender.com";

const TURSO_DATABASE_URL =
  process.env.TURSO_DATABASE_URL || "";

const TURSO_AUTH_TOKEN =
  process.env.TURSO_AUTH_TOKEN || "";

const STORE_NAME = "IRoom";
const CONTACT_USERNAME = "iroom_24";
const CHANNEL_USERNAME = "iroom_market";

const PUBLIC_DIR = path.join(__dirname, "public");

const WEBHOOK_PATH = "/telegram/webhook";

const WEBHOOK_SECRET =
  process.env.TELEGRAM_WEBHOOK_SECRET ||
  crypto.randomBytes(32).toString("hex");

const WEBHOOK_URL =
  `${MINIAPP_URL.replace(/\/+$/, "")}${WEBHOOK_PATH}`;

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

/* =========================================================
   BASIC
========================================================= */

app.use(
  express.json({
    limit: "10mb"
  })
);

app.use(
  express.urlencoded({
    extended: true
  })
);

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function text(value) {
  return value == null ? "" : String(value);
}

function isAdmin(telegramId) {
  return ADMIN_IDS.has(String(telegramId));
}

function money(value) {
  return Number(value || 0).toLocaleString("ru-RU");
}

function escapeHtml(value) {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(value) {
  return text(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

/*
 * Преобразование ID, которые приходят из Mini App,
 * в нормальные INTEGER для SQLite/Turso.
 */
function integerId(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  if (!Number.isSafeInteger(number)) {
    return null;
  }

  return number;
}

function numberValue(value, fallback = 0) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

/* =========================================================
   TELEGRAM MINI APP AUTH
========================================================= */

function getInitData(req) {
  return (
    req.headers["x-telegram-init-data"] ||
    req.headers["x-telegram-web-app-init-data"] ||
    ""
  );
}

function validateTelegramInitData(initData) {
  if (!initData || !BOT_TOKEN) {
    return null;
  }

  try {
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

    const userRaw = params.get("user");

    if (!userRaw) {
      return null;
    }

    return JSON.parse(userRaw);
  } catch (error) {
    console.error(
      "Telegram auth error:",
      error.message
    );

    return null;
  }
}

function requireTelegram(req, res, next) {
  const user = validateTelegramInitData(
    getInitData(req)
  );

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
  const user = validateTelegramInitData(
    getInitData(req)
  );

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
   USERS
========================================================= */

async function saveUser(user) {
  if (!user?.id) {
    return;
  }

  const telegramId = String(user.id);

  const existing = await db.execute({
    sql: `
      SELECT *
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
        user.username || "",
        user.first_name || "",
        user.last_name || "",
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
      id("usr"),
      telegramId,
      user.username || "",
      user.first_name || "",
      user.last_name || "",
      now(),
      now()
    ]
  });
}

/* =========================================================
   TELEGRAM BOT API
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
      data.description || "Telegram API error"
    );
  }

  return data.result;
}

async function notifyAdmins(message) {
  if (!BOT_TOKEN) {
    return;
  }

  for (const adminId of ADMIN_IDS) {
    try {
      await telegram("sendMessage", {
        chat_id: adminId,
        text: message,
        parse_mode: "HTML"
      });
    } catch (error) {
      console.error(
        `Admin notification ${adminId}:`,
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
      telegramMode: "webhook",
      webhook: WEBHOOK_URL,
      admins: [...ADMIN_IDS]
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================================================
   CATEGORIES
========================================================= */

app.get("/api/categories", async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT *
      FROM categories
      WHERE COALESCE(active, 1) = 1
      ORDER BY
        COALESCE(sort_order, 0),
        name
    `);

    res.json({
      ok: true,
      categories: result.rows
    });
  } catch (error) {
    console.error(
      "Categories error:",
      error
    );

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================================================
   PRODUCTS
========================================================= */

app.get("/api/products", async (req, res) => {
  try {
    const category =
      text(req.query.category).trim();

    const search =
      text(req.query.search).trim();

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
      const categoryNumber =
        integerId(category);

      sql += `
        AND (
          c.slug = ?
          OR c.id = ?
        )
      `;

      args.push(
        category,
        categoryNumber ?? category
      );
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

      args.push(
        q,
        q,
        q
      );
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
    console.error(
      "Products error:",
      error
    );

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================================================
   SINGLE PRODUCT
========================================================= */

app.get(
  "/api/products/:id",
  async (req, res) => {
    try {
      const productId =
        integerId(req.params.id);

      if (productId === null) {
        return res.status(400).json({
          ok: false,
          error: "Invalid product ID"
        });
      }

      const product = await db.execute({
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
        args: [productId]
      });

      if (!product.rows.length) {
        return res.status(404).json({
          ok: false,
          error: "Product not found"
        });
      }

      const variants = await db.execute({
        sql: `
          SELECT *
          FROM product_variants
          WHERE product_id = ?
            AND COALESCE(active, 1) = 1
          ORDER BY id
        `,
        args: [productId]
      });

      const images = await db.execute({
        sql: `
          SELECT *
          FROM images
          WHERE product_id = ?
          ORDER BY
            COALESCE(sort_order, 0),
            id
        `,
        args: [productId]
      });

      res.json({
        ok: true,
        product: product.rows[0],
        variants: variants.rows,
        images: images.rows
      });
    } catch (error) {
      console.error(
        "Product error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: error.message
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
  async (req, res) => {
    try {
      await saveUser(
        req.telegramUser
      );

      res.json({
        ok: true,
        user: req.telegramUser,
        admin: isAdmin(
          req.telegramUser.id
        )
      });
    } catch (error) {
      console.error(
        "ME error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================================================
   SETTINGS
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
        settings,
        store: STORE_NAME,
        contact: CONTACT_USERNAME,
        channel: CHANNEL_USERNAME
      });
    } catch (error) {
      console.error(
        "Settings error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================================================
   CREATE ORDER / BOOKING
========================================================= */

app.post(
  "/api/orders",
  requireTelegram,
  async (req, res) => {
    try {
      const {
        productId,
        variantId,
        productName,
        variantText,
        price
      } = req.body;

      if (
        !productId &&
        !productName
      ) {
        return res.status(400).json({
          ok: false,
          error: "Product is required"
        });
      }

      await saveUser(
        req.telegramUser
      );

      const orderId = id("ord");

      const normalizedProductId =
        integerId(productId);

      const normalizedVariantId =
        integerId(variantId);

      const customerName = [
        req.telegramUser.first_name,
        req.telegramUser.last_name
      ]
        .filter(Boolean)
        .join(" ");

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
          VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          )
        `,
        args: [
          orderId,
          String(req.telegramUser.id),
          normalizedProductId,
          normalizedVariantId,
          productName || "",
          variantText || "",
          numberValue(price),
          customerName || "",
          req.telegramUser.username || "",
          "new",
          now(),
          now()
        ]
      });

      const message = [
        "🛍 <b>Новая бронь IRoom</b>",
        "",
        `<b>Товар:</b> ${escapeHtml(
          productName || ""
        )}`,
        variantText
          ? `<b>Вариант:</b> ${escapeHtml(
              variantText
            )}`
          : "",
        `<b>Цена:</b> ${money(
          price
        )} ₽`,
        "",
        `<b>Клиент:</b> ${escapeHtml(
          customerName
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

      await notifyAdmins(
        message
      );

      res.json({
        ok: true,
        orderId
      });
    } catch (error) {
      console.error(
        "Order error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: error.message
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
    res.json({
      ok: true,
      admin: true,
      telegramUser:
        req.telegramUser,
      admins: [...ADMIN_IDS]
    });
  }
);

/* =========================================================
   ADMIN PRODUCTS LIST
========================================================= */

app.get(
  "/api/admin/products",
  requireAdmin,
  async (req, res) => {
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
      console.error(
        "Admin products error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================================================
   ADMIN CATEGORIES LIST
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
          COALESCE(sort_order, 0),
          name
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
        error: error.message
      });
    }
  }
);

/* =========================================================
   ADMIN ORDERS LIST
========================================================= */

app.get(
  "/api/admin/orders",
  requireAdmin,
  async (req, res) => {
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
      console.error(
        "Admin orders error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================================================
   ADMIN CREATE PRODUCT
========================================================= */

app.post(
  "/api/admin/products",
  requireAdmin,
  async (req, res) => {
    try {
      const body =
        req.body || {};

      const name =
        text(body.name).trim();

      if (!name) {
        return res.status(400).json({
          ok: false,
          error:
            "Product name is required"
        });
      }

      /*
       * ВАЖНО:
       * products.id НЕ передаём.
       * SQLite/Turso создаст INTEGER ID автоматически.
       */

      let categoryId =
        body.category_id ??
        body.categoryId ??
        null;

      if (
        categoryId !== null &&
        categoryId !== undefined &&
        categoryId !== ""
      ) {
        categoryId =
          integerId(categoryId);

        if (categoryId === null) {
          return res.status(400).json({
            ok: false,
            error: "Invalid category ID"
          });
        }
      } else {
        categoryId = null;
      }

      const productSlug =
        text(
          body.slug ||
          slugify(name)
        );

      const result =
        await db.execute({
          sql: `
            INSERT INTO products (
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
            VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
          `,
          args: [
            categoryId,
            name,
            productSlug,
            body.description || "",
            body.image_url ||
              body.imageUrl ||
              "",
            numberValue(body.price),
            body.active === false
              ? 0
              : 1,
            body.is_new ||
            body.isNew
              ? 1
              : 0,
            numberValue(
              body.sort_order ??
              body.sortOrder
            ),
            now(),
            now()
          ]
        });

      /*
       * lastInsertRowid — числовой ID,
       * который реально создал Turso.
       */

      const productId =
        Number(
          result.lastInsertRowid
        );

      if (
        !Number.isSafeInteger(
          productId
        )
      ) {
        throw new Error(
          "Turso did not return a valid product ID"
        );
      }

      /*
       * Создаём варианты.
       *
       * ID варианта тоже НЕ передаём —
       * SQLite/Turso создаёт его самостоятельно.
       */

      if (
        Array.isArray(
          body.variants
        )
      ) {
        for (
          const variant
          of body.variants
        ) {
          await db.execute({
            sql: `
              INSERT INTO product_variants (
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
              VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
              )
            `,
            args: [
              productId,
              variant.color || "",
              variant.memory || "",
              variant.country || "",
              variant.sim || "",
              numberValue(
                variant.price,
                numberValue(
                  body.price
                )
              ),
              numberValue(
                variant.stock
              ),
              variant.active === false
                ? 0
                : 1,
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
      console.error(
        "Admin create product:",
        error
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================================================
   ADMIN UPDATE PRODUCT
========================================================= */

app.put(
  "/api/admin/products/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const body =
        req.body || {};

      const productId =
        integerId(req.params.id);

      if (productId === null) {
        return res.status(400).json({
          ok: false,
          error: "Invalid product ID"
        });
      }

      const existing =
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

      if (
        !existing.rows.length
      ) {
        return res.status(404).json({
          ok: false,
          error:
            "Product not found"
        });
      }

      const current =
        existing.rows[0];

      let categoryId =
        body.category_id ??
        body.categoryId ??
        current.category_id ??
        null;

      if (
        categoryId !== null &&
        categoryId !== undefined &&
        categoryId !== ""
      ) {
        categoryId =
          integerId(categoryId);

        if (categoryId === null) {
          return res.status(400).json({
            ok: false,
            error: "Invalid category ID"
          });
        }
      } else {
        categoryId = null;
      }

      const name =
        body.name ??
        current.name;

      const description =
        body.description ??
        current.description ??
        "";

      const imageUrl =
        body.image_url ??
        body.imageUrl ??
        current.image_url ??
        "";

      const price =
        numberValue(
          body.price,
          numberValue(
            current.price
          )
        );

      const active =
        body.active == null
          ? current.active ?? 1
          : body.active
          ? 1
          : 0;

      const isNew =
        body.is_new != null ||
        body.isNew != null
          ? (
              body.is_new ??
              body.isNew
            )
            ? 1
            : 0
          : current.is_new ?? 0;

      const sortOrder =
        numberValue(
          body.sort_order ??
          body.sortOrder,
          numberValue(
            current.sort_order
          )
        );

      await db.execute({
        sql: `
          UPDATE products
          SET
            category_id = ?,
            name = ?,
            description = ?,
            image_url = ?,
            price = ?,
            active = ?,
            is_new = ?,
            sort_order = ?,
            updated_at = ?
          WHERE id = ?
        `,
        args: [
          categoryId,
          name,
          description,
          imageUrl,
          price,
          active,
          isNew,
          sortOrder,
          now(),
          productId
        ]
      });

      /*
       * Если варианты переданы,
       * полностью пересоздаём их.
       */

      if (
        Array.isArray(
          body.variants
        )
      ) {
        await db.execute({
          sql: `
            DELETE FROM product_variants
            WHERE product_id = ?
          `,
          args: [
            productId
          ]
        });

        for (
          const variant
          of body.variants
        ) {
          await db.execute({
            sql: `
              INSERT INTO product_variants (
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
              VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
              )
            `,
            args: [
              productId,
              variant.color || "",
              variant.memory || "",
              variant.country || "",
              variant.sim || "",
              numberValue(
                variant.price,
                price
              ),
              numberValue(
                variant.stock
              ),
              variant.active === false
                ? 0
                : 1,
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
      console.error(
        "Admin update product:",
        error
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================================================
   ADMIN DELETE PRODUCT
========================================================= */

app.delete(
  "/api/admin/products/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const productId =
        integerId(req.params.id);

      if (productId === null) {
        return res.status(400).json({
          ok: false,
          error: "Invalid product ID"
        });
      }

      await db.execute({
        sql: `
          UPDATE products
          SET
            active = 0,
            updated_at = ?
          WHERE id = ?
        `,
        args: [
          now(),
          productId
        ]
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
        error: error.message
      });
    }
  }
);

/* =========================================================
   ADMIN CREATE CATEGORY
========================================================= */

app.post(
  "/api/admin/categories",
  requireAdmin,
  async (req, res) => {
    try {
      const body =
        req.body || {};

      const name =
        text(body.name).trim();

      if (!name) {
        return res.status(400).json({
          ok: false,
          error:
            "Category name is required"
        });
      }

      /*
       * categories.id также создаётся
       * автоматически Turso.
       */

      const result =
        await db.execute({
          sql: `
            INSERT INTO categories (
              name,
              slug,
              image_url,
              sort_order,
              active,
              created_at,
              updated_at
            )
            VALUES (
              ?, ?, ?, ?, ?, ?, ?
            )
          `,
          args: [
            name,
            body.slug ||
              slugify(name),
            body.image_url ||
              body.imageUrl ||
              "",
            numberValue(
              body.sort_order ??
              body.sortOrder
            ),
            body.active === false
              ? 0
              : 1,
            now(),
            now()
          ]
        });

      const categoryId =
        Number(
          result.lastInsertRowid
        );

      if (
        !Number.isSafeInteger(
          categoryId
        )
      ) {
        throw new Error(
          "Turso did not return a valid category ID"
        );
      }

      res.json({
        ok: true,
        categoryId
      });
    } catch (error) {
      console.error(
        "Admin category:",
        error
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================================================
   ADMIN UPDATE CATEGORY
========================================================= */

app.put(
  "/api/admin/categories/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const body =
        req.body || {};

      const categoryId =
        integerId(req.params.id);

      if (categoryId === null) {
        return res.status(400).json({
          ok: false,
          error: "Invalid category ID"
        });
      }

      const existing =
        await db.execute({
          sql: `
            SELECT *
            FROM categories
            WHERE id = ?
            LIMIT 1
          `,
          args: [
            categoryId
          ]
        });

      if (
        !existing.rows.length
      ) {
        return res.status(404).json({
          ok: false,
          error:
            "Category not found"
        });
      }

      const current =
        existing.rows[0];

      await db.execute({
        sql: `
          UPDATE categories
          SET
            name = ?,
            slug = ?,
            image_url = ?,
            sort_order = ?,
            active = ?,
            updated_at = ?
          WHERE id = ?
        `,
        args: [
          body.name ??
            current.name,

          body.slug ??
            current.slug,

          body.image_url ??
            body.imageUrl ??
            current.image_url ??
            "",

          numberValue(
            body.sort_order ??
            body.sortOrder,
            numberValue(
              current.sort_order
            )
          ),

          body.active == null
            ? current.active ?? 1
            : body.active
            ? 1
            : 0,

          now(),

          categoryId
        ]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        "Admin update category:",
        error
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================================================
   ADMIN DELETE CATEGORY
========================================================= */

app.delete(
  "/api/admin/categories/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const categoryId =
        integerId(req.params.id);

      if (categoryId === null) {
        return res.status(400).json({
          ok: false,
          error: "Invalid category ID"
        });
      }

      await db.execute({
        sql: `
          UPDATE categories
          SET
            active = 0,
            updated_at = ?
          WHERE id = ?
        `,
        args: [
          now(),
          categoryId
        ]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        "Admin delete category:",
        error
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

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

      const mime =
        req.file.mimetype ||
        "image/jpeg";

      const image =
        `data:${mime};base64,` +
        req.file.buffer.toString(
          "base64"
        );

      res.json({
        ok: true,
        url: image
      });
    } catch (error) {
      console.error(
        "Upload error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================================================
   TELEGRAM WEBHOOK
========================================================= */

async function handleUpdate(update) {
  const message =
    update?.message;

  if (!message) {
    return;
  }

  const chatId =
    message.chat?.id;

  const command =
    text(message.text).trim();

  if (!chatId) {
    return;
  }

  if (command === "/start") {
    await telegram(
      "sendMessage",
      {
        chat_id: chatId,
        text:
          `Добро пожаловать в ${STORE_NAME}!\n\n` +
          "Откройте магазин:",
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

  if (command === "/help") {
    await telegram(
      "sendMessage",
      {
        chat_id: chatId,
        text:
          "IRoom — магазин техники Apple."
      }
    );
  }
}

app.post(
  WEBHOOK_PATH,
  async (req, res) => {
    try {
      const secret =
        req.headers[
          "x-telegram-bot-api-secret-token"
        ];

      if (
        !secret ||
        secret !== WEBHOOK_SECRET
      ) {
        return res.status(403).json({
          ok: false,
          error:
            "Invalid webhook secret"
        });
      }

      await handleUpdate(
        req.body
      );

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        "Telegram webhook error:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================================================
   TELEGRAM WEBHOOK SETUP
========================================================= */

async function setupWebhook() {
  if (!BOT_TOKEN) {
    console.log(
      "Telegram webhook disabled: BOT_TOKEN missing"
    );

    return;
  }

  try {
    await telegram(
      "setWebhook",
      {
        url: WEBHOOK_URL,
        secret_token:
          WEBHOOK_SECRET,
        allowed_updates: [
          "message"
        ],
        drop_pending_updates: false
      }
    );

    const info =
      await telegram(
        "getWebhookInfo"
      );

    console.log(
      "Telegram webhook configured"
    );

    console.log(
      `Webhook URL: ${WEBHOOK_URL}`
    );

    console.log(
      `Telegram webhook pending updates: ${
        info.pending_update_count || 0
      }`
    );

    if (
      info.last_error_message
    ) {
      console.log(
        `Telegram webhook last error: ${
          info.last_error_message
        }`
      );
    }
  } catch (error) {
    console.error(
      "Telegram webhook setup error:",
      error.message
    );
  }
}

/* =========================================================
   ADMIN PAGE
========================================================= */

app.get(
  "/admin",
  (req, res) => {
    res.sendFile(
      path.join(
        PUBLIC_DIR,
        "admin.html"
      )
    );
  }
);

app.get(
  "/admin.html",
  (req, res) => {
    res.sendFile(
      path.join(
        PUBLIC_DIR,
        "admin.html"
      )
    );
  }
);

/* =========================================================
   STATIC
========================================================= */

app.use(
  express.static(
    PUBLIC_DIR
  )
);

app.use(
  (req, res, next) => {
    if (req.method !== "GET") {
      return next();
    }

    if (
      req.path.startsWith("/api/") ||
      req.path === "/health" ||
      req.path === WEBHOOK_PATH ||
      req.path === "/admin" ||
      req.path === "/admin.html"
    ) {
      return next();
    }

    res.sendFile(
      path.join(
        PUBLIC_DIR,
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
    if (
      !TURSO_DATABASE_URL ||
      !TURSO_AUTH_TOKEN
    ) {
      throw new Error(
        "TURSO_DATABASE_URL or TURSO_AUTH_TOKEN is missing"
      );
    }

    await db.execute(
      "SELECT 1"
    );

    console.log(
      "Turso database connected"
    );

    const tables =
      await db.execute(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
      `);

    const tableNames =
      tables.rows.map(
        (row) =>
          String(row.name)
      );

    console.log(
      "Database tables:",
      tableNames.join(", ")
    );

    app.listen(
      PORT,
      async () => {
        console.log(
          `IRoom started on port ${PORT}`
        );

        console.log(
          `Store: ${STORE_NAME}`
        );

        console.log(
          `Mini App: ${MINIAPP_URL}`
        );

        console.log(
          `Admin page: ${MINIAPP_URL}/admin`
        );

        console.log(
          `Admin 1: ${
            ADMIN_ID || "not set"
          }`
        );

        console.log(
          `Admin 2: ${SECOND_ADMIN_ID}`
        );

        console.log(
          "Telegram mode: WEBHOOK"
        );

        await setupWebhook();
      }
    );
  } catch (error) {
    console.error(
      "Fatal startup error:",
      error
    );

    process.exit(1);
  }
}

start();