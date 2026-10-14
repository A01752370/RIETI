package mx.sipinna.rieti.viewmodel

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pruebas de [ValidadorCuenta]: cuenta opcional de ciudadano (Fase 4). */
class ValidadorCuentaTest {

    @Test
    fun `correo`() {
        assertTrue(ValidadorCuenta.correoValido(" persona@ejemplo.mx "))
        assertFalse(ValidadorCuenta.correoValido("persona@ejemplo"))
        assertFalse(ValidadorCuenta.correoValido("sin arroba.mx"))
    }

    @Test
    fun `contrasena igual a la politica del pool`() {
        assertEquals(emptyList<String>(), ValidadorCuenta.problemasContrasena("ContrasenaSegura1"))
        assertEquals(4, ValidadorCuenta.problemasContrasena("").size)
        assertEquals(listOf("Incluye al menos un número"), ValidadorCuenta.problemasContrasena("ContrasenaSegura"))
        assertEquals(listOf("Usa al menos 12 caracteres"), ValidadorCuenta.problemasContrasena("Corta1A"))
    }

    @Test
    fun `codigo de 6 digitos`() {
        assertTrue(ValidadorCuenta.codigoValido("123456"))
        assertFalse(ValidadorCuenta.codigoValido("12345"))
        assertFalse(ValidadorCuenta.codigoValido("12a456"))
    }

    @Test
    fun `registro exige que las contrasenas coincidan`() {
        assertEquals(emptyList<String>(), ValidadorCuenta.validarRegistro("a@ejemplo.mx", "ContrasenaSegura1", "ContrasenaSegura1"))
        assertTrue(ValidadorCuenta.validarRegistro("a@ejemplo.mx", "ContrasenaSegura1", "Otra").contains("Las contraseñas no coinciden"))
    }
}
