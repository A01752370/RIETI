package mx.sipinna.rieti.viewmodel

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import mx.sipinna.rieti.model.GrupoMenores
import mx.sipinna.rieti.model.Municipio

/** Pruebas de [ValidadorReporte]: reglas del formulario antes de enviar (Fase 2). */
class ValidadorReporteTest {

    private val atizapan = Municipio(1, "15013", "Atizapán de Zaragoza")
    private val municipios = listOf(
        atizapan, Municipio(2, "15012", "Atizapán"), Municipio(3, "15057", "Naucalpan de Juárez"), Municipio(4, "15104", "Tlalnepantla de Baz")
    )
    private val direccionValida = DatosDireccion("Av. López Mateos", "12", "Centro", "52900", "Frente al mercado")

    private fun validar(
        municipio: Municipio? = atizapan,
        direccion: DatosDireccion = direccionValida,
        conteos: Map<String, Int> = mapOf("0-5" to 2, "12-17" to 1),
        actividad: String = "Venta ambulante",
        actividadOtro: String = "",
        riesgo: String = "No sé",
        descripcion: String = "Dos menores vendiendo dulces"
    ) = ValidadorReporte.validar(
        municipio, direccion, conteos, actividad, actividadOtro, ValidadorReporte.ACTIVIDADES_RESPALDO, riesgo, descripcion
    )

    @Test
    fun `un formulario completo no tiene problemas`() {
        assertEquals(emptyList<String>(), validar())
    }

    @Test
    fun `grupos de edad - 2 de 0-5 y 1 de 12-17 suman 3 y se envian en orden`() {
        val conteos = mapOf("12-17" to 1, "0-5" to 2, "6-11" to 0)
        assertEquals(3, ValidadorReporte.total(conteos))
        assertEquals(listOf(GrupoMenores("0-5", 2), GrupoMenores("12-17", 1)), ValidadorReporte.gruposParaEnviar(conteos))
    }

    @Test
    fun `sin menores no se puede enviar y no se pasa de 50`() {
        assertTrue(validar(conteos = emptyMap()).contains("Indica cuántas niñas, niños o adolescentes viste"))
        assertTrue(validar(conteos = mapOf("0-5" to 30, "6-11" to 21)).contains("El total no puede pasar de 50"))
        assertTrue(ValidadorReporte.puedeAumentar(mapOf("0-5" to 49)))
        assertFalse(ValidadorReporte.puedeAumentar(mapOf("0-5" to 30, "Sin determinar" to 20)))
    }

    @Test
    fun `la direccion exige calle, colonia y codigo postal del Estado de Mexico`() {
        val problemas = validar(direccion = DatosDireccion("  ", "", "", "", ""))
        assertTrue(problemas.contains("Escribe la calle"))
        assertTrue(problemas.contains("Escribe la colonia"))
        assertTrue(problemas.contains("Escribe el código postal"))
        assertTrue(validar(direccion = direccionValida.copy(codigoPostal = "5290")).contains("El código postal debe tener 5 dígitos"))
        assertTrue(validar(direccion = direccionValida.copy(codigoPostal = "06000")).any { it.contains("Estado de México") })
        assertTrue(ValidadorReporte.esCodigoPostalEdomex("57999"))
        assertFalse(ValidadorReporte.esCodigoPostalEdomex("58000"))
    }

    @Test
    fun `Otro exige describir la actividad`() {
        assertEquals(listOf("Describe la actividad que observaste"), validar(actividad = "Otro"))
        assertEquals(emptyList<String>(), validar(actividad = "Otro", actividadOtro = "Malabares"))
    }

    @Test
    fun `la actividad debe estar en el catalogo vigente`() {
        assertEquals(listOf("Elige la actividad que observaste"), validar(actividad = "Inventada"))
    }

    @Test
    fun `respeta el largo maximo del servidor`() {
        val problemas = validar(descripcion = "x".repeat(ValidadorReporte.MAX_DESCRIPCION + 1))
        assertEquals(1, problemas.size)
    }

    @Test
    fun `los catalogos de respaldo coinciden con los del servidor`() {
        assertEquals(listOf("0-5", "6-11", "12-14", "15-17", "Sin determinar"), ValidadorReporte.EDADES)
        assertEquals(listOf("Sí", "No", "No sé"), ValidadorReporte.RIESGOS)
        assertEquals(14, ValidadorReporte.ACTIVIDADES_RESPALDO.size)
        assertEquals(listOf("Otro", "No sé"), ValidadorReporte.ACTIVIDADES_RESPALDO.takeLast(2))
        assertTrue(ValidadorReporte.ETIQUETAS_EDAD.keys.containsAll(ValidadorReporte.EDADES))
    }

    @Test
    fun `la sugerencia del mapa no borra lo que la persona escribio`() {
        val actual = DatosDireccion(calle = "Mi calle", colonia = "", codigoPostal = "")
        val r = ValidadorReporte.aplicarSugerencia(actual, setOf("calle"), "Av. Sugerida", "12", "Centro", "52900")
        assertEquals(DatosDireccion("Mi calle", "12", "Centro", "52900", ""), r)
        // Campos sugeridos vacíos no sobrescriben.
        assertEquals(r, ValidadorReporte.aplicarSugerencia(r, emptySet(), null, "", null, null))
    }

    @Test
    fun `normaliza el folio escrito a mano`() {
        assertEquals("RIETI-2026-000123", ValidadorReporte.normalizarFolio(" rieti-2026-000123 "))
        assertEquals("RIETI-ATZ-2026-000123", ValidadorReporte.normalizarFolio(" rieti-atz-2026-000123 "))
        assertNull(ValidadorReporte.normalizarFolio("RIETI-AT-2026-000123"))
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
