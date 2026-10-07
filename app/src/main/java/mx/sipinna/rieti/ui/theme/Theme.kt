package mx.sipinna.rieti.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val ColorSchemeClaro = lightColorScheme(
    primary = TealRieti,
    secondary = TealDark,
    error = RojoError
)

private val ColorSchemeOscuro = darkColorScheme(
    primary = TealRieti,
    secondary = TealDark,
    error = RojoError
)

/** Tema Material 3 de la app RIETI, compartido por todas las pantallas Compose. */
@Composable
fun RIETITheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) ColorSchemeOscuro else ColorSchemeClaro
    MaterialTheme(colorScheme = colorScheme, content = content)
}
