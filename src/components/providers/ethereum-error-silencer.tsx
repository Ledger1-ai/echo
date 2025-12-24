"use client";

import { useEffect } from "react";

export function EthereumErrorSilencer() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const msg =
        (event?.error && (event.error as any)?.message) ||
        event.message ||
        "";
      const src = (event as any).filename || "";
      // Suppress extension-originating redefinition errors for window.ethereum
      if (
        /Cannot redefine property: ethereum/i.test(msg) ||
        /evmAsk\.js/i.test(src) ||
        /bfnaelmomeimhlpmgjnjophhpkkoljpa/i.test(src)
      ) {
        event.preventDefault();
        return true;
      }
      return undefined;
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event?.reason;
      const msg =
        typeof reason === "string"
          ? reason
          : (reason && (reason.message as string)) || "";
      if (/Cannot redefine property: ethereum/i.test(msg)) {
        event.preventDefault();
        return true;
      }
      return undefined;
    };

    window.addEventListener("error", onError, { capture: true });
    window.addEventListener("unhandledrejection", onRejection, { capture: true });

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
