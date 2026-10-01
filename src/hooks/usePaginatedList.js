import { useEffect, useMemo, useState } from "react";

export const CATALOG_PAGE_SIZE = 25;

function scrollMainPaneToTop() {
  document.querySelector(".main-pane")?.scrollTo({ top: 0, behavior: "smooth" });
}

export function usePaginatedList(items, pageSize = CATALOG_PAGE_SIZE, resetKey = "") {
  const [pageIndex, setPageIndex] = useState(0);
  const list = items ?? [];
  const total = list.length;
  const pageCount = Math.max(0, Math.ceil(total / pageSize));

  useEffect(() => {
    setPageIndex(0);
  }, [resetKey]);

  useEffect(() => {
    if (pageCount > 0 && pageIndex > pageCount - 1) {
      setPageIndex(pageCount - 1);
    }
  }, [pageCount, pageIndex]);

  const slice = useMemo(() => {
    const start = pageIndex * pageSize;
    return list.slice(start, start + pageSize);
  }, [list, pageIndex, pageSize]);

  const goToPage = (nextIndex) => {
    if (nextIndex < 0 || (pageCount > 0 && nextIndex >= pageCount)) return;
    setPageIndex(nextIndex);
    scrollMainPaneToTop();
  };

  return {
    slice,
    total,
    pageSize,
    pageIndex,
    pageCount,
    goToPage,
  };
}
