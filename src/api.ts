import type { BuilderCfg, Content, VideoJob } from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      msg = data.error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export async function fetchContent(): Promise<Content> {
  return json<Content>(await fetch("/api/content"));
}

export async function saveContent(content: Content): Promise<Content> {
  const res = await fetch("/api/content", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(content),
  });
  return json<Content>(res);
}

export async function patchTopic(id: string, patch: Record<string, unknown>): Promise<Content> {
  const res = await fetch(`/api/topics/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  return json<Content>(res);
}

export async function exportPptx(cfg: BuilderCfg): Promise<Blob> {
  const res = await fetch("/api/export/pptx", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cfg),
  });
  if (!res.ok) {
    let msg = "Export PPTX selhal.";
    try {
      msg = (await res.json()).error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.blob();
}

export async function resetContent(): Promise<Content> {
  const res = await fetch("/api/content/reset", { method: "POST" });
  return json<Content>(res);
}

export type { VideoJob } from "./types";

export async function startVideo(cfg: BuilderCfg, voice: string): Promise<{ id: string }> {
  const res = await fetch("/api/video", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...cfg, voice }),
  });
  return json<{ id: string }>(res);
}

export async function getVideo(id: string): Promise<VideoJob> {
  return json<VideoJob>(await fetch(`/api/video/${id}`));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
