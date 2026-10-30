import fs from "node:fs";
import path from "node:path";

const DIR = process.env.PREVIEWS_DIR || path.join(process.cwd(), "data", "previews");

function cleanSlug(slug) {
  return String(slug || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80);
}

export function savePreview(preview) {
  const slug = cleanSlug(preview?.slug);
  if (!slug) {
    const err = new Error("Slug inválido.");
    err.status = 400;
    throw err;
  }
  fs.mkdirSync(DIR, { recursive: true });
  const row = { ...preview, slug };
  fs.writeFileSync(path.join(DIR, `${slug}.json`), JSON.stringify(row));
  return { slug };
}

export function loadPreview(slug) {
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
