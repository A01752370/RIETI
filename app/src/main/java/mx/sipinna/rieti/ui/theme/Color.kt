package mx.sipinna.rieti.ui.theme

import androidx.compose.ui.graphics.Color

/*
 * Tokens de diseño de RIETI: los mismos valores que web/src/tokens.css
 * (ver docs/diseno/tokens.md). Tomados de los logos; los tonos que no alcanzaban
 * contraste AA para texto se oscurecieron conservando el tono.
 */

/** Teal SIPINNA (#0092A3) oscurecido: 5.50:1 sobre blanco. Botones y enlaces. */
val Primario = Color(0xFF007482)

/** Variante para estados presionados: 7.08:1. */
val PrimarioOscuro = Color(0xFF00626D)

/** Índigo del logo SIPINNA, original: 6.27:1. */
val Secundario = Color(0xFF486090)

/** Rosa SIPINNA (#D5769E) oscurecido: 5.34:1. */
val Acento = Color(0xFFBB3970)

/** Texto del logo SIPINNA: 18.3:1. */
val Texto = Color(0xFF1E120D)

/** Gris RIETI (#909090) oscurecido: 5.33:1. Ayudas y notas. */
val TextoSecundario = Color(0xFF6B6B6B)

val ErrorRieti = Color(0xFFC62828)
val Superficie = Color(0xFFF3F4F8)
val TintePrimario = Color(0xFFE6F4F6)
val TinteAcento = Color(0xFFFBEFF4)

/** Colores de estatus (texto blanco ≥ 4.5:1), iguales a la web. */
object ColoresEstatus {
    val Recibido = Color(0xFF546E7A)
    val EnRevision = Color(0xFF1565C0)
    /** Antes #EF6C00 (3.08:1, no cumplía AA). */
    val EnAtencion = Color(0xFFC15700)
    val Canalizado = Color(0xFF6A1B9A)
    val Concluido = Color(0xFF2E7D32)
    val Descartado = Color(0xFF757575)
}
