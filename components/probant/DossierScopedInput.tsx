"use client";
import { useSearchParams } from "next/navigation";
import type { InputHTMLAttributes } from "react";

/** Contextual navigation has one selected scope. Legacy manual-entry routes keep their existing inputs. */
export function DossierScopedInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const params = useSearchParams();
  return <input {...props} readOnly={props.readOnly || params.has("context")} />;
}
