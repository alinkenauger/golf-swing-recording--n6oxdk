// Gradle version: 8.1.0

pluginManagement {
    repositories {
        gradlePluginPortal()
        google()
        mavenCentral()
    }
    resolutionStrategy {
        eachPlugin {
            when (requested.id.id) {
                "com.android.application" -> {
                    useModule("com.android.tools.build:gradle:8.1.0")
                }
                "org.jetbrains.kotlin.android" -> {
                    useModule("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.0")
                }
                "com.google.dagger.hilt.android" -> {
                    useModule("com.google.dagger:hilt-android-gradle-plugin:2.48")
                }
            }
        }
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

// Enable build cache for faster builds
buildCache {
    local {
        directory = File(rootDir, ".gradle/build-cache")
        removeUnusedEntriesAfterDays = 7
    }
}

// Configure Gradle properties
gradle.startParameter.apply {
    systemProperties["org.gradle.jvmargs"] = "-Xmx2048m -Dfile.encoding=UTF-8"
    systemProperties["org.gradle.parallel"] = "true"
    systemProperties["org.gradle.caching"] = "true"
    systemProperties["android.useAndroidX"] = "true"
    systemProperties["kotlin.code.style"] = "official"
}

rootProject.name = "VideoCoach"
include(":app")