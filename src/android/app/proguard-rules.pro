# Video Coaching Platform ProGuard Rules
# Version: 1.0

# Keep all annotations, signatures, exceptions, inner classes, enclosing methods, source files and line numbers
-keepattributes *Annotation*, Signature, Exception, InnerClasses, EnclosingMethod, SourceFile, LineNumberTable

# Optimization configuration
-optimizationpasses 5
-optimizations !code/simplification/arithmetic,!code/simplification/cast,!field/*,!class/merging/*
-dontusemixedcaseclassnames
-dontskipnonpubliclibraryclasses
-verbose
-allowaccessmodification

# Video processing related rules
-keep class com.videocoach.utils.** { *; }
-keep class com.videocoach.utils.VideoRecorder { *; }
-keep class com.videocoach.utils.VideoProcessor { *; }
-keep class com.videocoach.utils.VideoUtils { *; }

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Media related rules
-keep class android.media.** { *; }
-keep class com.videocoach.utils.VideoRecorder { *; }
-keep class com.videocoach.utils.VideoProcessor { *; }

# Domain models and API interfaces
-keep class com.videocoach.domain.models.** { *; }
-keep interface com.videocoach.data.api.** { *; }

# Retrofit rules (v2.9.0)
-dontwarn retrofit2.**
-keep class retrofit2.** { *; }
-keepclasseswithmembers class * {
    @retrofit2.http.* <methods>;
}
-keepattributes Signature
-keepattributes Exceptions

# Moshi rules (v1.15.0)
-dontwarn com.squareup.moshi.**
-keep class com.squareup.moshi.** { *; }
-keep @com.squareup.moshi.JsonQualifier interface *
-keepclasseswithmembers class * {
    @com.squareup.moshi.* <methods>;
}

# OkHttp rules
-dontwarn okhttp3.**
-dontwarn okio.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# Hilt rules (v2.48)
-keepnames @dagger.hilt.android.HiltAndroidApp class *
-keep class dagger.hilt.** { *; }
-keep class javax.inject.** { *; }
-keep class * extends dagger.hilt.android.lifecycle.HiltViewModel

# Android framework rules
-keep class androidx.core.app.CoreComponentFactory { *; }
-keep class * extends androidx.fragment.app.Fragment
-keepclassmembers class * extends androidx.lifecycle.ViewModel {
    <init>();
}

# Keep serialized names for JSON parsing
-keepclassmembers class * {
    @com.squareup.moshi.Json *;
}

# Keep enum values
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Keep Parcelable implementations
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# Keep Serializable implementations
-keepnames class * implements java.io.Serializable
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    !static !transient <fields>;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# WebSocket related rules
-keep class org.webrtc.** { *; }
-keep class com.videocoach.websocket.** { *; }

# Security related rules
-keep class javax.crypto.** { *; }
-keep class org.bouncycastle.** { *; }
-dontwarn org.bouncycastle.**

# Keep source file names and line numbers for crash reporting
-renamesourcefileattribute SourceFile
-keepattributes SourceFile,LineNumberTable

# Preserve R classes for resources
-keepclassmembers class **.R$* {
    public static <fields>;
}