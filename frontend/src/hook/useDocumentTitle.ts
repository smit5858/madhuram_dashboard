import { useEffect } from "react";

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} | Saggu Auto Tech` : "Saggu Auto Tech";
  }, [title]);
}
