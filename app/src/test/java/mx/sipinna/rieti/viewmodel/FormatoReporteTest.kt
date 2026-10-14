package mx.sipinna.rieti.viewmodel

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import mx.sipinna.rieti.model.DireccionRespuesta
import mx.sipinna.rieti.model.GrupoMenores

/** Pruebas de [FormatoReporte]: textos del detalle para el personal. */
class FormatoReporteTest {

    @Test
    fun `varios grupos muestran cada uno y el total`() {
        val g = listOf(GrupoMenores("0-5", 2), GrupoMenores("12-17", 1))
        assertEquals("2 de 0 a 5 años · 1 de 12 a 17 años (total 3)", FormatoReporte.menores(g, 3, "0-5"))
    }

    @Test
    fun `un solo grupo o servidor anterior usan una sola frase`() {
        assertEquals("2 de 6 a 11 años", FormatoReporte.menores(listOf(GrupoMenores("6-11", 2)), 2, "6-11"))
        assertEquals("4 de 12 a 17 años", FormatoReporte.menores(null, 4, "12-17"))
        assertEquals("3 de edad sin determinar", FormatoReporte.menores(listOf(GrupoMenores("Sin determinar", 3)), 3, "Sin determinar"))
    }

    @Test
    fun `actividad Otro con detalle`() {
        assertEquals("Otro: Malabares", FormatoReporte.actividad("Otro", "Malabares"))
        assertEquals("Venta ambulante", FormatoReporte.actividad("Venta ambulante", null))
    }

    @Test
    fun `direccion en una linea`() {
        assertEquals(
            "Av. López Mateos 12, Col. Centro, C.P. 52900",
            FormatoReporte.direccion(DireccionRespuesta("Av. López Mateos", "12", "Centro", "52900", "frente al mercado"))
        )
        assertEquals("Col. Centro", FormatoReporte.direccion(DireccionRespuesta(null, null, "Centro", null, null)))
        assertNull(FormatoReporte.direccion(null))
        assertNull(FormatoReporte.direccion(DireccionRespuesta(null, null, null, null, null)))
    }
}
