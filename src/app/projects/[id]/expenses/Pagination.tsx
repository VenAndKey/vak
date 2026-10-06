"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 10;

export function usePagination<T>(items: T[], pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  // Keep the page in range if the list shrinks (e.g. after a refetch).
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const current = Math.min(page, totalPages);
  const pageItems = items.slice((current - 1) * pageSize, current * pageSize);

  return { page: current, totalPages, total: items.length, pageItems, setPage };
}

export function PaginationControls({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-3 py-3 bg-slate-50 border rounded-md text-sm">
      <div className="text-slate-600 text-xs max-sm:text-sm">
        Page <span className="font-semibold">{page}</span> of{" "}
        <span className="font-semibold">{totalPages}</span> ({total} total)
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="h-8 max-sm:h-10 max-sm:px-4 text-xs max-sm:text-sm"
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="h-8 max-sm:h-10 max-sm:px-4 text-xs max-sm:text-sm"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
