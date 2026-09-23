const express = require("express");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { createClient } = require("@libsql/client");

const app = express();

const PORT = process.env.PORT || 10000;

const TURSO_DATABASE_URL =
  process.env.TURSO_DATABASE_URL;

const TURSO_AUTH_TOKEN =
  process.env.TURSO_AUTH_TOKEN;

const BOT_TOKEN =
  process.env.BOT_TOKEN || "";

const ADMIN_ID =
  process.env.ADMIN_ID
    ? String(process.env.ADMIN_ID)
    : "";

const MINIAPP_URL =
  process.env.MINIAPP_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  "";

/* =========================================================
   DATABASE
   ========================================================= */

if (
  !TURSO_DATABASE_URL ||
  !TURSO_AUTH_TOKEN
) {
  console.error(
    "TURSO_DATABASE_URL или TURSO_AUTH_TOKEN не заданы"
  );
}

const db = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN
});

/* =========================================================
   EXPRESS
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

/* =========================================================
   MULTER
   ========================================================= */

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif"
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(
        new Error(
          "Разрешены только изображения"
        )
      );
    }

    cb(null, true);
  }
});

/* =========================================================
   TELEGRAM MINI APP AUTH
   ========================================================= */

function validateTelegramInitData(initData) {
  if (!BOT_TOKEN || !initData) {
    return null;
  }

  try {
    const params =
      new URLSearchParams(initData);

    const receivedHash =
      params.get("hash");

    if (!receivedHash) {
      return null;
    }

    params.delete("hash");

    const dataCheckString =
      [...params.entries()]
        .sort(([a], [b]) =>
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

    const receivedBuffer =
      Buffer.from(
        receivedHash,
        "hex"
      );

    const calculatedBuffer =
      Buffer.from(
        calculatedHash,
        "hex"
      );

    if (
      receivedBuffer.length !==
        calculatedBuffer.length ||
      !crypto.timingSafeEqual(
        receivedBuffer,
        calculatedBuffer
      )
    ) {
      return null;
    }

    const userString =
      params.get("user");

    if (!userString) {
      return null;
    }

    return JSON.parse(userString);
  } catch (error) {
    console.error(
      "Telegram auth error:",
      error
    );

    return null;
  }
}

function getTelegramInitData(req) {
  return (
    req.headers[
      "x-telegram-init-data"
    ] ||
    req.headers[
      "x-telegram-web-app-init-data"
    ] ||
    ""
  );
}

async function isAdminTelegramId(
  telegramId
) {
  if (!telegramId) {
    return false;
  }

  if (
    ADMIN_ID &&
    String(telegramId) ===
      String(ADMIN_ID)
  ) {
    return true;
  }

  const result =
    await db.execute({
      sql: `
        SELECT telegram_id
        FROM admins
        WHERE telegram_id = ?
        LIMIT 1
      `,
      args: [String(telegramId)]
    });

  return result.rows.length > 0;
}

async function requireAdmin(
  req,
  res,
  next
) {
  try {
    const initData =
      getTelegramInitData(req);

    if (!initData) {
      return res.status(401).json({
        ok: false,
        error:
          "Telegram authorization required"
      });
    }

    const telegramUser =
      validateTelegramInitData(
        initData
      );

    if (
      !telegramUser ||
      !telegramUser.id
    ) {
      return res.status(401).json({
        ok: false,
        error:
          "Invalid Telegram Mini App authorization"
      });
    }

    const admin =
      await isAdminTelegramId(
        telegramUser.id
      );

    if (!admin) {
      return res.status(403).json({
        ok: false,
        error:
          "Admin access denied"
      });
    }

    req.telegramUser =
      telegramUser;

    next();
  } catch (error) {
    console.error(
      "Admin auth error:",
      error
    );

    res.status(500).json({
      ok: false,
      error:
        "Authorization error"
    });
  }
}

/* =========================================================
   DATABASE INITIALIZATION
   ========================================================= */

async function initDatabase() {
  await db.batch(
    [
      {
        sql: `
          CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            image_url TEXT,
            sort_order INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `
      },

      {
        sql: `
          CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            memory TEXT,
            color TEXT,
            version TEXT,
            price INTEGER NOT NULL DEFAULT 0,
            image_url TEXT,
            category_id INTEGER,
            is_new INTEGER DEFAULT 0,
            new_sort_order INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `
      },

      {
        sql: `
          CREATE TABLE IF NOT EXISTS admins (
            telegram_id TEXT PRIMARY KEY,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `
      },

      {
        sql: `
          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
          )
        `
      },

      {
        sql: `
          CREATE TABLE IF NOT EXISTS images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mime_type TEXT NOT NULL,
            image_data BLOB NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `
      }
    ],
    "write"
  );

  const categoryCount =
    await db.execute(
      "SELECT COUNT(*) AS count FROM categories"
    );

  if (
    Number(
      categoryCount.rows[0].count
    ) === 0
  ) {
    await db.batch(
      [
        {
          sql: `
            INSERT INTO categories
            (name, slug, sort_order, active)
            VALUES (?, ?, ?, ?)
          `,
          args: [
            "iPhone",
            "iphone",
            1,
            1
          ]
        },

        {
          sql: `
            INSERT INTO categories
            (name, slug, sort_order, active)
            VALUES (?, ?, ?, ?)
          `,
          args: [
            "iPad",
            "ipad",
            2,
            1
          ]
        },

        {
          sql: `
            INSERT INTO categories
            (name, slug, sort_order, active)
            VALUES (?, ?, ?, ?)
          `,
          args: [
            "Mac",
            "mac",
            3,
            1
          ]
        },

        {
          sql: `
            INSERT INTO categories
            (name, slug, sort_order, active)
            VALUES (?, ?, ?, ?)
          `,
          args: [
            "Apple Watch",
            "apple-watch",
            4,
            1
          ]
        },

        {
          sql: `
            INSERT INTO categories
            (name, slug, sort_order, active)
            VALUES (?, ?, ?, ?)
          `,
          args: [
            "AirPods",
            "airpods",
            5,
            1
          ]
        }
      ],
      "write"
    );
  }

  const settings = [
    [
      "store_name",
      "iroom"
    ],
    [
      "contact_username",
      process.env.CONTACT_USERNAME || ""
    ]
  ];

  for (
    const [key, value]
    of settings
  ) {
    await db.execute({
      sql: `
        INSERT INTO settings
        (key, value)
        VALUES (?, ?)
        ON CONFLICT(key)
        DO UPDATE SET
          value = excluded.value
      `,
      args: [key, value]
    });
  }

  if (ADMIN_ID) {
    await db.execute({
      sql: `
        INSERT OR IGNORE INTO admins
        (telegram_id)
        VALUES (?)
      `,
      args: [ADMIN_ID]
    });
  }

  console.log(
    "Turso database initialized"
  );
}

/* =========================================================
   HEALTH
   ========================================================= */

app.get(
  "/api/health",
  async (req, res) => {
    try {
      const result =
        await db.execute(
          "SELECT 1 AS ok"
        );

      res.json({
        ok: true,
        database:
          result.rows[0].ok === 1,
        app: "iroom"
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        database: false,
        error:
          "Database connection failed"
      });
    }
  }
);

/* =========================================================
   PUBLIC CATEGORIES
   ========================================================= */

app.get(
  "/api/categories",
  async (req, res) => {
    try {
      const result =
        await db.execute(`
          SELECT
            id,
            name,
            slug,
            image_url,
            sort_order
          FROM categories
          WHERE active = 1
          ORDER BY
            sort_order ASC,
            id ASC
        `);

      res.json({
        ok: true,
        categories:
          result.rows
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        error:
          "Не удалось загрузить категории"
      });
    }
  }
);

/* =========================================================
   PUBLIC PRODUCTS
   ========================================================= */

const productSelect = `
  SELECT
    p.id,
    p.name,
    p.memory,
    p.color,
    p.version,
    p.price,
    p.image_url,
    p.category_id,
    p.is_new,
    p.new_sort_order,
    c.name AS category_name,
    c.slug AS category_slug
  FROM products p
  LEFT JOIN categories c
    ON c.id = p.category_id
`;

app.get(
  "/api/products",
  async (req, res) => {
    try {
      const category =
        req.query.category;

      let result;

      if (category) {
        result =
          await db.execute({
            sql: `
              ${productSelect}
              WHERE p.active = 1
                AND c.slug = ?
              ORDER BY p.id DESC
            `,
            args: [category]
          });
      } else {
        result =
          await db.execute(`
            ${productSelect}
            WHERE p.active = 1
            ORDER BY p.id DESC
          `);
      }

      res.json({
        ok: true,
        products:
          result.rows
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        error:
          "Не удалось загрузить товары"
      });
    }
  }
);

app.get(
  "/api/products/new",
  async (req, res) => {
    try {
      const result =
        await db.execute(`
          ${productSelect}
          WHERE p.active = 1
            AND p.is_new = 1
          ORDER BY
            p.new_sort_order ASC,
            p.id DESC
        `);

      res.json({
        ok: true,
        products:
          result.rows
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        error:
          "Не удалось загрузить новинки"
      });
    }
  }
);

app.get(
  "/api/products/:id",
  async (req, res) => {
    try {
      const result =
        await db.execute({
          sql: `
            ${productSelect}
            WHERE p.id = ?
              AND p.active = 1
            LIMIT 1
          `,
          args: [req.params.id]
        });

      if (
        result.rows.length === 0
      ) {
        return res.status(404).json({
          ok: false,
          error:
            "Товар не найден"
        });
      }

      res.json({
        ok: true,
        product:
          result.rows[0]
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        error:
          "Не удалось загрузить товар"
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
      const result =
        await db.execute(`
          SELECT key, value
          FROM settings
        `);

      const settings = {};

      for (
        const row of result.rows
      ) {
        settings[row.key] =
          row.value;
      }

      res.json({
        ok: true,
        settings
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        error:
          "Не удалось загрузить настройки"
      });
    }
  }
);

/* =========================================================
   IMAGE STORAGE
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
          error:
            "Файл не выбран"
        });
      }

      const result =
        await db.execute({
          sql: `
            INSERT INTO images
            (mime_type, image_data)
            VALUES (?, ?)
          `,
          args: [
            req.file.mimetype,
            req.file.buffer
          ]
        });

      const imageId =
        Number(
          result.lastInsertRowid
        );

      res.json({
        ok: true,
        image_id: imageId,
        image_url:
          `/api/images/${imageId}`
      });
    } catch (error) {
      console.error(
        "Image upload error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Не удалось сохранить изображение"
      });
    }
  }
);

app.get(
  "/api/images/:id",
  async (req, res) => {
    try {
      const result =
        await db.execute({
          sql: `
            SELECT
              mime_type,
              image_data
            FROM images
            WHERE id = ?
            LIMIT 1
          `,
          args: [req.params.id]
        });

      if (
        result.rows.length === 0
      ) {
        return res
          .status(404)
          .send("Image not found");
      }

      const row =
        result.rows[0];

      res.setHeader(
        "Content-Type",
        row.mime_type
      );

      res.setHeader(
        "Cache-Control",
        "public, max-age=31536000, immutable"
      );

      res.end(
        Buffer.from(
          row.image_data
        )
      );
    } catch (error) {
      console.error(
        "Image read error:",
        error
      );

      res
        .status(500)
        .send("Image error");
    }
  }
);

/* =========================================================
   ADMIN: CURRENT USER
   ========================================================= */

app.get(
  "/api/admin/me",
  requireAdmin,
  async (req, res) => {
    res.json({
      ok: true,
      admin: true,
      user: {
        id:
          req.telegramUser.id,

        first_name:
          req.telegramUser.first_name ||
          "",

        last_name:
          req.telegramUser.last_name ||
          "",

        username:
          req.telegramUser.username ||
          ""
      }
    });
  }
);

/* =========================================================
   ADMIN: PRODUCTS
   ========================================================= */

app.get(
  "/api/admin/products",
  requireAdmin,
  async (req, res) => {
    try {
      const result =
        await db.execute(`
          ${productSelect}
          ORDER BY p.id DESC
        `);

      res.json({
        ok: true,
        products:
          result.rows
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        error:
          "Не удалось загрузить товары"
      });
    }
  }
);

app.post(
  "/api/admin/products",
  requireAdmin,
  async (req, res) => {
    try {
      const {
        name,
        memory,
        color,
        version,
        price,
        image_url,
        category_id,
        is_new,
        new_sort_order,
        active
      } = req.body;

      if (
        !name ||
        String(name).trim() === ""
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Название товара обязательно"
        });
      }

      const numericPrice =
        Number(price || 0);

      const numericCategory =
        category_id === "" ||
        category_id === null ||
        category_id === undefined
          ? null
          : Number(category_id);

      const result =
        await db.execute({
          sql: `
            INSERT INTO products
            (
              name,
              memory,
              color,
              version,
              price,
              image_url,
              category_id,
              is_new,
              new_sort_order,
              active,
              updated_at
            )
            VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `,
          args: [
            String(name).trim(),
            memory || "",
            color || "",
            version || "",
            numericPrice,
            image_url || "",
            numericCategory,
            is_new ? 1 : 0,
            Number(
              new_sort_order || 0
            ),
            active === false
              ? 0
              : 1
          ]
        });

      res.json({
        ok: true,
        product_id:
          Number(
            result.lastInsertRowid
          )
      });
    } catch (error) {
      console.error(
        "Create product error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Не удалось создать товар"
      });
    }
  }
);

app.put(
  "/api/admin/products/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const {
        name,
        memory,
        color,
        version,
        price,
        image_url,
        category_id,
        is_new,
        new_sort_order,
        active
      } = req.body;

      if (
        !name ||
        String(name).trim() === ""
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Название товара обязательно"
        });
      }

      const numericPrice =
        Number(price || 0);

      const numericCategory =
        category_id === "" ||
        category_id === null ||
        category_id === undefined
          ? null
          : Number(category_id);

      await db.execute({
        sql: `
          UPDATE products
          SET
            name = ?,
            memory = ?,
            color = ?,
            version = ?,
            price = ?,
            image_url = ?,
            category_id = ?,
            is_new = ?,
            new_sort_order = ?,
            active = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        args: [
          String(name).trim(),
          memory || "",
          color || "",
          version || "",
          numericPrice,
          image_url || "",
          numericCategory,
          is_new ? 1 : 0,
          Number(
            new_sort_order || 0
          ),
          active === false
            ? 0
            : 1,
          req.params.id
        ]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        "Update product error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Не удалось изменить товар"
      });
    }
  }
);

app.delete(
  "/api/admin/products/:id",
  requireAdmin,
  async (req, res) => {
    try {
      await db.execute({
        sql: `
          DELETE FROM products
          WHERE id = ?
        `,
        args: [req.params.id]
      });

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        "Delete product error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Не удалось удалить товар"
      });
    }
  }
);

/* =========================================================
   ADMIN: CATEGORIES
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
            image_url,
            sort_order,
            active
          FROM categories
          ORDER BY
            sort_order ASC,
            id ASC
        `);

      res.json({
        ok: true,
        categories:
          result.rows
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        error:
          "Не удалось загрузить категории"
      });
    }
  }
);

app.post(
  "/api/admin/categories",
  requireAdmin,
  async (req, res) => {
    try {
      const {
        name,
        slug,
        image_url,
        sort_order,
        active
      } = req.body;

      if (
        !name ||
        String(name).trim() === ""
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Название категории обязательно"
        });
      }

      const cleanName =
        String(name).trim();

      const cleanSlug =
        String(
          slug || cleanName
        )
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(
            /[^a-z0-9а-яё-]/gi,
            ""
          );

      const result =
        await db.execute({
          sql: `
            INSERT INTO categories
            (
              name,
              slug,
              image_url,
              sort_order,
              active
            )
            VALUES (?, ?, ?, ?, ?)
          `,
          args: [
            cleanName,
            cleanSlug,
            image_url || "",
            Number(
              sort_order || 0
            ),
            active === false
              ? 0
              : 1
          ]
        });

      res.json({
        ok: true,
        category_id:
          Number(
            result.lastInsertRowid
          )
      });
    } catch (error) {
      console.error(
        "Create category error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Не удалось создать категорию"
      });
    }
  }
);

app.put(
  "/api/admin/categories/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const {
        name,
        slug,
        image_url,
        sort_order,
        active
      } = req.body;

      if (
        !name ||
        String(name).trim() === ""
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Название категории обязательно"
        });
      }

      const cleanName =
        String(name).trim();

      const cleanSlug =
        String(
          slug || cleanName
        )
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(
            /[^a-z0-9а-яё-]/gi,
            ""
          );

      await db.execute({
        sql: `
          UPDATE categories
          SET
            name = ?,
            slug = ?,
            image_url = ?,
            sort_order = ?,
            active = ?
          WHERE id = ?
        `,
        args: [
          cleanName,
          cleanSlug,
          image_url || "",
          Number(
            sort_order || 0
          ),
          active === false
            ? 0
            : 1,
          req.params.id
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
        error:
          "Не удалось изменить категорию"
      });
    }
  }
);

app.delete(
  "/api/admin/categories/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const products =
        await db.execute({
          sql: `
            SELECT COUNT(*) AS count
            FROM products
            WHERE category_id = ?
          `,
          args: [
            req.params.id
          ]
        });

      if (
        Number(
          products.rows[0].count
        ) > 0
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Сначала перенесите товары из этой категории"
        });
      }

      await db.execute({
        sql: `
          DELETE FROM categories
          WHERE id = ?
        `,
        args: [
          req.params.id
        ]
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
        error:
          "Не удалось удалить категорию"
      });
    }
  }
);

/* =========================================================
   ADMIN: SETTINGS
   ========================================================= */

app.put(
  "/api/admin/settings",
  requireAdmin,
  async (req, res) => {
    try {
      const settings =
        req.body || {};

      for (
        const [key, value]
        of Object.entries(settings)
      ) {
        await db.execute({
          sql: `
            INSERT INTO settings
            (key, value)
            VALUES (?, ?)
            ON CONFLICT(key)
            DO UPDATE SET
              value = excluded.value
          `,
          args: [
            key,
            String(value ?? "")
          ]
        });
      }

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        "Settings update error:",
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
   TELEGRAM BOT API
   ========================================================= */

async function telegramRequest(
  method,
  body = {}
) {
  if (!BOT_TOKEN) {
    console.error(
      "BOT_TOKEN не задан"
    );

    return null;
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

    const data =
      await response.json();

    if (!data.ok) {
      console.error(
        `Telegram API ${method} error:`,
        data
      );
    }

    return data;
  } catch (error) {
    console.error(
      `Telegram API ${method} failed:`,
      error
    );

    return null;
  }
}

let telegramOffset = 0;
let telegramPolling = false;

async function setupTelegramBot() {
  if (!BOT_TOKEN) {
    console.log(
      "BOT_TOKEN не задан — Telegram bot disabled"
    );

    return;
  }

  const webAppUrl =
    MINIAPP_URL;

  if (!webAppUrl) {
    console.error(
      "MINIAPP_URL не задан. Telegram Mini App не сможет открыться."
    );

    return;
  }

  await telegramRequest(
    "deleteWebhook",
    {
      drop_pending_updates: false
    }
  );

  await telegramRequest(
    "setMyCommands",
    {
      commands: [
        {
          command: "start",
          description:
            "Открыть iroom"
        }
      ]
    }
  );

  console.log(
    "Telegram bot configured"
  );

  console.log(
    "Mini App URL:",
    webAppUrl
  );

  startTelegramPolling(
    webAppUrl
  );
}

async function startTelegramPolling(
  webAppUrl
) {
  if (telegramPolling) {
    return;
  }

  telegramPolling = true;

  console.log(
    "Telegram polling started"
  );

  while (telegramPolling) {
    try {
      const result =
        await telegramRequest(
          "getUpdates",
          {
            offset:
              telegramOffset,

            timeout: 25,

            allowed_updates: [
              "message"
            ]
          }
        );

      if (!result?.ok) {
        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              5000
            )
        );

        continue;
      }

      const updates =
        result.result || [];

      for (
        const update
        of updates
      ) {
        telegramOffset =
          update.update_id + 1;

        const message =
          update.message;

        if (!message) {
          continue;
        }

        const chatId =
          message.chat?.id;

        if (!chatId) {
          continue;
        }

        const text =
          String(
            message.text || ""
          ).trim();

        if (
          text === "/start" ||
          text.startsWith(
            "/start "
          )
        ) {
          await telegramRequest(
            "sendMessage",
            {
              chat_id: chatId,

              text:
                "Добро пожаловать в iroom 🍎\n\n" +
                "Выберите товар и забронируйте его прямо в приложении.",

              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text:
                        "Открыть iroom",

                      web_app: {
                        url:
                          webAppUrl
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
        "Telegram polling error:",
        error
      );

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            5000
          )
      );
    }
  }
}

/* =========================================================
   STATIC
   ========================================================= */

app.use(
  express.static(
    path.join(
      __dirname,
      "public"
    )
  )
);

/* =========================================================
   ROUTES
   ========================================================= */

app.get(
  "/admin",
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        "public",
        "admin.html"
      )
    );
  }
);

/*
  Express 5:
  безопасный fallback для Mini App.
*/

app.use(
  (req, res, next) => {
    if (
      req.method !== "GET"
    ) {
      return next();
    }

    if (
      req.path.startsWith(
        "/api/"
      )
    ) {
      return res.status(404).json({
        ok: false,
        error:
          "API route not found"
      });
    }

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
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
    console.error(error);

    if (
      error instanceof
      multer.MulterError
    ) {
      return res.status(400).json({
        ok: false,
        error:
          "Ошибка загрузки файла"
      });
    }

    if (
      error.message ===
      "Разрешены только изображения"
    ) {
      return res.status(400).json({
        ok: false,
        error:
          error.message
      });
    }

    res.status(500).json({
      ok: false,
      error:
        "Внутренняя ошибка сервера"
    });
  }
);

/* =========================================================
   START SERVER
   ========================================================= */

initDatabase()
  .then(() => {
    app.listen(
      PORT,
      async () => {
        console.log(
          `iroom started on port ${PORT}`
        );

        await setupTelegramBot();
      }
    );
  })
  .catch(error => {
    console.error(
      "Database initialization failed:",
      error
    );

    process.exit(1);
  });