import { RotateCcw } from "lucide-react";
import { useInfiniteScroll } from "../../hook/useInfiniteScroll";

export interface InfiniteScrollFooterProps {
    hasNextPage: boolean;
    isFetching: boolean;
    isFetchingNextPage: boolean;
    /** The last next-page fetch failed — shows a Retry button instead of auto-loading. */
    isError: boolean;
    onLoadMore: () => void;
    loadedCount: number;
    total?: number;
    /** Scroll container the footer sits in — see useInfiniteScroll's `root`. */
    scrollRoot?: Element | null;
    /** Plural noun for the end-of-list message, e.g. "couriers". */
    itemLabel?: string;
}

/** Bottom-of-list sentinel for an infinite-scroll table: auto-loads the next batch as it scrolls
 *  into view, and shows a small loader, a retry prompt, or an end-of-list message. Render it
 *  inside the scroll container, after the table. */
const InfiniteScrollFooter = ({
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isError,
    onLoadMore,
    loadedCount,
    total,
    scrollRoot,
    itemLabel = "records",
}: InfiniteScrollFooterProps) => {
    const sentinelRef = useInfiniteScroll({ hasNextPage, isFetching, isError, onLoadMore, root: scrollRoot });

    if (loadedCount === 0) return null;

    return (
        <div className="border-t border-slate-100 px-4 py-3 text-center text-xs text-slate-500">
            {hasNextPage && <div ref={sentinelRef} aria-hidden="true" className="h-px" />}

            {isFetchingNextPage ? (
                <div className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#3d6fe0] border-t-transparent"></div>
                    <span>Loading more {itemLabel}…</span>
                </div>
            ) : isError ? (
                <div className="flex items-center justify-center gap-2">
                    <span className="text-red-500">Couldn't load more {itemLabel}.</span>
                    <button
                        type="button"
                        onClick={onLoadMore}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                    >
                        <RotateCcw className="h-3 w-3" />
                        Retry
                    </button>
                </div>
            ) : hasNextPage ? (
                <span>
                    Showing {loadedCount}
                    {total !== undefined ? ` of ${total}` : ""} — scroll for more
                </span>
            ) : (
                <span>
                    You've reached the end · {total ?? loadedCount} {itemLabel}
                </span>
            )}
        </div>
    );
};

export default InfiniteScrollFooter;
