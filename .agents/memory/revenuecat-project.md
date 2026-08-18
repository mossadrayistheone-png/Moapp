---
name: RevenueCat project structure
description: RevenueCat "Mo" project IDs, app IDs, entitlements, and offering created for Mo app subscriptions.
---

# RevenueCat project "Mo"

**Project ID:** `proj7d405e07`

## Apps
| Label | ID | Type |
|---|---|---|
| Test Store | `app57d7f64ff5` | `test_store` |
| iOS | `appeec288fb09` | `app_store` (bundle: `com.mo.assistant.ios`) |
| Android | `app6c4d1d2bef` | `play_store` (package: `com.mo.assistant`) |

## Products (6 total — 2 tiers × 3 stores)
| Tier | Test | iOS | Android |
|---|---|---|---|
| Executive ($49.99) | `prod04462dca6c` | `prod35cf05e4fc` | `prodf7b5d34ce3` |
| Luxury ($99.99) | `prod2abffce876` | `prod324799664d` | `prod5a37ddb064` |

Store identifiers: `executive_monthly`, `luxury_monthly` (Android: `executive_monthly:monthly`, `luxury_monthly:monthly`)

## Entitlements
- `executive` → `entl2b1fbe45bb` — grants Executive mode; also granted by Luxury
- `luxury` → `entlbe4b4cb810` — grants Luxury mode only

## Offering
- `default` (current) → `ofrng66cfb12545`
  - Package `executive_monthly` → `pkge94b3b046c9`
  - Package `luxury_monthly`    → `pkge310df6d5a0`

## Public API Keys (saved as Replit Secrets)
- `EXPO_PUBLIC_REVENUECAT_TEST_API_KEY` = `test_YaEbYCxhkQcMMRLmenENEYJkIFm`
- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` = `appl_gBqvSwBeiQqmIlwELSKVqJOYhCH`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` = `goog_jqxARJDCbJILfMOpbZKyVDZOkfi`
- `REVENUECAT_PROJECT_ID` = `proj7d405e07` (set as env var)

**Why:** These IDs are needed if the seed script is ever re-run, if new entitlements/products are added, or if the RevenueCat dashboard needs debugging without re-seeding.

**How to apply:** Before touching RevenueCat config in future sessions, check this file first to avoid re-creating resources.

## Notes
- `attachProductsToEntitlement` API endpoint: `POST /v2/projects/{pid}/entitlements/{ent_id}/product_ids`
- `attachProductsToPackage` API endpoint: `POST /v2/projects/{pid}/packages/{pkg_id}/actions/attach_products` (NOT inside the offerings path)
- Public API keys live at: `GET /v2/projects/{pid}/apps/{app_id}/public_api_keys`
- Test-store prices: `POST /v2/projects/{pid}/products/{prod_id}/test_store_prices`
- `@replit/connectors-sdk` is NOT installed; use `proxyFetch` in CodeExecution "use impure" blocks instead
