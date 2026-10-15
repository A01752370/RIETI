package mx.sipinna.rieti.view

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Face
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import mx.sipinna.rieti.ui.theme.TextoSecundario

/**
 * Pantalla de inicio. El ciudadano no necesita cuenta (D-12): puede reportar
 * de forma anónima o consultar un reporte con su folio y clave. El personal
 * SIPINNA entra por un acceso aparte, discreto, al final.
 *
 * Diseño: poco texto, las dos acciones principales arriba y grandes, y la
 * explicación en bloques cortos ("Qué es", "Cómo funciona", "Tu privacidad"),
 * como en la web pública. Todo el texto usa estilos del tema para respetar el
 * tamaño de fuente del sistema.
 *
 * @param alReportar abre el aviso de privacidad y luego el formulario
 * @param alConsultar abre la consulta con folio + clave
 * @param alEntrarPersonal abre el inicio de sesión del personal
 * @param haySesionCiudadano true si hay una cuenta de ciudadano con sesión iniciada
 * @param alCuenta abre "Mi panel" (con sesión) o el acceso a la cuenta opcional (sin sesión)
 */
@Composable
fun InicioScreen(
    alReportar: () -> Unit,
    alConsultar: () -> Unit,
    alEntrarPersonal: () -> Unit,
    haySesionCiudadano: Boolean = false,
    alCuenta: () -> Unit = {}
) {
    PantallaRieti(titulo = "Inicio") {
        Spacer(Modifier.height(8.dp))
        EncabezadoMarcas()
        Spacer(Modifier.height(8.dp))

        Text(
            "¿Viste a una niña, niño o adolescente trabajando?",
            style = MaterialTheme.typography.headlineSmall,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().semantics { heading() }
        )
        Text(
            "Repórtalo de forma anónima. Toma un par de minutos.",
            style = MaterialTheme.typography.bodyLarge,
            color = TextoSecundario,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth()
        )

        AccionPrincipal(texto = "Reportar", icono = Icons.AutoMirrored.Filled.Send, alPresionar = alReportar, destacada = true)
        AccionPrincipal(texto = "Consultar mi reporte", icono = Icons.Filled.Search, alPresionar = alConsultar, destacada = false)

        // Cuenta opcional (Fase 4): discreta; el reporte anónimo sigue siendo el camino principal.
        TextButton(onClick = alCuenta, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
            Text(if (haySesionCiudadano) "Mi panel: ver mis reportes" else "Iniciar sesión o crear cuenta (opcional)")
        }

        AvisoEmergencia()

        Spacer(Modifier.height(8.dp))
        BloqueInfo(icono = Icons.Filled.Face, titulo = "Qué es SIPINNA") {
            Text(
                "Es el sistema municipal que protege los derechos de niñas, niños y adolescentes. " +
                    "Su personal revisa cada reporte y le da seguimiento.",
                style = MaterialTheme.typography.bodyMedium
            )
        }

        BloqueInfo(icono = Icons.Filled.Info, titulo = "Cómo funciona un reporte") {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                PasoNumerado(1, Icons.AutoMirrored.Filled.Send, "Reporta", "Cuenta qué viste y dónde.")
                PasoNumerado(2, Icons.Filled.Lock, "Recibe tu folio y clave", "Guárdalos: son tu forma de consultar.")
                PasoNumerado(3, Icons.Filled.Notifications, "El SIPINNA lo atiende", "El personal revisa y da seguimiento.")
                PasoNumerado(4, Icons.Filled.Search, "Consulta el avance", "Con tu folio y clave, cuando quieras.")
            }
        }

        BloqueInfo(icono = Icons.Filled.Lock, titulo = "Tu privacidad") {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Vineta("No pedimos tu nombre ni tus datos.")
                Vineta("No guardamos la ubicación de tu teléfono.")
                Vineta("Solo tú tienes la clave para consultar tu reporte.")
            }
        }

        TextButton(onClick = alEntrarPersonal, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
            Text("Soy personal SIPINNA")
        }
        Text(
            "RIETI no realiza inspecciones ni sustituye una denuncia formal ante el Ministerio Público.",
            style = MaterialTheme.typography.bodySmall,
            color = TextoSecundario,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth()
        )
        PieInstitucional()
        Spacer(Modifier.height(8.dp))
    }
}

/**
 * Botón grande de acción principal (≥ 56 dp de alto, con ícono y texto).
 *
 * @param destacada true para la acción primaria (relleno); false para la secundaria (tonal)
 */
@Composable
private fun AccionPrincipal(texto: String, icono: ImageVector, alPresionar: () -> Unit, destacada: Boolean) {
    val modificador = Modifier.fillMaxWidth().heightIn(min = 56.dp)
    val contenido: @Composable () -> Unit = {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(icono, contentDescription = null, modifier = Modifier.size(ButtonDefaults.IconSize))
            Text(texto, style = MaterialTheme.typography.titleMedium)
        }
    }
    if (destacada) {
        Button(onClick = alPresionar, modifier = modificador) { contenido() }
    } else {
        FilledTonalButton(onClick = alPresionar, modifier = modificador) { contenido() }
    }
}

/** Renglón con viñeta para listas cortas. */
@Composable
fun Vineta(texto: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("•", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
        Text(texto, style = MaterialTheme.typography.bodyMedium)
    }
}
