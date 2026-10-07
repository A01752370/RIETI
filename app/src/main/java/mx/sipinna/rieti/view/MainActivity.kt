package mx.sipinna.rieti.view

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import mx.sipinna.rieti.ui.theme.RIETITheme

/**
 * Única Activity de la app (patrón "single-activity"): todas las pantallas
 * son funciones `@Composable` registradas en un `NavHost`, y la navegación
 * entre ellas se hace con `navController.navigate(...)` en vez de `Intent`.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            RIETITheme {
                AppRieti()
            }
        }
    }
}

/** Declara el grafo de navegación completo de la app. */
@Composable
private fun AppRieti() {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = Rutas.LOGIN) {

        composable(Rutas.LOGIN) {
            LoginScreen(navController)
        }
        composable(Rutas.REGISTRO) {
            RegistroScreen(navController)
        }
        composable(Rutas.FORMULARIO) {
            FormularioReporteScreen(navController)
        }
        composable(
            route = Rutas.CONFIRMACION,
            arguments = listOf(navArgument("folio") { type = NavType.StringType })
        ) { backStackEntry ->
            val folio = backStackEntry.arguments?.getString("folio") ?: ""
            ConfirmacionScreen(navController, folio)
        }
        composable(
            route = Rutas.HOME,
            arguments = listOf(navArgument("esAdmin") { type = NavType.BoolType })
        ) { backStackEntry ->
            val esAdmin = backStackEntry.arguments?.getBoolean("esAdmin") ?: false
            HomeScreen(navController, esAdmin)
        }
        composable(Rutas.REPORTES_LIST) {
            ReportesListScreen(navController)
        }
        composable(
            route = Rutas.SEGUIMIENTO,
            arguments = listOf(navArgument("esAdmin") { type = NavType.BoolType })
        ) { backStackEntry ->
            val esAdmin = backStackEntry.arguments?.getBoolean("esAdmin") ?: false
            SeguimientoScreen(esAdmin)
        }
    }
}
