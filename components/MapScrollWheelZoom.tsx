"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

/** Enables/disables Leaflet scroll-wheel zoom after mount (prop alone is mount-only). */
export default function MapScrollWheelZoom({ enabled }: { enabled: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (enabled) {
      map.scrollWheelZoom.enable();
    } else {
      map.scrollWheelZoom.disable();
    }
  }, [map, enabled]);

  return null;
}
