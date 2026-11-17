import { THEME } from "./theme.js";

const CX = 360;
const CY = 360;
const R_OUTER = 338;
const R_INNER = 176;

function polar(r, angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function segmentGeometry(index, count, gapDeg = 1.6) {
  const step = 360 / count;
  const start = -90 - step / 2 + index * step + gapDeg / 2;
  const end = start + step - gapDeg;
  const largeArc = end - start > 180 ? 1 : 0;
  const [x1, y1] = polar(R_OUTER, start);
  const [x2, y2] = polar(R_OUTER, end);
  const [x3, y3] = polar(R_INNER, end);
  const [x4, y4] = polar(R_INNER, start);
  const d = [
    `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `A ${R_OUTER} ${R_OUTER} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `L ${x3.toFixed(2)} ${y3.toFixed(2)}`,
    `A ${R_INNER} ${R_INNER} 0 ${largeArc} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
    "Z",
  ].join(" ");

  const mid = (start + end) / 2;
  const labelRadius = (R_INNER + R_OUTER) / 2 + 10;
  const [lx, ly] = polar(labelRadius, mid);
  return { d, mid, start, end, labelX: lx, labelY: ly };
}

function splitLabel(text) {
  const clean = String(text || "").trim();
  if (clean.length <= 15) return [clean];
  const words = clean.split(/\s+/);
  if (words.length === 1) return [clean];
  let best = [clean];
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const diff = Math.abs(a.length - b.length);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = [a, b];
    }
  }
  return best;
}

export function categoryCounts(categories, topics, selectedIds = []) {
  const selected = new Set(selectedIds);
  return categories.map((category) => {
    const items = topics.filter((t) => t.categoryId === category.id);
    return {
      ...category,
      total: items.length,
      selected: items.filter((t) => selected.has(t.id)).length,
      itemIds: items.map((t) => t.id),
    };
  });
}

/**
 * Vykreslí kolo oblastí Vema. Segment = kategorie modulů, barva = kategorie.
 * Stejné SVG používá náhled, PPTX (přes rasterizaci) i video.
 *
 * @param {{
 *   categories?: any[],
 *   topics?: any[],
 *   selectedIds?: string[],
 *   currentCategoryId?: string|null,
 *   size?: number,
 *   interactive?: boolean,
 *   centerTitle?: string,
 *   ariaLabel?: string
 * }} [options]
 */
export function categoryWheelSVG(options = {}) {
  const {
    categories = [],
    topics = [],
    selectedIds = [],
    currentCategoryId = null,
    size = 720,
    interactive = false,
    centerTitle = "Vema",
    ariaLabel = "Kolo oblastí Vema",
  } = options;

  const stats = categoryCounts(categories, topics, selectedIds);
  const selectedModules = stats.reduce((sum, c) => sum + c.selected, 0);
  const totalModules = stats.reduce((sum, c) => sum + c.total, 0);
  const focusMode = Boolean(currentCategoryId);
  const count = Math.max(stats.length, 1);

  const segs = stats
    .map((cat, index) => {
      const geo = segmentGeometry(index, count);
      const isCurrent = focusMode && cat.id === currentCategoryId;
      const isSelected = cat.selected > 0;
      const isFull = cat.total > 0 && cat.selected === cat.total;

      let fill = "#E7EEF7";
      let textColor = "#52657A";
      let countColor = "#899BAB";
      let weight = 600;
      if (isCurrent) {
        fill = cat.color;
        textColor = "#FFFFFF";
        countColor = "#EAF4FF";
        weight = 700;
      } else if (focusMode) {
        fill = isSelected ? "#DCE8F7" : "#EEF3F9";
        textColor = isSelected ? "#2C5A93" : "#8296A8";
        countColor = isSelected ? "#5C7FA6" : "#96A8B8";
        weight = isSelected ? 650 : 550;
      } else if (isSelected) {
        fill = cat.color;
        textColor = "#FFFFFF";
        countColor = "#EAF4FF";
        weight = 700;
      }

      const lines = splitLabel(cat.name);
      const fontSize = lines.some((l) => l.length > 13) ? 15 : 16.5;
      const lineHeight = fontSize * 1.16;
      const startY = -(((lines.length - 1) * lineHeight) / 2) - 8;

      const text = lines
        .map(
          (line, i) =>
            `<tspan x="0" dy="${i === 0 ? startY : lineHeight}">${esc(line)}</tspan>`,
        )
        .join("");

      const countLabel = `${cat.selected} / ${cat.total}`;
      const hit = interactive ? "wheel-hit" : "";

      return `
        <g class="wheel-seg ${hit}" ${interactive ? `data-category-id="${esc(cat.id)}" role="button" tabindex="0"` : ""} aria-label="${esc(cat.name)}">
          <path d="${geo.d}" fill="${fill}" stroke="#FFFFFF" stroke-width="2" />
          <text transform="translate(${geo.labelX.toFixed(2)} ${geo.labelY.toFixed(2)})"
                text-anchor="middle" dominant-baseline="middle"
                font-family="Arial, Liberation Sans, sans-serif" font-size="${fontSize}"
                font-weight="${weight}" fill="${textColor}"
                style="pointer-events:none;user-select:none">${text}</text>
          <text x="${geo.labelX.toFixed(2)}" y="${(geo.labelY + lineHeight * (lines.length - 1) / 2 + 18).toFixed(2)}"
                text-anchor="middle" font-family="Arial, Liberation Sans, sans-serif"
                font-size="11.5" font-weight="600" fill="${countColor}"
                style="pointer-events:none;user-select:none">${esc(countLabel)}</text>
        </g>`;
    })
    .join("");

  const subtitle = `${selectedModules} z ${totalModules} modulů`;
  const hint = focusMode ? "VYBRANÁ OBLAST" : "KLIKNĚTE DO KOLA";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 720" width="${size}" height="${size}" role="img" aria-label="${esc(ariaLabel)}" class="vema-wheel">
    <style>
      .vema-wheel .wheel-hit { cursor: pointer; }
      .vema-wheel .wheel-hit:hover path { filter: brightness(1.05); }
      .vema-wheel .wheel-hit:focus { outline: none; }
      .vema-wheel .wheel-hit:focus path { stroke: ${THEME.accent}; stroke-width: 5; }
    </style>
    <circle cx="${CX}" cy="${CY}" r="${R_OUTER + 4}" fill="#FFFFFF" opacity="0.55" />
    <g>${segs}</g>
    <circle cx="${CX}" cy="${CY}" r="${R_INNER - 4}" fill="#FFFFFF" stroke="#E3EBF4" stroke-width="1.5" />
    <text x="${CX}" y="${CY - 12}" text-anchor="middle" font-family="Arial, Liberation Sans, sans-serif" font-size="40" font-weight="700" fill="${THEME.navy}">${esc(centerTitle)}</text>
    <text x="${CX}" y="${CY + 30}" text-anchor="middle" font-family="Arial, Liberation Sans, sans-serif" font-size="16" fill="${THEME.muted}">${esc(subtitle)}</text>
    <text x="${CX}" y="${CY + 60}" text-anchor="middle" font-family="Arial, Liberation Sans, sans-serif" font-size="10.5" letter-spacing="1.4" fill="#93A4B5">${esc(hint)}</text>
  </svg>`;
}
