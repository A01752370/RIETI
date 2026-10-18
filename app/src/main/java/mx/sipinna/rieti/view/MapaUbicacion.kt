package mx.sipinna.rieti.view

import android.annotation.SuppressLint
import android.content.Context
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import java.io.File
import mx.sipinna.rieti.BuildConfig
import mx.sipinna.rieti.ui.theme.TextoSecundario
import org.osmdroid.config.Configuration
import org.osmdroid.events.MapEventsReceiver
import org.osmdroid.tileprovider.tilesource.XYTileSource
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.CustomZoomButtonsController
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.MapEventsOverlay
import org.osmdroid.views.overlay.Marker

/** Centro inicial del mapa cuando aún no hay punto: Atizapán de Zaragoza. */
private val CENTRO_INICIAL = GeoPoint(19.5594, -99.2512)

/** Mismo rectángulo que el servidor (`geo-utilidades.ts`): fuera de él no hay teselas. */
private val CAJA_EDOMEX = BoundingBox(20.35, -98.55, 18.3, -100.65)

/** Atribución obligatoria de los datos del mapa. */
const val ATRIBUCION_OSM = "© colaboradores de OpenStreetMap"

/**
 * Teselas servidas por el backend (`api/v1/geo/teselas/{z}/{x}/{y}.png`): el
 * proveedor del mapa no ve la IP ni el dispositivo de quien reporta.
 */
private val FUENTE_TESELAS = XYTileSource(
    "RIETI-OSM", 8, 18, 256, ".png", arrayOf("${BuildConfig.API_URL}api/v1/geo/teselas/"), ATRIBUCION_OSM
)

/** Configura osmdroid una vez: agente identificable y caché en el directorio de caché de la app (sin permisos de almacenamiento). */
private fun configurarOsmdroid(contexto: Context) {
    val conf = Configuration.getInstance()
    conf.load(contexto, contexto.getSharedPreferences("osmdroid", Context.MODE_PRIVATE))
    conf.userAgentValue = "RIETI/${BuildConfig.VERSION_NAME}"
    conf.osmdroidBasePath = File(contexto.cacheDir, "osmdroid")
    conf.osmdroidTileCache = File(contexto.cacheDir, "osmdroid/teselas")
}

/**
 * Mapa para marcar el lugar de los hechos (Fase 2). La persona toca el mapa o
 * arrastra el marcador (mantener presionado); cada vez que lo suelta se llama a
 * [alMover]. Si [punto] cambia desde fuera (p. ej. "Usar mi ubicación"), el mapa
 * se centra ahí.
 *
 * El mapa no es accesible para lectores de pantalla; la dirección se puede
 * escribir a mano en los campos de abajo, así que el reporte no depende de él.
 *
 * @param punto punto actual, o null si no hay
 * @param alMover se llama con la latitud y longitud elegidas
 */
@SuppressLint("ClickableViewAccessibility")
@Composable
fun MapaUbicacion(punto: GeoPoint?, alMover: (Double, Double) -> Unit, modifier: Modifier = Modifier) {
    val contexto = LocalContext.current
    val ciclo = LocalLifecycleOwner.current.lifecycle
    val alMoverActual = rememberUpdatedState(alMover)

    val mapa = remember {
        configurarOsmdroid(contexto)
        MapView(contexto).apply {
            setTileSource(FUENTE_TESELAS)
            setMultiTouchControls(true)
            zoomController.setVisibility(CustomZoomButtonsController.Visibility.SHOW_AND_FADEOUT)
            minZoomLevel = 8.0
            maxZoomLevel = 18.0
            setScrollableAreaLimitDouble(CAJA_EDOMEX)
            isHorizontalMapRepetitionEnabled = false
            isVerticalMapRepetitionEnabled = false
            controller.setZoom(if (punto != null) 17.0 else 13.0)
            controller.setCenter(punto ?: CENTRO_INICIAL)
            // Que arrastrar el mapa no desplace el formulario.
            setOnTouchListener { v, _ -> v.parent?.requestDisallowInterceptTouchEvent(true); false }
        }
    }
    val marcador = remember {
        Marker(mapa).apply {
            isDraggable = true
            title = "Lugar de los hechos"
            setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
            setOnMarkerDragListener(object : Marker.OnMarkerDragListener {
                override fun onMarkerDrag(m: Marker) = Unit
                override fun onMarkerDragStart(m: Marker) = Unit
                override fun onMarkerDragEnd(m: Marker) {
                    alMoverActual.value(m.position.latitude, m.position.longitude)
                }
            })
        }
    }
    remember {
        mapa.overlays.add(MapEventsOverlay(object : MapEventsReceiver {
            override fun singleTapConfirmedHelper(p: GeoPoint): Boolean {
                alMoverActual.value(p.latitude, p.longitude)
                return true
            }
            override fun longPressHelper(p: GeoPoint): Boolean = false
        }))
        true
    }

    DisposableEffect(ciclo) {
        val observador = LifecycleEventObserver { _, evento ->
            when (evento) {
                Lifecycle.Event.ON_RESUME -> mapa.onResume()
                Lifecycle.Event.ON_PAUSE -> mapa.onPause()
                else -> Unit
            }
        }
        ciclo.addObserver(observador)
        onDispose {
            ciclo.removeObserver(observador)
            mapa.onDetach()
        }
    }

    Column(modifier) {
        AndroidView(
            factory = { mapa },
            update = { m ->
                if (punto == null) {
                    m.overlays.remove(marcador)
                } else {
                    if (marcador !in m.overlays) m.overlays.add(marcador)
                    if (marcador.position != punto) {
                        marcador.position = punto
                        m.controller.animateTo(punto, maxOf(m.zoomLevelDouble, 16.0), 400L)
                    }
                }
                m.invalidate()
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(260.dp)
                .clip(MaterialTheme.shapes.medium)
                .semantics { contentDescription = "Mapa. Toca para colocar el marcador del lugar de los hechos." }
        )
        Text(ATRIBUCION_OSM, style = MaterialTheme.typography.labelSmall, color = TextoSecundario)
    }
}

/**
 * Mini mapa de solo lectura con el punto del lugar de los hechos (detalle del
 * personal, Fase 5). No responde a toques, para no interferir con el
 * desplazamiento de la pantalla; para explorar está "Abrir en el mapa".
 * Usa las mismas teselas mediadas por el backend.
 *
 * @param punto lugar de los hechos
 */
@SuppressLint("ClickableViewAccessibility")
@Composable
fun MiniMapa(punto: GeoPoint, modifier: Modifier = Modifier) {
    val contexto = LocalContext.current
    val ciclo = LocalLifecycleOwner.current.lifecycle
    val mapa = remember {
        configurarOsmdroid(contexto)
        MapView(contexto).apply {
            setTileSource(FUENTE_TESELAS)
            setMultiTouchControls(false)
            zoomController.setVisibility(CustomZoomButtonsController.Visibility.NEVER)
            minZoomLevel = 8.0
            maxZoomLevel = 18.0
            isHorizontalMapRepetitionEnabled = false
            isVerticalMapRepetitionEnabled = false
            controller.setZoom(16.0)
            controller.setCenter(punto)
            setOnTouchListener { _, _ -> true }
            overlays.add(Marker(this).apply {
                position = punto
                title = "Lugar de los hechos"
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                setOnMarkerClickListener { _, _ -> true }
            })
        }
    }
    DisposableEffect(ciclo) {
        val observador = LifecycleEventObserver { _, evento ->
            when (evento) {
                Lifecycle.Event.ON_RESUME -> mapa.onResume()
                Lifecycle.Event.ON_PAUSE -> mapa.onPause()
                else -> Unit
            }
        }
        ciclo.addObserver(observador)
        onDispose {
            ciclo.removeObserver(observador)
            mapa.onDetach()
        }
    }
    Column(modifier) {
        AndroidView(
            factory = { mapa },
            modifier = Modifier
                .fillMaxWidth()
                .height(180.dp)
                .clip(MaterialTheme.shapes.medium)
                .semantics { contentDescription = "Mapa con el punto del lugar de los hechos" }
        )
        Text(ATRIBUCION_OSM, style = MaterialTheme.typography.labelSmall, color = TextoSecundario)
    }
}
