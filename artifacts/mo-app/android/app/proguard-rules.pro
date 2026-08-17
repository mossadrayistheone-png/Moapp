# React Native & Expo proguard rules for R8 minification

# Keep all React Native framework classes
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# New Architecture (TurboModules / JSI)
-keep class com.facebook.react.turbomodule.** { *; }
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
    @com.facebook.react.uimanager.annotations.ReactProp *;
}

# Expo modules
-keep class expo.** { *; }
-keep class com.expo.** { *; }
-keep class versioned.host.exp.exponent.** { *; }

# Reanimated
-keep class com.swmansion.reanimated.** { *; }

# Gesture handler
-keep class com.swmansion.gesturehandler.** { *; }

# Safe area context
-keep class com.th3rdwave.safeareacontext.** { *; }

# expo-av / video
-keep class com.yarnpkg.** { *; }
-keep class expo.modules.av.** { *; }

# Keep native modules referenced by name from JS
-keep class * extends com.facebook.react.bridge.ReactContextBaseJavaModule { *; }
-keep class * extends com.facebook.react.bridge.BaseJavaModule { *; }
-keep class * extends com.facebook.react.uimanager.ViewManager { *; }
-keep class * extends com.facebook.react.uimanager.SimpleViewManager { *; }

# OkHttp (networking)
-keep class okhttp3.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

# Suppress common warnings from third-party libs
-dontwarn com.facebook.**
-dontwarn expo.**
-dontwarn com.swmansion.**
