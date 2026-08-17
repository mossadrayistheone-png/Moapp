#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Mo — Local Android APK build script
#
# Builds an APK using the committed android/ native project.
# No EAS Build or paid Expo plan required.
#
# Prerequisites (must be installed on your machine before running this):
#   • Java JDK 17  (NOT 11, NOT 21 — React Native 0.81 requires exactly 17)
#       macOS:   brew install openjdk@17
#       Ubuntu:  sudo apt install openjdk-17-jdk
#       Windows: https://adoptium.net  (Temurin 17)
#   • Android SDK  (easiest via Android Studio → SDK Manager)
#       Required SDK components:
#         - Android SDK Platform 35 (Android 15)
#         - Android SDK Build-Tools 35.x
#         - NDK 27.1.12297006
#         - CMake 3.22.1
#
# Usage:
#   chmod +x build-android.sh
#   ./build-android.sh          # release APK (default)
#   ./build-android.sh debug    # debug APK
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

VARIANT="${1:-release}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_DIR="$SCRIPT_DIR/android"
LOCAL_PROPS="$ANDROID_DIR/local.properties"

# ── 1. Verify Java 17 ─────────────────────────────────────────────────────────
if ! command -v java &>/dev/null; then
  echo "❌  Java not found. Install JDK 17: https://adoptium.net"
  exit 1
fi

JAVA_VER=$(java -version 2>&1 | awk -F '"' '/version/ {print $2}' | cut -d'.' -f1)
if [[ "$JAVA_VER" != "17" ]]; then
  echo "❌  Java 17 required (found Java $JAVA_VER). Install Temurin 17: https://adoptium.net"
  exit 1
fi
echo "✅  Java $JAVA_VER"

# ── 2. Verify / write local.properties ───────────────────────────────────────
if [[ ! -f "$LOCAL_PROPS" ]]; then
  # Try common SDK locations
  CANDIDATE=""
  if [[ -d "$HOME/Library/Android/sdk" ]]; then
    CANDIDATE="$HOME/Library/Android/sdk"              # macOS
  elif [[ -d "$HOME/Android/Sdk" ]]; then
    CANDIDATE="$HOME/Android/Sdk"                      # Linux
  elif [[ -d "$LOCALAPPDATA/Android/Sdk" ]]; then
    CANDIDATE="$LOCALAPPDATA/Android/Sdk"              # Windows (Git Bash)
  fi

  if [[ -n "$CANDIDATE" ]]; then
    echo "sdk.dir=$CANDIDATE" > "$LOCAL_PROPS"
    echo "✅  Created local.properties → sdk.dir=$CANDIDATE"
  else
    echo "❌  android/local.properties not found and Android SDK not at standard location."
    echo "    Create $LOCAL_PROPS with:"
    echo "      sdk.dir=/path/to/your/Android/sdk"
    echo "    (The path is shown in Android Studio → SDK Manager → Android SDK Location)"
    exit 1
  fi
else
  SDK_DIR=$(grep "^sdk.dir=" "$LOCAL_PROPS" | cut -d'=' -f2-)
  echo "✅  local.properties → sdk.dir=$SDK_DIR"
fi

# ── 3. Install JS dependencies (in case they're missing) ─────────────────────
echo ""
echo "📦  Installing JS dependencies..."
cd "$SCRIPT_DIR"
if command -v pnpm &>/dev/null; then
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
elif command -v npm &>/dev/null; then
  npm install
fi

# ── 4. Build ──────────────────────────────────────────────────────────────────
echo ""
echo "🔨  Building $VARIANT APK..."
cd "$ANDROID_DIR"

if [[ "$VARIANT" == "debug" ]]; then
  ./gradlew :app:assembleDebug --stacktrace
  APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
else
  ./gradlew :app:assembleRelease --stacktrace
  APK_PATH="app/build/outputs/apk/release/app-release.apk"
fi

# ── 5. Done ───────────────────────────────────────────────────────────────────
echo ""
if [[ -f "$APK_PATH" ]]; then
  ABS_PATH="$(cd "$(dirname "$APK_PATH")" && pwd)/$(basename "$APK_PATH")"
  SIZE=$(du -sh "$APK_PATH" | cut -f1)
  echo "✅  APK built successfully ($SIZE)"
  echo "    $ABS_PATH"
  echo ""
  echo "    Install on a connected device:"
  echo "    adb install -r \"$ABS_PATH\""
else
  echo "❌  Build completed but APK not found at expected path: $APK_PATH"
  exit 1
fi
