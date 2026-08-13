import "server-only";

import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import type { AwsCredentialIdentityProvider } from "@smithy/types";

export interface AwsRuntimeConfig {
  region: string;
  credentials?: AwsCredentialIdentityProvider;
}

export function awsRuntimeConfig(region: string): AwsRuntimeConfig {
  if (!region) throw new Error("AWS_REGION_NOT_CONFIGURED");

  if (process.env.VERCEL) {
    const roleArn = process.env.AWS_ROLE_ARN?.trim();
    if (!roleArn) throw new Error("AWS_OIDC_ROLE_NOT_CONFIGURED");
    return {
      region,
      credentials: awsCredentialsProvider({
        roleArn,
        clientConfig: { region },
        roleSessionName: "probant-vercel",
      }),
    };
  }

  // Lambda/ECS use the task execution role. Local development uses the
  // standard AWS provider chain and is never enabled by the demo mode.
  return { region };
}
