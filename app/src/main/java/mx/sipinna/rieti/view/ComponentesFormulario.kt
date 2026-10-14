package mx.sipinna.rieti.view

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import mx.sipinna.rieti.ui.theme.TextoSecundario
import mx.sipinna.rieti.viewmodel.ValidadorReporte

/**
 * Menores por grupo de edad: un bloque por rango con botones − y + (48 dp) y el
 * total al final. El total nunca pasa de [ValidadorReporte.TOTAL_MAXIMO].
 *
 * @param conteos cantidad actual por rango
 * @param alCambiar se llama con el rango y su nueva cantidad
 */
@Composable
fun ContadorEdades(conteos: Map<String, Int>, alCambiar: (String, Int) -> Unit) {
    val total = ValidadorReporte.total(conteos)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        ValidadorReporte.EDADES.forEach { rango ->
            val cantidad = conteos[rango] ?: 0
            val etiqueta = ValidadorReporte.ETIQUETAS_EDAD.getValue(rango)
            // Bloque con cantidad: borde de color (los botones tonales siguen viéndose sobre el fondo gris).
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                border = if (cantidad > 0) BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else null,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        etiqueta,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = if (cantidad > 0) FontWeight.SemiBold else FontWeight.Normal,
                        modifier = Modifier.weight(1f)
                    )
                    FilledTonalIconButton(
                        onClick = { alCambiar(rango, cantidad - 1) },
                        enabled = cantidad > 0,
                        modifier = Modifier.size(48.dp).semantics { contentDescription = "Quitar uno: $etiqueta" }
                    ) { Text("−", style = MaterialTheme.typography.titleLarge) }
                    Text(
                        "$cantidad",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold,
                        textAlign = TextAlign.Center,
                        modifier = Modifier
                            .widthIn(min = 32.dp)
                            .semantics { contentDescription = "$cantidad, $etiqueta"; liveRegion = LiveRegionMode.Polite }
                    )
                    FilledTonalIconButton(
                        onClick = { alCambiar(rango, cantidad + 1) },
                        enabled = ValidadorReporte.puedeAumentar(conteos),
                        colors = IconButtonDefaults.filledTonalIconButtonColors(),
                        modifier = Modifier.size(48.dp).semantics { contentDescription = "Agregar uno: $etiqueta" }
                    ) { Text("+", style = MaterialTheme.typography.titleLarge) }
                }
            }
        }
        Text(
            if (total >= ValidadorReporte.TOTAL_MAXIMO) "Total: $total (máximo ${ValidadorReporte.TOTAL_MAXIMO})" else "Total: $total",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
        )
    }
}

/**
 * Selector de actividad desplegable. Las opciones ocupan cada una su propio
 * renglón de al menos 48 dp y el texto largo se ajusta en varias líneas, así que
 * nunca se enciman.
 *
 * @param actividades catálogo (del servidor o de respaldo), con "Otro" al final
 * @param seleccion actividad elegida, o cadena vacía
 * @param alElegir se llama con la actividad elegida
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SelectorActividad(actividades: List<String>, seleccion: String, alElegir: (String) -> Unit) {
    var abierto by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = abierto, onExpandedChange = { abierto = it }) {
        OutlinedTextField(
            value = seleccion,
            onValueChange = {},
            readOnly = true,
            label = { Text("Actividad observada") },
            placeholder = { Text("Elige una opción") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = abierto) },
            modifier = Modifier.menuAnchor().fillMaxWidth()
        )
        ExposedDropdownMenu(expanded = abierto, onDismissRequest = { abierto = false }) {
            actividades.forEach { actividad ->
                DropdownMenuItem(
                    text = { Text(actividad, style = MaterialTheme.typography.bodyLarge) },
                    onClick = { alElegir(actividad); abierto = false },
                    modifier = Modifier.heightIn(min = 48.dp),
                    contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding
                )
            }
        }
    }
}

/** Nota pequeña bajo un campo (ayuda o estado). */
@Composable
fun NotaCampo(texto: String) {
    Text(texto, style = MaterialTheme.typography.bodySmall, color = TextoSecundario)
}
