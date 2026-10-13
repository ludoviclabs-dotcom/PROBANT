"use client";
import NextLink from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, type ComponentProps, type AnchorHTMLAttributes } from "react";
import { useOptionalActiveDossier } from "@/lib/dossier/client";
import { contextParams, navigationContext, parseNavigationContext, withDossierContext } from "@/lib/dossier/navigation-context";

export function useDossierHref() {
  const active = useOptionalActiveDossier(), params = useSearchParams();
  let context = null;
  try { context = active ? navigationContext(active.snapshot, active.context) : parseNavigationContext(new URLSearchParams(params.toString())); } catch { /* Invalid contexts are displayed by the route boundary. */ }
  const key = context ? contextParams(context).toString() : "";
  return useCallback((href: string) => withDossierContext(href, key ? parseNavigationContext(new URLSearchParams(key)) : null), [key]);
}
export function DossierContextLink({ href, ...props }: ComponentProps<typeof NextLink>) {
  const contextual = useDossierHref();
  return <NextLink {...props} href={typeof href === "string" ? contextual(href) : href} />;
}
export function DossierContextAnchor({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const contextual = useDossierHref();
  return <a {...props} href={href ? contextual(href) : href} />;
}
