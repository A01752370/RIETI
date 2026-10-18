package mx.sipinna.rieti.viewmodel

import org.junit.Assert.assertEquals
import org.junit.Test

/** Pruebas de [ExtractorFolioClave] con textos como los que la gente realmente pega. */
class ExtractorFolioClaveTest {

    private val folio = "RIETI-2026-000123"
    private val clave = "ABCD-EFGH-2345"

    private fun extraer(t: String) = ExtractorFolioClave.extraer(t)

    @Test
    fun `bloque combinado que copiaba la version anterior`() {
        assertEquals(FolioYClave(folio, clave), extraer("Folio: RIETI-2026-000123\nClave: ABCD-EFGH-2345"))
    }

    @Test
    fun `bloque del boton compartir con etiquetas largas`() {
        assertEquals(FolioYClave(folio, clave), extraer("RIETI\nFolio: RIETI-2026-000123\nClave de consulta: ABCD-EFGH-2345"))
    }

    @Test
    fun `minusculas y espacios en lugar de guiones`() {
        assertEquals(FolioYClave(folio, clave), extraer("  rieti 2026 000123   abcd efgh 2345 "))
    }

    @Test
    fun `sin guiones`() {
        assertEquals(FolioYClave(folio, clave), extraer("RIETI2026000123 ABCDEFGH2345"))
    }

    @Test
    fun `con saltos de linea dentro de la clave`() {
        assertEquals(FolioYClave(folio, clave), extraer("folio rieti-2026-000123\nclave\nABCD\nEFGH\n2345"))
    }

    @Test
    fun `guiones largos de teclados moviles`() {
        assertEquals(FolioYClave(folio, clave), extraer("RIETI–2026–000123 ABCD—EFGH—2345"))
    }

    @Test
    fun `solo folio`() {
        assertEquals(FolioYClave(folio, null), extraer("RIETI-2026-000123"))
    }

    @Test
    fun `solo clave`() {
        assertEquals(FolioYClave(null, clave), extraer("abcd-efgh-2345"))
    }

    @Test
    fun `texto basura no produce datos`() {
        assertEquals(FolioYClave(null, null), extraer("hola, ¿cómo consulto mi reporte?"))
        assertEquals(FolioYClave(null, null), extraer(""))
        assertEquals(FolioYClave(null, null), extraer("para este caso"))
    }

    @Test
    fun `una clave con simbolos que el servidor nunca genera no se reconoce`() {
        assertEquals(null, extraer("ABCD-EFGH-0001").clave)
    }

    @Test
    fun `los digitos del folio no se toman como clave`() {
        assertEquals(FolioYClave(folio, null), extraer("Folio: RIETI-2026-000123\nClave:"))
    }

    @Test
    fun `un folio con digitos de mas no se acepta`() {
        assertEquals(null, extraer("RIETI-2026-0001234").folio)
    }

    @Test
    fun `la palabra CONSULTA no se confunde con una clave`() {
        assertEquals(FolioYClave(null, null), extraer("Clave de consulta"))
    }

    @Test
    fun `pegar el bloque en el campo de la clave rellena los dos campos`() {
        val r = ExtractorFolioClave.alCambiar("Folio: RIETI-2026-000123\nClave: ABCD-EFGH-2345", enCampoFolio = false, folioActual = "", claveActual = "")
        assertEquals(folio to clave, r)
    }

    @Test
    fun `pegar el bloque en el campo del folio rellena los dos campos`() {
        val r = ExtractorFolioClave.alCambiar("Folio: RIETI-2026-000123\nClave: ABCD-EFGH-2345", enCampoFolio = true, folioActual = "", claveActual = "")
        assertEquals(folio to clave, r)
    }

    @Test
    fun `mientras se teclea se conserva el texto parcial`() {
        assertEquals("RIETI-2026-00" to "", ExtractorFolioClave.alCambiar("RIETI-2026-00", true, "", ""))
        assertEquals(folio to "ABCD-EF", ExtractorFolioClave.alCambiar("ABCD-EF", false, folio, ""))
    }

    @Test
    fun `un folio pegado en el campo de la clave se mueve a su campo`() {
        assertEquals(folio to "", ExtractorFolioClave.alCambiar("RIETI-2026-000123", false, "", ""))
    }

    @Test
    fun `pegar desde el boton rellena lo reconocido y conserva lo demas`() {
        assertEquals(folio to clave, ExtractorFolioClave.alPegar("Folio: RIETI-2026-000123 Clave: ABCD-EFGH-2345", "", ""))
        assertEquals(folio to "YA ESCRITA", ExtractorFolioClave.alPegar("RIETI-2026-000123", "", "YA ESCRITA"))
        assertEquals(null, ExtractorFolioClave.alPegar("nada util", "x", "y"))
    }

    @Test
    fun `el texto libre se limita despues de intentar interpretarlo`() {
        val largo = "x".repeat(100)
        assertEquals(ExtractorFolioClave.MAX_TEXTO_LIBRE, ExtractorFolioClave.alCambiar(largo, true, "", "").first.length)
    }

    @Test
    fun `Fase 6 - folio con clave municipal, junto, separado o en minusculas`() {
        val nuevo = "RIETI-ATZ-2026-000123"
        assertEquals(FolioYClave(nuevo, clave), extraer("Folio: RIETI-ATZ-2026-000123\nClave de consulta: ABCD-EFGH-2345"))
        assertEquals(FolioYClave(nuevo, clave), extraer(" rieti atz 2026 000123  abcd efgh 2345 "))
        assertEquals(FolioYClave(nuevo, null), extraer("RIETIATZ2026000123"))
        // Los folios heredados siguen funcionando.
        assertEquals(FolioYClave(folio, null), extraer("RIETI-2026-000123"))
    }
}
