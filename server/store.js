import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT, "data");
export const DATA_FILE = path.join(DATA_DIR, "content.json");
export const SEED_FILE = path.join(ROOT, "data", "content.seed.json");
export const OUTPUT_DIR = process.env.OUTPUT_DIR
  ? path.resolve(process.env.OUTPUT_DIR)
  : path.join(ROOT, "output");

let cache = null;

async function readJson(file) {
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw);
}

export async function getContent() {
  if (cache) return cache;
  try {
    cache = await readJson(DATA_FILE);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    // První spuštění s prázdným perzistentním diskem – nasypeme demo obsah.
    await fs.mkdir(DATA_DIR, { recursive: true });
    cache = await readJson(SEED_FILE);
    await fs.writeFile(DATA_FILE, JSON.stringify(cache, null, 2), "utf8");
  }
  return cache;
}

function assertShape(content) {
  if (!content || typeof content !== "object") throw new Error("Neplatný obsah.");
  for (const key of [
    "topics",
    "categories",
    "salespeople",
    "references",
    "referenceImages",
    "sectors",
    "settings",
    "brand",
    "company",
  ]) {
    if (!content[key]) throw new Error(`Chybí část obsahu: ${key}`);
  }
  if (!Array.isArray(content.topics)) throw new Error("topics musí být pole.");
}

export async function saveContent(next) {
  assertShape(next);
  const current = await getContent();
  const updated = {
    ...next,
    meta: {
      ...(next.meta || {}),
      version: (current.meta?.version || 0) + 1,
      updatedAt: new Date().toISOString(),
    },
  };
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(updated, null, 2), "utf8");
  await fs.rename(tmp, DATA_FILE);
  cache = updated;
  return updated;
}

export function newId(prefix = "item") {
  return `${prefix}-${crypto.randomBytes(4).toString("hex")}`;
}

export async function ensureOutput() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  return OUTPUT_DIR;
}

export async function makeJobDir(jobId) {
  const dir = path.join(OUTPUT_DIR, "jobs", jobId);
  await fs.mkdir(path.join(dir, "slides"), { recursive: true });
  await fs.mkdir(path.join(dir, "audio"), { recursive: true });
  return dir;
}
