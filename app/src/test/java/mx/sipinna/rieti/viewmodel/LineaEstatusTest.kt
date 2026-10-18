package mx.sipinna.rieti.viewmodel

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pruebas de la línea de progreso del estatus y del catálogo de significados (Fase 5). */
class LineaEstatusTest {

    private fun estados(l: LineaEstatus) = l.pasos.map { it.estatus to it.estado }

    @Test
    fun `pantalla de folio - recien recibido, sin historial, con la fecha de alta`() {
        val l = LineaEstatus.calcular("Recibido", emptyList(), "2026-10-14T09:00:00Z")
        assertEquals(EstadoPaso.ACTUAL, l.pasos[0].estado)
        assertEquals("2026-10-14T09:00:00Z", l.pasos[0].fecha)
        assertTrue(l.pasos.drop(1).all { it.estado == EstadoPaso.PENDIENTE && it.fecha == null })
        assertNull(l.descartado)
        assertEquals("Etapa 1 de 5: Registrado", l.descripcion)
    }

    @Test
    fun `alcanzados con palomita y fecha, actual resaltado, pendientes sin fecha`() {
        val l = LineaEstatus.calcular("En atención", listOf("Recibido" to "a", "En revisión" to "b", "En atención" to "c"))
        assertEquals(
            listOf(
                "Recibido" to EstadoPaso.ALCANZADO, "En revisión" to EstadoPaso.ALCANZADO, "En atención" to EstadoPaso.ACTUAL,
                "Canalizado" to EstadoPaso.PENDIENTE, "Concluido" to EstadoPaso.PENDIENTE
            ),
            estados(l)
        )
        assertEquals(listOf("a", "b", "c", null, null), l.pasos.map { it.fecha })
    }

    @Test
    fun `una etapa que el caso salto se marca como omitida, no como pendiente`() {
        val l = LineaEstatus.calcular("Concluido", listOf("Recibido" to "a", "En revisión" to "b", "Canalizado" to "c", "Concluido" to "d"))
        assertEquals(EstadoPaso.OMITIDO, l.pasos[2].estado) // En atención
        assertEquals(EstadoPaso.ACTUAL, l.pasos[4].estado)
    }

    @Test
    fun `descartado es un final distinto y solo muestra lo que se alcanzo`() {
        val l = LineaEstatus.calcular("Descartado", listOf("Recibido" to "a", "En revisión" to "b", "Descartado" to "c"))
        assertEquals(listOf("Recibido" to EstadoPaso.ALCANZADO, "En revisión" to EstadoPaso.ALCANZADO), estados(l))
        assertNotNull(l.descartado)
        assertEquals("c", l.descartado!!.fecha)
        assertEquals("Reporte cancelado", l.descripcion)
    }

    @Test
    fun `Fase 6 - Reincidente y Archivado se muestran aparte de la linea, con etiquetas del socio`() {
        val r = LineaEstatus.calcular("Reincidente", listOf("Recibido" to "a", "En revisión" to "b", "En atención" to "c", "Concluido" to "d", "Reincidente" to "e"))
        assertEquals("Reincidente", r.final?.estatus)
        assertEquals("e", r.final?.fecha)
        assertTrue(r.pasos.all { it.estado == EstadoPaso.ALCANZADO })
        val a = LineaEstatus.calcular("Archivado", listOf("Recibido" to "a", "Concluido" to "d", "Archivado" to "f"))
        assertEquals("Archivado", a.final?.estatus)
        assertEquals("Reporte concluido y archivado", a.descripcion)
        assertEquals(listOf("Registrado", "En revisión", "En seguimiento", "Canalizado", "Concluido", "Cancelado", "Archivado", "Reincidente"),
            CatalogoEstatus.TODOS.map { CatalogoEstatus.etiqueta(it) })
    }

    @Test
    fun `cada estatus tiene una explicacion sin plazos ni promesas`() {
        CatalogoEstatus.TODOS.forEach { e ->
            val texto = CatalogoEstatus.significado(e)
            assertTrue(texto.isNotBlank())
            assertNull("\"$e\" no debe prometer tiempos: $texto", Regex("(?i)\\b(horas?|d[ií]as?|semanas?|pronto|plazo|m[aá]ximo)\\b").find(texto))
        }
    }

    @Test
    fun `tiempo transcurrido medido`() {
        val ahora = Instant.parse("2026-10-18T12:00:00Z")
        assertEquals("menos de 1 min", FormatoReporte.transcurrido("2026-10-18T11:59:40Z", ahora))
        assertEquals("45 min", FormatoReporte.transcurrido("2026-10-18T11:15:00Z", ahora))
        assertEquals("5 h", FormatoReporte.transcurrido("2026-10-18T07:00:00Z", ahora))
        assertEquals("1 día y 3 h", FormatoReporte.transcurrido("2026-10-17T09:00:00Z", ahora))
        assertEquals("21 días", FormatoReporte.transcurrido("2026-09-27T12:00:00Z", ahora))
        assertNull(FormatoReporte.transcurrido("no es fecha", ahora))
    }
}
