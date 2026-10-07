package mx.sipinna.rieti.model

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import mx.sipinna.rieti.viewmodel.FormularioReporteViewModel

/**
 * Encapsula el uso del GPS del dispositivo (vía Servicios de Google Play) para
 * capturar automáticamente la ubicación al registrar un reporte (RF-05).
 *
 * Basado en el patrón visto en clase (GPS_Ubicación): esta clase vive en
 * `model` porque es la fuente de datos de ubicación; no sabe nada de Compose
 * ni de Retrofit, solo reporta coordenadas al ViewModel que la creó.
 *
 * No solicita las actualizaciones continuas de ubicación (a diferencia del
 * ejemplo del curso): para esta app basta con una sola lectura al momento de
 * llenar el formulario, así que se usa `getCurrentLocation` en vez de un
 * `LocationCallback` de larga duración.
 *
 * @param context contexto de la Activity que la crea (para verificar permisos)
 * @param viewModel ViewModel que recibe la ubicación capturada
 */
class GestorUbicacion(
    private val context: Context,
    private val viewModel: FormularioReporteViewModel
) {

    private val clienteUbicacion: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)

    /** true si la app ya tiene concedido al menos uno de los dos permisos de ubicación. */
    fun tienePermiso(): Boolean {
        val fino = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
        val aproximado = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
        return fino == PackageManager.PERMISSION_GRANTED || aproximado == PackageManager.PERMISSION_GRANTED
    }

    /**
     * Solicita una lectura actual del GPS y la entrega al [viewModel] mediante
     * [FormularioReporteViewModel.actualizarUbicacionCapturada].
     *
     * Si no hay permiso concedido, no hace nada (la Activity es responsable de
     * pedir el permiso antes de llamar a esta función).
     */
    @SuppressLint("MissingPermission")
    fun capturarUbicacionActual() {
        if (!tienePermiso()) return

        val solicitud = com.google.android.gms.location.CurrentLocationRequest.Builder()
            .setPriority(Priority.PRIORITY_BALANCED_POWER_ACCURACY)
            .build()

        clienteUbicacion.getCurrentLocation(solicitud, null)
            .addOnSuccessListener { ubicacion: Location? ->
                if (ubicacion != null) {
                    viewModel.actualizarUbicacionCapturada(ubicacion.latitude, ubicacion.longitude)
                }
            }
    }
}
