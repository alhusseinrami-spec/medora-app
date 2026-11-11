"use client";
import { useEffect } from "react";

// Registers the field app's service worker, which (with /field.webmanifest) lets phones install it as an app.
export function FieldAppSetup() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/field-sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
