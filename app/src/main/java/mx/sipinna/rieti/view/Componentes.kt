package mx.sipinna.rieti.view

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Estructura común de las pantallas: barra superior con título, botón de
 * regresar opcional, acciones, y contenido desplazable con márgenes.
 *
 * @param titulo texto de la barra superior
 * @param alRegresar si no es null, muestra la flecha de regresar
 * @param acciones botones a la derecha de la barra (p. ej. "Cerrar sesión")
 * @param desplazable false para pantallas con listas propias (LazyColumn)
 * @param contenido contenido de la pantalla
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PantallaRieti(
    titulo: String,
    alRegresar: (() -> Unit)? = null,
    acciones: @Composable () -> Unit = {},
    desplazable: Boolean = true,
    contenido: @Composable ColumnScope.() -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(titulo, modifier = Modifier.semantics { heading() }) },
                navigationIcon = {
                    if (alRegresar != null) {
                        IconButton(onClick = alRegresar) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Regresar")
                        }
                    }
                },
                actions = { acciones() },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    navigationIconContentColor = MaterialTheme.colorScheme.onPrimary,
                    actionIconContentColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        }
    ) { relleno ->
        val base = Modifier
            .fillMaxSize()
            .padding(relleno)
            .padding(horizontal = 20.dp, vertical = 16.dp)
        Column(
            modifier = if (desplazable) base.verticalScroll(rememberScrollState()) else base,
            verticalArrangement = Arrangement.spacedBy(12.dp),
            content = contenido
        )
    }
}

/** Botón de texto para la barra superior (usa el color de la barra). */
@Composable
fun AccionBarra(texto: String, alPresionar: () -> Unit) {
    TextButton(onClick = alPresionar) {
        Text(texto, color = MaterialTheme.colorScheme.onPrimary)
    }
}

/** Mensaje de error visible y accesible. */
@Composable
fun MensajeError(texto: String) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(
            texto,
            color = MaterialTheme.colorScheme.onErrorContainer,
            modifier = Modifier.padding(12.dp)
        )
    }
}

/** Indicador de carga centrado. */
@Composable
fun Cargando() {
    Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator()
    }
}

/** Aviso de emergencia: el reporte no sustituye a una llamada al 911 (RF-07, RNF-37). */
@Composable
fun AvisoEmergencia() {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer),
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(
            "Si una niña, niño o adolescente está en peligro inmediato, llama al 911.",
            color = MaterialTheme.colorScheme.onTertiaryContainer,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(12.dp)
        )
    }
}

/** Color asociado a cada estatus canónico, para reconocerlo de un vistazo. */
fun colorEstatus(estatus: String): Color = when (estatus) {
    "Recibido" -> Color(0xFF546E7A)
    "En revisión" -> Color(0xFF1565C0)
    "En atención" -> Color(0xFFEF6C00)
    "Canalizado" -> Color(0xFF6A1B9A)
    "Concluido" -> Color(0xFF2E7D32)
    "Descartado" -> Color(0xFF757575)
    else -> Color(0xFF424242)
}

/** Etiqueta de color con el nombre del estatus. */
@Composable
fun EtiquetaEstatus(estatus: String) {
    Surface(color = colorEstatus(estatus), shape = MaterialTheme.shapes.small) {
        Text(
            estatus,
            color = Color.White,
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
        )
    }
}

private val FORMATO_FECHA = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm", Locale("es", "MX"))

/** Convierte una fecha ISO-8601 del API a texto local ("9 oct 2026, 14:30"). */
fun formatearFecha(iso: String): String = try {
    OffsetDateTime.parse(iso).atZoneSameInstant(ZoneId.systemDefault()).format(FORMATO_FECHA)
} catch (e: Exception) {
    iso
}
