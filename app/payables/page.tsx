import { PAYABLE_PROCEDURES,type PayableProcedure } from "@/lib/workpapers/payables-program";
import { PayablesWorkspace } from "@/components/probant/PayablesWorkspace";
export default async function Page({ searchParams }: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const p = await searchParams, value = (k: string) => typeof p[k] === "string" ? p[k] as string : undefined;
    return <PayablesWorkspace initial={{ dossierId: value("dossierId") ?? "", periodId: value("periodId") ?? "", id: value("id"), version: value("version") && /^[1-9]\d*$/.test(value("version")!) ? Number(value("version")) : undefined, event: value("event"), filter: value("filter") ?? "all",procedure:PAYABLE_PROCEDURES.includes(value("procedure") as PayableProcedure)?value("procedure") as PayableProcedure:undefined }}/>;
}
