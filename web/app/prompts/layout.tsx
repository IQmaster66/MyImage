import { PromptsSidebar } from "@/components/prompts/prompts-sidebar";
import { Suspense } from "react";

function SidebarFallback() {
  return (
    <aside
      className="flex w-full shrink-0 flex-col border-b border-emerald-200/90 bg-white/95 p-4 sm:sticky sm:top-16 sm:z-30 sm:w-72 sm:shrink-0 sm:self-start sm:border-r sm:border-b-0 dark:border-emerald-900/50 dark:bg-zinc-900/95"
    >
      <p className="text-xs text-gray-500">加载导航…</p>
    </aside>
  );
}

export default function PromptsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start">
      <Suspense fallback={<SidebarFallback />}>
        <PromptsSidebar />
      </Suspense>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
