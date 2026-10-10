package mx.sipinna.rieti.viewmodel

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import mx.sipinna.rieti.model.Municipio

/** Pruebas de [ValidadorReporte]: reglas del formulario antes de enviar. */
class ValidadorReporteTest {

    private val atizapan = Municipio(1, "15013", "Atizapán de Zaragoza")
    private val municipios = listOf(
        atizapan, Municipio(2, "15012", "Atizapán"), Municipio(3, "15057", "Naucalpan de Juárez"), Municipio(4, "15104", "Tlalnepantla de Baz")
    )

    private fun validar(
        municipio: Municipio? = atizapan,
        ubicacion: String = "Av. López Mateos y Calle 5",
        cantidad: String = "2 a 3",
        edad: String = "6-11",
        actividad: String = "Venta ambulante",
        riesgo: String = "No sé",
        descripcion: String = "Dos menores vendiendo dulces"
    ) = ValidadorReporte.validar(municipio, ubicacion, cantidad, edad, actividad, riesgo, descripcion)

    @Test
    fun `un formulario completo no tiene problemas`() {
        assertEquals(emptyList<String>(), validar())
    }

    @Test
    fun `sin elegir chips se piden todos`() {
        val problemas = validar(cantidad = "", edad = "", actividad = "", riesgo = "")
        assertEquals(4, problemas.size)
    }

    @Test
    fun `ubicacion y descripcion vacias o solo con espacios no pasan`() {
        val problemas = validar(ubicacion = "   ", descripcion = "\n")
        assertTrue(problemas.contains("Indica el lugar de los hechos"))
        assertTrue(problemas.contains("Describe brevemente lo que observaste"))
    }

    @Test
    fun `respeta el largo maximo del servidor`() {
        val problemas = validar(descripcion = "x".repeat(ValidadorReporte.MAX_DESCRIPCION + 1))
        assertEquals(1, problemas.size)
    }

    @Test
    fun `las opciones de los chips coinciden con los catalogos del servidor`() {
        assertEquals(listOf("0-5", "6-11", "12-17"), ValidadorReporte.EDADES)
        assertEquals(listOf("Sí", "No", "No sé"), ValidadorReporte.RIESGOS)
        assertEquals(6, ValidadorReporte.ACTIVIDADES.size)
        assertEquals(listOf(1, 2, 4), ValidadorReporte.CANTIDADES.values.toList())
    }

    @Test
    fun `normaliza el folio escrito a mano`() {
        assertEquals("RIETI-2026-000123", ValidadorReporte.normalizarFolio(" rieti-2026-000123 "))
        assertNull(ValidadorReporte.normalizarFolio("RIETI-2026-123"))
        assertNull(ValidadorReporte.normalizarFolio("RIETI-2026-000001' OR '1'='1"))
    }

    @Test
    fun `el municipio es obligatorio en la app`() {
        assertEquals(listOf("Elige el municipio donde ocurre"), validar(municipio = null))
    }

    @Test
    fun `la busqueda de municipios ignora acentos y prioriza los que empiezan con el texto`() {
        assertEquals("atizapan", ValidadorReporte.normalizar("  ATIZAPÁN "))
        assertEquals(listOf("15013", "15012"), ValidadorReporte.filtrarMunicipios(municipios, "atizapan").map { it.clave })
        assertEquals(listOf("Tlalnepantla de Baz"), ValidadorReporte.filtrarMunicipios(municipios, "baz").map { it.nombre })
        assertEquals(municipios, ValidadorReporte.filtrarMunicipios(municipios, ""))
        assertTrue(ValidadorReporte.filtrarMunicipios(municipios, "zzz").isEmpty())
    }
}
