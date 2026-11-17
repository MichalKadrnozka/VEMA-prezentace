import { useMemo } from "react";
import { categoryWheelSVG } from "../../shared/wheel.js";
import { enrichTopic } from "../../shared/model.js";
import type { Content } from "../types";

export function Wheel({
  content,
  selectedIds,
  onToggleCategory,
}: {
  content: Content;
  selectedIds: string[];
  onToggleCategory: (categoryId: string) => void;
}) {
  const topics = useMemo(
    () =>
      content.topics
        .filter((t) => t.enabled !== false)
        .map((t) => enrichTopic(content, t)),
    [content],
  );

  const html = useMemo(
    () =>
      categoryWheelSVG({
        categories: content.categories,
        topics,
        selectedIds,
        interactive: true,
        size: 720,
      }),
    [content.categories, topics, selectedIds],
  );

  function pick(target: EventTarget | null) {
    const el = (target as HTMLElement | null)?.closest?.("[data-category-id]");
    const id = el?.getAttribute("data-category-id");
    if (id) onToggleCategory(id);
  }

  return (
    <div
      className="wheel-wrap"
      onClick={(e) => pick(e.target)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick(e.target);
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
