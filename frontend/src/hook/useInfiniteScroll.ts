import { useEffect, useRef, useState } from "react";

interface UseInfiniteScrollOptions {
    hasNextPage: boolean;
    /** Any fetch in flight for this list (first page, next page, or an invalidation refetch) —
     *  no new page is requested until it settles, so scrolling can never stack requests. */
    isFetching: boolean;
    /** The last next-page fetch failed — auto-loading pauses until the user retries manually,
     *  instead of re-firing the failing request every time the sentinel is visible. */
    isError: boolean;
    onLoadMore: () => void;
    /** Scroll container the sentinel lives in; defaults to the viewport. */
    root?: Element | null;
    /** How far ahead of the sentinel becoming visible to start loading. */
    rootMargin?: string;
}

/**
 * Calls `onLoadMore` when the returned sentinel ref's element scrolls into view, using
 * IntersectionObserver rather than a scroll listener. The observer is re-created whenever a fetch
 * settles — its initial callback then reports whether the sentinel is *still* visible, so a batch
 * too short to fill the container keeps loading until it does (a plain observer would never fire
 * again, since the sentinel's visibility didn't change).
 */
export const useInfiniteScroll = ({
    hasNextPage,
    isFetching,
    isError,
    onLoadMore,
    root = null,
    rootMargin = "200px",
}: UseInfiniteScrollOptions) => {
    const [sentinel, setSentinel] = useState<Element | null>(null);

    // Latest callback without re-creating the observer on every render.
    const onLoadMoreRef = useRef(onLoadMore);
    useEffect(() => {
        onLoadMoreRef.current = onLoadMore;
    });

    useEffect(() => {
        if (!sentinel || !hasNextPage || isFetching || isError) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    // Disconnect before the fetch flips isFetching, so a second intersection
                    // in the meantime can't fire a duplicate request.
                    observer.disconnect();
                    onLoadMoreRef.current();
                }
            },
            { root, rootMargin }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [sentinel, hasNextPage, isFetching, isError, root, rootMargin]);

    return setSentinel;
};
