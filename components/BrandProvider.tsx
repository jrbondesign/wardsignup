"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PublicBrand } from "@/lib/brand";

const BrandContext = createContext<PublicBrand | null>(null);

export function BrandProvider({
  brand,
  children,
}: {
  brand: PublicBrand;
  children: ReactNode;
}) {
  return (
    <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>
  );
}

export function useBrand(): PublicBrand {
  const ctx = useContext(BrandContext);
  if (!ctx) {
    throw new Error("useBrand must be used within BrandProvider");
  }
  return ctx;
}
