/**
 * Límite de intentos fallidos de consulta por folio (RF-47, ataque A1).
 *
 * El throttling por IP ya frena a un solo cliente; este límite protege un folio
 * concreto aunque el atacante reparta los intentos entre varias IP. Tras
 * `maxFallos` intentos fallidos dentro de la ventana, el folio queda bloqueado
 * para consulta pública hasta que la ventana expira.
 *
 * Vive en memoria de cada tarea de ECS (no se persiste ni se comparte entre
 * tareas): es una defensa en profundidad, no la única. No guarda IP ni ningún
 * dato del ciudadano, solo el folio y un contador (RNF-29).
 */
export class LimitadorIntentos {
  private readonly fallos = new Map<string, { cuenta: number; expira: number }>();

  /**
   * @param maxFallos intentos fallidos permitidos dentro de la ventana
   * @param ventanaMs duración de la ventana (y del bloqueo) en milisegundos
   * @param ahora reloj inyectable para pruebas
   */
  constructor(
    private readonly maxFallos = 5,
    private readonly ventanaMs = 15 * 60_000,
    private readonly ahora: () => number = Date.now,
  ) {}

  /** true si el folio alcanzó el máximo de fallos y la ventana sigue vigente. */
  estaBloqueado(clave: string): boolean {
    const r = this.vigente(clave);
    return r !== undefined && r.cuenta >= this.maxFallos;
  }

  /** Registra un intento fallido; la ventana empieza con el primer fallo. */
  registrarFallo(clave: string): void {
    const r = this.vigente(clave);
    if (r) r.cuenta++;
    else this.fallos.set(clave, { cuenta: 1, expira: this.ahora() + this.ventanaMs });
    this.purgar();
  }

  /** Borra el contador tras una consulta exitosa. */
  reiniciar(clave: string): void {
    this.fallos.delete(clave);
  }

  private vigente(clave: string) {
    const r = this.fallos.get(clave);
    if (r && r.expira <= this.ahora()) {
      this.fallos.delete(clave);
      return undefined;
    }
    return r;
  }

  /** Evita que el mapa crezca sin límite si alguien prueba miles de folios. */
  private purgar(): void {
    if (this.fallos.size < 10_000) return;
    const t = this.ahora();
    for (const [k, v] of this.fallos) if (v.expira <= t) this.fallos.delete(k);
  }
}
