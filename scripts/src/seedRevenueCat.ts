/**
 * RevenueCat seed script for Mo.
 *
 * Creates the full RevenueCat structure:
 *   - One project: "Mo"
 *   - Three app targets: Test Store, App Store (iOS), Play Store (Android)
 *   - Two products:  executive_monthly ($49.99/mo), luxury_monthly ($99.99/mo)
 *   - Two entitlements: "executive", "luxury"
 *   - One offering ("default") with two packages
 *
 * Run AFTER connecting the RevenueCat integration in Replit:
 *   pnpm --filter @workspace/scripts exec tsx src/seedRevenueCat.ts
 *
 * Copy the printed API keys and IDs into Replit Secrets:
 *   EXPO_PUBLIC_REVENUECAT_TEST_API_KEY
 *   EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
 *   EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY
 *   REVENUECAT_PROJECT_ID
 */

import { getUncachableRevenueCatClient } from "./revenueCatClient";

import {
  listProjects,
  createProject,
  listApps,
  createApp,
  listAppPublicApiKeys,
  listProducts,
  createProduct,
  listEntitlements,
  createEntitlement,
  attachProductsToEntitlement,
  listOfferings,
  createOffering,
  updateOffering,
  listPackages,
  createPackages,
  attachProductsToPackage,
  type App,
  type Product,
  type Project,
  type Entitlement,
  type Offering,
  type Package,
  type CreateProductData,
} from "@replit/revenuecat-sdk";

// ── App identity ──────────────────────────────────────────────────────────────
const PROJECT_NAME = "Mo";

// iOS bundle ID and Android package name — update when you create store listings
const APP_STORE_BUNDLE_ID    = "com.mo.assistant.ios";
const PLAY_STORE_PACKAGE_NAME = "com.mo.assistant";

// ── Product definitions ───────────────────────────────────────────────────────
const PRODUCTS = [
  {
    identifier:      "executive_monthly",
    playIdentifier:  "executive_monthly:monthly", // {subscriptionId}:{basePlanId}
    displayName:     "Mo Executive – Monthly",
    title:           "Mo Executive",
    duration:        "P1M" as const,
    entitlementKey:  "executive",
    entitlementName: "Executive Access",
    packageKey:      "executive_monthly",
    packageName:     "Executive Monthly",
    // Test-store price in micros (1,000,000 micros = $1)
    prices: [
      { amount_micros: 49_990_000, currency: "USD" },
    ],
  },
  {
    identifier:      "luxury_monthly",
    playIdentifier:  "luxury_monthly:monthly",
    displayName:     "Mo Luxury – Monthly",
    title:           "Mo Luxury",
    duration:        "P1M" as const,
    entitlementKey:  "luxury",
    entitlementName: "Luxury Access",
    packageKey:      "luxury_monthly",
    packageName:     "Luxury Monthly",
    prices: [
      { amount_micros: 99_990_000, currency: "USD" },
    ],
  },
] as const;

const OFFERING_KEY  = "default";
const OFFERING_NAME = "Default Offering";

// ── Helpers ───────────────────────────────────────────────────────────────────

type TestStorePricesResponse = {
  object: string;
  prices: { amount_micros: number; currency: string }[];
};

async function ensureProduct(
  client: Awaited<ReturnType<typeof getUncachableRevenueCatClient>>,
  projectId: string,
  existingProducts: Product[],
  targetApp: App,
  label: string,
  storeIdentifier: string,
  isTestStore: boolean,
  def: typeof PRODUCTS[number]
): Promise<Product> {
  const existing = existingProducts.find(
    (p) => p.store_identifier === storeIdentifier && p.app_id === targetApp.id
  );
  if (existing) {
    console.log(`  ${label} product already exists:`, existing.id);
    return existing;
  }

  const body: CreateProductData["body"] = {
    store_identifier: storeIdentifier,
    app_id:           targetApp.id,
    type:             "subscription",
    display_name:     def.displayName,
  };
  if (isTestStore) {
    body.subscription = { duration: def.duration };
    body.title = def.title;
  }

  const { data, error } = await createProduct({ client, path: { project_id: projectId }, body });
  if (error) throw new Error(`Failed to create ${label} product: ${JSON.stringify(error)}`);
  console.log(`  Created ${label} product:`, data.id);
  return data;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function seed() {
  const client = await getUncachableRevenueCatClient();

  // ── Project ────────────────────────────────────────────────────────────────
  let project: Project;
  const { data: existing, error: listErr } = await listProjects({ client, query: { limit: 20 } });
  if (listErr) throw new Error("Failed to list projects");

  const found = existing.items?.find((p) => p.name === PROJECT_NAME);
  if (found) {
    console.log("Project already exists:", found.id);
    project = found;
  } else {
    const { data, error } = await createProject({ client, body: { name: PROJECT_NAME } });
    if (error) throw new Error("Failed to create project");
    console.log("Created project:", data.id);
    project = data;
  }

  // ── Apps ───────────────────────────────────────────────────────────────────
  const { data: appsData, error: appsErr } = await listApps({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (appsErr || !appsData?.items?.length) throw new Error("No apps found on project");

  let testApp      = appsData.items.find((a) => a.type === "test_store");
  let appStoreApp  = appsData.items.find((a) => a.type === "app_store");
  let playStoreApp = appsData.items.find((a) => a.type === "play_store");

  if (!testApp) throw new Error("Test Store app not found — RevenueCat creates it automatically");
  console.log("Test Store app:", testApp.id);

  if (!appStoreApp) {
    const { data, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: { name: "Mo iOS", type: "app_store", app_store: { bundle_id: APP_STORE_BUNDLE_ID } },
    });
    if (error) throw new Error("Failed to create App Store app");
    appStoreApp = data;
    console.log("Created App Store app:", data.id);
  } else {
    console.log("App Store app:", appStoreApp.id);
  }

  if (!playStoreApp) {
    const { data, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: { name: "Mo Android", type: "play_store", play_store: { package_name: PLAY_STORE_PACKAGE_NAME } },
    });
    if (error) throw new Error("Failed to create Play Store app");
    playStoreApp = data;
    console.log("Created Play Store app:", data.id);
  } else {
    console.log("Play Store app:", playStoreApp.id);
  }

  // ── Products ───────────────────────────────────────────────────────────────
  const { data: existingProducts, error: prodErr } = await listProducts({
    client,
    path: { project_id: project.id },
    query: { limit: 100 },
  });
  if (prodErr) throw new Error("Failed to list products");

  // Store per-product results for entitlement attachment
  const productMap: Record<string, { test: Product; appStore: Product; playStore: Product }> = {};

  for (const def of PRODUCTS) {
    console.log(`\n── ${def.displayName} ──`);

    const testProduct      = await ensureProduct(client, project.id, existingProducts.items ?? [], testApp,      "Test Store", def.identifier,     true,  def);
    const appStoreProduct  = await ensureProduct(client, project.id, existingProducts.items ?? [], appStoreApp,  "App Store",  def.identifier,     false, def);
    const playStoreProduct = await ensureProduct(client, project.id, existingProducts.items ?? [], playStoreApp, "Play Store", def.playIdentifier, false, def);

    productMap[def.entitlementKey] = {
      test:      testProduct,
      appStore:  appStoreProduct,
      playStore: playStoreProduct,
    };

    // Test-store prices
    const { error: priceError } = await client.post<TestStorePricesResponse>({
      url: "/projects/{project_id}/products/{product_id}/test_store_prices",
      path: { project_id: project.id, product_id: testProduct.id },
      body: { prices: def.prices },
    });
    if (priceError) {
      if (
        priceError &&
        typeof priceError === "object" &&
        "type" in priceError &&
        priceError["type"] === "resource_already_exists"
      ) {
        console.log("  Test store prices already exist");
      } else {
        throw new Error(`Failed to set test prices: ${JSON.stringify(priceError)}`);
      }
    } else {
      console.log("  Test store prices set:", def.prices.map((p) => `${p.currency} ${p.amount_micros / 1_000_000}`).join(", "));
    }
  }

  // ── Entitlements ───────────────────────────────────────────────────────────
  const { data: existingEnts, error: entErr } = await listEntitlements({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (entErr) throw new Error("Failed to list entitlements");

  const entitlementMap: Record<string, Entitlement> = {};

  for (const def of PRODUCTS) {
    console.log(`\n── Entitlement: ${def.entitlementKey} ──`);

    let ent: Entitlement;
    const existingEnt = existingEnts.items?.find((e) => e.lookup_key === def.entitlementKey);

    if (existingEnt) {
      console.log("  Entitlement already exists:", existingEnt.id);
      ent = existingEnt;
    } else {
      const { data, error } = await createEntitlement({
        client,
        path: { project_id: project.id },
        body: { lookup_key: def.entitlementKey, display_name: def.entitlementName },
      });
      if (error) throw new Error(`Failed to create entitlement ${def.entitlementKey}: ${JSON.stringify(error)}`);
      console.log("  Created entitlement:", data.id);
      ent = data;
    }
    entitlementMap[def.entitlementKey] = ent;

    const products = productMap[def.entitlementKey];
    const { error: attachErr } = await attachProductsToEntitlement({
      client,
      path: { project_id: project.id, entitlement_id: ent.id },
      body: { product_ids: [products.test.id, products.appStore.id, products.playStore.id] },
    });
    if (attachErr) {
      if (attachErr.type === "unprocessable_entity_error") {
        console.log("  Products already attached to entitlement");
      } else {
        throw new Error(`Failed to attach products to entitlement: ${JSON.stringify(attachErr)}`);
      }
    } else {
      console.log("  Products attached to entitlement");
    }
  }

  // ── Offering ───────────────────────────────────────────────────────────────
  console.log("\n── Offering ──");
  const { data: existingOfferings, error: offErr } = await listOfferings({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (offErr) throw new Error("Failed to list offerings");

  let offering: Offering;
  const existingOff = existingOfferings.items?.find((o) => o.lookup_key === OFFERING_KEY);
  if (existingOff) {
    console.log("Offering already exists:", existingOff.id);
    offering = existingOff;
  } else {
    const { data, error } = await createOffering({
      client,
      path: { project_id: project.id },
      body: { lookup_key: OFFERING_KEY, display_name: OFFERING_NAME },
    });
    if (error) throw new Error("Failed to create offering");
    console.log("Created offering:", data.id);
    offering = data;
  }

  if (!offering.is_current) {
    const { error } = await updateOffering({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      body: { is_current: true },
    });
    if (error) throw new Error("Failed to set offering as current");
    console.log("Set offering as current");
  }

  // ── Packages ───────────────────────────────────────────────────────────────
  const { data: existingPkgs, error: pkgErr } = await listPackages({
    client,
    path: { project_id: project.id, offering_id: offering.id },
    query: { limit: 20 },
  });
  if (pkgErr) throw new Error("Failed to list packages");

  for (const def of PRODUCTS) {
    console.log(`\n── Package: ${def.packageKey} ──`);

    let pkg: Package;
    const existingPkg = existingPkgs.items?.find((p) => p.lookup_key === def.packageKey);

    if (existingPkg) {
      console.log("  Package already exists:", existingPkg.id);
      pkg = existingPkg;
    } else {
      const { data, error } = await createPackages({
        client,
        path: { project_id: project.id, offering_id: offering.id },
        body: { lookup_key: def.packageKey, display_name: def.packageName },
      });
      if (error) throw new Error(`Failed to create package ${def.packageKey}: ${JSON.stringify(error)}`);
      console.log("  Created package:", data.id);
      pkg = data;
    }

    const products = productMap[def.entitlementKey];
    const { error: attachErr } = await attachProductsToPackage({
      client,
      path: { project_id: project.id, package_id: pkg.id },
      body: {
        products: [
          { product_id: products.test.id,      eligibility_criteria: "all" },
          { product_id: products.appStore.id,  eligibility_criteria: "all" },
          { product_id: products.playStore.id, eligibility_criteria: "all" },
        ],
      },
    });
    if (attachErr) {
      if (attachErr.type === "unprocessable_entity_error") {
        console.log("  Package products already attached");
      } else {
        throw new Error(`Failed to attach products to package: ${JSON.stringify(attachErr)}`);
      }
    } else {
      console.log("  Products attached to package");
    }
  }

  // ── API Keys ───────────────────────────────────────────────────────────────
  const getKeys = async (app: App) => {
    const { data, error } = await listAppPublicApiKeys({
      client,
      path: { project_id: project.id, app_id: app.id },
    });
    if (error) throw new Error(`Failed to get API keys for app ${app.id}`);
    return data?.items.map((k) => k.key).join(", ") ?? "N/A";
  };

  const testKey  = await getKeys(testApp);
  const iosKey   = await getKeys(appStoreApp);
  const droidKey = await getKeys(playStoreApp);

  console.log(`
==================================================
  RevenueCat setup complete!
==================================================
  Project ID:            ${project.id}
  Test Store App ID:     ${testApp.id}
  App Store App ID:      ${appStoreApp.id}
  Play Store App ID:     ${playStoreApp.id}

  Entitlements:
    executive  →  ${entitlementMap["executive"]?.id}
    luxury     →  ${entitlementMap["luxury"]?.id}

  Public API Keys (add these to Replit Secrets):
    EXPO_PUBLIC_REVENUECAT_TEST_API_KEY    = ${testKey}
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY     = ${iosKey}
    EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY = ${droidKey}
    REVENUECAT_PROJECT_ID                  = ${project.id}
==================================================
`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
