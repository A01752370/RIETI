package mx.sipinna.rieti.view

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.HorizontalDivider
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import mx.sipinna.rieti.R
import mx.sipinna.rieti.ui.theme.ColoresEstatus
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
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        LogoRieti(alto = 40.dp)
                        Text(titulo, modifier = Modifier.semantics { heading() })
                    }
                },
                navigationIcon = {
                    if (alRegresar != null) {
                        IconButton(onClick = alRegresar) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Regresar")
                        }
                    }
                },
                actions = { acciones() },
                colors = TopAppBarDefaults.topAppBarColors(
                    // Barra clara: los logos y el texto oscuro se leen sobre fondo claro.
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface,
                    navigationIconContentColor = MaterialTheme.colorScheme.primary,
                    actionIconContentColor = MaterialTheme.colorScheme.primary
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

/** Botón de texto para la barra superior. */
@Composable
fun AccionBarra(texto: String, alPresionar: () -> Unit) {
    TextButton(onClick = alPresionar) {
        Text(texto, color = MaterialTheme.colorScheme.primary)
    }
}

/**
 * Logo de RIETI (identidad de la app). Se muestra completo, sin recortar ni
 * deformar (`ContentScale.Fit`), con margen de seguridad alrededor.
 *
 * @param alto alto en dp; el ancho sale de la proporción original (508×492)
 */
@Composable
fun LogoRieti(alto: Dp, modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(R.drawable.logo_rieti),
        contentDescription = "RIETI, Ruta Intermunicipal para la Erradicación del Trabajo Infantil",
        contentScale = ContentScale.Fit,
        modifier = modifier.height(alto).padding(4.dp)
    )
}

/**
 * Logo institucional del SIPINNA de Atizapán de Zaragoza (marca institucional).
 *
 * @param alto alto en dp; el ancho sale de la proporción original (1920×571)
 */
@Composable
fun LogoSipinna(alto: Dp, modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(R.drawable.logo_sipinna),
        contentDescription = "Sistema Municipal de Protección Integral de Niñas, Niños y Adolescentes (SIPINNA) de Atizapán de Zaragoza",
        contentScale = ContentScale.Fit,
        modifier = modifier.height(alto).padding(4.dp)
    )
}

/** Encabezado de marca: RIETI (app) y SIPINNA (institución), sobre fondo claro. */
@Composable
fun EncabezadoMarcas() {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            LogoRieti(alto = 72.dp)
            LogoSipinna(alto = 56.dp)
        }
        HorizontalDivider(modifier = Modifier.padding(top = 4.dp))
    }
}

/** Estado vacío con una explicación (no una pantalla en blanco). */
@Composable
fun EstadoVacio(texto: String) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(Icons.Filled.Info, contentDescription = null, tint = MaterialTheme.colorScheme.secondary)
            Text(texto, style = MaterialTheme.typography.bodyLarge)
        }
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

/** Color de cada estatus canónico (igual que en la web; texto blanco ≥ 4.5:1). */
fun colorEstatus(estatus: String): Color = when (estatus) {
    "Recibido" -> ColoresEstatus.Recibido
    "En revisión" -> ColoresEstatus.EnRevision
    "En atención" -> ColoresEstatus.EnAtencion
    "Canalizado" -> ColoresEstatus.Canalizado
    "Concluido" -> ColoresEstatus.Concluido
    "Descartado" -> ColoresEstatus.Descartado
    else -> Color(0xFF424242)
}

/** Icono de cada estatus (los mismos conceptos que en la web). */
fun iconoEstatus(estatus: String): ImageVector = when (estatus) {
    "Recibido" -> Icons.Filled.Email
    "En revisión" -> Icons.Filled.Search
    "En atención" -> Icons.Filled.Person
    "Canalizado" -> Icons.AutoMirrored.Filled.ArrowForward
    "Concluido" -> Icons.Filled.CheckCircle
    "Descartado" -> Icons.Filled.Close
    else -> Icons.Filled.Info
}

/** Etiqueta de estatus: color + icono + texto (nunca solo color). */
@Composable
fun EtiquetaEstatus(estatus: String) {
    Surface(color = colorEstatus(estatus), shape = MaterialTheme.shapes.extraLarge) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
        ) {
            Icon(iconoEstatus(estatus), contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
            Text(estatus, color = Color.White, style = MaterialTheme.typography.labelLarge)
        }
    }
}

private val FORMATO_FECHA = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm", Locale("es", "MX"))

/** Convierte una fecha ISO-8601 del API a texto local ("9 oct 2026, 14:30"). */
fun formatearFecha(iso: String): String = try {
    OffsetDateTime.parse(iso).atZoneSameInstant(ZoneId.systemDefault()).format(FORMATO_FECHA)
} catch (e: Exception) {
    iso
}
