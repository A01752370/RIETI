package mx.sipinna.rieti.viewmodel

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReglasFotosTest {

    @Test
    fun `la advertencia es el texto del socio formador`() {
        assertTrue(ReglasFotos.ADVERTENCIA.startsWith("Evita tomar fotografías que pongan en riesgo a niñas, niños o adolescentes."))
        assertTrue(ReglasFotos.ADVERTENCIA.contains("No confrontes a las personas involucradas ni te expongas para obtener evidencia."))
        assertTrue(ReglasFotos.ADVERTENCIA.endsWith("para facilitar a las Autoridades su localización."))
    }

    @Test
    fun `hasta tres fotos`() {
        assertEquals(3, ReglasFotos.restantes(0))
        assertEquals(1, ReglasFotos.restantes(2))
        assertEquals(0, ReglasFotos.restantes(3))
        assertEquals(0, ReglasFotos.restantes(5))
    }

    @Test
    fun `reduce al lado maximo sin agrandar ni deformar`() {
        assertEquals(Pair(2048, 1536), ReglasFotos.medidas(4000, 3000))
        assertEquals(Pair(1152, 2048), ReglasFotos.medidas(2250, 4000))
        assertEquals(Pair(800, 600), ReglasFotos.medidas(800, 600))
    }

    @Test
    fun `muestreo en potencias de dos sin bajar del lado maximo`() {
        assertEquals(1, ReglasFotos.muestreo(2048, 1536))
        assertEquals(2, ReglasFotos.muestreo(4096, 3072))
        assertEquals(4, ReglasFotos.muestreo(9000, 6000))
        assertTrue(9000 / ReglasFotos.muestreo(9000, 6000) >= ReglasFotos.LADO_MAXIMO)
    }

    @Test
    fun `mensaje de la confirmacion`() {
        assertNull(ReglasFotos.mensajeConfirmacion(0))
        assertEquals("Se adjuntó 1 foto al reporte.", ReglasFotos.mensajeConfirmacion(1))
        assertEquals("Se adjuntaron 3 fotos al reporte.", ReglasFotos.mensajeConfirmacion(3))
        assertTrue(ReglasFotos.mensajeConfirmacion(-1)!!.contains("sí quedó registrado"))
    }
}
