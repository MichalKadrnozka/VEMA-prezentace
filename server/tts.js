import fs from "node:fs/promises";
import path from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

export const VOICES = [
  { id: "cs-CZ-VlastaNeural", label: "Vlasta (žena)" },
  { id: "cs-CZ-AntoninNeural", label: "Antonín (muž)" },
];

/**
 * Vygeneruje MP3 s českým komentářem. Vrací cestu k souboru.
 * Microsoft Edge TTS nepotřebuje API klíč, ale vyžaduje internet.
 */
export async function synthesize(text, outDir, voice = VOICES[0].id) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) throw new Error("Prázdný text pro voice-over.");

  await fs.mkdir(outDir, { recursive: true });
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const result = await tts.toFile(outDir, clean);
      if (!result?.audioFilePath) throw new Error("TTS nevrátilo audio soubor.");
      const target = path.join(outDir, "voice.mp3");
      await fs.rename(result.audioFilePath, target).catch(async () => {
        await fs.copyFile(result.audioFilePath, target);
        await fs.unlink(result.audioFilePath).catch(() => {});
      });
      const stat = await fs.stat(target);
      if (stat.size < 500) throw new Error("TTS vrátilo prázdné audio.");
      return target;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
    }
  }
  throw new Error(`Voice-over se nepovedl: ${lastError?.message || lastError}`);
}
