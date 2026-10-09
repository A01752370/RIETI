package mx.sipinna.rieti.repository

import org.junit.Assert.assertEquals
import org.junit.Test

/** Pruebas de [errorDesdeRespuesta]: traducción del formato `{codigo, mensaje}` del API. */
class ErroresApiTest {

    @Test
    fun `usa codigo y mensaje del servidor`() {
        val e = errorDesdeRespuesta(404, """{"codigo":"FOLIO_O_CLAVE_INCORRECTOS","mensaje":"El folio o la clave no son correctos"}""")
        assertEquals("FOLIO_O_CLAVE_INCORRECTOS", e.codigo)
        assertEquals("El folio o la clave no son correctos", e.mensaje)
        assertEquals(404, e.estatusHttp)
    }

    @Test
    fun `un 401 de sesion se muestra como sesion expirada`() {
        val e = errorDesdeRespuesta(401, """{"codigo":"NO_AUTENTICADO","mensaje":"Inicia sesión para continuar"}""")
        assertEquals("NO_AUTENTICADO", e.codigo)
        assertEquals(MensajesError.SESION_EXPIRADA, e.mensaje)
    }

    @Test
    fun `credenciales invalidas en el login no se confunden con sesion expirada`() {
        val e = errorDesdeRespuesta(401, """{"codigo":"CREDENCIALES_INVALIDAS","mensaje":"Correo o contraseña incorrectos"}""")
        assertEquals("Correo o contraseña incorrectos", e.mensaje)
    }

    @Test
    fun `cuerpo vacio o que no es JSON da un mensaje generico`() {
        assertEquals(MensajesError.INESPERADO, errorDesdeRespuesta(502, "<html>Bad gateway</html>").mensaje)
        assertEquals("HTTP_502", errorDesdeRespuesta(502, null).codigo)
    }
}
