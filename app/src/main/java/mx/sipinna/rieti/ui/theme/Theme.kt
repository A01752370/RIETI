package mx.sipinna.rieti.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * Esquema de color de RIETI (tokens de Color.kt). Siempre claro: los logos solo
 * se usan sobre fondo claro y así el contraste verificado es el que ve la persona.
 */
private val EsquemaRieti = lightColorScheme(
    primary = Primario,
    onPrimary = Color.White,
    primaryContainer = TintePrimario,
    onPrimaryContainer = PrimarioOscuro,
    secondary = Secundario,
    onSecondary = Color.White,
    tertiary = Acento,
    onTertiary = Color.White,
    tertiaryContainer = TinteAcento,
    onTertiaryContainer = Texto,
    error = ErrorRieti,
    onError = Color.White,
    errorContainer = Color(0xFFFDECEA),
    onErrorContainer = Texto,
    background = Color.White,
    onBackground = Texto,
    surface = Color.White,
    onSurface = Texto,
    surfaceVariant = Superficie,
    // Texto oscuro también dentro de tarjetas y superficies grises (Material lo usa como color de contenido).
    onSurfaceVariant = Texto,
    outline = Color(0xFFC9CCD6),
)

/** Tema Material 3 de la app RIETI, compartido por todas las pantallas Compose. */
@Composable
fun RIETITheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = EsquemaRieti, typography = Typography, content = content)
}
