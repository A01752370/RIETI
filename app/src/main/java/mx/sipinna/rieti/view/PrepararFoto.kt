package mx.sipinna.rieti.view

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mx.sipinna.rieti.viewmodel.ReglasFotos

/**
 * Convierte la foto elegida o tomada en un JPEG reducido **sin metadatos** (Fase 8): al
 * decodificar a píxeles y volver a comprimir se pierden EXIF y GPS. En Android 9+ se aplica
 * la orientación de la foto. Todo ocurre en memoria; el servidor la re-codifica de nuevo.
 *
 * @return los bytes del JPEG, o null si el archivo no es una imagen legible
 */
suspend fun prepararFoto(contexto: Context, uri: Uri): ByteArray? = withContext(Dispatchers.IO) {
    try {
        val bitmap: Bitmap = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(contexto.contentResolver, uri)) { decoder, info, _ ->
                val (ancho, alto) = ReglasFotos.medidas(info.size.width, info.size.height)
                decoder.setTargetSize(ancho, alto)
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            }
        } else {
            val limites = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            contexto.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, limites) }
            if (limites.outWidth <= 0) return@withContext null
            val opciones = BitmapFactory.Options().apply { inSampleSize = ReglasFotos.muestreo(limites.outWidth, limites.outHeight) }
            val leida = contexto.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opciones) } ?: return@withContext null
            val (ancho, alto) = ReglasFotos.medidas(leida.width, leida.height)
            if (ancho == leida.width) leida else Bitmap.createScaledBitmap(leida, ancho, alto, true)
        }
        ByteArrayOutputStream().use { salida ->
            var calidad = 85
            do {
                salida.reset()
                bitmap.compress(Bitmap.CompressFormat.JPEG, calidad, salida)
                calidad -= 15
            } while (salida.size() > ReglasFotos.MAX_BYTES && calidad > 30)
            bitmap.recycle()
            salida.toByteArray().takeIf { it.size <= ReglasFotos.MAX_BYTES }
        }
    } catch (e: Exception) {
        null
    }
}
