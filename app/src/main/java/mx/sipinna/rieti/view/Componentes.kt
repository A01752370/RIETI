package mx.sipinna.rieti.view

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.text.style.TextAlign
import mx.sipinna.rieti.ui.theme.TextoSecundario
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Refresh
import mx.sipinna.rieti.viewmodel.CatalogoEstatus
import androidx.compose.material.icons.filled.Warning
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
import androidx.compose.foundation.ScrollState
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
 * @param barraInferior contenido fijo abajo (p. ej. el botón de aceptar), fuera del desplazamiento
 * @param desplazamiento estado del desplazamiento, para que la pantalla pueda volver arriba (p. ej. al cambiar de paso)
 * @param contenido contenido de la pantalla
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PantallaRieti(
    titulo: String,
    alRegresar: (() -> Unit)? = null,
    acciones: @Composable () -> Unit = {},
    desplazable: Boolean = true,
    barraInferior: (@Composable () -> Unit)? = null,
    desplazamiento: ScrollState? = null,
    contenido: @Composable ColumnScope.() -> Unit
) {
    Scaffold(
        bottomBar = {
            if (barraInferior != null) {
                Surface(shadowElevation = 8.dp, color = MaterialTheme.colorScheme.surface) {
                    Box(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 20.dp, vertical = 12.dp)) {
                        barraInferior()
                    }
                }
            }
        },
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        LogoRieti(alto = 32.dp)
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
            modifier = if (desplazable) base.verticalScroll(desplazamiento ?: rememberScrollState()) else base,
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
 * Marca de RIETI (figuras + palabra "RIETI"), sin deformar (`ContentScale.Fit`).
 *
 * El subtítulo del logo original ("Ruta Intermunicipal para la Erradicación del
 * Trabajo Infantil") es ilegible a tamaño de pantalla, así que el recurso solo
 * trae la marca y el nombre completo se muestra como texto ([EncabezadoMarcas]).
 * Hay un PNG por densidad (mdpi a xxxhdpi) remuestreado con Lanczos.
 *
 * @param alto alto en dp; el ancho sale de la proporción (≈1.44:1)
 */
@Composable
fun LogoRieti(alto: Dp, modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(R.drawable.logo_rieti),
        contentDescription = "RIETI, Ruta Intermunicipal para la Erradicación del Trabajo Infantil",
        contentScale = ContentScale.Fit,
        modifier = modifier.height(alto)
    )
}

/**
 * Marca del SIPINNA (palabra "SIPINNA" con su ícono). El nombre completo de la
 * institución se muestra aparte como texto, por legibilidad ([PieInstitucional]).
 *
 * @param alto alto en dp; el ancho sale de la proporción (≈4.5:1)
 */
@Composable
fun LogoSipinna(alto: Dp, modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(R.drawable.logo_sipinna),
        contentDescription = "SIPINNA",
        contentScale = ContentScale.Fit,
        modifier = modifier.height(alto)
    )
}

/** Encabezado de marca centrado: logo de RIETI y su nombre completo como texto legible. */
@Composable
fun EncabezadoMarcas() {
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        LogoRieti(alto = 96.dp)
        Spacer(Modifier.height(8.dp))
        Text(
            "Ruta Intermunicipal para la Erradicación del Trabajo Infantil",
            style = MaterialTheme.typography.labelLarge,
            color = TextoSecundario,
            textAlign = TextAlign.Center
        )
    }
}

/**
 * Pie institucional: marca del SIPINNA y su nombre completo en texto
 * (el texto del logo original no se lee a este tamaño).
 */
@Composable
fun PieInstitucional() {
    Column(
        Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        HorizontalDivider()
        Spacer(Modifier.height(8.dp))
        Text("Un servicio de", style = MaterialTheme.typography.labelMedium, color = TextoSecundario)
        LogoSipinna(alto = 40.dp)
        Text(
            "Sistema Municipal de Protección Integral de Niñas, Niños y Adolescentes de Atizapán de Zaragoza",
            style = MaterialTheme.typography.bodySmall,
            color = TextoSecundario,
            textAlign = TextAlign.Center
        )
    }
}

/**
 * Bloque informativo con ícono, título y contenido, en una tarjeta ligera.
 *
 * @param icono ícono decorativo (no se anuncia: el título ya lo describe)
 * @param titulo encabezado del bloque (se marca como encabezado para lectores de pantalla)
 * @param contenido cuerpo del bloque
 */
@Composable
fun BloqueInfo(icono: ImageVector, titulo: String, contenido: @Composable ColumnScope.() -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Icon(icono, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Text(titulo, style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
            }
            contenido()
        }
    }
}

/**
 * Paso numerado de un proceso (círculo con número, ícono y texto).
 *
 * @param numero posición del paso
 * @param icono ícono del paso
 * @param titulo acción del paso
 * @param detalle explicación corta
 */
@Composable
fun PasoNumerado(numero: Int, icono: ImageVector, titulo: String, detalle: String) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
        modifier = Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}
    ) {
        Surface(color = MaterialTheme.colorScheme.primary, shape = CircleShape, modifier = Modifier.size(32.dp)) {
            Box(contentAlignment = Alignment.Center) {
                Text("$numero", color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.titleSmall)
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(icono, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                Text(titulo, style = MaterialTheme.typography.titleSmall)
            }
            Text(detalle, style = MaterialTheme.typography.bodyMedium)
        }
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
    "Archivado" -> ColoresEstatus.Archivado
    "Reincidente" -> ColoresEstatus.Reincidente
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
    "Archivado" -> Icons.Filled.Lock
    "Reincidente" -> Icons.Filled.Refresh
    else -> Icons.Filled.Info
}

/**
 * Etiqueta de estatus: color + icono + texto (nunca solo color). Recibe el nombre
 * interno y muestra la etiqueta pública del catálogo del socio (Fase 6).
 */
@Composable
fun EtiquetaEstatus(estatus: String) {
    Surface(color = colorEstatus(estatus), shape = MaterialTheme.shapes.extraLarge) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
        ) {
            Icon(iconoEstatus(estatus), contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
            Text(CatalogoEstatus.etiqueta(estatus), color = Color.White, style = MaterialTheme.typography.labelLarge)
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

/** Indicador de prioridad Alta (peligro inmediato, Fase 6): icono + texto, nunca solo color. Media y Normal no llevan insignia. */
@Composable
fun IndicadorPrioridad(prioridad: String?) {
    if (prioridad != "Alta") return
    Surface(color = MaterialTheme.colorScheme.error, shape = MaterialTheme.shapes.extraLarge) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
        ) {
            Icon(Icons.Filled.Warning, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
            Text("Prioridad alta", color = Color.White, style = MaterialTheme.typography.labelLarge)
        }
    }
}

/** Insignia de texto (p. ej. "Seguimiento vencido" o "Posible duplicado"; Fase 7). */
@Composable
fun IndicadorTexto(texto: String, destacado: Boolean = false) {
    Surface(
        color = if (destacado) MaterialTheme.colorScheme.tertiaryContainer else MaterialTheme.colorScheme.surfaceVariant,
        shape = MaterialTheme.shapes.extraLarge
    ) {
        Text(
            texto, style = MaterialTheme.typography.labelLarge,
            color = if (destacado) MaterialTheme.colorScheme.onTertiaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
        )
    }
}

/** Indicador visible de riesgo percibido por quien reportó ("Sí"): icono + texto, nunca solo color. */
@Composable
fun IndicadorRiesgo() {
    Surface(color = MaterialTheme.colorScheme.errorContainer, shape = MaterialTheme.shapes.extraLarge) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
        ) {
            Icon(Icons.Filled.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.size(16.dp))
            Text("Riesgo percibido", color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.labelLarge)
        }
    }
}
