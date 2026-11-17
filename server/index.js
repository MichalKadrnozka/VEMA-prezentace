import express from "express";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { ROOT, OUTPUT_DIR, SEED_FILE, getContent, saveContent, ensureOutput } from "./store.js";
import { buildPptx } from "./pptx.js";
import { renderVideo } from "./video.js";
import { VOICES } from "./tts.js";

const app = express();
const PORT = Number(process.env.PORT || 8787);
const jobs = new Map();

// Volitelné jednoduché zabezpečení pro veřejné demo (Basic auth).
// Na produkci doporučujeme skutečné přihlašování a role.
const APP_PASSWORD = process.env.APP_PASSWORD || "";
if (APP_PASSWORD) {
  app.use((req, res, next) => {
    if (req.path === "/api/health") return next();
    const header = req.headers.authorization || "";
    const [, encoded] = header.split(" ");
    let user = "";
    let pass = "";
    if (encoded) {
      try {
        [user, pass] = Buffer.from(encoded, "base64").toString("utf8").split(":");
      } catch {
        /* ignore */
      }
    }
    // Uživatelské jméno je libovolné, rozhoduje heslo.
    if (pass === APP_PASSWORD) return next();
    res.setHeader("WWW-Authenticate", 'Basic realm="Vema prezentér"');
    res.status(401).send("Přístup vyžaduje heslo.");
  });
}

app.use(express.json({ limit: "12mb" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("/api/voices", (req, res) => res.json({ voices: VOICES }));

app.get("/api/content", async (req, res, next) => {
  try {
    res.json(await getContent());
  } catch (err) {
    next(err);
  }
});

app.put("/api/content", async (req, res, next) => {
  try {
    const updated = await saveContent(req.body);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

app.patch("/api/topics/:id", async (req, res, next) => {
  try {
    const content = structuredClone(await getContent());
    const topic = content.topics.find((t) => t.id === req.params.id);
    if (!topic) return res.status(404).json({ error: "Téma nenalezeno." });
    Object.assign(topic, req.body || {});
    const updated = await saveContent(content);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

app.post("/api/content/reset", async (req, res, next) => {
  try {
    const raw = await fs.readFile(SEED_FILE, "utf8");
    const seed = JSON.parse(raw);
    const updated = await saveContent(seed);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

app.post("/api/export/pptx", async (req, res, next) => {
  try {
    const content = await getContent();
    const { buffer, filename } = await buildPptx(content, req.body || {});
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

app.post("/api/video", async (req, res, next) => {
  try {
    const content = await getContent();
    const cfg = req.body || {};
    if (!Array.isArray(cfg.topicIds) || cfg.topicIds.length === 0) {
      return res.status(400).json({ error: "Vyberte alespoň jedno téma." });
    }

    await ensureOutput();
    const id = crypto.randomBytes(5).toString("hex");
    const job = {
      id,
      status: "running",
      progress: 0,
      step: "Zařazeno…",
      log: [],
      createdAt: Date.now(),
      file: null,
      error: null,
    };
    jobs.set(id, job);

    const onProgress = (progress, step) => {
      job.progress = Math.max(0, Math.min(100, progress));
      job.step = step;
      job.log.push(step);
      if (job.log.length > 40) job.log.splice(0, job.log.length - 40);
    };

    res.status(202).json({ id });

    renderVideo({
      content,
      cfg,
      voice: cfg.voice,
      jobId: id,
      onProgress,
    })
      .then((result) => {
        job.status = "done";
        job.progress = 100;
        job.file = result.file;
        job.duration = result.duration;
        job.slides = result.slides;
        job.url = `/api/video/${id}/file`;
        job.step = "Video je hotové.";
      })
      .catch((err) => {
        console.error("Video job failed:", err);
        job.status = "error";
        job.error = err.message || String(err);
        job.log.push(`Chyba: ${job.error}`);
      });
  } catch (err) {
    next(err);
  }
});

app.get("/api/video/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Úloha nenalezena." });
  const { file, ...rest } = job;
  res.json(rest);
});

app.get("/api/video/:id/file", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== "done" || !job.file) {
    return res.status(404).json({ error: "Video ještě není hotové." });
  }
  res.download(job.file, `VEMA-video-${job.id}.mp4`);
});

// Statický build frontendu (npm run build)
const dist = path.join(ROOT, "dist");
app.use(express.static(dist));
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(dist, "index.html"), (err) => {
    if (err) next();
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err.message || "Neočekávaná chyba serveru." });
});

// Úklid starých dočasných úloh (starší než 6 hodin), aby output nerostl donekonečna.
async function cleanupOldJobs() {
  try {
    const dir = path.join(OUTPUT_DIR, "jobs");
    const entries = await fs.readdir(dir).catch(() => []);
    const now = Date.now();
    for (const name of entries) {
      const full = path.join(dir, name);
      const stat = await fs.stat(full).catch(() => null);
      if (stat && now - stat.mtimeMs > 6 * 60 * 60 * 1000) {
        await fs.rm(full, { recursive: true, force: true }).catch(() => {});
      }
    }
  } catch {
    /* ignore */
  }
}

app.listen(PORT, async () => {
  console.log(`VEMA prezentér API běží na http://localhost:${PORT}`);
  await ensureOutput();
  cleanupOldJobs();
});
