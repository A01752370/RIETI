package mx.sipinna.rieti.view

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PersistableBundle
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import mx.sipinna.rieti.ui.theme.TextoSecundario
import mx.sipinna.rieti.viewmodel.LineaEstatus

/** Qué se copió por última vez, para confirmarlo en pantalla. */
private enum class Copiado { NADA, FOLIO, CLAVE, AMBOS }

/**
 * Confirmación del reporte: muestra folio y clave de consulta una sola vez.
 *
 * El servidor solo guarda el hash de la clave, así que si se pierde no se puede
 * recuperar; por eso se insiste en guardarla. No se guarda en el teléfono.
 *
 * Cada botón de copiar deja en el portapapeles **solo el valor limpio**
 * (`RIETI-2026-000123` o `ABCD-EFGH-2345`), para pegarlo tal cual en la consulta.
 * "Copiar ambos" y "Compartir" usan un bloque con etiquetas que la consulta
 * también sabe separar ([mx.sipinna.rieti.viewmodel.ExtractorFolioClave]).
 *
 * @param folio folio asignado
 * @param clave clave de consulta
 * @param fecha fecha de registro (ISO-8601) para la línea de avance, o null
 * @param alTerminar vuelve al inicio
 */
@Composable
fun ConfirmacionScreen(folio: String, clave: String, fecha: String? = null, alTerminar: () -> Unit) {
    val contexto = LocalContext.current
    var copiado by rememberSaveable { mutableStateOf(Copiado.NADA) }
    val ambos = "Folio: $folio\nClave de consulta: $clave"

    PantallaRieti(titulo = "Reporte enviado") {
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(40.dp))
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("¡Gracias por ayudar a proteger los derechos de niñas, niños y adolescentes!", style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
                    Text("Tu reporte fue recibido correctamente.", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Icon(Icons.Filled.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Guarda estos datos ahora", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onErrorContainer)
                    Text(
                        "No se vuelven a mostrar. Por tu privacidad no los guardamos en el teléfono y la clave no se puede recuperar.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onErrorContainer
                    )
                }
            }
        }

        TarjetaDato(
            etiqueta = "Folio",
            valor = folio,
            textoBoton = if (copiado == Copiado.FOLIO) "Folio copiado" else "Copiar folio",
            alCopiar = { copiarSensible(contexto, "Folio RIETI", folio); copiado = Copiado.FOLIO }
        )
        TarjetaDato(
            etiqueta = "Clave de consulta",
            valor = clave,
            textoBoton = if (copiado == Copiado.CLAVE) "Clave copiada" else "Copiar clave",
            alCopiar = { copiarSensible(contexto, "Clave RIETI", clave); copiado = Copiado.CLAVE }
        )

        OutlinedButton(
            onClick = { copiarSensible(contexto, "Folio y clave RIETI", ambos); copiado = Copiado.AMBOS },
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
        ) {
            Text(if (copiado == Copiado.AMBOS) "Folio y clave copiados" else "Copiar ambos")
        }
        OutlinedButton(
            onClick = {
                // La persona elige con qué app compartir (p. ej. enviárselo a sí misma); RIETI no guarda nada.
                val envio = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, "RIETI\n$ambos")
                }
                contexto.startActivity(Intent.createChooser(envio, "Compartir folio y clave"))
            },
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
        ) {
            Icon(Icons.Filled.Share, contentDescription = null, modifier = Modifier.size(ButtonDefaults.IconSize))
            Text("Compartir", modifier = Modifier.padding(start = 8.dp))
        }

        if (copiado != Copiado.NADA) {
            Text(
                "Pégalo en tus notas o en un mensaje para ti.",
                style = MaterialTheme.typography.bodySmall,
                color = TextoSecundario,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
            )
        }

        // Fase 5: la misma línea de avance que verá al consultar; hoy solo está en "Recibido".
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Avance de tu reporte", style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
                LineaProgresoEstatus(LineaEstatus.calcular("Recibido", emptyList(), fecha))
            }
        }

        Button(onClick = alTerminar, shape = MaterialTheme.shapes.extraLarge, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(top = 8.dp)) {
            Text("Ya los guardé, volver al inicio")
        }
    }
}

/**
 * Tarjeta con un dato (folio o clave) en tipografía monoespaciada, seleccionable,
 * y su propio botón de copiar.
 */
@Composable
private fun TarjetaDato(etiqueta: String, valor: String, textoBoton: String, alCopiar: () -> Unit) {
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(etiqueta, style = MaterialTheme.typography.labelLarge, color = TextoSecundario)
            SelectionContainer {
                Text(
                    valor,
                    style = MaterialTheme.typography.headlineSmall,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.SemiBold,
                    // Se lee carácter por carácter para dictarlo sin errores.
                    modifier = Modifier.semantics { contentDescription = "$etiqueta: ${valor.toList().joinToString(" ")}" }
                )
            }
            OutlinedButton(onClick = alCopiar, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Text(textoBoton)
            }
        }
    }
}

/**
 * Copia al portapapeles marcando el contenido como **sensible**: en Android 13+
 * el sistema no muestra su vista previa (útil porque la clave da acceso al
 * estatus del reporte). En versiones anteriores la marca se ignora sin error.
 */
private fun copiarSensible(contexto: Context, etiqueta: String, texto: String) {
    val clip = ClipData.newPlainText(etiqueta, texto).apply {
        description.extras = PersistableBundle().apply {
            val clave = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) ClipDescription.EXTRA_IS_SENSITIVE
            else "android.content.extra.IS_SENSITIVE"
            putBoolean(clave, true)
        }
    }
    (contexto.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(clip)
}
