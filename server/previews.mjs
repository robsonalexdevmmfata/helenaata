import fs from "node:fs";
import path from "node:path";
import { loadAppPreview, upsertAppPreview } from "./helena-db.mjs";

const DIR = process.env.PREVIEWS_DIR || path.join(process.cwd(), "data", "previews");

function cleanSlug(slug) {
  return String(slug || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80);
}

function saveToDisk(preview) {
  const slug = cleanSlug(preview?.slug);
  if (!slug) return null;
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const row = { ...preview, slug };
    fs.writeFileSync(path.join(DIR, `${slug}.json`), JSON.stringify(row));
    return slug;
  } catch (err) {
    console.warn("[previews] disk save:", err?.message || err);
    return null;
  }
}

function loadFromDisk(slug) {
  const clean = cleanSlug(slug);
  if (!clean) return null;
  const file = path.join(DIR, `${clean}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** Persiste prévia: Supabase (durable) + disco local (cache). */
export async function savePreview(preview) {
  const slug = cleanSlug(preview?.slug);
  if (!slug) {
    const err = new Error("Slug inválido.");
    err.status = 400;
    throw err;
  }
  const row = { ...preview, slug };
  const org = String(preview?.organizationId || "public");
  const db = await upsertAppPreview(row, org);
  saveToDisk(row);
  if (!db.ok && !loadFromDisk(slug)) {
    const err = new Error(db.error || "Falha ao gravar prévia.");
    err.status = 500;
    throw err;
  }
  return { slug };
}

/** Lê prévia pública: Supabase primeiro, depois disco. */
export async function loadPreview(slug) {
  const clean = cleanSlug(slug);
  if (!clean) return null;
  const fromDb = await loadAppPreview(clean);
  if (fromDb) return fromDb;
  return loadFromDisk(clean);
}
