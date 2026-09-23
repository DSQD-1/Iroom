const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { createClient } = require("@libsql/client");

const app = express();

const PORT = process.env.PORT || 10000;

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  console.error("TURSO_DATABASE_URL или TURSO_AUTH_TOKEN не заданы");
}

const db = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const uploadsDir = path.join(__dirname, "public", "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    const safeName =
      Date.now() +
      "-" +
      Math.random().toString(36).slice(2, 10) +
      ext;

    cb(null, safeName);
  }
});

const upload = multer({
  storage,

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
      return cb(new Error("Разрешены только изображения"));
    }

    cb(null, true);
  }
});

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
      }
    ],
    "write"
  );

  const categoryCount = await db.execute(
    "SELECT COUNT(*) AS count FROM categories"
  );

  if (Number(categoryCount.rows[0].count) === 0) {
    await db.batch(
      [
        {
          sql: `
            INSERT INTO categories
            (name, slug, sort_order, active)
            VALUES (?, ?, ?, ?)
          `,
          args: ["iPhone", "iphone", 1, 1]
        },

        {
          sql: `
            INSERT INTO categories
            (name, slug, sort_order, active)
            VALUES (?, ?, ?, ?)
          `,
          args: ["iPad", "ipad", 2, 1]
        },

        {
          sql: `
            INSERT INTO categories
            (name, slug, sort_order, active)
            VALUES (?, ?, ?, ?)
          `,
          args: ["Mac", "mac", 3, 1]
        },

        {
          sql: `
            INSERT INTO categories
            (name, slug, sort_order, active)
            VALUES (?, ?, ?, ?)
          `,
          args: ["Apple Watch", "apple-watch", 4, 1]
        },

        {
          sql: `
            INSERT INTO categories
            (name, slug, sort_order, active)
            VALUES (?, ?, ?, ?)
          `,
          args: ["AirPods", "airpods", 5, 1]
        }
      ],
      "write"
    );
  }

  const settings = [
    ["store_name", "iroom"],
    ["contact_username", process.env.CONTACT_USERNAME || ""]
  ];

  for (const [key, value] of settings) {
    await db.execute({
      sql: `
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key)
        DO UPDATE SET value = excluded.value
      `,
      args: [key, value]
    });
  }

  if (process.env.ADMIN_ID) {
    await db.execute({
      sql: `
        INSERT OR IGNORE INTO admins (telegram_id)
        VALUES (?)
      `,
      args: [String(process.env.ADMIN_ID)]
    });
  }

  console.log("Turso database initialized");
}

app.get("/api/health", async (req, res) => {
  try {
    const result = await db.execute("SELECT 1 AS ok");

    res.json({
      ok: true,
      database: result.rows[0].ok === 1,
      app: "iroom"
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      database: false,
      error: "Database connection failed"
    });
  }
});

app.get("/api/categories", async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT
        id,
        name,
        slug,
        image_url,
        sort_order
      FROM categories
      WHERE active = 1
      ORDER BY sort_order ASC, id ASC
    `);

    res.json({
      ok: true,
      categories: result.rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Не удалось загрузить категории"
    });
  }
});

app.get("/api/products", async (req, res) => {
  try {
    const category = req.query.category;

    let result;

    if (category) {
      result = await db.execute({
        sql: `
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
          WHERE p.active = 1
            AND c.slug = ?
          ORDER BY p.id DESC
        `,
        args: [category]
      });
    } else {
      result = await db.execute(`
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
        WHERE p.active = 1
        ORDER BY p.id DESC
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
      error: "Не удалось загрузить товары"
    });
  }
});

app.get("/api/products/new", async (req, res) => {
  try {
    const result = await db.execute(`
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
      WHERE p.active = 1
        AND p.is_new = 1
      ORDER BY p.new_sort_order ASC, p.id DESC
    `);

    res.json({
      ok: true,
      products: result.rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Не удалось загрузить новинки"
    });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const result = await db.execute({
      sql: `
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
      error: "Не удалось загрузить товар"
    });
  }
});

app.get("/api/settings", async (req, res) => {
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
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Не удалось загрузить настройки"
    });
  }
});

app.post("/api/admin/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: "Файл не выбран"
      });
    }

    const imageUrl = `/uploads/${req.file.filename}`;

    res.json({
      ok: true,
      image_url: imageUrl
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Не удалось загрузить изображение"
    });
  }
});

app.use("/uploads", express.static(uploadsDir));

app.use(express.static(path.join(__dirname, "public")));

/*
  Express 5:
  вместо app.get("*") используем обычный middleware fallback.
*/
app.use((req, res, next) => {
  if (req.method !== "GET") {
    return next();
  }

  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      ok: false,
      error: "API route not found"
    });
  }

  res.sendFile(path.join(__dirname, "public", "index.html"));
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`iroom started on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Database initialization failed:", error);
    process.exit(1);
  });