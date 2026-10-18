package mx.sipinna.rieti.viewmodel

/**
 * Folio y clave encontrados en un texto. Cualquiera puede faltar.
 *
 * @property folio folio normalizado `RIETI-ATZ-AAAA-NNNNNN` o el heredado `RIETI-AAAA-NNNNNN`, o null
 * @property clave clave normalizada `XXXX-XXXX-XXXX`, o null
 */
data class FolioYClave(val folio: String?, val clave: String?)

/**
 * Interpreta lo que la persona escribe o pega en la consulta (CU-08).
 *
 * La pantalla de confirmación permite copiar el folio, la clave o ambos; además,
 * mucha gente pega el bloque completo ("Folio: …\nClave: …") que recibió por
 * mensaje. Este extractor tolera mayúsculas o minúsculas, espacios, saltos de
 * línea, guiones faltantes y las etiquetas del bloque, y separa los dos datos.
 * Es lógica pura (sin Android) para poder probarla.
 */
object ExtractorFolioClave {

    /** Largo máximo que se conserva de un texto que no se pudo interpretar. */
    const val MAX_TEXTO_LIBRE = 40

    // Separadores tolerados entre bloques: espacios, saltos de línea o guiones (también varios seguidos).
    private const val SEP = "[\\s\\-–—]*"

    /** RIETI-ATZ-2026-000123 (Fase 6) o RIETI-2026-000123, "rieti atz 2026 000123", "RIETI2026000123"… */
    private val FOLIO = Regex("RIETI$SEP(?:([A-Z]{3})$SEP)?(\\d{4})$SEP(\\d{6})(?!\\d)")

    /** Etiquetas que acompañan a los datos en el texto compartido; se ignoran. */
    private val ETIQUETAS = Regex("\\b(FOLIO|CLAVE|DE|CONSULTA|RIETI)\\b")

    /**
     * Alfabeto de la clave: el mismo del servidor (`clave-consulta.ts`), sin 0/O ni 1/I/L.
     * Restringirlo evita confundir palabras comunes ("CONSULTA", "PARA ESTE CASO") con una clave.
     */
    private const val SIMBOLO = "[2-9A-HJKMNP-Z]"

    /** Tres bloques de 4 símbolos, juntos o separados (ABCD-EFGH-2345, "abcd efgh 2345", ABCDEFGH2345). */
    private val CLAVE = Regex("(?<![A-Z0-9])($SIMBOLO{4})$SEP($SIMBOLO{4})$SEP($SIMBOLO{4})(?![A-Z0-9])")

    /**
     * Busca el folio y la clave en [texto].
     *
     * El folio se busca primero y se retira del texto, para que sus dígitos no
     * se confundan con la clave.
     */
    fun extraer(texto: String): FolioYClave {
        val mayus = texto.uppercase()
        val coincidenciaFolio = FOLIO.find(mayus)
        val folio = coincidenciaFolio?.let { m ->
            val clave = m.groupValues[1].takeIf { it.isNotEmpty() }?.let { "$it-" } ?: ""
            "RIETI-$clave${m.groupValues[2]}-${m.groupValues[3]}"
        }

        val resto = (coincidenciaFolio?.let { mayus.removeRange(it.range) } ?: mayus)
            .replace(ETIQUETAS, " ")
        val clave = CLAVE.find(resto)?.let { m -> m.groupValues.drop(1).joinToString("-") }
        return FolioYClave(folio, clave)
    }

    /**
     * Nuevo valor de los dos campos cuando cambia uno de ellos.
     *
     * - Si el texto trae folio **y** clave (p. ej. se pegó el bloque completo),
     *   se rellenan los dos, sin importar en qué campo se pegó.
     * - Si el campo editado reconoce su propio dato completo, se deja normalizado.
     * - Si no, se conserva lo escrito (con un límite sensato), para no estorbar
     *   mientras la persona teclea.
     *
     * @param texto lo que quedó en el campo editado
     * @param enCampoFolio true si se editó el campo del folio
     * @param folioActual valor actual del campo del folio
     * @param claveActual valor actual del campo de la clave
     * @return par (folio, clave) a mostrar
     */
    fun alCambiar(texto: String, enCampoFolio: Boolean, folioActual: String, claveActual: String): Pair<String, String> {
        val encontrado = extraer(texto)
        if (encontrado.folio != null && encontrado.clave != null) return encontrado.folio to encontrado.clave

        val libre = texto.take(MAX_TEXTO_LIBRE)
        return if (enCampoFolio) {
            (encontrado.folio ?: libre) to claveActual
        } else {
            // Si en el campo de la clave se pegó solo un folio, se manda a su campo.
            if (encontrado.folio != null) encontrado.folio to claveActual
            else folioActual to (encontrado.clave ?: libre)
        }
    }

    /**
     * Resultado del botón "Pegar": rellena lo que se reconozca en el portapapeles
     * y deja igual el resto.
     *
     * @return par (folio, clave) a mostrar, o null si el texto no trae ningún dato reconocible
     */
    fun alPegar(texto: String, folioActual: String, claveActual: String): Pair<String, String>? {
        val e = extraer(texto)
        if (e.folio == null && e.clave == null) return null
        return (e.folio ?: folioActual) to (e.clave ?: claveActual)
    }
}
