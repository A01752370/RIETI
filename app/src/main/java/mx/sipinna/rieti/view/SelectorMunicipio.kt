package mx.sipinna.rieti.view

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.PopupProperties
import mx.sipinna.rieti.model.Municipio
import mx.sipinna.rieti.viewmodel.ValidadorReporte

/**
 * Selector de municipio con búsqueda (D-16): un campo de texto que filtra la
 * lista de los 125 municipios mientras se escribe (sin importar acentos) y un
 * menú desplegable para elegir. No hay valor preseleccionado ni se usa la
 * ubicación del teléfono para adivinarlo.
 *
 * Accesible con TalkBack: el campo tiene etiqueta y ayuda, y cada opción del
 * menú es un elemento con su nombre.
 *
 * @param municipios catálogo completo
 * @param seleccionado municipio elegido, o null
 * @param alElegir se llama con el municipio elegido, o con null si la persona cambia el texto
 * @param error mensaje de error a mostrar bajo el campo, o null
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SelectorMunicipio(
    municipios: List<Municipio>,
    seleccionado: Municipio?,
    alElegir: (Municipio?) -> Unit,
    error: String?
) {
    var texto by rememberSaveable { mutableStateOf(seleccionado?.nombre ?: "") }
    var abierto by remember { mutableStateOf(false) }
    val opciones = remember(texto, municipios) { ValidadorReporte.filtrarMunicipios(municipios, texto) }

    ExposedDropdownMenuBox(expanded = abierto, onExpandedChange = { abierto = it }) {
        OutlinedTextField(
            value = texto,
            onValueChange = {
                texto = it
                abierto = true
                if (seleccionado != null && it != seleccionado.nombre) alElegir(null)
            },
            label = { Text("Municipio donde ocurre") },
            supportingText = {
                Text(error ?: if (abierto) "${opciones.size} municipios coinciden" else "Escribe para buscar entre los 125 municipios del Estado de México")
            },
            isError = error != null,
            singleLine = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = abierto) },
            modifier = Modifier.menuAnchor().fillMaxWidth()
        )
        // DropdownMenu sin foco (no ExposedDropdownMenu): en Material 3 1.2 el menú expuesto toma
        // el foco y lo que se escribe ya no llega al campo de búsqueda (visto en el emulador).
        DropdownMenu(
            expanded = abierto,
            onDismissRequest = { abierto = false },
            properties = PopupProperties(focusable = false),
            modifier = Modifier.exposedDropdownSize().heightIn(max = 280.dp)
        ) {
            if (opciones.isEmpty()) {
                DropdownMenuItem(text = { Text("Ningún municipio coincide con “$texto”") }, onClick = {}, enabled = false)
            } else {
                opciones.forEach { m ->
                    DropdownMenuItem(
                        text = { Text(m.nombre) },
                        onClick = {
                            texto = m.nombre
                            alElegir(m)
                            abierto = false
                        },
                        contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding,
                        modifier = Modifier.semantics { contentDescription = "Municipio ${m.nombre}" }
                    )
                }
            }
        }
    }
}
