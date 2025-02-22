// Root-level build.gradle.kts for Video Coaching Platform Android application
// Plugin versions
buildscript {
    repositories {
        google() // v8.1.0 - Android Gradle Plugin
        mavenCentral() // v1.9.0 - Kotlin
        gradlePluginPortal() // Additional Gradle plugins
    }
    
    dependencies {
        classpath("com.android.tools.build:gradle:8.1.0")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.0")
        classpath("com.google.dagger:hilt-android-gradle-plugin:2.48")
        classpath("com.google.gms:google-services:4.4.0")
        classpath("com.google.firebase:firebase-crashlytics-gradle:2.9.9")
    }
}

// Project-wide Gradle settings
allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

// Project-wide Gradle configuration
tasks.register("clean") {
    doLast {
        delete(rootProject.buildDir)
    }
}

// Gradle configuration
gradle.projectsEvaluated {
    tasks.withType<JavaCompile> {
        options.compilerArgs.add("-Xlint:unchecked")
        options.compilerArgs.add("-Xlint:deprecation")
    }
}

// Gradle properties
gradle.properties {
    // Enable Gradle daemon for faster builds
    org.gradle.daemon=true
    
    // Enable parallel project execution
    org.gradle.parallel=true
    
    // Enable build cache
    org.gradle.caching=true
    
    // Increase memory allocation
    org.gradle.jvmargs=-Xmx2048m -XX:+HeapDumpOnOutOfMemoryError
    
    // Enable configuration cache
    org.gradle.configuration-cache=true
    
    // Android-specific optimizations
    android.useAndroidX=true
    android.enableJetifier=false
    android.nonTransitiveRClass=true
}

// Android configuration
android {
    compileSdk = 34
    
    defaultConfig {
        minSdk = 24
        targetSdk = 34
        
        // Enable strict mode for development builds
        buildConfigField("boolean", "ENABLE_STRICT_MODE", "true")
    }
    
    buildFeatures {
        viewBinding = true
        compose = true
    }
    
    buildTypes {
        getByName("release") {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        
        getByName("debug") {
            isDebuggable = true
            enableUnitTestCoverage = true
            enableAndroidTestCoverage = true
        }
    }
    
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    
    kotlinOptions {
        jvmTarget = "17"
        allWarningsAsErrors = true
        freeCompilerArgs = listOf(
            "-Xopt-in=kotlin.RequiresOptIn",
            "-Xexplicit-api=strict"
        )
    }
    
    testOptions {
        unitTests.isReturnDefaultValues = true
        unitTests.isIncludeAndroidResources = true
    }
    
    packagingOptions {
        resources.excludes.add("META-INF/*.kotlin_module")
        resources.excludes.add("META-INF/DEPENDENCIES")
        resources.excludes.add("META-INF/LICENSE")
        resources.excludes.add("META-INF/LICENSE.txt")
        resources.excludes.add("META-INF/license.txt")
        resources.excludes.add("META-INF/NOTICE")
        resources.excludes.add("META-INF/NOTICE.txt")
        resources.excludes.add("META-INF/notice.txt")
        resources.excludes.add("META-INF/ASL2.0")
    }
    
    lint {
        abortOnError = true
        checkReleaseBuilds = true
        warningsAsErrors = true
    }
}

// Hilt configuration
hilt {
    enableAggregatingTask = true
}

// Crashlytics configuration
crashlytics {
    mappingFileUploadEnabled = true
    nativeSymbolUploadEnabled = true
    unstrippedNativeLibsDir = "build/intermediates/stripped_native_libs"
}

// Dependencies version catalog
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
    
    versionCatalogs {
        create("libs") {
            version("kotlin", "1.9.0")
            version("compose", "1.5.0")
            version("hilt", "2.48")
            version("crashlytics", "2.9.9")
        }
    }
}