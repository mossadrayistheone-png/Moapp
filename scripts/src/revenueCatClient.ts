/**
 * Returns an initialised @replit/revenuecat-sdk Client that routes all
 * requests through the Replit RevenueCat connector proxy.
 *
 * The connector injects the Bearer token server-side — no API key is
 * ever read from environment variables here.
 *
 * Usage:
 *   const client = await getUncachableRevenueCatClient();
 *   const { data } = await listProjects({ client, query: { limit: 20 } });
 */

import { ReplitConnectors } from "@replit/connectors-sdk";
import { createClient, createConfig } from "@replit/revenuecat-sdk/client";

export async function getUncachableRevenueCatClient() {
  const connectors = new ReplitConnectors();

  // createProxyFetch returns a fetch-compatible function that routes every
  // request through the Replit connector proxy for "revenuecat", injecting
  // auth automatically.  The SDK's createConfig accepts it via the `fetch`
  // option, so all SDK helper functions (listProjects, createProduct, etc.)
  // use the proxy transparently.
  const proxyFetch = connectors.createProxyFetch("revenuecat");

  const client = createClient(
    createConfig({
      // The proxy forwards to https://api.revenuecat.com; the SDK appends /v2/…
      baseUrl: "https://api.revenuecat.com/v2",
      fetch: proxyFetch as typeof fetch,
    })
  );

  return client;
}
