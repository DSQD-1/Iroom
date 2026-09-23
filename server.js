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
  process.env.OPENAI_MODEL ||
  "gpt-5.6-luna";

const ADMIN_ID =
  process.env.ADMIN_ID
    ? String(process.env.ADMIN_ID)
    : "";

const SECOND_ADMIN_ID =
  "5975037118";

const STORE_NAME =
  "iroom";

const CONTACT_USERNAME =
  "iroom_24";

const MINIAPP_URL =
  process.env.MINIAPP_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  "";

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
    limit: "20mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "20mb"
  })
);

/* =========================================================
   MULTER
========================================================= */

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize:
      10 * 1024 * 1024
  },

  fileFilter: (
    req,
    file,
    cb
  ) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif"
    ];

    if (
      !allowed.includes(
        file.mimetype
      )
    ) {
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

function validateTelegramInitData(
  initData
) {
  if (
    !BOT_TOKEN ||
    !initData
  ) {
    return null;
  }

  try {
    const params =
      new URLSearchParams(
        initData
      );

    const receivedHash =
      params.get("hash");

    if (!receivedHash) {
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
        .update(
          dataCheckString
        )
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

    return JSON.parse(
      userString
    );
  } catch (error) {
    console.error(
      "Telegram auth error:",
      error
    );

    return null;
  }
}

function getTelegramInitData(
  req
) {
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

/* =========================================================
   ADMIN ACCESS
========================================================= */

function isAdminTelegramId(
  telegramId
) {
  if (!telegramId) {
    return false;
  }

  const id =
    String(telegramId);

  return (
    id ===
      String(ADMIN_ID) ||
    id ===
      SECOND_ADMIN_ID
  );
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
      return res
        .status(401)
        .json({
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
      return res
        .status(401)
        .json({
          ok: false,
          error:
            "Invalid Telegram Mini App authorization"
        });
    }

    if (
      !isAdminTelegramId(
        telegramUser.id
      )
    ) {
      return res
        .status(403)
        .json({
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

    res
      .status(500)
      .json({
        ok: false,
        error:
          "Authorization error"
      });
  }
}

/* =========================================================
   DATABASE
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
      String(
        error.message || ""
      ).toLowerCase();

    if (
      !message.includes(
        "duplicate column"
      ) &&
      !message.includes(
        "already exists"
      )
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

  /*
   * Новые поля для вариантов товара.
   *
   * Старые товары продолжат работать.
   */

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

  const categoryCount =
    await db.execute(
      `
        SELECT COUNT(*) AS count
        FROM categories
      `
    );

  if (
    Number(
      categoryCount.rows[0].count
    ) === 0
  ) {
    await db.batch(
      [
        [
          "iPhone",
          "iphone",
          1
        ],
        [
          "iPad",
          "ipad",
          2
        ],
        [
          "Mac",
          "mac",
          3
        ],
        [
          "Apple Watch",
          "apple-watch",
          4
        ],
        [
          "AirPods",
          "airpods",
          5
        ]
      ].map(
        ([
          name,
          slug,
          sort_order
        ]) => ({
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
            sort_order
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

function normalize(
  value
) {
  return String(
    value ?? ""
  )
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      " "
    );
}

function normalizePrice(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const digits =
    String(value)
      .replace(
        /[^\d]/g,
        ""
      );

  if (!digits) {
    return null;
  }

  const number =
    Number(digits);

  return Number.isFinite(
    number
  )
    ? number
    : null;
}

function makeCategorySlug(
  name
) {
  return String(
    name || ""
  )
    .trim()
    .toLowerCase()
    .replace(
      /[^\p{L}\p{N}]+/gu,
      "-"
    )
    .replace(
      /^-|-$/g,
      ""
    );
}

/* =========================================================
   PRODUCT KEY
========================================================= */

function productKey(
  product,
  categoryId
) {
  return [
    categoryId,
    normalize(
      product.name
    ),
    normalize(
      product.memory
    ),
    normalize(
      product.color
    ),
    normalize(
      product.region
    ),
    normalize(
      product.sim_type ||
        product.simType
    ),
    normalize(
      product.version
    ),
    product.price ??
      "",
    product.price_max ??
      product.priceMax ??
      ""
  ].join("|");
}

/* =========================================================
   CATEGORIES
========================================================= */

async function getOrCreateCategory(
  categoryName
) {
  const cleanName =
    String(
      categoryName || "Другое"
    ).trim();

  const existing =
    await db.execute({
      sql: `
        SELECT
          id,
          name,
          slug
        FROM categories
        WHERE lower(name) = lower(?)
        LIMIT 1
      `,
      args: [
        cleanName
      ]
    });

  if (
    existing.rows.length
  ) {
    return existing.rows[0];
  }

  let slug =
    makeCategorySlug(
      cleanName
    );

  if (!slug) {
    slug =
      "category";
  }

  let finalSlug =
    slug;

  let counter = 2;

  while (true) {
    const check =
      await db.execute({
        sql: `
          SELECT id
          FROM categories
          WHERE slug = ?
          LIMIT 1
        `,
        args: [
          finalSlug
        ]
      });

    if (
      check.rows.length ===
      0
    ) {
      break;
    }

    finalSlug =
      `${slug}-${counter}`;

    counter++;
  }

  const maxSort =
    await db.execute(`
      SELECT
        COALESCE(
          MAX(sort_order),
          0
        ) AS max_sort
      FROM categories
    `);

  const sortOrder =
    Number(
      maxSort.rows[0]
        .max_sort || 0
    ) + 1;

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

  const inserted =
    await db.execute({
      sql: `
        SELECT
          id,
          name,
          slug
        FROM categories
        WHERE slug = ?
        LIMIT 1
      `,
      args: [
        finalSlug
      ]
    });

  return inserted.rows[0];
}

/* =========================================================
   EXISTING PRODUCTS
========================================================= */

async function loadExistingProducts() {
  const result =
    await db.execute(`
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

  const existing =
    new Set();

  for (
    const row of
      result.rows
  ) {
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
    normalizePrice(
      product.price
    );

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
    );

  const version =
    String(
      product.version || ""
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
      String(
        product.name || ""
      ).trim(),

      String(
        product.memory || ""
      ).trim(),

      String(
        product.color || ""
      ).trim(),

      version,

      price ?? 0,

      String(
        product.image_url || ""
      ),

      categoryId,

      Number(
        product.is_new || 0
      ) === 1
        ? 1
        : 0,

      Number(
        product.new_sort_order ||
          0
      ),

      Number(
        product.active
      ) === 0
        ? 0
        : 1,

      String(
        product.region || ""
      ).trim(),

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
   OLD PRICE LIST IMPORT
========================================================= */

async function importPriceListOnce() {
  let priceList;

  try {
    priceList =
      require(
        "./price-list"
      );
  } catch (error) {
    console.log(
      "price-list.js не найден — пропускаем старый импорт."
    );

    return {
      ok: true,
      skipped: true
    };
  }

  if (
    !Array.isArray(
      priceList
    )
  ) {
    return {
      ok: false,
      skipped: true
    };
  }

  const flag =
    await db.execute({
      sql: `
        SELECT value
        FROM system_flags
        WHERE key = ?
        LIMIT 1
      `,
      args: [
        "price_list_imported"
      ]
    });

  if (
    flag.rows.length &&
    String(
      flag.rows[0].value
    ) === "1"
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

  for (
    const product of
      priceList
  ) {
    try {
      const category =
        await getOrCreateCategory(
          product.category ||
            "Другое"
        );

      const key =
        productKey(
          product,
          category.id
        );

      if (
        existing.has(key)
      ) {
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

  if (
    errors === 0
  ) {
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
    ok:
      errors === 0,
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
  async (
    req,
    res
  ) => {
    try {
      const result =
        await db.execute(
          "SELECT 1 AS ok"
        );

      res.json({
        ok: true,
        database:
          result.rows[0].ok === 1,
        app:
          STORE_NAME
      });
    } catch (error) {
      console.error(error);

      res
        .status(500)
        .json({
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
  async (
    req,
    res
  ) => {
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

      res
        .status(500)
        .json({
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
  async (
    req,
    res
  ) => {
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
              ORDER BY
                p.id DESC
            `,
            args: [
              category
            ]
          });
      } else {
        result =
          await db.execute(`
            ${productSelect}
            WHERE p.active = 1
            ORDER BY
              p.id DESC
          `);
      }

      res.json({
        ok: true,
        products:
          result.rows
      });
    } catch (error) {
      console.error(error);

      res
        .status(500)
        .json({
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
  async (
    req,
    res
  ) => {
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

      res
        .status(500)
        .json({
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
  async (
    req,
    res
  ) => {
    try {
      const result =
        await db.execute({
          sql: `
            ${productSelect}
            WHERE p.id = ?
              AND p.active = 1
            LIMIT 1
          `,
          args: [
            req.params.id
          ]
        });

      if (
        result.rows.length === 0
      ) {
        return res
          .status(404)
          .json({
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

      res
        .status(500)
        .json({
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
  (
    req,
    res
  ) => {
    res.json({
      ok: true,
      settings: {
        store_name:
          STORE_NAME,

        contact_username:
          CONTACT_USERNAME
      }
    });
  }
);

/* =========================================================
   IMAGE UPLOAD
========================================================= */

app.post(
  "/api/admin/upload",
  requireAdmin,
  upload.single("image"),
  async (
    req,
    res
  ) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "Файл не выбран"
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
        Number(
          result.lastInsertRowid
        );

      res.json({
        ok: true,
        image_id:
          imageId,
        image_url:
          `/api/images/${imageId}`
      });
    } catch (error) {
      console.error(
        "Image upload error:",
        error
      );

      res
        .status(500)
        .json({
          ok: false,
          error:
            "Не удалось сохранить изображение"
        });
    }
  }
);

/* =========================================================
   IMAGE READ
========================================================= */

app.get(
  "/api/images/:id",
  async (
    req,
    res
  ) => {
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
          args: [
            req.params.id
          ]
        });

      if (
        result.rows.length === 0
      ) {
        return res
          .status(404)
          .send(
            "Image not found"
          );
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
      console.error(error);

      res
        .status(500)
        .send(
          "Image error"
        );
    }
  }
);

/* =========================================================
   IMAGE HELPERS
========================================================= */

function extractImageId(
  imageUrl
) {
  if (!imageUrl) {
    return null;
  }

  const match =
    String(
      imageUrl
    ).match(
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
    extractImageId(
      imageUrl
    );

  if (!imageId) {
    return;
  }

  await db.execute({
    sql: `
      DELETE FROM images
      WHERE id = ?
    `,
    args: [
      imageId
    ]
  });
}

/* =========================================================
   ADMIN ME
========================================================= */

app.get(
  "/api/admin/me",
  requireAdmin,
  (
    req,
    res
  ) => {
    res.json({
      ok: true,
      admin: true,
      user: {
        id:
          req.telegramUser.id,

        first_name:
          req.telegramUser
            .first_name || "",

        last_name:
          req.telegramUser
            .last_name || "",

        username:
          req.telegramUser
            .username || ""
      }
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
    try {
      const result =
        await db.execute(`
          ${productSelect}
          ORDER BY
            p.id DESC
        `);

      res.json({
        ok: true,
        products:
          result.rows
      });
    } catch (error) {
      console.error(error);

      res
        .status(500)
        .json({
          ok: false,
          error:
            "Не удалось загрузить товары"
        });
    }
  }
);

/* =========================================================
   CREATE PRODUCT
========================================================= */

app.post(
  "/api/admin/products",
  requireAdmin,
  async (
    req,
    res
  ) => {
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
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "Название товара обязательно"
          });
      }

      const numericPrice =
        Number(
          price || 0
        );

      const numericCategory =
        category_id === "" ||
        category_id === null ||
        category_id ===
          undefined
          ? null
          : Number(
              category_id
            );

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
          numericPrice,
          image_url || "",
          numericCategory,
          Number(is_new) === 1
            ? 1
            : 0,
          Number(
            new_sort_order || 0
          ),
          Number(active) === 0
            ? 0
            : 1,
          region || "",
          sim_type || "",
          normalizePrice(
            price_max
          ),
          normalizePrice(
            foreign_price
          ),
          price_type ||
            "fixed"
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

      res
        .status(500)
        .json({
          ok: false,
          error:
            "Не удалось создать товар"
        });
    }
  }
);

/* =========================================================
   UPDATE PRODUCT
========================================================= */

app.put(
  "/api/admin/products/:id",
  requireAdmin,
  async (
    req,
    res
  ) => {
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
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "Название товара обязательно"
          });
      }

      const oldProduct =
        await db.execute({
          sql: `
            SELECT
              image_url
            FROM products
            WHERE id = ?
            LIMIT 1
          `,
          args: [
            req.params.id
          ]
        });

      if (
        oldProduct.rows
          .length === 0
      ) {
        return res
          .status(404)
          .json({
            ok: false,
            error:
              "Товар не найден"
          });
      }

      const oldImage =
        oldProduct.rows[0]
          .image_url || "";

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
          category_id ===
            undefined
            ? null
            : Number(
                category_id
              ),
          Number(is_new) === 1
            ? 1
            : 0,
          Number(
            new_sort_order || 0
          ),
          Number(active) === 0
            ? 0
            : 1,
          region || "",
          sim_type || "",
          normalizePrice(
            price_max
          ),
          normalizePrice(
            foreign_price
          ),
          price_type ||
            "fixed",
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

      res
        .status(500)
        .json({
          ok: false,
          error:
            "Не удалось изменить товар"
        });
    }
  }
);

/* =========================================================
   DELETE PRODUCT
========================================================= */

app.delete(
  "/api/admin/products/:id",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      const product =
        await db.execute({
          sql: `
            SELECT
              image_url
            FROM products
            WHERE id = ?
            LIMIT 1
          `,
          args: [
            req.params.id
          ]
        });

      if (
        product.rows
          .length === 0
      ) {
        return res
          .status(404)
          .json({
            ok: false,
            error:
              "Товар не найден"
          });
      }

      const imageUrl =
        product.rows[0]
          .image_url || "";

      await db.execute({
        sql: `
          DELETE FROM products
          WHERE id = ?
        `,
        args: [
          req.params.id
        ]
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

      res
        .status(500)
        .json({
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
  async (
    req,
    res
  ) => {
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

      res
        .status(500)
        .json({
          ok: false,
          error:
            "Не удалось загрузить категории"
        });
    }
  }
);

/* =========================================================
   CREATE CATEGORY
========================================================= */

app.post(
  "/api/admin/categories",
  requireAdmin,
  async (
    req,
    res
  ) => {
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
        return res
          .status(400)
          .json({
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
          .replace(
            /\s+/g,
            "-"
          )
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
          Number(
            sort_order || 0
          ),
          Number(active) === 0
            ? 0
            : 1
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

      res
        .status(500)
        .json({
          ok: false,
          error:
            "Не удалось создать категорию"
        });
    }
  }
);

/* =========================================================
   UPDATE CATEGORY
========================================================= */

app.put(
  "/api/admin/categories/:id",
  requireAdmin,
  async (
    req,
    res
  ) => {
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
        return res
          .status(400)
          .json({
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
          .replace(
            /\s+/g,
            "-"
          )
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
          Number(active) === 0
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

      res
        .status(500)
        .json({
          ok: false,
          error:
            "Не удалось изменить категорию"
        });
    }
  }
);

/* =========================================================
   DELETE CATEGORY
========================================================= */

app.delete(
  "/api/admin/categories/:id",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      const products =
        await db.execute({
          sql: `
            SELECT
              COUNT(*) AS count
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
        return res
          .status(400)
          .json({
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

      res
        .status(500)
        .json({
          ok: false,
          error:
            "Не удалось удалить категорию"
        });
    }
  }
);

/* =========================================================
   OPENAI — MASS PRICE PARSER
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
Ты — парсер прайс-листов магазина iroom.

Тебе передаётся текст прайс-листа.
Твоя задача — превратить КАЖДУЮ строку с товаром и ценой
в отдельный объект массива products.

Очень важно:

1. Не пропускай позиции.
2. Не объединяй разные цвета.
3. Не объединяй разные регионы.
4. Не объединяй разную память.
5. Не объединяй разные цены.
6. Каждая строка с ценой = отдельный товар/вариант.

Пример:

🇯🇵 17 Pro Max 512GB Orange - 123.800

должен стать:

name = "iPhone 17 Pro Max"
category = "iPhone"
memory = "512GB"
color = "Orange"
region = "🇯🇵"
price = 123800
price_type = "fixed"

Если заголовок выше строки говорит:
"iPhone 17 Pro Max",
то используй полный заголовок как модель.

Если написано:
"iPhone 17 / 17 Pro / 17 Pro Max / 17 Air"
это список моделей, но товарные строки ниже нужно связывать
с конкретным названием только если это однозначно возможно.

Регионы:
🇯🇵 = Japan
🇭🇰 = Hong Kong
🇮🇳 = India
🇺🇸 = USA
🇨🇳 = China

В поле region сохраняй флаг и название, например:
"🇯🇵 Japan"

SIM-правила могут быть указаны отдельно:

🇯🇵🇺🇸 - eSim+eSim
🇮🇳🇭🇰 - Sim+eSim
🇨🇳 - Sim+Sim

Применяй эти правила к товарам соответствующего региона.

Если в самой строке явно указано eSim,
например:
🇺🇸 17e 256GB Black eSim - 65.200

то sim_type = "eSIM".

Если регион 🇯🇵 или 🇺🇸 и действует правило
🇯🇵🇺🇸 - eSim+eSim,
то sim_type = "eSIM + eSIM".

Если регион 🇮🇳 или 🇭🇰,
то sim_type = "SIM + eSIM".

Если 🇨🇳,
то sim_type = "SIM + SIM".

Память:
256GB, 512GB, 1TB, 2TB и т.п.
сохраняй как написано.

Цвет:
Black, White, Orange, Blue, Silver,
Lavender, Sage, Gold, Pink, Soft Pink и т.п.
сохраняй без перевода.

Цена:
65.200 = 65200
123.800 = 123800
1.025.000 = 1025000

Если цена указана "от 100.000",
price = 100000
price_type = "from"

Если указано "до 150.000",
price_max = 150000.

Если цена "по запросу":
price = null
price_type = "request"

Если есть основная и иностранная цена,
заполняй foreign_price.

category:
iPhone → iPhone
iPad → iPad
Mac / MacBook → Mac
Apple Watch → Apple Watch
AirPods → AirPods
Dyson → Dyson
PlayStation / PS5 / PS5 Pro → PlayStation
Xbox → Xbox
Nintendo → Nintendo
Samsung → Android
Xiaomi / Redmi / POCO → Android
Google Pixel → Android
OnePlus → Android
Honor / Huawei → Android
остальное классифицируй логично.

is_new:
ставь 1, если товар находится в блоке новинок
или явно обозначен как новый.
Иначе 0.

version:
используй только для дополнительной информации,
которую нельзя положить в остальные поля.
Не дублируй туда цену, если она уже в price.

Никогда не придумывай цену.
Никогда не придумывай отсутствующий вариант.
`;
}

async function parsePriceListWithAI(
  rawText
) {
  if (!OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY не задан в Render"
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

        body:
          JSON.stringify({
            model:
              OPENAI_MODEL,

            store: false,

            instructions:
              openAIParserPrompt(),

            input:
              rawText,

            text: {
              format: {
                type:
                  "json_schema",

                name:
                  "iroom_price_list",

                strict:
                  true,

                schema:
                  PRICE_PARSER_SCHEMA
              }
            }
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

  const outputText =
    data.output_text ||
    "";

  if (!outputText) {
    throw new Error(
      "OpenAI не вернул результат"
    );
  }

  let parsed;

  try {
    parsed =
      JSON.parse(
        outputText
      );
  } catch (error) {
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
   CLEAN AI PRODUCTS
========================================================= */

function cleanAIProduct(
  product
) {
  const clean = {
    name:
      String(
        product.name || ""
      ).trim(),

    category:
      String(
        product.category ||
          "Другое"
      ).trim(),

    memory:
      String(
        product.memory || ""
      ).trim(),

    color:
      String(
        product.color || ""
      ).trim(),

    region:
      String(
        product.region || ""
      ).trim(),

    sim_type:
      String(
        product.sim_type || ""
      ).trim(),

    price:
      normalizePrice(
        product.price
      ),

    price_type:
      String(
        product.price_type ||
          "fixed"
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
      String(
        product.version || ""
      ).trim(),

    is_new:
      Number(
        product.is_new || 0
      ) === 1
        ? 1
        : 0,

    active: 1
  };

  /*
   * Если AI вернул обычный регион-флаг,
   * добавляем понятное название.
   */

  const regionMap = {
    "🇯🇵":
      "🇯🇵 Japan",

    "🇭🇰":
      "🇭🇰 Hong Kong",

    "🇮🇳":
      "🇮🇳 India",

    "🇺🇸":
      "🇺🇸 USA",

    "🇨🇳":
      "🇨🇳 China"
  };

  if (
    regionMap[
      clean.region
    ]
  ) {
    clean.region =
      regionMap[
        clean.region
      ];
  }

  /*
   * Автоматическое SIM-правило,
   * если AI оставил поле пустым.
   */

  if (
    !clean.sim_type
  ) {
    if (
      clean.region.includes(
        "🇯🇵"
      ) ||
      clean.region.includes(
        "🇺🇸"
      )
    ) {
      clean.sim_type =
        "eSIM + eSIM";
    } else if (
      clean.region.includes(
        "🇮🇳"
      ) ||
      clean.region.includes(
        "🇭🇰"
      )
    ) {
      clean.sim_type =
        "SIM + eSIM";
    } else if (
      clean.region.includes(
        "🇨🇳"
      )
    ) {
      clean.sim_type =
        "SIM + SIM";
    }
  }

  /*
   * Если цена не указана,
   * не позволяем создать ложную цену 0.
   */

  if (
    clean.price === null &&
    clean.price_type ===
      "fixed"
  ) {
    clean.price_type =
      "request";
  }

  return clean;
}

/* =========================================================
   MASS IMPORT INTO TURSO
========================================================= */

async function importProductsFromAI(
  aiProducts
) {
  const existing =
    await loadExistingProducts();

  let added = 0;
  let duplicates = 0;
  let errors = 0;

  const addedProducts =
    [];

  const duplicateProducts =
    [];

  const errorProducts =
    [];

  for (
    const rawProduct of
      aiProducts
  ) {
    try {
      const product =
        cleanAIProduct(
          rawProduct
        );

      if (
        !product.name
      ) {
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

      if (
        existing.has(key)
      ) {
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
        "AI import product error:",
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
   TELEGRAM
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
            JSON.stringify(
              body
            )
        }
      );

    return await response.json();
  } catch (error) {
    console.error(
      `Telegram API ${method} failed:`,
      error
    );

    return null;
  }
}

/* =========================================================
   TELEGRAM ADMIN PRICE IMPORT
========================================================= */

function isAdminMessage(
  message
) {
  const telegramId =
    message?.from?.id;

  return isAdminTelegramId(
    telegramId
  );
}

function formatMoney(
  value
) {
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

function productPreviewLine(
  product
) {
  const parts = [];

  if (
    product.region
  ) {
    parts.push(
      product.region
    );
  }

  if (
    product.memory
  ) {
    parts.push(
      product.memory
    );
  }

  if (
    product.color
  ) {
    parts.push(
      product.color
    );
  }

  if (
    product.sim_type
  ) {
    parts.push(
      product.sim_type
    );
  }

  return `• ${
    product.name
  }${
    parts.length
      ? ` · ${parts.join(
          " · "
        )}`
      : ""
  } — ${
    formatMoney(
      product.price
    )
  }`;
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
    text.startsWith(
      "/start "
    )
  ) {
    return false;
  }

  if (
    !isAdminMessage(
      message
    )
  ) {
    return false;
  }

  /*
   * Команды управления
   */

  if (
    text === "/ai" ||
    text === "/help"
  ) {
    await telegramRequest(
      "sendMessage",
      {
        chat_id:
          chatId,

        text:
          "🤖 AI-админ iroom\n\n" +
          "Просто отправь мне прайс-лист текстом.\n\n" +
          "Например:\n" +
          "🇯🇵 17 Pro Max 512GB Orange - 123.800\n" +
          "🇭🇰 17 Pro Max 512GB Orange - 134.200\n\n" +
          "Я сам разберу модели, память, цвет, регион, SIM/eSIM и цены и добавлю все позиции в магазин.\n\n" +
          "Можно отправить сразу сотни строк."
      }
    );

    return true;
  }

  /*
   * Не пытаемся отправлять короткие обычные сообщения
   * в OpenAI.
   */

  if (
    text.length < 15
  ) {
    return false;
  }

  /*
   * Если это обычная фраза, а не похоже
   * на прайс, всё равно разрешаем AI
   * обработать только достаточно длинные
   * сообщения.
   */

  await telegramRequest(
    "sendMessage",
    {
      chat_id:
        chatId,

      text:
        "⏳ Разбираю прайс-лист...\n\n" +
        "Это может занять немного времени."
    }
  );

  try {
    const aiProducts =
      await parsePriceListWithAI(
        text
      );

    if (
      aiProducts.length ===
      0
    ) {
      await telegramRequest(
        "sendMessage",
        {
          chat_id:
            chatId,

          text:
            "❌ Не нашёл в сообщении товаров с ценами."
        }
      );

      return true;
    }

    /*
     * Массовая запись.
     */

    const result =
      await importProductsFromAI(
        aiProducts
      );

    /*
     * Формируем ответ.
     */

    let responseText =
      "✅ Прайс обработан\n\n";

    responseText +=
      `📦 Найдено: ${aiProducts.length}\n`;

    responseText +=
      `🟢 Добавлено: ${result.added}\n`;

    responseText +=
      `🟡 Дубликатов: ${result.duplicates}\n`;

    responseText +=
      `🔴 Ошибок: ${result.errors}`;

    /*
     * Показываем первые товары,
     * чтобы не засрать Telegram огромным сообщением.
     */

    if (
      result.addedProducts
        .length
    ) {
      responseText +=
        "\n\nДобавленные товары:";

      const preview =
        result.addedProducts
          .slice(0, 20);

      for (
        const product of
          preview
      ) {
        responseText +=
          `\n${productPreviewLine(
            product
          )}`;
      }

      if (
        result.addedProducts
          .length > 20
      ) {
        responseText +=
          `\n\n...и ещё ${
            result.addedProducts
              .length - 20
          }`;
      }
    }

    await telegramRequest(
      "sendMessage",
      {
        chat_id:
          chatId,

        text:
          responseText
      }
    );

    return true;
  } catch (error) {
    console.error(
      "ADMIN AI IMPORT ERROR:",
      error
    );

    await telegramRequest(
      "sendMessage",
      {
        chat_id:
          chatId,

        text:
          "❌ Не удалось обработать прайс.\n\n" +
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
            "AI импорт прайса"
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

  if (
    OPENAI_API_KEY
  ) {
    console.log(
      "OpenAI AI admin: enabled"
    );
  } else {
    console.log(
      "OpenAI AI admin: disabled — OPENAI_API_KEY missing"
    );
  }

  startTelegramPolling(
    MINIAPP_URL
  );
}

async function startTelegramPolling(
  webAppUrl
) {
  if (
    telegramPolling
  ) {
    return;
  }

  telegramPolling = true;

  console.log(
    "Telegram polling started"
  );

  while (
    telegramPolling
  ) {
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

      if (
        !result?.ok
      ) {
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
          text.startsWith(
            "/start "
          )
        ) {
          await telegramRequest(
            "sendMessage",
            {
              chat_id:
                chatId,

              text:
                "Добро пожаловать в iroom 🍎\n\n" +
                "Выберите товар и откройте магазин.",

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

        /*
         * AI импорт работает только
         * для двух админов.
         */

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
  (
    req,
    res
  ) => {
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
  (
    req,
    res,
    next
  ) => {
    if (
      req.method !==
      "GET"
    ) {
      return next();
    }

    if (
      req.path.startsWith(
        "/api/"
      )
    ) {
      return res
        .status(404)
        .json({
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
      return res
        .status(400)
        .json({
          ok: false,
          error:
            "Ошибка загрузки файла"
        });
    }

    if (
      error.message ===
      "Разрешены только изображения"
    ) {
      return res
        .status(400)
        .json({
          ok: false,
          error:
            error.message
        });
    }

    res
      .status(500)
      .json({
        ok: false,
        error:
          "Внутренняя ошибка сервера"
      });
  }
);

/* =========================================================
   START
========================================================= */

initDatabase()
  .then(
    async () => {
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

          await setupTelegramBot();
        }
      );
    }
  )
  .catch(
    (error) => {
      console.error(
        "Database initialization failed:",
        error
      );

      process.exit(1);
    }
  );