import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { buildPptx } from "./pptx.js";
import { synthesize, VOICES } from "./tts.js";
import { makeJobDir } from "./store.js";

const run = promisify(execFile);

const SOFFICE = process.env.SOFFICE_PATH || "soffice";
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";
const PDFTOPPM = process.env.PDFTOPPM_PATH || "pdftoppm";

// LibreOffice nesmí běžet paralelně se stejným profilem.
let loChain = Promise.resolve();
function withLibreOffice(fn) {
  const next = loChain.then(fn, fn);
  loChain = next.catch(() => {});
  return next;
}

async function exec(cmd, args, options = {}) {
  try {
    return await run(cmd, args, { timeout: 240000, maxBuffer: 16 * 1024 * 1024, ...options });
  } catch (err) {
    const detail = (err.stderr || err.stdout || err.message || "").toString().slice(-1800);
    throw new Error(`${path.basename(cmd)} selhalo: ${detail}`);
  }
}

async function duration(file) {
  const { stdout } = await exec(FFPROBE, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    file,
  ]);
  const value = Number.parseFloat(String(stdout).trim());
  return Number.isFinite(value) ? value : 0;
}

async function convertToImages(pptxPath, jobDir) {
  const slidesDir = path.join(jobDir, "slides");
  await fs.mkdir(slidesDir, { recursive: true });
  const profileDir = path.join(jobDir, "lo-profile");
  await fs.mkdir(profileDir, { recursive: true });
  const profile = pathToFileURL(profileDir).href;

  await withLibreOffice(async () => {
    await exec(SOFFICE, [
      "--headless",
      `-env:UserInstallation=${profile}`,
      "--convert-to", "pdf",
      "--outdir", jobDir,
      pptxPath,
    ]);
  });

  const pdf = path.join(jobDir, `${path.basename(pptxPath, ".pptx")}.pdf`);
  await fs.access(pdf);

  await exec(PDFTOPPM, [
    "-png",
    "-scale-to-x", "1920",
    "-scale-to-y", "-1",
    pdf,
    path.join(slidesDir, "slide"),
  ]);

  const files = (await fs.readdir(slidesDir))
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((f) => path.join(slidesDir, f));

  if (!files.length) throw new Error("Z PPTX se nepodařilo vytvořit obrázky slidů.");
  return files;
}

async function renderSegment({ image, audio, out, sec }) {
  const args = ["-y", "-loop", "1", "-framerate", "30", "-i", image];
  if (audio) {
    args.push("-i", audio, "-af", "apad=pad_dur=1.6,aresample=48000");
  } else {
    args.push("-f", "lavfi", "-t", sec.toFixed(3), "-i", "anullsrc=r=48000:cl=stereo");
  }
  args.push(
    "-t", sec.toFixed(3),
    "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1",
    "-r", "30",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "stillimage",
    "-crf", "21",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "160k",
    "-ar", "48000",
    "-ac", "2",
    "-movflags", "+faststart",
    out,
  );
  await exec(FFMPEG, args);
}

/**
 * Kompletní pipeline: PPTX → PDF → PNG → TTS → MP4.
 * Vrací { file, duration, slides }.
 */
export async function renderVideo({ content, cfg, voice, jobId, onProgress = () => {} }) {
  const jobDir = await makeJobDir(jobId);
  const chosenVoice = voice === "none" ? null : voice || VOICES[0].id;

  onProgress(4, "Sestavuji prezentaci z knihovny obsahu…");
  const { buffer, deck, filename } = await buildPptx(content, cfg);
  const pptxPath = path.join(jobDir, filename);
  await fs.writeFile(pptxPath, buffer);
  onProgress(12, `Prezentace má ${deck.slides.length} slidů. Převádím na obrázky…`);

  const images = await convertToImages(pptxPath, jobDir);
  onProgress(28, `Převedeno ${images.length} slidů. Generuji český voice-over…`);

  const count = Math.min(images.length, deck.slides.length);
  const segments = [];
  let total = 0;
  const audioDir = path.join(jobDir, "audio");

  for (let i = 0; i < count; i++) {
    const slide = deck.slides[i];
    const narr = String(slide.narration || "").trim();
    let audio = null;
    let voiceDuration = 0;

    if (chosenVoice && narr) {
      try {
        audio = await synthesize(narr, path.join(audioDir, String(i + 1)), chosenVoice);
        voiceDuration = await duration(audio);
      } catch (err) {
        onProgress(
          30 + (i / Math.max(count, 1)) * 55,
          `Slide ${i + 1}: voice-over se nepovedl (${err.message}). Použiji ticho.`,
        );
        audio = null;
      }
    }

    const sec = Math.max(3.4, voiceDuration + 0.9);
    const out = path.join(jobDir, `seg-${String(i).padStart(3, "0")}.mp4`);
    await renderSegment({ image: images[i], audio, out, sec });
    segments.push(out);
    total += sec;

    const pct = 30 + ((i + 1) / Math.max(count, 1)) * 55;
    onProgress(
      pct,
      `Slide ${i + 1}/${count}: ${audio ? `${voiceDuration.toFixed(1)} s komentáře` : "bez komentáře"} → ${sec.toFixed(1)} s videa`,
    );
  }

  onProgress(88, "Spojuji jednotlivé slidy do výsledného MP4…");
  const listPath = path.join(jobDir, "list.txt");
  await fs.writeFile(listPath, segments.map((s) => `file '${path.basename(s)}'`).join("\n"), "utf8");

  const final = path.join(jobDir, "video.mp4");
  try {
    await exec(FFMPEG, [
      "-y", "-f", "concat", "-safe", "0", "-i", "list.txt",
      "-c", "copy", "-movflags", "+faststart", "video.mp4",
    ], { cwd: jobDir });
  } catch {
    // Kdyby se segmenty lišily, přepočítáme obraz i zvuk.
    await exec(FFMPEG, [
      "-y", "-f", "concat", "-safe", "0", "-i", "list.txt",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
      "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "video.mp4",
    ], { cwd: jobDir });
  }

  const size = (await fs.stat(final)).size;
  if (size < 20000) throw new Error("Výsledné video je příliš malé – něco se nepovedlo.");

  onProgress(100, `Hotovo. Video má ${Math.round(total)} s a ${(size / 1024 / 1024).toFixed(1)} MB.`);
  return { file: final, duration: total, slides: count, voice: chosenVoice };
}
