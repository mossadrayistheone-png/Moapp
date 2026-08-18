# Android Signing Keystore Setup

One-time setup so that new Mo APK builds can be installed over existing ones
without requiring an uninstall first.

## Why this is needed

`expo prebuild --clean` regenerates `android/app/debug.keystore` on every CI
run. Android treats a new keystore as a completely different app, which forces a
full uninstall before each test build. Storing a stable keystore as a GitHub
secret and restoring it after prebuild fixes this permanently.

## One-time: generate the keystore

Run this locally **once** and keep `mo-release.keystore` somewhere safe
(password manager, encrypted drive, etc.). Never commit it to the repository.

```bash
keytool -genkeypair -v \
  -keystore mo-release.keystore \
  -alias androiddebugkey \
  -keyalg RSA -keysize 2048 \
  -validity 10000 \
  -storepass android \
  -keypass android \
  -dname "CN=Mo, OU=Mo, O=Mo, L=Unknown, ST=Unknown, C=US"
```

> The alias and passwords match the existing `signingConfigs.debug` block in
> `build.gradle`, so no Gradle changes are needed.

## One-time: add the keystore as a GitHub secret

1. Base64-encode the keystore file:

   ```bash
   # macOS
   base64 -i mo-release.keystore | pbcopy   # copied to clipboard

   # Linux
   base64 -w 0 mo-release.keystore
   ```

2. In your GitHub repository, go to  
   **Settings → Secrets and variables → Actions → New repository secret**

3. Name: `ANDROID_KEYSTORE_BASE64`  
   Value: paste the base64 string from step 1.

4. Click **Add secret**.

## Verification

After adding the secret, trigger a manual build via  
**Actions → Build Android APK → Run workflow**.

The CI log will print:

```
Stable keystore installed — over-the-air updates enabled.
```

If the secret is missing it prints a warning and falls back to the ephemeral
keystore (builds still succeed, but installs still require uninstall).

## Recovery

If you ever lose the keystore file:

- Download `mo-release.keystore` from your password manager / backup.
- Re-encode and update the `ANDROID_KEYSTORE_BASE64` secret.
- **Do not** generate a new keystore — that resets the signing identity and
  devices will require an uninstall again.
