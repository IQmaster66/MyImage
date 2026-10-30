import {
  INSPIRATION_LINKS,
  INSPIRATION_SECTION_LABEL,
} from "@/lib/inspiration-links";

type InspirationLinksListProps = {
  /** 下拉菜单更紧凑；侧栏展示描述 */
  variant: "dropdown" | "sidebar";
  /** 点击链接后回调（例如关闭下拉） */
  onNavigate?: () => void;
};

export function InspirationLinksList({
  variant,
  onNavigate,
}: InspirationLinksListProps) {
  const isDropdown = variant === "dropdown";

  return (
    <div>
      <p
        className={
          isDropdown
            ? "px-3 pt-2.5 pb-1 text-[10px] font-semibold tracking-wider text-gray-400 uppercase dark:text-gray-500"
            : "mb-1.5 px-1 text-[10px] font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400"
        }
      >
        {INSPIRATION_SECTION_LABEL}
      </p>
      <nav
        className={
          isDropdown
            ? "flex flex-col gap-0.5 px-1.5 pb-1.5"
            : "flex flex-col gap-0.5"
        }
        aria-label={INSPIRATION_SECTION_LABEL}
      >
        {INSPIRATION_LINKS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onNavigate}
            className={
              isDropdown
                ? "rounded-md px-2.5 py-2 transition-colors hover:bg-green-50 dark:hover:bg-green-950/40"
                : "rounded-lg px-3 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800"
            }
          >
            <span
              className={
                isDropdown
                  ? "flex items-center justify-between gap-2 text-sm font-medium text-gray-800 dark:text-gray-100"
                  : "flex items-center justify-between gap-2 text-sm text-gray-700 dark:text-gray-300"
              }
            >
              <span>{item.label}</span>
              <span
                className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500"
                aria-hidden
              >
                ↗
              </span>
            </span>
            <span
              className={
                isDropdown
                  ? "mt-0.5 block text-[11px] leading-snug text-gray-500 dark:text-gray-400"
                  : "mt-0.5 block text-[11px] leading-snug text-gray-500 dark:text-gray-500"
              }
            >
              {item.description}
            </span>
          </a>
        ))}
      </nav>
    </div>
  );
}
