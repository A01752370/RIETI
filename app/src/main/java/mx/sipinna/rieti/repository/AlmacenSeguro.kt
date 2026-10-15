package mx.sipinna.rieti.repository

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Guarda un texto pequeño (el refresh token de la cuenta de ciudadano) cifrado
 * con AES-256-GCM. La llave vive en el **Android Keystore**: no se puede extraer
 * del teléfono ni viaja en respaldos (la app además tiene `allowBackup=false`).
 *
 * Se usa el Keystore directamente para no agregar dependencias. Si algo falla
 * (p. ej. la llave se invalidó), el valor se descarta y la persona vuelve a
 * iniciar sesión: nunca se guarda en claro.
 *
 * @param contexto contexto de la aplicación
 */
class AlmacenSeguro(contexto: Context) {

    private val preferencias = contexto.getSharedPreferences("rieti_seguro", Context.MODE_PRIVATE)

    private fun llave(): SecretKey {
        val almacen = KeyStore.getInstance(PROVEEDOR).apply { load(null) }
        (almacen.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val generador = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, PROVEEDOR)
        generador.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generador.generateKey()
    }

    /** Guarda [valor] cifrado bajo [clave]; con null lo borra. */
    fun guardar(clave: String, valor: String?) {
        if (valor == null) {
            preferencias.edit().remove(clave).apply()
            return
        }
        val cifrador = Cipher.getInstance(TRANSFORMACION).apply { init(Cipher.ENCRYPT_MODE, llave()) }
        val cifrado = cifrador.doFinal(valor.toByteArray(Charsets.UTF_8))
        val paquete = cifrador.iv + cifrado
        preferencias.edit().putString(clave, Base64.encodeToString(paquete, Base64.NO_WRAP)).apply()
    }

    /** Lee y descifra el valor guardado bajo [clave], o null si no hay o no se puede descifrar. */
    fun leer(clave: String): String? {
        val texto = preferencias.getString(clave, null) ?: return null
        return try {
            val paquete = Base64.decode(texto, Base64.NO_WRAP)
            val iv = paquete.copyOfRange(0, IV_BYTES)
            val cifrado = paquete.copyOfRange(IV_BYTES, paquete.size)
            val cifrador = Cipher.getInstance(TRANSFORMACION).apply { init(Cipher.DECRYPT_MODE, llave(), GCMParameterSpec(128, iv)) }
            String(cifrador.doFinal(cifrado), Charsets.UTF_8)
        } catch (e: Exception) {
            guardar(clave, null)
            null
        }
    }

    private companion object {
        const val PROVEEDOR = "AndroidKeyStore"
        const val ALIAS = "rieti_sesion_ciudadano"
        const val TRANSFORMACION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
    }
}
