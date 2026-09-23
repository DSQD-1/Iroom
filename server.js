const express = require("express");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { createClient } = require("@libsql/client");

const app = express();

/* =========================================================
   CONFIG
========================================================= */

const PORT = process.env.PORT || 10000;

const TURSO_DATABASE_URL =
  process.env.TURSO_DATABASE_URL || "";

const TURSO_AUTH_TOKEN =
  process.env.TURSO_AUTH_TOKEN || "";

const BOT_TOKEN =
  process.env.BOT_TOKEN || "";

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY || "";

const OPENAI_MODEL =
  process.env.OPENAI_MODEL || "gpt-5.6-luna";

const ADMIN_ID =
  process.env.ADMIN_ID
    ? String(process.env.ADMIN_ID)
    : "";

const SECOND_ADMIN_ID = "5975037118";

const STORE_NAME = "iroom";
const CONTACT_USERNAME = "iroom_24";

const MINIAPP_URL =
  process.env.MINIAPP_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  "";

if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  console.error(
    "TURSO_DATABASE_URL или TURSO_AUTH_TOKEN не заданы"
  );
}

if (!OPENAI_API_KEY) {
  console.warn(
    "OPENAI_API_KEY не задан — AI будет отключён."
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
    limit: "30mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "30mb"
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
        new Error("Разрешены только изображения")
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

    const receivedBuffer = Buffer.from(
      receivedHash,
      "hex"
    );

    const calculatedBuffer = Buffer.from(
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

    const userString = params.get("user");

    if (!userString) {
      return null;
    }

    return JSON.parse(userString);
  } catch (error) {
    console.error(
      "Telegram auth error:",
      error.message
    );

    return null;
  }
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

  return validateTelegramInitData(initData);
}

/* =========================================================
   ADMIN ACCESS
========================================================= */

function isAdminTelegramId(telegramId) {
  if (!telegramId) {
    return false;
  }

  const id = String(telegramId);

  return (
    id === String(ADMIN_ID) ||
    id === SECOND_ADMIN_ID
  );
}

async function requireAdmin(req, res, next) {
  try {
    const telegramUser = getTelegramUser(req);

    if (!telegramUser || !telegramUser.id) {
      return res.status(401).json({
        ok: false,
        error:
          "Invalid Telegram Mini App authorization"
      });
    }

    if (!isAdminTelegramId(telegramUser.id)) {
      return res.status(403).json({
        ok: false,
        error: "Admin access denied"
      });
    }

    req.telegramUser = telegramUser;

    next();
  } catch (error) {
    console.error(
      "Admin auth error:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: "Authorization error"
    });
  }
}

/* =========================================================
   DATABASE HELPERS
========================================================= */

async function addColumnIfMissing(
  table,
  column,
  definition
) {
  try {
    await db.execute(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
    );

    console.log(
      `DB migration: added ${table}.${column}`
    );
  } catch (error) {
    const message =
      String(error.message || "").toLowerCase();

    if (
      !message.includes("duplicate column") &&
      !message.includes("already exists")
    ) {
      console.error(
        `Migration ${table}.${column}:`,
        error.message
      );
    }
  }
}

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
      },

      {
        sql: `
          CREATE TABLE IF NOT EXISTS system_flags (
            key TEXT PRIMARY KEY,
            value TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `
      }
    ],
    "write"
  );

  await addColumnIfMissing(
    "products",
    "region",
    "TEXT"
  );

  await addColumnIfMissing(
    "products",
    "sim_type",
    "TEXT"
  );

  await addColumnIfMissing(
    "products",
    "price_max",
    "INTEGER"
  );

  await addColumnIfMissing(
    "products",
    "foreign_price",
    "INTEGER"
  );

  await addColumnIfMissing(
    "products",
    "price_type",
    "TEXT DEFAULT 'fixed'"
  );

  const categoryCount = await db.execute(`
    SELECT COUNT(*) AS count
    FROM categories
  `);

  if (
    Number(categoryCount.rows[0].count) === 0
  ) {
    const categories = [
      ["iPhone", "iphone", 1],
      ["iPad", "ipad", 2],
      ["Mac", "mac", 3],
      ["Apple Watch", "apple-watch", 4],
      ["AirPods", "airpods", 5]
    ];

    await db.batch(
      categories.map(
        ([name, slug, sortOrder]) => ({
          sql: `
            INSERT INTO categories
            (
              name,
              slug,
              sort_order,
              active
            )
            VALUES (?, ?, ?, 1)
          `,
          args: [
            name,
            slug,
            sortOrder
          ]
        })
      ),
      "write"
    );
  }

  await db.execute({
    sql: `
      INSERT OR IGNORE INTO settings
      (
        key,
        value
      )
      VALUES (?, ?)
    `,
    args: [
      "store_name",
      STORE_NAME
    ]
  });

  await db.execute({
    sql: `
      INSERT OR IGNORE INTO settings
      (
        key,
        value
      )
      VALUES (?, ?)
    `,
    args: [
      "contact_username",
      CONTACT_USERNAME
    ]
  });

  console.log(
    "Turso database initialized"
  );
}

/* =========================================================
   NORMALIZATION
========================================================= */

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizePrice(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const digits = String(value).replace(
    /[^\d]/g,
    ""
  );

  if (!digits) {
    return null;
  }

  const number = Number(digits);

  return Number.isFinite(number)
    ? number
    : null;
}

function makeCategorySlug(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
}

/* =========================================================
   PRODUCT KEY
========================================================= */

function productKey(product, categoryId) {
  return [
    categoryId,
    normalize(product.name),
    normalize(product.memory),
    normalize(product.color),
    normalize(product.region),
    normalize(
      product.sim_type ||
        product.simType
    ),
    normalize(product.version),
    product.price ?? "",
    product.price_max ??
      product.priceMax ??
      ""
  ].join("|");
}

/* =========================================================
   CATEGORY
========================================================= */

async function getOrCreateCategory(
  categoryName
) {
  const cleanName =
    String(categoryName || "Другое").trim();

  const existing = await db.execute({
    sql: `
      SELECT id, name, slug
      FROM categories
      WHERE lower(name) = lower(?)
      LIMIT 1
    `,
    args: [cleanName]
  });

  if (existing.rows.length) {
    return existing.rows[0];
  }

  let slug = makeCategorySlug(cleanName);

  if (!slug) {
    slug = "category";
  }

  let finalSlug = slug;
  let counter = 2;

  while (true) {
    const check = await db.execute({
      sql: `
        SELECT id
        FROM categories
        WHERE slug = ?
        LIMIT 1
      `,
      args: [finalSlug]
    });

    if (check.rows.length === 0) {
      break;
    }

    finalSlug = `${slug}-${counter}`;
    counter++;
  }

  const maxSort = await db.execute(`
    SELECT
      COALESCE(MAX(sort_order), 0) AS max_sort
    FROM categories
  `);

  const sortOrder =
    Number(maxSort.rows[0].max_sort || 0) + 1;

  await db.execute({
    sql: `
      INSERT INTO categories
      (
        name,
        slug,
        sort_order,
        active
      )
      VALUES (?, ?, ?, 1)
    `,
    args: [
      cleanName,
      finalSlug,
      sortOrder
    ]
  });

  const inserted = await db.execute({
    sql: `
      SELECT id, name, slug
      FROM categories
      WHERE slug = ?
      LIMIT 1
    `,
    args: [finalSlug]
  });

  return inserted.rows[0];
}

/* =========================================================
   EXISTING PRODUCTS
========================================================= */

async function loadExistingProducts() {
  const result = await db.execute(`
    SELECT
      id,
      name,
      memory,
      color,
      region,
      sim_type,
      version,
      price,
      price_max,
      category_id
    FROM products
  `);

  const existing = new Set();

  for (const row of result.rows) {
    existing.add(
      productKey(
        row,
        row.category_id
      )
    );
  }

  return existing;
}

/* =========================================================
   INSERT PRODUCT
========================================================= */

async function insertProduct(
  product,
  categoryId
) {
  const price =
    normalizePrice(product.price);

  const priceMax =
    normalizePrice(
      product.price_max ??
        product.priceMax
    );

  const foreignPrice =
    normalizePrice(
      product.foreign_price ??
        product.foreignPrice
    );

  const priceType =
    String(
      product.price_type ??
        product.priceType ??
        "fixed"
    ).trim();

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
        region,
        sim_type,
        price_max,
        foreign_price,
        price_type,
        updated_at
      )
      VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    args: [
      String(product.name || "").trim(),

      String(product.memory || "").trim(),

      String(product.color || "").trim(),

      String(product.version || "").trim(),

      price ?? 0,

      String(product.image_url || ""),

      categoryId,

      Number(product.is_new) === 1
        ? 1
        : 0,

      Number(product.new_sort_order || 0),

      Number(product.active) === 0
        ? 0
        : 1,

      String(product.region || "").trim(),

      String(
        product.sim_type ||
          product.simType ||
          ""
      ).trim(),

      priceMax,

      foreignPrice,

      priceType
    ]
  });
}

/* =========================================================
   OLD PRICE LIST
========================================================= */

async function importPriceListOnce() {
  let priceList;

  try {
    priceList = require("./price-list");
  } catch {
    console.log(
      "price-list.js не найден — старый импорт пропущен."
    );

    return {
      ok: true,
      skipped: true
    };
  }

  if (!Array.isArray(priceList)) {
    return {
      ok: false,
      skipped: true
    };
  }

  const flag = await db.execute({
    sql: `
      SELECT value
      FROM system_flags
      WHERE key = ?
      LIMIT 1
    `,
    args: ["price_list_imported"]
  });

  if (
    flag.rows.length &&
    String(flag.rows[0].value) === "1"
  ) {
    console.log(
      "PRICE LIST: уже импортирован"
    );

    return {
      ok: true,
      alreadyImported: true
    };
  }

  const existing =
    await loadExistingProducts();

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const product of priceList) {
    try {
      const category =
        await getOrCreateCategory(
          product.category || "Другое"
        );

      const key = productKey(
        product,
        category.id
      );

      if (existing.has(key)) {
        skipped++;
        continue;
      }

      await insertProduct(
        product,
        category.id
      );

      existing.add(key);
      imported++;
    } catch (error) {
      errors++;

      console.error(
        "Price list import:",
        error.message
      );
    }
  }

  if (errors === 0) {
    await db.execute({
      sql: `
        INSERT INTO system_flags
        (
          key,
          value
        )
        VALUES (?, ?)
        ON CONFLICT(key)
        DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `,
      args: [
        "price_list_imported",
        "1"
      ]
    });
  }

  console.log(
    `PRICE LIST: добавлено ${imported}, дубликатов ${skipped}, ошибок ${errors}`
  );

  return {
    ok: errors === 0,
    imported,
    skipped,
    errors
  };
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
        app: STORE_NAME,
        ai:
          Boolean(OPENAI_API_KEY)
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        database: false
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
        categories: result.rows
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
   PRODUCT SELECT
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
    p.active,
    p.region,
    p.sim_type,
    p.price_max,
    p.foreign_price,
    p.price_type,
    c.name AS category_name,
    c.slug AS category_slug
  FROM products p
  LEFT JOIN categories c
    ON c.id = p.category_id
`;

/* =========================================================
   PUBLIC PRODUCTS
========================================================= */

app.get(
  "/api/products",
  async (req, res) => {
    try {
      const category =
        req.query.category;

      let result;

      if (category) {
        result = await db.execute({
          sql: `
            ${productSelect}
            WHERE p.active = 1
              AND c.slug = ?
            ORDER BY
              p.id DESC
          `,
          args: [category]
        });
      } else {
        result = await db.execute(`
          ${productSelect}
          WHERE p.active = 1
          ORDER BY
            p.id DESC
        `);
      }

      res.json({
        ok: true,
        products: result.rows
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

/* =========================================================
   NEW PRODUCTS
========================================================= */

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
        products: result.rows
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

/* =========================================================
   SINGLE PRODUCT
========================================================= */

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

      if (result.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          error: "Товар не найден"
        });
      }

      res.json({
        ok: true,
        product: result.rows[0]
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
  (req, res) => {
    res.json({
      ok: true,
      settings: {
        store_name: STORE_NAME,
        contact_username:
          CONTACT_USERNAME
      }
    });
  }
);

/* =========================================================
   IMAGES
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
          error: "Файл не выбран"
        });
      }

      const result =
        await db.execute({
          sql: `
            INSERT INTO images
            (
              mime_type,
              image_data
            )
            VALUES (?, ?)
          `,
          args: [
            req.file.mimetype,
            req.file.buffer
          ]
        });

      const imageId =
        Number(result.lastInsertRowid);

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

      if (result.rows.length === 0) {
        return res.status(404).send(
          "Image not found"
        );
      }

      const row = result.rows[0];

      res.setHeader(
        "Content-Type",
        row.mime_type
      );

      res.setHeader(
        "Cache-Control",
        "public, max-age=31536000, immutable"
      );

      res.end(
        Buffer.from(row.image_data)
      );
    } catch (error) {
      console.error(error);

      res.status(500).send(
        "Image error"
      );
    }
  }
);

function extractImageId(imageUrl) {
  if (!imageUrl) {
    return null;
  }

  const match = String(imageUrl).match(
    /\/api\/images\/(\d+)/
  );

  return match
    ? Number(match[1])
    : null;
}

async function deleteImageByUrl(
  imageUrl
) {
  const imageId =
    extractImageId(imageUrl);

  if (!imageId) {
    return;
  }

  await db.execute({
    sql: `
      DELETE FROM images
      WHERE id = ?
    `,
    args: [imageId]
  });
}

/* =========================================================
   ADMIN ME
========================================================= */

app.get(
  "/api/admin/me",
  requireAdmin,
  (req, res) => {
    res.json({
      ok: true,
      admin: true,
      user: {
        id: req.telegramUser.id,
        first_name:
          req.telegramUser.first_name || "",
        last_name:
          req.telegramUser.last_name || "",
        username:
          req.telegramUser.username || ""
      },
      ai: Boolean(OPENAI_API_KEY)
    });
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
          ${productSelect}
          ORDER BY
            p.id DESC
        `);

      res.json({
        ok: true,
        products: result.rows
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
        active,
        region,
        sim_type,
        price_max,
        foreign_price,
        price_type
      } = req.body;

      if (
        !name ||
        !String(name).trim()
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Название товара обязательно"
        });
      }

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
            region,
            sim_type,
            price_max,
            foreign_price,
            price_type,
            updated_at
          )
          VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
        args: [
          String(name).trim(),
          memory || "",
          color || "",
          version || "",
          Number(price || 0),
          image_url || "",
          category_id === "" ||
          category_id === null ||
          category_id === undefined
            ? null
            : Number(category_id),
          Number(is_new) === 1 ? 1 : 0,
          Number(new_sort_order || 0),
          Number(active) === 0 ? 0 : 1,
          region || "",
          sim_type || "",
          normalizePrice(price_max),
          normalizePrice(foreign_price),
          price_type || "fixed"
        ]
      });

      res.json({
        ok: true
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
        active,
        region,
        sim_type,
        price_max,
        foreign_price,
        price_type
      } = req.body;

      if (
        !name ||
        !String(name).trim()
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Название товара обязательно"
        });
      }

      const oldProduct =
        await db.execute({
          sql: `
            SELECT image_url
            FROM products
            WHERE id = ?
            LIMIT 1
          `,
          args: [req.params.id]
        });

      if (oldProduct.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          error: "Товар не найден"
        });
      }

      const oldImage =
        oldProduct.rows[0].image_url || "";

      const newImage =
        image_url || "";

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
            region = ?,
            sim_type = ?,
            price_max = ?,
            foreign_price = ?,
            price_type = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        args: [
          String(name).trim(),
          memory || "",
          color || "",
          version || "",
          Number(price || 0),
          newImage,
          category_id === "" ||
          category_id === null ||
          category_id === undefined
            ? null
            : Number(category_id),
          Number(is_new) === 1 ? 1 : 0,
          Number(new_sort_order || 0),
          Number(active) === 0 ? 0 : 1,
          region || "",
          sim_type || "",
          normalizePrice(price_max),
          normalizePrice(foreign_price),
          price_type || "fixed",
          req.params.id
        ]
      });

      if (
        oldImage &&
        oldImage !== newImage
      ) {
        await deleteImageByUrl(
          oldImage
        );
      }

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
      const product =
        await db.execute({
          sql: `
            SELECT image_url
            FROM products
            WHERE id = ?
            LIMIT 1
          `,
          args: [req.params.id]
        });

      if (product.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          error: "Товар не найден"
        });
      }

      const imageUrl =
        product.rows[0].image_url || "";

      await db.execute({
        sql: `
          DELETE FROM products
          WHERE id = ?
        `,
        args: [req.params.id]
      });

      if (imageUrl) {
        await deleteImageByUrl(
          imageUrl
        );
      }

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
        categories: result.rows
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
        !String(name).trim()
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
        String(slug || cleanName)
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(
            /[^a-z0-9а-яё-]/gi,
            ""
          );

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
          Number(sort_order || 0),
          Number(active) === 0 ? 0 : 1
        ]
      });

      res.json({
        ok: true
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
        !String(name).trim()
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
        String(slug || cleanName)
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
          Number(sort_order || 0),
          Number(active) === 0 ? 0 : 1,
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
          args: [req.params.id]
        });

      if (
        Number(products.rows[0].count) > 0
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
        args: [req.params.id]
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
   OPENAI
========================================================= */

const PRICE_PARSER_SCHEMA = {
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

          memory: {
            type: "string"
          },

          color: {
            type: "string"
          },

          region: {
            type: "string"
          },

          sim_type: {
            type: "string"
          },

          price: {
            type: [
              "integer",
              "null"
            ]
          },

          price_type: {
            type: "string"
          },

          price_max: {
            type: [
              "integer",
              "null"
            ]
          },

          foreign_price: {
            type: [
              "integer",
              "null"
            ]
          },

          version: {
            type: "string"
          },

          is_new: {
            type: "integer"
          }
        },

        required: [
          "name",
          "category",
          "memory",
          "color",
          "region",
          "sim_type",
          "price",
          "price_type",
          "price_max",
          "foreign_price",
          "version",
          "is_new"
        ]
      }
    }
  },

  required: [
    "products"
  ]
};

function openAIParserPrompt() {
  return `
Ты — AI-парсер прайс-листов магазина iroom.

Твоя задача — разобрать переданный текст
и создать отдельный объект для КАЖДОЙ
позиции, у которой есть цена.

Нельзя:
- пропускать строки;
- объединять разные цвета;
- объединять разные регионы;
- объединять разную память;
- объединять разные цены;
- придумывать товары;
- придумывать цены.

Если выше группы товаров находится заголовок модели,
используй его для определения name.

Например:

iPhone 17 Pro Max

🇯🇵 17 Pro Max 512GB Orange - 123.800

Результат:

name = iPhone 17 Pro Max
category = iPhone
memory = 512GB
color = Orange
region = 🇯🇵 Japan
price = 123800

Регионы:

🇯🇵 = Japan
🇺🇸 = USA
🇮🇳 = India
🇭🇰 = Hong Kong
🇨🇳 = China

Правила SIM:

🇯🇵 и 🇺🇸 = eSIM + eSIM
🇮🇳 и 🇭🇰 = SIM + eSIM
🇨🇳 = SIM + SIM

Если строка явно говорит eSim,
используй eSIM.

Память сохраняй как:
256GB
512GB
1TB
2TB

Цвет сохраняй без перевода:
Black
White
Orange
Blue
Pink
Soft Pink
Silver
Gold
и т.д.

Цена:
65.200 = 65200
123.800 = 123800
1.025.000 = 1025000

"от 100.000":
price = 100000
price_type = from

"по запросу":
price = null
price_type = request

Если верхняя граница цены указана,
запиши её в price_max.

Категории:

iPhone → iPhone
iPad → iPad
Mac / MacBook → Mac
Apple Watch → Apple Watch
AirPods → AirPods
Dyson → Dyson
PlayStation / PS5 → PlayStation
Xbox → Xbox
Nintendo → Nintendo
Samsung → Android
Xiaomi / Redmi / POCO → Android
Google Pixel → Android
OnePlus → Android
Honor / Huawei → Android

Остальное классифицируй логично.

is_new = 1 только если позиция находится
в блоке новинок или явно обозначена как новая.

version используй только для дополнительной
информации, которую нельзя поместить
в другие поля.

Не добавляй текстовые комментарии.
Верни только данные согласно JSON-схеме.
`;
}

async function callOpenAI({
  instructions,
  input,
  schema,
  schemaName
}) {
  if (!OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY не задан в Render"
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
        store: false,
        instructions,
        input,

        text: schema
          ? {
              format: {
                type: "json_schema",
                name: schemaName,
                strict: true,
                schema
              }
            }
          : undefined
      })
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    console.error(
      "OpenAI error:",
      JSON.stringify(
        data,
        null,
        2
      )
    );

    throw new Error(
      data?.error?.message ||
        "Ошибка OpenAI API"
    );
  }

  return data;
}

/* =========================================================
   PRICE PARSER
========================================================= */

async function parsePriceListWithAI(
  rawText
) {
  const data =
    await callOpenAI({
      instructions:
        openAIParserPrompt(),

      input: rawText,

      schema:
        PRICE_PARSER_SCHEMA,

      schemaName:
        "iroom_price_list"
    });

  const outputText =
    data.output_text || "";

  if (!outputText) {
    throw new Error(
      "OpenAI не вернул результат"
    );
  }

  let parsed;

  try {
    parsed =
      JSON.parse(outputText);
  } catch {
    console.error(
      "AI JSON parse error:",
      outputText
    );

    throw new Error(
      "ИИ вернул некорректный JSON"
    );
  }

  if (
    !Array.isArray(
      parsed.products
    )
  ) {
    throw new Error(
      "ИИ не вернул массив товаров"
    );
  }

  return parsed.products;
}

/* =========================================================
   CLEAN AI PRODUCT
========================================================= */

function cleanAIProduct(product) {
  const clean = {
    name:
      String(product.name || "").trim(),

    category:
      String(
        product.category || "Другое"
      ).trim(),

    memory:
      String(product.memory || "").trim(),

    color:
      String(product.color || "").trim(),

    region:
      String(product.region || "").trim(),

    sim_type:
      String(product.sim_type || "").trim(),

    price:
      normalizePrice(product.price),

    price_type:
      String(
        product.price_type || "fixed"
      ).trim(),

    price_max:
      normalizePrice(
        product.price_max
      ),

    foreign_price:
      normalizePrice(
        product.foreign_price
      ),

    version:
      String(product.version || "").trim(),

    is_new:
      Number(product.is_new) === 1
        ? 1
        : 0,

    active: 1
  };

  const regionMap = {
    "🇯🇵": "🇯🇵 Japan",
    "🇭🇰": "🇭🇰 Hong Kong",
    "🇮🇳": "🇮🇳 India",
    "🇺🇸": "🇺🇸 USA",
    "🇨🇳": "🇨🇳 China"
  };

  if (regionMap[clean.region]) {
    clean.region =
      regionMap[clean.region];
  }

  if (!clean.sim_type) {
    if (
      clean.region.includes("🇯🇵") ||
      clean.region.includes("🇺🇸")
    ) {
      clean.sim_type =
        "eSIM + eSIM";
    } else if (
      clean.region.includes("🇮🇳") ||
      clean.region.includes("🇭🇰")
    ) {
      clean.sim_type =
        "SIM + eSIM";
    } else if (
      clean.region.includes("🇨🇳")
    ) {
      clean.sim_type =
        "SIM + SIM";
    }
  }

  if (
    clean.price === null &&
    clean.price_type === "fixed"
  ) {
    clean.price_type = "request";
  }

  return clean;
}

/* =========================================================
   AI MASS IMPORT
========================================================= */

async function importProductsFromAI(
  aiProducts
) {
  const existing =
    await loadExistingProducts();

  let added = 0;
  let duplicates = 0;
  let errors = 0;

  const addedProducts = [];
  const duplicateProducts = [];
  const errorProducts = [];

  for (
    const rawProduct of aiProducts
  ) {
    try {
      const product =
        cleanAIProduct(
          rawProduct
        );

      if (!product.name) {
        errors++;

        errorProducts.push(
          "товар без названия"
        );

        continue;
      }

      const category =
        await getOrCreateCategory(
          product.category
        );

      const key =
        productKey(
          product,
          category.id
        );

      if (existing.has(key)) {
        duplicates++;

        duplicateProducts.push(
          product
        );

        continue;
      }

      await insertProduct(
        product,
        category.id
      );

      existing.add(key);

      added++;

      addedProducts.push(
        product
      );
    } catch (error) {
      errors++;

      errorProducts.push(
        `${
          rawProduct?.name ||
          "товар"
        }: ${
          error.message
        }`
      );

      console.error(
        "AI import error:",
        error
      );
    }
  }

  return {
    added,
    duplicates,
    errors,
    addedProducts,
    duplicateProducts,
    errorProducts
  };
}

/* =========================================================
   AI CATALOG CONTEXT
========================================================= */

async function getCatalogForAI() {
  const result =
    await db.execute(`
      SELECT
        p.id,
        p.name,
        p.memory,
        p.color,
        p.region,
        p.sim_type,
        p.price,
        p.price_max,
        p.price_type,
        c.name AS category
      FROM products p
      LEFT JOIN categories c
        ON c.id = p.category_id
      WHERE p.active = 1
      ORDER BY
        p.id DESC
      LIMIT 500
    `);

  return result.rows;
}

function formatCatalogForAI(
  products
) {
  return products
    .map((product) => {
      return [
        `ID: ${product.id}`,
        `Название: ${product.name}`,
        `Категория: ${
          product.category || ""
        }`,
        `Память: ${
          product.memory || ""
        }`,
        `Цвет: ${
          product.color || ""
        }`,
        `Регион: ${
          product.region || ""
        }`,
        `SIM: ${
          product.sim_type || ""
        }`,
        `Цена: ${
          product.price ?? ""
        }`,
        `Цена до: ${
          product.price_max ?? ""
        }`,
        `Тип цены: ${
          product.price_type || ""
        }`
      ].join(" | ");
    })
    .join("\n");
}

/* =========================================================
   AI CUSTOMER CHAT
========================================================= */

async function answerCustomerWithAI(
  userMessage
) {
  const products =
    await getCatalogForAI();

  const catalog =
    formatCatalogForAI(
      products
    );

  const instructions = `
Ты — AI-консультант магазина iroom.

Отвечай на русском языке.

Тебе доступен реальный каталог магазина.

Правила:
1. Не придумывай товары.
2. Не придумывай цены.
3. Не придумывай характеристики.
4. Если товара нет в каталоге — честно скажи.
5. Если пользователь спрашивает варианты,
   перечисляй реальные варианты.
6. Цены бери только из каталога.
7. Не утверждай, что товар есть в наличии,
   если этого поля нет.
8. Отвечай коротко и понятно.
9. Если пользователь просит подобрать товар,
   используй только товары из каталога.

КАТАЛОГ:
${catalog}
`;

  const data =
    await callOpenAI({
      instructions,
      input: userMessage
    });

  return (
    data.output_text ||
    "Не удалось получить ответ."
  );
}

/* =========================================================
   AI ADMIN CHAT
========================================================= */

const ADMIN_ACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,

  properties: {
    action: {
      type: "string",
      enum: [
        "chat",
        "import_price_list",
        "update_price",
        "make_new",
        "remove_product",
        "activate_product",
        "deactivate_product"
      ]
    },

    reply: {
      type: "string"
    },

    price_list: {
      type: "string"
    },

    product_id: {
      type: [
        "integer",
        "null"
      ]
    },

    price: {
      type: [
        "integer",
        "null"
      ]
    },

    product_name: {
      type: "string"
    }
  },

  required: [
    "action",
    "reply",
    "price_list",
    "product_id",
    "price",
    "product_name"
  ]
};

async function parseAdminCommand(
  message
) {
  const products =
    await getCatalogForAI();

  const catalog =
    formatCatalogForAI(
      products
    );

  const instructions = `
Ты — AI-администратор магазина iroom.

Администратор может:
- загрузить целый прайс;
- изменить цену;
- сделать товар новинкой;
- удалить товар;
- включить товар;
- выключить товар;
- просто задать вопрос.

Текущий каталог:

${catalog}

Определи действие.

ВАЖНО:
Если администратор просто вставил большой
многострочный прайс с ценами, action должен быть:

import_price_list

В price_list положи исходный текст прайса.

Если пользователь просит изменить цену
конкретного товара и ты можешь однозначно
определить product_id из каталога:
action = update_price

Если просит сделать товар новинкой:
action = make_new

Если просит удалить:
action = remove_product

Если просит включить:
action = activate_product

Если просит выключить:
action = deactivate_product

Если это обычный вопрос:
action = chat

Не придумывай ID товара.
Не придумывай цену.

reply должен быть коротким ответом
администратору.
`;

  const data =
    await callOpenAI({
      instructions,
      input: message,
      schema:
        ADMIN_ACTION_SCHEMA,
      schemaName:
        "iroom_admin_action"
    });

  const outputText =
    data.output_text || "";

  if (!outputText) {
    throw new Error(
      "AI не вернул действие"
    );
  }

  return JSON.parse(outputText);
}

/* =========================================================
   AI ADMIN ACTION EXECUTOR
========================================================= */

async function executeAdminAIAction(
  action
) {
  switch (action.action) {
    case "import_price_list": {
      const parsed =
        await parsePriceListWithAI(
          action.price_list
        );

      if (!parsed.length) {
        return {
          ok: false,
          message:
            "В прайсе не найдено товаров с ценами."
        };
      }

      const result =
        await importProductsFromAI(
          parsed
        );

      return {
        ok: true,
        message:
          `Прайс обработан.\n\n` +
          `Найдено: ${parsed.length}\n` +
          `Добавлено: ${result.added}\n` +
          `Дубликатов: ${result.duplicates}\n` +
          `Ошибок: ${result.errors}`,

        result
      };
    }

    case "update_price": {
      if (!action.product_id) {
        return {
          ok: false,
          message:
            "Не удалось определить товар."
        };
      }

      if (
        action.price === null ||
        action.price === undefined
      ) {
        return {
          ok: false,
          message:
            "Не удалось определить новую цену."
        };
      }

      const result =
        await db.execute({
          sql: `
            UPDATE products
            SET
              price = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
          args: [
            Number(action.price),
            Number(action.product_id)
          ]
        });

      if (
        Number(
          result.rowsAffected || 0
        ) === 0
      ) {
        return {
          ok: false,
          message:
            "Товар не найден."
        };
      }

      return {
        ok: true,
        message:
          `Цена изменена на ${Number(
            action.price
          ).toLocaleString(
            "ru-RU"
          )} ₽.`
      };
    }

    case "make_new": {
      if (!action.product_id) {
        return {
          ok: false,
          message:
            "Не удалось определить товар."
        };
      }

      await db.execute({
        sql: `
          UPDATE products
          SET
            is_new = 1,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        args: [
          Number(action.product_id)
        ]
      });

      return {
        ok: true,
        message:
          "Товар добавлен в новинки."
      };
    }

    case "remove_product": {
      if (!action.product_id) {
        return {
          ok: false,
          message:
            "Не удалось определить товар."
        };
      }

      const product =
        await db.execute({
          sql: `
            SELECT image_url
            FROM products
            WHERE id = ?
            LIMIT 1
          `,
          args: [
            Number(
              action.product_id
            )
          ]
        });

      if (
        product.rows.length === 0
      ) {
        return {
          ok: false,
          message:
            "Товар не найден."
        };
      }

      await db.execute({
        sql: `
          DELETE FROM products
          WHERE id = ?
        `,
        args: [
          Number(
            action.product_id
          )
        ]
      });

      if (
        product.rows[0].image_url
      ) {
        await deleteImageByUrl(
          product.rows[0]
            .image_url
        );
      }

      return {
        ok: true,
        message:
          "Товар удалён."
      };
    }

    case "activate_product": {
      if (!action.product_id) {
        return {
          ok: false,
          message:
            "Не удалось определить товар."
        };
      }

      await db.execute({
        sql: `
          UPDATE products
          SET
            active = 1,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        args: [
          Number(
            action.product_id
          )
        ]
      });

      return {
        ok: true,
        message:
          "Товар включён."
      };
    }

    case "deactivate_product": {
      if (!action.product_id) {
        return {
          ok: false,
          message:
            "Не удалось определить товар."
        };
      }

      await db.execute({
        sql: `
          UPDATE products
          SET
            active = 0,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        args: [
          Number(
            action.product_id
          )
        ]
      });

      return {
        ok: true,
        message:
          "Товар выключен."
      };
    }

    default:
      return {
        ok: true,
        message:
          action.reply || "Готово."
      };
  }
}

/* =========================================================
   AI API
========================================================= */

/*
POST /api/ai/chat

Покупатель:
{
  message: "Какой есть 17 Pro Max 512?"
}

Админ:
{
  message: "Добавь этот прайс ..."
}

Админ автоматически определяется
по Telegram ID.
*/

app.post(
  "/api/ai/chat",
  async (req, res) => {
    try {
      const message =
        String(
          req.body?.message || ""
        ).trim();

      if (!message) {
        return res.status(400).json({
          ok: false,
          error:
            "Сообщение пустое"
        });
      }

      if (message.length > 100000) {
        return res.status(400).json({
          ok: false,
          error:
            "Сообщение слишком большое"
        });
      }

      const telegramUser =
        getTelegramUser(req);

      const isAdmin =
        Boolean(
          telegramUser &&
          isAdminTelegramId(
            telegramUser.id
          )
        );

      if (isAdmin) {
        const action =
          await parseAdminCommand(
            message
          );

        if (
          action.action ===
          "chat"
        ) {
          const answer =
            await answerCustomerWithAI(
              message
            );

          return res.json({
            ok: true,
            admin: true,
            action: "chat",
            answer
          });
        }

        const result =
          await executeAdminAIAction(
            action
          );

        return res.json({
          ok: result.ok,
          admin: true,
          action:
            action.action,
          answer:
            result.message,
          result:
            result.result || null
        });
      }

      const answer =
        await answerCustomerWithAI(
          message
        );

      res.json({
        ok: true,
        admin: false,
        answer
      });
    } catch (error) {
      console.error(
        "AI chat error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message ||
          "Ошибка AI"
      });
    }
  }
);

/* =========================================================
   ADMIN AI IMPORT PREVIEW
========================================================= */

app.post(
  "/api/admin/ai/parse",
  requireAdmin,
  async (req, res) => {
    try {
      const text =
        String(
          req.body?.text || ""
        ).trim();

      if (!text) {
        return res.status(400).json({
          ok: false,
          error:
            "Прайс пустой"
        });
      }

      const products =
        await parsePriceListWithAI(
          text
        );

      res.json({
        ok: true,
        count: products.length,
        products:
          products.map(
            cleanAIProduct
          )
      });
    } catch (error) {
      console.error(
        "AI parse error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message ||
          "Не удалось разобрать прайс"
      });
    }
  }
);

/* =========================================================
   ADMIN AI IMPORT CONFIRM
========================================================= */

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
        return res.status(400).json({
          ok: false,
          error:
            "Нет товаров для импорта"
        });
      }

      const result =
        await importProductsFromAI(
          products
        );

      res.json({
        ok: true,
        ...result
      });
    } catch (error) {
      console.error(
        "AI import error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message ||
          "Не удалось импортировать товары"
      });
    }
  }
);

/* =========================================================
   TELEGRAM API
========================================================= */

async function telegramRequest(
  method,
  body = {}
) {
  if (!BOT_TOKEN) {
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

          body:
            JSON.stringify(body)
        }
      );

    return await response.json();
  } catch (error) {
    console.error(
      `Telegram API ${method} failed:`,
      error.message
    );

    return null;
  }
}

/* =========================================================
   TELEGRAM ADMIN PRICE IMPORT
========================================================= */

function isAdminMessage(message) {
  return isAdminTelegramId(
    message?.from?.id
  );
}

function formatMoney(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "по запросу";
  }

  return `${Number(
    value
  ).toLocaleString(
    "ru-RU"
  )} ₽`;
}

function productPreviewLine(product) {
  const parts = [];

  if (product.region) {
    parts.push(
      product.region
    );
  }

  if (product.memory) {
    parts.push(
      product.memory
    );
  }

  if (product.color) {
    parts.push(
      product.color
    );
  }

  return `• ${
    product.name
  }${
    parts.length
      ? ` · ${parts.join(" · ")}`
      : ""
  } — ${formatMoney(
    product.price
  )}`;
}

async function handleAdminPriceMessage(
  message
) {
  const chatId =
    message.chat?.id;

  const text =
    String(
      message.text || ""
    ).trim();

  if (
    !chatId ||
    !text
  ) {
    return false;
  }

  if (
    text === "/start" ||
    text.startsWith("/start ")
  ) {
    return false;
  }

  if (
    !isAdminMessage(message)
  ) {
    return false;
  }

  if (
    text === "/ai" ||
    text === "/help"
  ) {
    await telegramRequest(
      "sendMessage",
      {
        chat_id: chatId,

        text:
          "🤖 AI-админ iroom\n\n" +
          "Просто отправь целый прайс одним сообщением.\n\n" +
          "Например:\n\n" +
          "🇯🇵 17 Pro Max 512GB Orange - 123.800\n" +
          "🇭🇰 17 Pro Max 512GB Orange - 134.200\n\n" +
          "ИИ разберёт модели, память, цвет, регион, SIM/eSIM и цены.\n\n" +
          "Также можно писать команды:\n" +
          "«Поставь iPhone 17 256GB Black цену 84900»\n" +
          "«Сделай этот товар новинкой»\n" +
          "«Удалить товар 123»"
      }
    );

    return true;
  }

  if (text.length < 15) {
    return false;
  }

  await telegramRequest(
    "sendMessage",
    {
      chat_id: chatId,

      text:
        "⏳ Разбираю сообщение с помощью AI..."
    }
  );

  try {
    const action =
      await parseAdminCommand(
        text
      );

    if (
      action.action === "chat"
    ) {
      await telegramRequest(
        "sendMessage",
        {
          chat_id: chatId,
          text:
            action.reply ||
            "Готово."
        }
      );

      return true;
    }

    const result =
      await executeAdminAIAction(
        action
      );

    let responseText =
      result.message;

    if (
      result.result?.addedProducts
        ?.length
    ) {
      responseText +=
        "\n\nДобавлено:";

      for (
        const product of
          result.result
            .addedProducts
            .slice(0, 20)
      ) {
        responseText +=
          `\n${productPreviewLine(
            product
          )}`;
      }

      const total =
        result.result
          .addedProducts
          .length;

      if (total > 20) {
        responseText +=
          `\n\n...и ещё ${
            total - 20
          }`;
      }
    }

    await telegramRequest(
      "sendMessage",
      {
        chat_id: chatId,
        text:
          responseText
      }
    );

    return true;
  } catch (error) {
    console.error(
      "Telegram AI error:",
      error
    );

    await telegramRequest(
      "sendMessage",
      {
        chat_id: chatId,

        text:
          "❌ Ошибка AI:\n\n" +
          String(
            error.message ||
              "Неизвестная ошибка"
          )
      }
    );

    return true;
  }
}

/* =========================================================
   TELEGRAM BOT
========================================================= */

let telegramOffset = 0;
let telegramPolling = false;

async function setupTelegramBot() {
  if (!BOT_TOKEN) {
    console.log(
      "BOT_TOKEN не задан — Telegram bot disabled"
    );

    return;
  }

  if (!MINIAPP_URL) {
    console.error(
      "MINIAPP_URL не задан"
    );

    return;
  }

  await telegramRequest(
    "deleteWebhook",
    {
      drop_pending_updates:
        false
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
        },
        {
          command: "ai",
          description:
            "AI администратор"
        },
        {
          command: "help",
          description:
            "Помощь"
        }
      ]
    }
  );

  console.log(
    "Telegram bot configured"
  );

  console.log(
    "Mini App URL:",
    MINIAPP_URL
  );

  console.log(
    "AI:",
    OPENAI_API_KEY
      ? "enabled"
      : "disabled"
  );

  startTelegramPolling(
    MINIAPP_URL
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
          (resolve) =>
            setTimeout(
              resolve,
              5000
            )
        );

        continue;
      }

      for (
        const update of
          result.result || []
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
          text.startsWith("/start ")
        ) {
          await telegramRequest(
            "sendMessage",
            {
              chat_id: chatId,

              text:
                "Добро пожаловать в iroom 🍎\n\n" +
                "Откройте магазин:",

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

          continue;
        }

        if (
          isAdminMessage(
            message
          )
        ) {
          await handleAdminPriceMessage(
            message
          );
        }
      }
    } catch (error) {
      console.error(
        "Telegram polling error:",
        error
      );

      await new Promise(
        (resolve) =>
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
   ADMIN PAGE
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

/* =========================================================
   FALLBACK
========================================================= */

app.use(
  (req, res, next) => {
    if (req.method !== "GET") {
      return next();
    }

    if (
      req.path.startsWith("/api/")
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
  (error, req, res, next) => {
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
        error.message ||
        "Внутренняя ошибка сервера"
    });
  }
);

/* =========================================================
   START
========================================================= */

initDatabase()
  .then(async () => {
    console.log(
      "Starting price list import check..."
    );

    await importPriceListOnce();

    app.listen(
      PORT,
      async () => {
        console.log(
          `iroom started on port ${PORT}`
        );

        console.log(
          "Store:",
          STORE_NAME
        );

        console.log(
          "Contact:",
          `@${CONTACT_USERNAME}`
        );

        console.log(
          "Admin 1:",
          ADMIN_ID
        );

        console.log(
          "Admin 2:",
          SECOND_ADMIN_ID
        );

        console.log(
          "OpenAI:",
          OPENAI_API_KEY
            ? "enabled"
            : "disabled"
        );

        await setupTelegramBot();
      }
    );
  })
  .catch((error) => {
    console.error(
      "Database initialization failed:",
      error
    );

    process.exit(1);
  });