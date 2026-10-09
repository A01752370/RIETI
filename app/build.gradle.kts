plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

val apiUrl: String = (findProperty("rieti.apiUrl") as String?) ?: "https://d3hexe1fo0mq6l.cloudfront.net/"
val apiUrlDebug: String = (findProperty("rieti.apiUrl") as String?) ?: apiUrl

android {
    namespace = "mx.sipinna.rieti"
    compileSdk = 34

    defaultConfig {
        applicationId = "mx.sipinna.rieti"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

        // URL del API en AWS (CloudFront → ALB → ECS). Se puede sobrescribir con -Prieti.apiUrl=...
        buildConfigField("String", "API_URL", "\"${apiUrl}\"")
    }

    buildTypes {
        debug {
            // Permite apuntar al backend local: -Prieti.apiUrl=http://10.0.2.2:3000/
            buildConfigField("String", "API_URL", "\"${apiUrlDebug}\"")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.navigation.compose)

    // Retrofit: consumo del API REST del backend (rol Backend del equipo)
    implementation(libs.retrofit)
    implementation(libs.retrofit.gson)
    implementation(libs.okhttp.logging)
    implementation(libs.kotlinx.coroutines.android)

    // Coil: carga de imágenes (thumbnail de mapa de la ubicación capturada)
    implementation(libs.coil.compose)

    // Servicios de ubicación de Google Play (GPS)
    implementation(libs.google.play.services.location)
}
