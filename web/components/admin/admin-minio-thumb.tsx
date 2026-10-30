"use client";

import { fetchMinioReadUrl } from "@/lib/ml-api";
import { useEffect, useState } from "react";

export function AdminMinioThumb({
  imageKey,
  alt,
  className = "h-full w-full object-cover",
}: {
  imageKey: string;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    void fetchMinioReadUrl(imageKey)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [imageKey]);

  if (failed) {
    return (
      <div className="flex h-full min-h-[5rem] items-center justify-center bg-gray-100 text-[10px] text-gray-500 dark:bg-zinc-900 dark:text-gray-400">
        加载失败
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex h-full min-h-[5rem] items-center justify-center bg-gray-100 text-[10px] text-gray-400 dark:bg-zinc-900">
        …
      </div>
    );
  }

  return <img src={url} alt={alt} className={className} loading="lazy" decoding="async" />;
}
