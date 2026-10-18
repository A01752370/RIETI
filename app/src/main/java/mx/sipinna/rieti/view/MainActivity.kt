package mx.sipinna.rieti.view

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import mx.sipinna.rieti.BuildConfig
import mx.sipinna.rieti.repository.SesionCiudadanoRepositorio
import mx.sipinna.rieti.repository.SesionRepositorio
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import mx.sipinna.rieti.ui.theme.RIETITheme

/**
 * Única Activity de la app (patrón "single-activity"): todas las pantallas son
 * funciones `@Composable` registradas en un `NavHost`.
 *
 * En builds **release** se activa `FLAG_SECURE` (sin capturas ni vista previa en
 * "recientes"), porque se muestran claves de consulta y reportes sobre menores
 * (ataque A17). En debug se deja desactivado para poder documentar con capturas.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Recupera la sesión de la cuenta opcional de ciudadano (refresh token cifrado con el Keystore).
        SesionCiudadanoRepositorio.iniciar(applicationContext)
        if (!BuildConfig.DEBUG) {
            window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        }
        enableEdgeToEdge()
        setContent {
            RIETITheme {
                AppRieti()
            }
        }
    }
}

/** Grafo de navegación completo de la app. */
@Composable
private fun AppRieti() {
    val nav = rememberNavController()
    val haySesionCiudadano by SesionCiudadanoRepositorio.haySesion.collectAsState()

    NavHost(navController = nav, startDestination = Rutas.INICIO) {

        // --- Ciudadano (sin cuenta, D-12) ---
        composable(Rutas.INICIO) {
            InicioScreen(
                alReportar = { nav.navigate(Rutas.AVISO) },
                alConsultar = { nav.navigate(Rutas.CONSULTA) },
                alEntrarPersonal = { nav.navigate(Rutas.LOGIN) },
                haySesionCiudadano = haySesionCiudadano,
                alCuenta = { nav.navigate(if (haySesionCiudadano) Rutas.MI_PANEL else Rutas.cuenta()) }
            )
        }
        composable(Rutas.AVISO) {
            AvisoPrivacidadScreen(
                alAceptar = { version -> nav.navigate(Rutas.formulario(version)) },
                alRegresar = { nav.popBackStack() }
            )
        }
        composable(
            route = Rutas.FORMULARIO,
            arguments = listOf(navArgument("avisoVersion") { type = NavType.StringType })
        ) { entrada ->
            FormularioReporteScreen(
                avisoVersion = entrada.arguments?.getString("avisoVersion").orEmpty(),
                alEnviar = { creado ->
                    // Al confirmar no se puede volver al formulario ni reenviar el mismo reporte.
                    nav.navigate(Rutas.confirmacion(creado.folio, creado.claveConsulta, creado.fechaCreacion)) {
                        popUpTo(Rutas.INICIO)
                    }
                },
                alRegresar = { nav.popBackStack() },
                alCuenta = { nav.navigate(Rutas.cuenta(volver = true)) }
            )
        }
        composable(
            route = Rutas.CONFIRMACION,
            arguments = listOf(
                navArgument("folio") { type = NavType.StringType },
                navArgument("clave") { type = NavType.StringType },
                navArgument("fecha") { type = NavType.StringType; defaultValue = "" }
            )
        ) { entrada ->
            ConfirmacionScreen(
                folio = entrada.arguments?.getString("folio").orEmpty(),
                clave = entrada.arguments?.getString("clave").orEmpty(),
                fecha = entrada.arguments?.getString("fecha")?.takeIf { it.isNotBlank() },
                alTerminar = { volverAlInicio(nav) }
            )
        }
        composable(Rutas.CONSULTA) {
            ConsultaScreen(alRegresar = { nav.popBackStack() })
        }

        // --- Cuenta opcional de ciudadano (Fase 4) ---
        composable(
            route = Rutas.CUENTA,
            arguments = listOf(navArgument("volver") { type = NavType.BoolType; defaultValue = false })
        ) { entrada ->
            // Desde el asistente ("con seguimiento") se regresa al formulario sin perder lo capturado.
            val volver = entrada.arguments?.getBoolean("volver") == true
            AccesoCuentaScreen(
                alEntrar = { if (volver) nav.popBackStack() else nav.navigate(Rutas.MI_PANEL) { popUpTo(Rutas.INICIO) } },
                alRegresar = { nav.popBackStack() }
            )
        }
        composable(Rutas.MI_PANEL) {
            MiPanelScreen(
                alConfiguracion = { nav.navigate(Rutas.CUENTA_CONFIGURACION) },
                alRegresar = { nav.popBackStack() },
                alSesionExpirada = { nav.navigate(Rutas.cuenta()) { popUpTo(Rutas.INICIO) } }
            )
        }
        composable(Rutas.CUENTA_CONFIGURACION) {
            ConfiguracionCuentaScreen(
                alRegresar = { nav.popBackStack() },
                alSalir = { volverAlInicio(nav) }
            )
        }

        // --- Personal SIPINNA ---
        composable(Rutas.LOGIN) {
            LoginScreen(
                alIniciarSesion = {
                    nav.navigate(Rutas.INICIO_PERSONAL) { popUpTo(Rutas.INICIO) }
                },
                alRegresar = { nav.popBackStack() }
            )
        }
        composable(Rutas.INICIO_PERSONAL) {
            InicioPersonalScreen(
                alAbrirBandeja = { estatus, sinAtender -> nav.navigate(Rutas.bandeja(estatus, sinAtender)) },
                alAbrirPrioridadAlta = { nav.navigate(Rutas.bandeja(prioridadAlta = true)) },
                alAbrirPendientes = { nav.navigate(Rutas.bandeja(pendientes = true)) },
                alCerrarSesion = { volverAlInicio(nav) },
                alSesionExpirada = { irAlLogin(nav) }
            )
        }
        composable(
            route = Rutas.BANDEJA,
            arguments = listOf(
                navArgument("estatus") { type = NavType.StringType; defaultValue = "" },
                navArgument("sinAtender") { type = NavType.IntType; defaultValue = 0 },
                navArgument("prioridadAlta") { type = NavType.BoolType; defaultValue = false },
                navArgument("pendientes") { type = NavType.BoolType; defaultValue = false }
            )
        ) {
            BandejaScreen(
                alAbrirReporte = { id -> nav.navigate(Rutas.detalle(id)) },
                alRegresar = { nav.popBackStack() },
                alCerrarSesion = { volverAlInicio(nav) },
                alSesionExpirada = { irAlLogin(nav) }
            )
        }
        composable(
            route = Rutas.DETALLE,
            arguments = listOf(navArgument("id") { type = NavType.IntType })
        ) {
            DetalleReporteScreen(
                alRegresar = { nav.popBackStack() },
                alSesionExpirada = { irAlLogin(nav) }
            )
        }
    }
}

/** Vuelve al inicio limpiando la pila (tras confirmar un reporte o cerrar sesión). */
private fun volverAlInicio(nav: NavHostController) {
    nav.navigate(Rutas.INICIO) { popUpTo(0) { inclusive = true } }
}

/** El token venció: se descarta y se pide iniciar sesión de nuevo. */
private fun irAlLogin(nav: NavHostController) {
    SesionRepositorio().cerrarSesion()
    nav.navigate(Rutas.LOGIN) { popUpTo(Rutas.INICIO) }
}
