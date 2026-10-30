import type { AxiosResponse } from "axios";

type PaginatedBody<T> = {
    data: T[];
    meta?: { page: number; limit: number; total: number; totalPages: number };
};

/** `getNextPageParam` for a useInfiniteQuery over a `{ data, meta }` paginated endpoint. Stops
 *  once the last page is reached — or as soon as a batch comes back shorter than the requested
 *  limit, which also covers rows deleted server-side since `meta.totalPages` was computed. */
export const getNextPageParam = <T>(lastPage: AxiosResponse<PaginatedBody<T>>, limit: number): number | undefined => {
    const meta = lastPage.data?.meta;
    if (!meta || meta.page >= meta.totalPages) return undefined;
    if ((lastPage.data?.data?.length ?? 0) < limit) return undefined;
    return meta.page + 1;
};

/** Flattens every loaded page into one list, dropping repeat ids. Offset pagination can repeat a
 *  row at a page boundary when a record is created while the user is mid-scroll (everything shifts
 *  down by one) — this keeps that from rendering a duplicate row. */
export const flattenUniqueById = <T extends { id?: number }>(pages: AxiosResponse<PaginatedBody<T>>[] | undefined): T[] => {
    const seen = new Set<number>();
    const result: T[] = [];
    for (const page of pages ?? []) {
        for (const item of page.data?.data ?? []) {
            if (item.id !== undefined) {
                if (seen.has(item.id)) continue;
                seen.add(item.id);
            }
            result.push(item);
        }
    }
    return result;
};
