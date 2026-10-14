package mx.sipinna.rieti.viewmodel

/**
 * Reglas de la cuenta de ciudadano que se revisan en el teléfono (el servidor y
 * el servicio de identidad vuelven a validar). Lógica pura, probada.
 */
object ValidadorCuenta {

    /** Largo mínimo de la contraseña (igual que el pool de ciudadanos). */
    const val MIN_CONTRASENA = 12

    private val CORREO = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")

    /** ¿Tiene forma de correo? */
    fun correoValido(correo: String): Boolean = CORREO.matches(correo.trim()) && correo.trim().length <= 254

    /**
     * Problemas de una contraseña nueva (vacío si cumple): 12+ caracteres, con
     * mayúscula, minúscula y número.
     */
    fun problemasContrasena(password: String): List<String> = buildList {
        if (password.length < MIN_CONTRASENA) add("Usa al menos $MIN_CONTRASENA caracteres")
        if (password.none { it.isUpperCase() }) add("Incluye al menos una mayúscula")
        if (password.none { it.isLowerCase() }) add("Incluye al menos una minúscula")
        if (password.none { it.isDigit() }) add("Incluye al menos un número")
    }

    /** ¿Código de 6 dígitos? */
    fun codigoValido(codigo: String): Boolean = Regex("^\\d{6}$").matches(codigo.trim())

    /** Problemas del formulario de registro. */
    fun validarRegistro(correo: String, password: String, confirmacion: String): List<String> = buildList {
        if (!correoValido(correo)) add("Escribe un correo válido")
        addAll(problemasContrasena(password))
        if (password != confirmacion) add("Las contraseñas no coinciden")
    }
}
