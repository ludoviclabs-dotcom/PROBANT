// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientFramingWorkspace } from "../ClientFramingWorkspace";
import { CLIENT_FRAME_TEMPLATE } from "@/lib/workpapers/clients-adapter";
import { periodId, type WorkpaperRun } from "@/lib/workpapers/model";
import { period } from "@/lib/workpapers/__tests__/clients-framing-fixtures";
const dossier = "11111111-1111-4111-8111-111111111111";
const initial: WorkpaperRun = { id: "pilot", rootId: "pilot", revision: 1, version: 1, schemaVersion: "1.0.0", scope: { organizationId: "real-org", dossierId: dossier, periodId: periodId(period), mode: "real" },
    period, template: CLIENT_FRAME_TEMPLATE, state: "draft", preparedBy: "actual-preparer", importIds: [], evidence: [], findings: [], notes: [], events: [] };
function mount(post: (body: Record<string, unknown>, headers: HeadersInit) => Promise<Response>) {
    let current = initial;
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
        if (url === "/api/auth/session")
            return Response.json({ authenticated: true, csrfToken: "server-csrf" });
        if (options?.method === "POST") {
            const response = await post(JSON.parse(options.body as string), options.headers!);
            if (response.ok)
                current = (await response.clone().json()).run;
            return response;
        }
        return Response.json({ actorId: "actual-preparer", permissions: ["read", "prepare", "download"], runs: [current], imports: [], sourceHeads: [], sourcesCurrent: { pilot: true } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ClientFramingWorkspace initialDossierId={dossier} initialPeriodValue={period}/>);
    fireEvent.click(screen.getByText("Charger le cadrage"));
    return fetchMock;
}
async function edit() {
    await screen.findByText(/Identité connectée : actual-preparer/);
    fireEvent.change(screen.getByLabelText("Conclusion"), { target: { value: "Ma conclusion" } });
    fireEvent.click(screen.getByText("Sauvegarder la conclusion"));
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("feuille pilote durable — accusés et conflits", () => {
    it("n’affiche sauvegardée qu’après l’accusé serveur et montre l’auteur réel", async () => {
        let ack: (response: Response) => void = () => { };
        mount(() => new Promise<Response>(resolve => { ack = resolve; }));
        await edit();
        await screen.findByText(/Sauvegarde en cours/);
        expect(screen.queryByText(/Sauvegardée — accusé/)).toBeNull();
        expect(screen.queryByText(/rôle simulé/i)).toBeNull();
        ack(Response.json({ run: { ...initial, version: 2, conclusion: "Ma conclusion", events: [{ id: "pilot:2", action: "conclusion", actorId: "actual-preparer", at: "2025-02-01T00:00:00Z", version: 2 }] } }));
        await screen.findByText(/Sauvegardée — accusé serveur reçu/);
        expect(screen.getByText(/Version courante 2/)).toBeTruthy();
    });
    it("garde la même clé et le même contenu après une panne réseau", async () => {
        const requests: {
            body: Record<string, unknown>;
            key: string | null;
        }[] = [];
        mount(async (body, headers) => {
            requests.push({ body, key: new Headers(headers).get("Idempotency-Key") });
            if (requests.length === 1)
                throw new Error("Connexion interrompue");
            return Response.json({ run: { ...initial, version: 2, conclusion: "Ma conclusion" } });
        });
        await edit();
        await screen.findByText(/Échec de sauvegarde/);
        expect(screen.queryByText(/Sauvegardée —/)).toBeNull();
        fireEvent.click(screen.getByText("Réessayer la même commande"));
        await screen.findByText(/Sauvegardée —/);
        expect(requests[1]).toEqual(requests[0]);
        expect(requests[0].body).not.toHaveProperty("actorId");
        expect(requests[0].body).not.toHaveProperty("role");
    });
    it("préserve le brouillon, compare la version serveur et attend une reprise explicite", async () => {
        let calls = 0;
        const current = { ...initial, version: 2, conclusion: "Conclusion concurrente" };
        mount(async () => { calls++; return Response.json({ error: "STALE_WORKPAPER_VERSION", expectedVersion: 1, current }, { status: 409 }); });
        await edit();
        await screen.findByText("Une autre modification a été sauvegardée");
        expect(screen.getByText("Votre brouillon · version 1")).toBeTruthy();
        expect(screen.getByText("Version serveur 2")).toBeTruthy();
        expect(screen.getByText("Conclusion concurrente")).toBeTruthy();
        expect((screen.getByLabelText("Conclusion") as HTMLTextAreaElement).value).toBe("Ma conclusion");
        fireEvent.click(screen.getByText("Conserver mon texte sur la version courante"));
        await waitFor(() => expect(screen.getByText(/Version courante 2/)).toBeTruthy());
        expect(calls).toBe(1);
        expect((screen.getByLabelText("Conclusion") as HTMLTextAreaElement).value).toBe("Ma conclusion");
    });
});
