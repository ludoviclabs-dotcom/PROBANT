// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DossierScopedInput } from "../DossierScopedInput";
import { CapabilityAccess } from "../CapabilityAccess";

const route = vi.hoisted(() => ({ params: null as URLSearchParams | null }));
vi.mock("next/navigation", () => ({ useSearchParams: () => route.params }));
afterEach(() => { cleanup(); route.params = null; vi.unstubAllGlobals(); });

it("keeps legacy manual input editable when the router has no parameters", () => {
  render(<DossierScopedInput aria-label="Dossier" defaultValue="dossier-local" />);
  expect(screen.getByRole("textbox", { name: "Dossier" })).toHaveProperty("readOnly", false);
});

it("locks canonical scope and preserves an explicitly read-only input without a router", () => {
  route.params = new URLSearchParams("context=1&dossierId=dossier-local");
  const view = render(<DossierScopedInput aria-label="Dossier" defaultValue="dossier-local" />);
  expect(screen.getByRole("textbox", { name: "Dossier" })).toHaveProperty("readOnly", true);
  route.params = null;
  view.rerender(<DossierScopedInput aria-label="Dossier" readOnly />);
  expect(screen.getByRole("textbox", { name: "Dossier" })).toHaveProperty("readOnly", true);
});

it("does not read capabilities or substitute DEMO SA when no dossier is selected", () => {
  const read = vi.fn(); vi.stubGlobal("fetch", read);
  render(<CapabilityAccess />);
  expect(screen.getByRole("status").textContent).toContain("Choisissez un dossier");
  expect(read).not.toHaveBeenCalled();
  expect(screen.queryByRole("link")).toBeNull();
});
