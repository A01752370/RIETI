package mx.sipinna.rieti.view

import android.provider.Settings
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import mx.sipinna.rieti.ui.theme.Primario
import mx.sipinna.rieti.ui.theme.TextoSecundario
import mx.sipinna.rieti.ui.theme.TintePrimario
import mx.sipinna.rieti.viewmodel.EstadoPaso
import mx.sipinna.rieti.viewmodel.LineaEstatus
import mx.sipinna.rieti.viewmodel.PasoLinea

/** Gris de las líneas y bordes pendientes (decorativo: el texto de cada paso ya dice su estado). */
private val GrisPendiente = Color(0xFFBDBDBD)

/**
 * true si la persona desactivó las animaciones del sistema (Opciones de
 * accesibilidad → "Quitar animaciones"): las transiciones se vuelven instantáneas.
 */
@Composable
fun animacionesReducidas(): Boolean {
    val contexto = LocalContext.current
    return remember {
        Settings.Global.getFloat(contexto.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
}

/**
 * Indicador de pasos conectados por una línea (Fase 5): el paso completado lleva
 * palomita, el actual va resaltado con un halo y el pendiente solo con borde.
 * En pantallas angostas muestra solo los números y, debajo, el nombre del paso actual.
 *
 * @param pasos nombres de los pasos, en orden
 * @param actual índice del paso actual (desde 0)
 * @param maximo índice del paso más avanzado ya visitado (se puede tocar para volver)
 * @param alElegir se llama al tocar un paso ya visitado; null para que no sea interactivo
 */
@Composable
fun IndicadorPasos(pasos: List<String>, actual: Int, maximo: Int = actual, alElegir: ((Int) -> Unit)? = null) {
    val descripcion = "Paso ${actual + 1} de ${pasos.size}: ${pasos[actual]}"
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val ancho = maxWidth >= 480.dp
        Column(
            Modifier.fillMaxWidth().semantics(mergeDescendants = true) {
                contentDescription = descripcion
                progressBarRangeInfo = ProgressBarRangeInfo((actual + 1).toFloat(), 0f..pasos.size.toFloat(), pasos.size - 1)
            },
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                pasos.forEachIndexed { i, _ ->
                    val estado = when {
                        i < actual -> EstadoPaso.ALCANZADO
                        i == actual -> EstadoPaso.ACTUAL
                        else -> EstadoPaso.PENDIENTE
                    }
                    val tocable = alElegir != null && i <= maximo && i != actual
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier.size(48.dp).then(if (tocable) Modifier.clickable { alElegir?.invoke(i) } else Modifier)
                    ) { CirculoPaso(numero = i + 1, estado = estado) }
                    if (i < pasos.lastIndex) {
                        Box(
                            Modifier.weight(1f).height(3.dp)
                                .background(if (i < actual) Primario else GrisPendiente, RoundedCornerShape(2.dp))
                        )
                    }
                }
            }
            if (ancho) {
                Row(Modifier.fillMaxWidth()) {
                    pasos.forEachIndexed { i, nombre ->
                        Text(
                            nombre,
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = if (i == actual) FontWeight.Bold else FontWeight.Normal,
                            color = if (i <= actual) MaterialTheme.colorScheme.onSurface else TextoSecundario,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            } else {
                Text(pasos[actual], style = MaterialTheme.typography.titleSmall, color = Primario)
            }
        }
    }
}

/** Círculo de un paso: palomita (completado), número con halo (actual) o número con borde (pendiente). */
@Composable
private fun CirculoPaso(numero: Int, estado: EstadoPaso, color: Color = Primario) {
    val halo = if (estado == EstadoPaso.ACTUAL) Modifier.border(BorderStroke(5.dp, color.copy(alpha = 0.25f)), CircleShape) else Modifier
    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(40.dp).then(halo)) {
        when (estado) {
            EstadoPaso.ALCANZADO -> Surface(color = color, shape = CircleShape, modifier = Modifier.size(32.dp)) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
                }
            }
            EstadoPaso.ACTUAL -> Surface(color = color, shape = CircleShape, modifier = Modifier.size(32.dp)) {
                Box(contentAlignment = Alignment.Center) {
                    Text("$numero", color = Color.White, style = MaterialTheme.typography.titleSmall)
                }
            }
            else -> Surface(
                color = MaterialTheme.colorScheme.surface,
                shape = CircleShape,
                border = BorderStroke(2.dp, if (estado == EstadoPaso.PENDIENTE) color else GrisPendiente),
                modifier = Modifier.size(32.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text("$numero", color = color, style = MaterialTheme.typography.titleSmall)
                }
            }
        }
    }
}

/**
 * Barra de progreso segmentada con el texto "Paso 2 de 4 · A quiénes" (va en la
 * barra inferior, junto al botón principal).
 *
 * @param total número de pasos
 * @param actual índice del paso actual (desde 0)
 * @param nombre nombre del paso actual
 */
@Composable
fun BarraProgresoPasos(total: Int, actual: Int, nombre: String) {
    Column(
        Modifier.fillMaxWidth().clearAndSetSemantics {
            contentDescription = "Paso ${actual + 1} de $total: $nombre"
            progressBarRangeInfo = ProgressBarRangeInfo((actual + 1).toFloat(), 0f..total.toFloat(), total - 1)
        },
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text("Paso ${actual + 1} de $total · $nombre", style = MaterialTheme.typography.labelLarge, color = TextoSecundario)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
            repeat(total) { i ->
                Box(
                    Modifier.weight(1f).height(6.dp)
                        .background(if (i <= actual) Primario else TintePrimario, RoundedCornerShape(3.dp))
                )
            }
        }
    }
}

/**
 * Línea de progreso del estatus de un reporte (Fase 5): Recibido → En revisión →
 * En atención → Canalizado → Concluido. Los pasos alcanzados llevan palomita y
 * fecha, el actual va resaltado con su color e icono, y los pendientes atenuados.
 * "Descartado" se muestra como un final distinto, no como un paso más.
 *
 * Solo usa estatus y fechas: la persona ciudadana nunca ve comentarios ni notas del personal.
 *
 * @param linea línea calculada con [LineaEstatus.calcular]
 * @param mostrarSignificado true para mostrar debajo la frase sobre la etapa actual
 */
@Composable
fun LineaProgresoEstatus(linea: LineaEstatus, mostrarSignificado: Boolean = true) {
    Column(
        Modifier.fillMaxWidth().semantics { contentDescription = linea.descripcion },
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        linea.pasos.forEachIndexed { i, paso ->
            FilaLinea(paso, conectorAbajo = i < linea.pasos.lastIndex || linea.descartado != null)
        }
        linea.descartado?.let { d ->
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
            ) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        EtiquetaEstatus(d.estatus)
                        d.fecha?.let { Text(formatearFecha(it), style = MaterialTheme.typography.bodySmall) }
                    }
                    Text("El reporte se cerró sin continuar el avance normal.", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        if (mostrarSignificado) {
            Text(
                linea.significado,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 12.dp)
            )
        }
    }
}

/** Un renglón de la línea: círculo + conector a la izquierda, nombre y fecha a la derecha. */
@Composable
private fun FilaLinea(paso: PasoLinea, conectorAbajo: Boolean) {
    val atenuado = paso.estado == EstadoPaso.PENDIENTE || paso.estado == EstadoPaso.OMITIDO
    Row(
        Modifier.fillMaxWidth().height(IntrinsicSize.Min).semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(40.dp).fillMaxHeight()) {
            when (paso.estado) {
                EstadoPaso.ACTUAL -> Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier.size(40.dp).border(BorderStroke(5.dp, colorEstatus(paso.estatus).copy(alpha = 0.25f)), CircleShape)
                ) {
                    Surface(color = colorEstatus(paso.estatus), shape = CircleShape, modifier = Modifier.size(32.dp)) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(iconoEstatus(paso.estatus), contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                        }
                    }
                }
                EstadoPaso.ALCANZADO -> Box(contentAlignment = Alignment.Center, modifier = Modifier.size(40.dp)) {
                    Surface(color = Primario, shape = CircleShape, modifier = Modifier.size(28.dp)) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Filled.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                        }
                    }
                }
                else -> Box(contentAlignment = Alignment.Center, modifier = Modifier.size(40.dp)) {
                    Box(Modifier.size(20.dp).border(BorderStroke(2.dp, GrisPendiente), CircleShape))
                }
            }
            if (conectorAbajo) {
                Box(
                    Modifier.width(3.dp).weight(1f)
                        .background(if (paso.estado == EstadoPaso.ALCANZADO) Primario else GrisPendiente, RoundedCornerShape(2.dp))
                )
            }
        }
        Column(Modifier.weight(1f).padding(top = 8.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                paso.estatus,
                style = if (paso.estado == EstadoPaso.ACTUAL) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyLarge,
                fontWeight = if (paso.estado == EstadoPaso.ACTUAL) FontWeight.Bold else FontWeight.Normal,
                color = if (atenuado) TextoSecundario else MaterialTheme.colorScheme.onSurface
            )
            val detalle = when (paso.estado) {
                EstadoPaso.ACTUAL -> paso.fecha?.let { "Etapa actual · desde el ${formatearFecha(it)}" } ?: "Etapa actual"
                EstadoPaso.ALCANZADO -> paso.fecha?.let { formatearFecha(it) } ?: "Completada"
                EstadoPaso.PENDIENTE -> "Pendiente"
                EstadoPaso.OMITIDO -> "No fue necesaria en este caso"
            }
            Text(detalle, style = MaterialTheme.typography.bodySmall, color = TextoSecundario)
        }
    }
}
