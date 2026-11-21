/** Helpers shared by the Share modals (Sells invoice, Products catalogue card). */

/** Web Share API file support (mobile Chrome/Safari, Chrome/Edge on Windows) — the only way to hand an
 *  actual PDF to WhatsApp or another app. Feature-detected once; callers hide the button otherwise. */
export const canShareFiles: boolean = (() => {
  try {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [new File([""], "file.pdf", { type: "application/pdf" })] })
    );
  } catch {
    return false;
  }
})();

/** Saves a blob through a temporary <a download> link (same pattern as ExportDropdown). */
export const downloadBlob = (blob: Blob, fileName: string) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};

/** A blob responseType also wraps the JSON error body in a Blob — unwrap it for the message. */
export const getBlobErrorMessage = async (err: unknown, fallback: string): Promise<string> => {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      return JSON.parse(await data.text())?.message || fallback;
    } catch {
      return fallback;
    }
  }
  return (err as { message?: string })?.message || fallback;
};

/** Opens the device share sheet with one or more files. Resolves false (not an error) when the user dismisses it. */
export const shareFile = async (file: File | File[], data: { title?: string; text?: string }): Promise<boolean> => {
  try {
    await navigator.share({ files: Array.isArray(file) ? file : [file], ...data });
    return true;
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") return false;
    throw err;
  }
};
