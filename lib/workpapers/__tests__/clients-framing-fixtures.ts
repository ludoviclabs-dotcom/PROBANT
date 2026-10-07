import { clientsMappingSchema } from "../clients-adapter";
export const period = { startDate: "2024-01-01", closingDate: "2024-12-31", asOfDate: "2025-02-01", currency: "EUR" as const, validation: "provisional" as const };
export const mapping = clientsMappingSchema.parse({ version: "clients-frame-1", headerRow: 1, columns: { key: "id", amount: "amount", date: "date" },
    delimiter: ";", decimal: ".", dateFormat: "ISO", sign: 1, currency: "EUR", clients: { accountColumn: "account", partyColumn: "party", basis: "closing_balance" } });
export const csv = (type: string, changed = false) => "id;account;party;amount;date\n" + (type === "clients_general" ?
    "GL;411000;GL;80.00;2024-12-31" : type === "clients_auxiliary" ?
    "A;411000;A;100.00;2024-12-31\nB;411000;B;-20.00;2024-12-31" :
    "A;411000;A;" + (changed ? "85.00" : "90.00") + ";2024-12-31\nB;411000;B;-10.00;2024-12-31");
