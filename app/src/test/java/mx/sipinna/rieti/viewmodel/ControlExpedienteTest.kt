package mx.sipinna.rieti.viewmodel

import mx.sipinna.rieti.model.EventoSeguimiento
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ControlExpedienteTest {

    private fun ev(estatus: String, tipo: String? = null) = EventoSeguimiento(estatus, null, null, "2026-10-18T00:00:00Z", tipo)

    @Test
    fun `respeta el tipo del servidor y clasifica los eventos de servidores anteriores`() {
        val h = listOf(ev("Recibido"), ev("En revisión"), ev("En revisión"), ev("En revisión", "accion"), ev("En revisión", "expediente"))
        assertEquals(listOf("registro", "cambio", "nota", "accion", "expediente"), h.indices.map { ControlExpediente.tipoEvento(h, it) })
    }

    @Test
    fun `solo el registro y los cambios de estatus avanzan el caso`() {
        assertTrue(ControlExpediente.esCambio("registro"))
        assertTrue(ControlExpediente.esCambio("cambio"))
        listOf("nota", "accion", "expediente").forEach { assertFalse(ControlExpediente.esCambio(it)) }
    }

    @Test
    fun `titulos de la bitacora`() {
        assertEquals("Acción realizada", ControlExpediente.tituloEvento("accion", "En revisión"))
        assertEquals("Cambio en el expediente", ControlExpediente.tituloEvento("expediente", "En revisión"))
        assertEquals("Cambio de estatus a \"En seguimiento\"", ControlExpediente.tituloEvento("cambio", "En atención"))
    }

    @Test
    fun `concluir exige resultado, cancelar motivo y reincidente comentario`() {
        assertFalse(ControlExpediente.cambioCompleto("Concluido", "comentario", "", ""))
        assertTrue(ControlExpediente.cambioCompleto("Concluido", "", "", "Se canalizó al DIF"))
        assertFalse(ControlExpediente.cambioCompleto("Descartado", "", " ", ""))
        assertFalse(ControlExpediente.cambioCompleto(CatalogoEstatus.REINCIDENTE, "", "", ""))
        assertTrue(ControlExpediente.cambioCompleto("En atención", "", "", ""))
    }

    @Test
    fun `texto de una accion`() {
        assertEquals("Visita: se habló con la familia", ControlExpediente.textoAccion("Visita", "  se habló con la familia "))
    }
}
