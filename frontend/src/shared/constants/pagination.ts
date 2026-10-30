/** Batch sizes offered by PageSizeSelect — how many records each infinite-scroll fetch loads. */
export const PAGE_SIZE_OPTIONS = [10, 20, 30, 50] as const;

export const DEFAULT_PAGE_SIZE: number = PAGE_SIZE_OPTIONS[0];
