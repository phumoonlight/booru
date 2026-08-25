import Link from "next/link";
import { groupByCategory, type Tag, type TagCategory } from "@/lib/data/tags";

// Danbooru-style category colours, tuned for the dark theme
const CATEGORY_COLOR: Record<TagCategory, string> = {
  artist: "text-[#ff8a8b]",
  copyright: "text-[#c797ff]",
  character: "text-[#35c64a]",
  general: "text-[#4fa3e3]",
  meta: "text-[#ead084]",
};

const CATEGORY_LABEL: Record<TagCategory, string> = {
  artist: "Artist",
  copyright: "Copyright",
  character: "Character",
  general: "General",
  meta: "Meta",
};

export function TagList({ tags }: { tags: Tag[] }) {
  const groups = groupByCategory(tags);

  if (groups.length === 0) {
    return <p className="text-sm text-muted">No tags on this post.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map(([category, group]) => (
        <section key={category}>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            {CATEGORY_LABEL[category]}
          </h3>
          <ul className="flex flex-col gap-0.5">
            {group.map((tag) => (
              <li key={tag.id} className="flex items-center gap-2">
                <Link
                  href={`/?tags=${encodeURIComponent(tag.name)}`}
                  className={`min-h-9 flex-1 py-1 text-sm hover:underline ${CATEGORY_COLOR[category]}`}
                >
                  {tag.name}
                </Link>
                <span className="text-xs tabular-nums text-muted">
                  {tag.post_count}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
