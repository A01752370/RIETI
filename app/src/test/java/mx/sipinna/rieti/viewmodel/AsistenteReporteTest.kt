package mx.sipinna.rieti.viewmodel

import java.io.File
import mx.sipinna.rieti.model.CrearReporteRequest
import mx.sipinna.rieti.model.DireccionReporte
import mx.sipinna.rieti.model.GrupoMenores
import mx.sipinna.rieti.model.Municipio
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pruebas de [AsistenteReporte]: validación por paso, navegación, cuerpo del envío y que nada se persista (Fase 5). */
class AsistenteReporteTest {

    private val actividades = ValidadorReporte.ACTIVIDADES_RESPALDO
    private val atizapan = Municipio(1, "15013", "Atizapán de Zaragoza")

    private val completo = DatosFormulario(
        municipio = atizapan,
        direccion = DatosDireccion("  Av. López Mateos ", "12 ", " Centro", "52900", "  "),
        conteos = mapOf("12-17" to 1, "0-5" to 2, "6-11" to 0),
        actividad = "Otro",
        actividadOtro = " Malabares ",
        riesgo = "No sé",
        descripcion = "  Dos menores en el crucero  "
    )

    private fun avanzar(e: EstadoAsistente) = AsistenteReporte.avanzar(e, actividades)

    @Test
    fun `no avanza si faltan datos del paso y marca cada campo con el mensaje de siempre`() {
        val e = avanzar(EstadoAsistente())
        assertEquals(PasoReporte.DONDE, e.paso)
        assertEquals("Elige el municipio donde ocurre", e.errores[CampoReporte.MUNICIPIO])
        assertEquals("Escribe la calle", e.errores[CampoReporte.CALLE])
        assertEquals("Escribe la colonia", e.errores[CampoReporte.COLONIA])
        assertEquals("Escribe el código postal", e.errores[CampoReporte.CODIGO_POSTAL])
    }

    @Test
    fun `cada paso solo valida lo suyo`() {
        val soloDonde = DatosFormulario(municipio = atizapan, direccion = DatosDireccion("Calle 5", "", "Centro", "52900"))
        val e1 = avanzar(EstadoAsistente(datos = soloDonde))
        assertEquals(PasoReporte.QUIENES, e1.paso)
        assertTrue(e1.errores.isEmpty())

        val e2 = avanzar(e1)
        assertEquals(PasoReporte.QUIENES, e2.paso)
        assertEquals(setOf(CampoReporte.GRUPOS), e2.errores.keys)

        val e3 = avanzar(e2.copy(datos = soloDonde.copy(conteos = mapOf("6-11" to 1))))
        assertEquals(PasoReporte.QUE, e3.paso)
        val e4 = avanzar(e3)
        assertEquals(setOf(CampoReporte.ACTIVIDAD, CampoReporte.RIESGO, CampoReporte.DESCRIPCION), e4.errores.keys)
    }

    @Test
    fun `codigo postal de otro estado no deja avanzar`() {
        val d = DatosFormulario(municipio = atizapan, direccion = DatosDireccion("Calle 5", "", "Centro", "06000"))
        assertEquals(
            "El código postal no es del Estado de México (empieza con 50 a 57)",
            avanzar(EstadoAsistente(datos = d)).errores[CampoReporte.CODIGO_POSTAL]
        )
    }

    @Test
    fun `adelante y atras no pierden lo capturado`() {
        var e = EstadoAsistente(datos = completo)
        repeat(3) { e = avanzar(e) }
        assertEquals(PasoReporte.REVISAR, e.paso)
        assertEquals(PasoReporte.REVISAR, e.maximo)
        e = AsistenteReporte.retroceder(e)!!
        e = AsistenteReporte.retroceder(e)!!
        e = AsistenteReporte.retroceder(e)!!
        assertEquals(PasoReporte.DONDE, e.paso)
        assertEquals(completo, e.datos)
        assertNull("En el primer paso no hay paso anterior: la pantalla decide si sale", AsistenteReporte.retroceder(e))
    }

    @Test
    fun `editar desde la revision vuelve directo a revisar al continuar`() {
        var e = EstadoAsistente(datos = completo)
        repeat(3) { e = avanzar(e) }
        e = AsistenteReporte.irA(e, PasoReporte.QUIENES)
        assertEquals(PasoReporte.QUIENES, e.paso)
        e = avanzar(e.copy(datos = e.datos.copy(conteos = mapOf("0-5" to 4))))
        assertEquals(PasoReporte.REVISAR, e.paso)
    }

    @Test
    fun `no se puede saltar a un paso que aun no se alcanza`() {
        val e = AsistenteReporte.irA(EstadoAsistente(), PasoReporte.REVISAR)
        assertEquals(PasoReporte.DONDE, e.paso)
    }

    @Test
    fun `corregir un campo quita solo su error`() {
        val e = avanzar(EstadoAsistente())
        val limpio = AsistenteReporte.limpiarError(e, CampoReporte.CALLE)
        assertFalse(CampoReporte.CALLE in limpio.errores)
        assertTrue(CampoReporte.MUNICIPIO in limpio.errores)
    }

    @Test
    fun `salir pide confirmacion solo si ya se capturo algo`() {
        assertFalse(AsistenteReporte.hayDatos(DatosFormulario()))
        assertFalse("Un contador en cero no cuenta como dato", AsistenteReporte.hayDatos(DatosFormulario(conteos = mapOf("0-5" to 0))))
        assertTrue(AsistenteReporte.hayDatos(DatosFormulario(descripcion = "algo")))
        assertTrue(AsistenteReporte.hayDatos(DatosFormulario(municipio = atizapan)))
    }

    @Test
    fun `el cuerpo final es identico al del formulario de una sola pantalla`() {
        // Lo que armaba FormularioReporteViewModel.enviar antes de la Fase 5, con los mismos datos.
        val esperado = CrearReporteRequest(
            municipioId = 1,
            direccion = DireccionReporte("Av. López Mateos", "12", "Centro", "52900", null),
            latitud = 19.5594,
            longitud = -99.2512,
            grupos = listOf(GrupoMenores("0-5", 2), GrupoMenores("12-17", 1)),
            actividad = "Otro",
            actividadOtro = "Malabares",
            situacionRiesgo = "No sé",
            descripcion = "Dos menores en el crucero",
            avisoPrivacidadVersion = "2026-10-v3",
            vincularCuenta = null
        )
        val punto = UbicacionCapturada(19.5594, -99.2512, null)
        assertEquals(esperado, AsistenteReporte.solicitud(completo, "2026-10-v3", punto, vincularCuenta = false))
    }

    @Test
    fun `anonimo por defecto - vincularCuenta solo viaja cuando se pide`() {
        assertNull(AsistenteReporte.solicitud(completo, "v", null, vincularCuenta = false).vincularCuenta)
        assertEquals(true, AsistenteReporte.solicitud(completo, "v", null, vincularCuenta = true).vincularCuenta)
        assertFalse("El interruptor empieza apagado", DatosFormulario().vincular)
    }

    @Test
    fun `actividad distinta de Otro no envia el detalle aunque se haya escrito`() {
        val d = completo.copy(actividad = "Venta ambulante")
        assertNull(AsistenteReporte.solicitud(d, "v", null, false).actividadOtro)
    }

    @Test
    fun `progreso e indicador accesible`() {
        assertEquals(0.25f, EstadoAsistente().progreso)
        assertEquals("Paso 2 de 4: A quiénes", PasoReporte.QUIENES.descripcion)
    }

    /**
     * Privacidad (Fase 5): lo capturado no se guarda en disco. El asistente vive en el
     * ViewModel; la pantalla no usa rememberSaveable para los datos del reporte y nada
     * del flujo de reporte usa preferencias, DataStore, archivos ni bases locales.
     */
    @Test
    fun `nada del formulario se persiste`() {
        val base = File("src/main/java/mx/sipinna/rieti")
        val archivos = listOf(
            "view/FormularioReporteScreen.kt", "viewmodel/FormularioReporteViewModel.kt",
            "viewmodel/AsistenteReporte.kt", "viewmodel/ValidadorReporte.kt"
        ).map { File(base, it) }
        val prohibido = Regex("rememberSaveable|SharedPreferences|DataStore|openFileOutput|Room|SQLite|SavedStateHandle")
        archivos.forEach { f ->
            assertTrue("No existe ${f.path}", f.exists())
            val hallazgo = prohibido.find(f.readText().lines().filterNot { it.trimStart().startsWith("*") || it.trimStart().startsWith("//") }.joinToString("\n"))
            assertNull("${f.name} no debe persistir datos del formulario (${hallazgo?.value})", hallazgo)
        }
    }
}
