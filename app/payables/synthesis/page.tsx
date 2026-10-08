import { PayablesSynthesis } from "@/components/probant/PayablesSynthesis";
export default async function Page({ searchParams }: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const p = await searchParams, v = (k: string) => typeof p[k] === "string" ? p[k] as string : undefined;
    return <PayablesSynthesis initial={{ dossierId: v("dossierId") ?? "", periodId: v("periodId") ?? "", id: v("id"), version: v("version") && /^[1-9]\d*$/.test(v("version")!) ? Number(v("version")) : undefined, event: v("event") }}/>;
}
