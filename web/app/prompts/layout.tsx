import { PromptsSidebar } from "@/components/prompts/prompts-sidebar";

export default function PromptsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-emerald-50/50 sm:flex-row dark:bg-emerald-950/30">
      <PromptsSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">{children}</div>
    </div>
  );
}
