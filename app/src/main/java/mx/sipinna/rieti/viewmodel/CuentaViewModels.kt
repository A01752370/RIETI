package mx.sipinna.rieti.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import mx.sipinna.rieti.model.CuentaCiudadano
import mx.sipinna.rieti.model.MiReporte
import mx.sipinna.rieti.repository.Resultado
import mx.sipinna.rieti.repository.SesionCiudadanoRepositorio

/**
 * Acceso a la cuenta opcional de ciudadano (Fase 4): iniciar sesión, crear
 * cuenta, activarla con el código y recuperar la contraseña.
 */
class AccesoCuentaViewModel : ViewModel() {

    private val sesion = SesionCiudadanoRepositorio

    private val _estado = MutableStateFlow<UiState<String>>(UiState.Inactivo)

    /** Resultado de la última acción: en éxito, un mensaje para mostrar. */
    val estado: StateFlow<UiState<String>> = _estado.asStateFlow()

    private fun lanzar(problemas: List<String>, accion: suspend () -> Resultado<String>) {
        if (_estado.value is UiState.Cargando) return
        if (problemas.isNotEmpty()) {
            _estado.value = UiState.Error(problemas.joinToString("\n"))
            return
        }
        _estado.value = UiState.Cargando
        viewModelScope.launch { _estado.value = accion().aUiState() }
    }

    /** Limpia el mensaje (al cambiar de pestaña o de paso). */
    fun reiniciar() {
        _estado.value = UiState.Inactivo
    }

    fun iniciarSesion(correo: String, password: String) = lanzar(
        if (ValidadorCuenta.correoValido(correo) && password.isNotEmpty()) emptyList() else listOf("Escribe tu correo y tu contraseña")
    ) {
        when (val r = sesion.iniciarSesion(correo, password)) {
            is Resultado.Exito -> Resultado.Exito("SESION_INICIADA")
            is Resultado.Error -> r
        }
    }

    fun registrar(correo: String, password: String, confirmacion: String) =
        lanzar(ValidadorCuenta.validarRegistro(correo, password, confirmacion)) { mensaje(sesion.registrar(correo, password)) }

    fun confirmar(correo: String, codigo: String) = lanzar(
        if (ValidadorCuenta.codigoValido(codigo)) emptyList() else listOf("El código tiene 6 dígitos")
    ) { mensaje(sesion.confirmar(correo, codigo)) }

    fun reenviarCodigo(correo: String) = lanzar(emptyList()) { mensaje(sesion.reenviarCodigo(correo)) }

    fun olvideContrasena(correo: String) = lanzar(
        if (ValidadorCuenta.correoValido(correo)) emptyList() else listOf("Escribe un correo válido")
    ) { mensaje(sesion.olvideContrasena(correo)) }

    fun restablecer(correo: String, codigo: String, password: String) = lanzar(
        buildList {
            if (!ValidadorCuenta.codigoValido(codigo)) add("El código tiene 6 dígitos")
            addAll(ValidadorCuenta.problemasContrasena(password))
        }
    ) { mensaje(sesion.restablecer(correo, codigo, password)) }

    private fun mensaje(r: Resultado<mx.sipinna.rieti.model.Mensaje>): Resultado<String> = when (r) {
        is Resultado.Exito -> Resultado.Exito(r.datos.mensaje)
        is Resultado.Error -> r
    }
}

/** "Mi panel": reportes vinculados a la cuenta (Fase 4). */
class MiPanelViewModel : ViewModel() {

    private val _reportes = MutableStateFlow<UiState<List<MiReporte>>>(UiState.Inactivo)

    /** Reportes vinculados. */
    val reportes: StateFlow<UiState<List<MiReporte>>> = _reportes.asStateFlow()

    /** (Re)carga la lista. */
    fun cargar() {
        _reportes.value = UiState.Cargando
        viewModelScope.launch { _reportes.value = SesionCiudadanoRepositorio.misReportes().aUiState() }
    }
}

/** Configuración de la cuenta: perfil, contraseña, cerrar sesión y eliminar (Fase 4). */
class ConfiguracionCuentaViewModel : ViewModel() {

    private val sesion = SesionCiudadanoRepositorio

    private val _cuenta = MutableStateFlow<UiState<CuentaCiudadano>>(UiState.Inactivo)

    /** Perfil de la cuenta. */
    val cuenta: StateFlow<UiState<CuentaCiudadano>> = _cuenta.asStateFlow()

    private val _accion = MutableStateFlow<UiState<String>>(UiState.Inactivo)

    /** Resultado de la última acción (cambiar contraseña, cerrar sesión, eliminar). */
    val accion: StateFlow<UiState<String>> = _accion.asStateFlow()

    fun cargar() {
        _cuenta.value = UiState.Cargando
        viewModelScope.launch { _cuenta.value = sesion.cuenta().aUiState() }
    }

    fun cambiarContrasena(actual: String, nueva: String) {
        val problemas = ValidadorCuenta.problemasContrasena(nueva)
        if (problemas.isNotEmpty()) {
            _accion.value = UiState.Error(problemas.joinToString("\n"))
            return
        }
        _accion.value = UiState.Cargando
        viewModelScope.launch {
            _accion.value = when (val r = sesion.cambiarContrasena(actual, nueva)) {
                is Resultado.Exito -> UiState.Exito(r.datos.mensaje)
                is Resultado.Error -> r.aUiState()
            }
        }
    }

    fun cerrarSesion() {
        _accion.value = UiState.Cargando
        viewModelScope.launch {
            sesion.cerrarSesion()
            _accion.value = UiState.Exito("SESION_CERRADA")
        }
    }

    fun eliminarCuenta() {
        _accion.value = UiState.Cargando
        viewModelScope.launch {
            _accion.value = when (val r = sesion.eliminarCuenta()) {
                is Resultado.Exito -> UiState.Exito("CUENTA_ELIMINADA")
                is Resultado.Error -> r.aUiState()
            }
        }
    }
}
