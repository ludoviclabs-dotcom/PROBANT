import "server-only";
import { getDatabase } from "@/lib/db/client";
import { getRequestAuthorizer } from "@/lib/auth/server";
import { FixedAssetRuntime } from "./fixed-asset-runtime";
import { fixedAssetHandlers } from "./fixed-asset-http";
import { PostgresFixedAssetDatabase } from "./fixed-asset-store";
export const fixedAssetServer = fixedAssetHandlers(() => new FixedAssetRuntime(new PostgresFixedAssetDatabase(getDatabase()), getRequestAuthorizer()));
