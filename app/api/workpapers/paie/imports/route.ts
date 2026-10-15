import { requireLocalPayroll } from "@/lib/workpapers/payroll-local-runtime";
import { payrollRealDisabled } from "@/lib/workpapers/payroll-http";
export const runtime = "nodejs";
export async function POST(request:Request){try{requireLocalPayroll()}catch{return payrollRealDisabled()}return (await import("@/lib/workpapers/payroll-local-server")).localPayrollServer.importsPOST(request)}
