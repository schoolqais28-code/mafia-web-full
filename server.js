const express = require("express");
const path = require("path");
const fs = require("fs");
const { Pool } = require("pg");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const STORE_NAME = process.env.STORE_NAME || "متجر التنين";
const FACEBOOK_URL = process.env.FACEBOOK_URL || "https://www.facebook.com/profile.php?id=61572937965817";
const ADMIN_KEY = process.env.ADMIN_KEY || "";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

app.use(express.json({ limit: "3mb" }));
app.use(express.static(path.join(__dirname, "store-public")));

function cleanText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function parsePrice(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function adminOnly(req, res, next) {
  const key = req.get("x-admin-key") || "";
  if (!ADMIN_KEY) return res.status(503).json({ error: "ADMIN_KEY is not configured" });
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  next();
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      price_jod NUMERIC(10, 2) NOT NULL DEFAULT 0,
      image_url TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'عام',
      description TEXT NOT NULL DEFAULT '',
      source_url TEXT NOT NULL DEFAULT '',
      source_key TEXT UNIQUE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS store_settings (
      id SMALLINT PRIMARY KEY DEFAULT 1,
      store_name TEXT NOT NULL,
      facebook_url TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(
    `INSERT INTO store_settings (id, store_name, facebook_url)
     VALUES (1, $1, $2)
     ON CONFLICT (id) DO UPDATE
     SET store_name = EXCLUDED.store_name,
         facebook_url = EXCLUDED.facebook_url,
         updated_at = NOW()`,
    [STORE_NAME, FACEBOOK_URL]
  );

  const countResult = await pool.query("SELECT COUNT(*)::int AS count FROM products");
  if (countResult.rows[0].count === 0) {
    const seedPath = path.join(__dirname, "seed", "products.json");
    if (fs.existsSync(seedPath)) {
      const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
      if (Array.isArray(seed)) {
        for (const item of seed) {
          const price = parsePrice(item.price_jod);
          if (!cleanText(item.name) || price === null) continue;
          await pool.query(
            `INSERT INTO products
             (name, price_jod, image_url, category, description, source_url, source_key)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (source_key) DO NOTHING`,
            [
              cleanText(item.name),
              price,
              cleanText(item.image_url),
              cleanText(item.category, "عام") || "عام",
              cleanText(item.description),
              cleanText(item.source_url),
              cleanText(item.source_key) || null
            ]
          );
        }
      }
    }
  }
}

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message });
  }
});

app.get("/api/store", async (_req, res) => {
  const result = await pool.query("SELECT store_name, facebook_url FROM store_settings WHERE id = 1");
  res.json(result.rows[0] || { store_name: STORE_NAME, facebook_url: FACEBOOK_URL });
});

app.get("/api/categories", async (_req, res) => {
  const result = await pool.query(
    "SELECT DISTINCT category FROM products WHERE active = TRUE ORDER BY category ASC"
  );
  res.json(result.rows.map((row) => row.category));
});

app.get("/api/products", async (req, res) => {
  const search = cleanText(req.query.search);
  const category = cleanText(req.query.category);
  const params = [];
  const where = ["active = TRUE"];

  if (search) {
    params.push("%" + search + "%");
    where.push(`(name ILIKE $${params.length} OR description ILIKE $${params.length})`);
  }
  if (category) {
    params.push(category);
    where.push(`category = $${params.length}`);
  }

  const result = await pool.query(
    `SELECT id, name, price_jod, image_url, category, description, source_url
     FROM products
     WHERE ${where.join(" AND ")}
     ORDER BY id DESC`,
    params
  );
  res.json(result.rows);
});

app.get("/api/admin/products", adminOnly, async (_req, res) => {
  const result = await pool.query(
    `SELECT id, name, price_jod, image_url, category, description, source_url, source_key, active
     FROM products ORDER BY id DESC`
  );
  res.json(result.rows);
});

app.post("/api/admin/products", adminOnly, async (req, res) => {
  const name = cleanText(req.body.name);
  const price = parsePrice(req.body.price_jod);
  if (!name || price === null) return res.status(400).json({ error: "Name and valid price are required" });

  const result = await pool.query(
    `INSERT INTO products
     (name, price_jod, image_url, category, description, source_url, source_key, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      name,
      price,
      cleanText(req.body.image_url),
      cleanText(req.body.category, "عام") || "عام",
      cleanText(req.body.description),
      cleanText(req.body.source_url),
      cleanText(req.body.source_key) || null,
      req.body.active !== false
    ]
  );
  res.status(201).json(result.rows[0]);
});

app.put("/api/admin/products/:id", adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const name = cleanText(req.body.name);
  const price = parsePrice(req.body.price_jod);
  if (!Number.isInteger(id) || !name || price === null) {
    return res.status(400).json({ error: "Invalid product data" });
  }

  const result = await pool.query(
    `UPDATE products SET
      name=$1, price_jod=$2, image_url=$3, category=$4, description=$5,
      source_url=$6, source_key=$7, active=$8, updated_at=NOW()
     WHERE id=$9 RETURNING *`,
    [
      name,
      price,
      cleanText(req.body.image_url),
      cleanText(req.body.category, "عام") || "عام",
      cleanText(req.body.description),
      cleanText(req.body.source_url),
      cleanText(req.body.source_key) || null,
      req.body.active !== false,
      id
    ]
  );
  if (!result.rowCount) return res.status(404).json({ error: "Product not found" });
  res.json(result.rows[0]);
});

app.delete("/api/admin/products/:id", adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  const result = await pool.query("DELETE FROM products WHERE id=$1 RETURNING id", [id]);
  if (!result.rowCount) return res.status(404).json({ error: "Product not found" });
  res.json({ ok: true });
});

app.post("/api/admin/import", adminOnly, async (req, res) => {
  const products = Array.isArray(req.body.products) ? req.body.products : [];
  if (!products.length) return res.status(400).json({ error: "products array is required" });

  const client = await pool.connect();
  let imported = 0;
  try {
    await client.query("BEGIN");
    if (req.body.replace === true) await client.query("DELETE FROM products");

    for (const item of products) {
      const name = cleanText(item.name);
      const price = parsePrice(item.price_jod);
      if (!name || price === null) continue;

      const sourceKey = cleanText(item.source_key) || null;
      if (sourceKey) {
        await client.query(
          `INSERT INTO products
           (name, price_jod, image_url, category, description, source_url, source_key, active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (source_key) DO UPDATE SET
             name=EXCLUDED.name,
             price_jod=EXCLUDED.price_jod,
             image_url=EXCLUDED.image_url,
             category=EXCLUDED.category,
             description=EXCLUDED.description,
             source_url=EXCLUDED.source_url,
             active=EXCLUDED.active,
             updated_at=NOW()`,
          [
            name, price, cleanText(item.image_url), cleanText(item.category, "عام") || "عام",
            cleanText(item.description), cleanText(item.source_url), sourceKey, item.active !== false
          ]
        );
      } else {
        await client.query(
          `INSERT INTO products
           (name, price_jod, image_url, category, description, source_url, active)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            name, price, cleanText(item.image_url), cleanText(item.category, "عام") || "عام",
            cleanText(item.description), cleanText(item.source_url), item.active !== false
          ]
        );
      }
      imported++;
    }
    await client.query("COMMIT");
    res.json({ ok: true, imported });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "store-public", "admin.html"));
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "store-public", "index.html"));
});

initDb()
  .then(() => app.listen(PORT, "0.0.0.0", () => console.log(`Dragon Store listening on ${PORT}`)))
  .catch((error) => {
    console.error("Database initialization failed", error);
    process.exit(1);
  });
