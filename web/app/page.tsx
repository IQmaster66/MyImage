import { QueryStatus } from "@/components/query-status";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-emerald-50/50 dark:bg-emerald-950/30">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
        <section className="rounded-xl border border-dashed border-emerald-200 bg-white p-10 text-center dark:border-emerald-800/60 dark:bg-zinc-900">
          <p className="text-emerald-900 dark:text-emerald-100">
            相册网格与灯箱可在接入后端（MinIO 预签名 URL / 列表 API）后继续扩展。
          </p>
          <div className="mt-6 flex justify-center">
            <QueryStatus />
          </div>
        </section>
      </main>
    </div>
  );
}
