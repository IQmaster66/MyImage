"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * 占位：验证 TanStack Query 与 Provider 已接通。接入真实 API 后可删或改为相册请求。
 */
export function QueryStatus() {
  const { isSuccess, dataUpdatedAt } = useQuery({
    queryKey: ["app", "bootstrap"],
    queryFn: async () => ({ ready: true as const }),
    staleTime: Infinity,
  });

  return (
    <p className="text-sm text-emerald-700 dark:text-emerald-400">
      TanStack Query 已就绪
      {isSuccess && dataUpdatedAt
        ? ` · 缓存于 ${new Date(dataUpdatedAt).toLocaleTimeString()}`
        : null}
    </p>
  );
}
