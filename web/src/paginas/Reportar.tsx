import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { api, Municipio, NuevoReporte, ReporteCreado } from '../api';
import { Esqueleto, Marco, MensajeError, useCarga, TextoAviso } from '../componentes';
import { Enlace, useTitulo } from '../enrutador';
import { BarraProgreso, calcularLinea, IndicadorPasos, LineaProgreso } from '../progreso';
import { SelectorMunicipio } from '../SelectorMunicipio';
import { ADVERTENCIA_FOTOS, MAX_FOTOS, subirFotos, TIPOS_FOTO, validarFotos } from '../fotos';

export const MAX_DESCRIPCION = 2000;
/** Tope de menores en un reporte (igual que en el servidor y la app). */
export const TOTAL_MAXIMO = 50;
/** Rangos de edad vigentes (Fase 6) y su texto (igual que en la app Android). "Sin determinar" es el "No sé". */
export const EDADES: { rango: string; etiqueta: string; corto: string }[] = [
  { rango: '0-5', etiqueta: 'De 0 a 5 años', corto: '0–5' },
  { rango: '6-11', etiqueta: 'De 6 a 11 años', corto: '6–11' },
  { rango: '12-14', etiqueta: 'De 12 a 14 años', corto: '12–14' },
  { rango: '15-17', etiqueta: 'De 15 a 17 años', corto: '15–17' },
  { rango: 'Sin determinar', etiqueta: 'Edad sin determinar', corto: 'No sé' },
];

/** Categorías de "¿Cuántas viste?" (Fase 6). */
export const CANTIDADES = ['1', '2', '3', '4', '5+', 'No sé'];
/** Texto de cada categoría de cantidad. */
export const TEXTO_CANTIDAD: Record<string, string> = { '5+': '5 o más' };
/** Respuestas a "¿Está en peligro inmediato?" (Fase 6). */
export const PELIGRO = ['Sí', 'No', 'No sé'];
/** Texto de una actividad ("Otro" se presenta como "Otra actividad"). */
export const textoActividad = (a: string) => (a === 'Otro' ? 'Otra actividad' : a);

/** Pasos del asistente (Fase 5), en orden. */
export const PASOS = [
  { clave: 'como', nombre: 'Cómo reportar', titulo: '¿Cómo quieres realizar tu reporte?' },
  { clave: 'donde', nombre: 'Dónde', titulo: '¿Dónde ocurre?' },
  { clave: 'quienes', nombre: 'A quiénes', titulo: '¿A quiénes viste?' },
  { clave: 'que', nombre: 'Qué ocurre', titulo: '¿Qué ocurre?' },
  { clave: 'revisar', nombre: 'Revisar y enviar', titulo: 'Revisa y envía' },
] as const;

/** Clave de un paso del asistente. */
export type ClavePaso = (typeof PASOS)[number]['clave'];

/**
 * Valores del formulario. Viven **solo en memoria** (estado de React): no se
 * guardan en `localStorage`, `sessionStorage`, cookies ni IndexedDB; si se
 * recarga o se cierra la página, se pierden. No hay borradores.
 */
export interface Formulario {
  municipio: Municipio | null;
  calle: string;
  numero: string;
  colonia: string;
  codigoPostal: string;
  referencias: string;
  /** ¿Está en peligro inmediato? (Sí, No, No sé; Fase 6). */
  peligro: string;
  /** Categoría de "¿Cuántas viste?" (1–4, 5+, No sé). */
  cantidad: string;
  /** Edades aproximadas elegidas (una o varias). */
  edades: string[];
  /** Menores por edad, solo cuando se eligió más de una edad. */
  conteos: Record<string, number>;
  actividad: string;
  actividadOtro: string;
  riesgo: string;
  descripcion: string;
  /** Fotos opcionales (Fase 8): solo en memoria hasta enviarlas, nunca se guardan en el navegador. */
  fotos: File[];
  /** La persona leyó la advertencia del socio antes de elegir fotos. */
  advertenciaLeida: boolean;
}

export const FORMULARIO_VACIO: Formulario = {
  municipio: null, calle: '', numero: '', colonia: '', codigoPostal: '', referencias: '', peligro: '', cantidad: '', edades: [], conteos: {},
  actividad: '', actividadOtro: '', riesgo: '', descripcion: '', fotos: [], advertenciaLeida: false,
};

/** Suma de menores. */
export const totalMenores = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0);

/** Los códigos postales del Estado de México van de 50000 a 57999. */
export const esCodigoPostalEdomex = (cp: string) => /^\d{5}$/.test(cp) && Number(cp) >= 50000 && Number(cp) <= 57999;

/** Clave del campo que muestra el error (los contadores comparten uno). */
export type CampoError = keyof Formulario | 'grupos';
/** Errores por campo. */
export type Errores = Partial<Record<CampoError, string>>;

/** Paso "Dónde": municipio y dirección. */
export function validarDonde(f: Formulario): Errores {
  const e: Errores = {};
  if (!f.municipio) e.municipio = 'Elige el municipio donde ocurre.';
  if (!f.calle.trim()) e.calle = 'Escribe la calle.';
  if (!f.colonia.trim()) e.colonia = 'Escribe la colonia.';
  if (!/^\d{5}$/.test(f.codigoPostal)) e.codigoPostal = 'El código postal debe tener 5 dígitos.';
  else if (!esCodigoPostalEdomex(f.codigoPostal)) e.codigoPostal = 'El código postal no es del Estado de México (empieza con 50 a 57).';
  return e;
}

/**
 * Grupos de edad a partir del formulario del socio (Fase 6): con una sola edad, la cantidad va
 * toda a esa edad ("5 o más" cuenta como 5 y "No sé" como 1, la cota mínima); con varias, los contadores.
 */
export function gruposDesde(f: Formulario): { rango: string; cantidad: number }[] {
  if (f.edades.length === 1) {
    const n = f.cantidad === '5+' ? 5 : f.cantidad === 'No sé' ? 1 : Number(f.cantidad) || 0;
    return n > 0 ? [{ rango: f.edades[0], cantidad: n }] : [];
  }
  return EDADES.filter((e) => f.edades.includes(e.rango) && (f.conteos[e.rango] ?? 0) > 0).map((e) => ({ rango: e.rango, cantidad: f.conteos[e.rango] }));
}

/** Paso "A quiénes": peligro inmediato, cantidad y edad aproximada (las mismas reglas que el servidor). */
export function validarQuienes(f: Formulario): Errores {
  const e: Errores = {};
  if (!PELIGRO.includes(f.peligro)) e.peligro = 'Indica si está en peligro inmediato.';
  if (!CANTIDADES.includes(f.cantidad)) e.cantidad = 'Indica cuántas niñas, niños o adolescentes viste.';
  if (f.edades.length === 0) e.edades = 'Indica la edad aproximada.';
  if (f.edades.length > 1 && CANTIDADES.includes(f.cantidad)) {
    const porEdad = f.edades.map((r) => f.conteos[r] ?? 0);
    const suma = porEdad.reduce((a, b) => a + b, 0);
    const cuadra = f.cantidad === 'No sé' || (f.cantidad === '5+' ? suma >= 5 : suma === Number(f.cantidad));
    if (porEdad.some((n) => n < 1)) e.grupos = 'Indica cuántas hay en cada edad que elegiste.';
    else if (!cuadra) e.grupos = `La suma por edad (${suma}) no coincide con la cantidad que indicaste.`;
    else if (suma > TOTAL_MAXIMO) e.grupos = `El total no puede pasar de ${TOTAL_MAXIMO}.`;
  }
  return e;
}

/** Paso "Qué ocurre": actividad, riesgo y descripción. */
export function validarQue(f: Formulario): Errores {
  const e: Errores = {};
  if (!f.actividad) e.actividad = 'Elige la actividad que observaste.';
  else if (f.actividad === 'Otro' && !f.actividadOtro.trim()) e.actividadOtro = 'Describe la actividad que observaste.';
  if (!f.riesgo) e.riesgo = 'Indica si percibes una situación de riesgo.';
  if (!f.descripcion.trim()) e.descripcion = 'Describe brevemente lo que observaste.';
  else if (f.descripcion.length > MAX_DESCRIPCION) e.descripcion = `Usa máximo ${MAX_DESCRIPCION} caracteres.`;
  return e;
}

/** Errores de un paso (el de revisión valida todo). */
export function validarPaso(paso: ClavePaso, f: Formulario): Errores {
  switch (paso) {
    case 'como': return {};
    case 'donde': return validarDonde(f);
    case 'quienes': return validarQuienes(f);
    case 'que': return validarQue(f);
    default: return validarFormulario(f);
  }
}

/**
 * Valida el formulario completo antes de enviarlo (el servidor vuelve a validar todo).
 * @returns errores por campo; vacío si todo está bien
 */
export function validarFormulario(f: Formulario): Errores {
  return { ...validarDonde(f), ...validarQuienes(f), ...validarQue(f) };
}

/** Cuerpo de `POST /reportes` con el formato nuevo (el mismo que antes del asistente). */
export function aNuevoReporte(f: Formulario, version: string): NuevoReporte {
  return {
    municipioId: f.municipio!.id,
    direccion: {
      calle: f.calle.trim(), colonia: f.colonia.trim(), codigoPostal: f.codigoPostal,
      ...(f.numero.trim() ? { numeroExterior: f.numero.trim() } : {}),
      ...(f.referencias.trim() ? { referencias: f.referencias.trim() } : {}),
    },
    grupos: gruposDesde(f),
    actividad: f.actividad,
    ...(f.actividad === 'Otro' ? { actividadOtro: f.actividadOtro.trim() } : {}),
    situacionRiesgo: f.riesgo,
    descripcion: f.descripcion.trim(),
    avisoPrivacidadVersion: version,
    // Fase 6: el servidor calcula la prioridad con el peligro inmediato; con canal asigna el folio con clave municipal.
    ...(f.peligro ? { peligroInmediato: f.peligro } : {}),
    ...(f.cantidad ? { cantidad: f.cantidad } : {}),
    canal: 'web',
  };
}

/** true si la persona ya capturó algo (al salir se le avisa que se perderá). */
export function hayDatos(f: Formulario): boolean {
  return Boolean(f.municipio || f.calle.trim() || f.numero.trim() || f.colonia.trim() || f.codigoPostal || f.referencias.trim()
    || totalMenores(f.conteos) > 0 || f.peligro || f.cantidad || f.edades.length > 0 || f.actividad || f.actividadOtro.trim() || f.riesgo || f.descripcion.trim());
}

/** Campo de texto con etiqueta, ayuda y error accesibles. */
function Campo({ id, etiqueta, valor, alCambiar, error, ayuda, max, modo, ancho }: {
  id: string; etiqueta: string; valor: string; alCambiar: (v: string) => void; error?: string; ayuda?: string; max: number;
  modo?: 'numeric'; ancho?: boolean;
}) {
  const describe = [ayuda && `ayuda-${id}`, error && `error-${id}`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={ancho ? 'campo campo-ancho' : 'campo'}>
      <label htmlFor={id}>{etiqueta}</label>
      {ayuda && <span id={`ayuda-${id}`} className="ayuda">{ayuda}</span>}
      <input id={id} type="text" inputMode={modo} maxLength={max} value={valor} onChange={(e) => alCambiar(e.target.value)}
        aria-describedby={describe} aria-invalid={error ? true : undefined} />
      {error && <span id={`error-${id}`} className="error-campo">{error}</span>}
    </div>
  );
}

/** Contadores por edad (botones − y + con etiqueta accesible) para las edades elegidas, y total. */
function ContadorEdades({ conteos, rangos, alCambiar, error }: {
  conteos: Record<string, number>; rangos: string[]; alCambiar: (c: Record<string, number>) => void; error?: string;
}) {
  const total = rangos.reduce((a, r) => a + (conteos[r] ?? 0), 0);
  return (
    <fieldset className="campo" aria-describedby={error ? 'error-grupos' : undefined}>
      <legend>¿Cuántas en cada edad?</legend>
      <div className="contadores">
        {EDADES.filter((e) => rangos.includes(e.rango)).map(({ rango, etiqueta }) => {
          const n = conteos[rango] ?? 0;
          return (
            <div key={rango} className={n > 0 ? 'contador contador-activo' : 'contador'}>
              <span className="contador-etiqueta">{etiqueta}</span>
              <button type="button" className="boton-redondo" aria-label={`Quitar uno: ${etiqueta}`} disabled={n === 0}
                onClick={() => alCambiar({ ...conteos, [rango]: n - 1 })}>−</button>
              <output className="contador-valor" aria-live="polite" aria-label={`${n}, ${etiqueta}`}>{n}</output>
              <button type="button" className="boton-redondo" aria-label={`Agregar uno: ${etiqueta}`} disabled={total >= TOTAL_MAXIMO}
                onClick={() => alCambiar({ ...conteos, [rango]: n + 1 })}>+</button>
            </div>
          );
        })}
      </div>
      <p className="contador-total" aria-live="polite">Total: {total}{total >= TOTAL_MAXIMO ? ` (máximo ${TOTAL_MAXIMO})` : ''}</p>
      {error && <span id="error-grupos" className="error-campo">{error}</span>}
    </fieldset>
  );
}

/** Grupo de opciones de selección única (radios accesibles con forma de chip). */
function Opciones({ nombre, leyenda, opciones, valor, alCambiar, error, textos = {} }: {
  nombre: string; leyenda: string; opciones: string[]; valor: string; alCambiar: (v: string) => void; error?: string; textos?: Record<string, string>;
}) {
  return (
    <fieldset className="campo" aria-describedby={error ? `error-${nombre}` : undefined}>
      <legend>{leyenda}</legend>
      <div className="opciones">
        {opciones.map((o) => (
          <label key={o} className="opcion">
            <input type="radio" name={nombre} value={o} checked={valor === o} onChange={() => alCambiar(o)} />
            <span>{textos[o] ?? o}</span>
          </label>
        ))}
      </div>
      {error && <span id={`error-${nombre}`} className="error-campo">{error}</span>}
    </fieldset>
  );
}

/** Aviso de privacidad (obligatorio, con su versión; D-18), antes del asistente. */
function PasoAviso({ alAceptar }: { alAceptar: (version: string) => void }) {
  const aviso = useCarga(api.aviso, []);
  const [acepto, setAcepto] = useState(false);
  if (aviso.cargando) return <Esqueleto />;
  if (aviso.error || !aviso.datos) return <MensajeError error={aviso.error} alReintentar={aviso.recargar} />;
  return (
    <section className="tarjeta" aria-labelledby="titulo-aviso">
      <h2 id="titulo-aviso">Antes de empezar: aviso de privacidad</h2>
      <TextoAviso aviso={aviso.datos} nivel={3} />
      <p className="texto-secundario pequeno">Versión {aviso.datos.version}</p>
      <label className="opcion">
        <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
        <span>Leí y acepto el aviso de privacidad</span>
      </label>
      <div className="acciones">
        <button type="button" className="boton boton-principal" disabled={!acepto} onClick={() => alAceptar(aviso.datos!.version)}>Continuar</button>
      </div>
    </section>
  );
}

/** Estado de la subida de fotos tras crear el reporte. */
type EstadoFotos = { fase: 'sin-fotos' } | { fase: 'subiendo' } | { fase: 'lista'; total: number } | { fase: 'error'; error: unknown };

/** Folio y clave, con copiar, compartir, advertencia y la línea de avance (hoy en "Recibido"); sube las fotos si las hay. */
function PasoListo({ creado, fotos }: { creado: ReporteCreado; fotos: File[] }) {
  const titulo = useRef<HTMLHeadingElement>(null);
  const [aviso, setAviso] = useState('');
  const [estadoFotos, setEstadoFotos] = useState<EstadoFotos>({ fase: fotos.length ? 'subiendo' : 'sin-fotos' });
  useEffect(() => titulo.current?.focus(), []);
  const adjuntar = () => {
    setEstadoFotos({ fase: 'subiendo' });
    subirFotos(creado.folio, creado.claveConsulta, fotos)
      .then((total) => setEstadoFotos({ fase: 'lista', total }))
      .catch((error) => setEstadoFotos({ fase: 'error', error }));
  };
  useEffect(() => { if (fotos.length) adjuntar(); }, []);
  const texto = `RIETI\nFolio: ${creado.folio}\nClave de consulta: ${creado.claveConsulta}`;

  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); setAviso('Folio y clave copiados.'); }
    catch { setAviso('No se pudo copiar. Anótalos a mano.'); }
  };
  const compartir = async () => {
    try { await navigator.share({ title: 'Mi reporte RIETI', text: texto }); setAviso('Listo.'); }
    catch { /* la persona canceló */ }
  };

  return (
    <>
      <section className="tarjeta tarjeta-tinte" aria-labelledby="titulo-listo">
        <h2 id="titulo-listo" ref={titulo} tabIndex={-1}>¡Gracias por ayudar a proteger los derechos de niñas, niños y adolescentes!</h2>
        <p>Tu reporte fue recibido correctamente.</p>
        {estadoFotos.fase === 'subiendo' && <p role="status">Adjuntando {fotos.length === 1 ? 'la foto' : `las ${fotos.length} fotos`}…</p>}
        {estadoFotos.fase === 'lista' && <p role="status">Se {estadoFotos.total === 1 ? 'adjuntó 1 foto' : `adjuntaron ${estadoFotos.total} fotos`} al reporte.</p>}
        {estadoFotos.fase === 'error' && (
          <div className="aviso aviso-atencion" role="alert">
            <p><strong>Tu reporte sí quedó registrado</strong>, pero no se pudieron adjuntar las fotos.</p>
            <MensajeError error={estadoFotos.error} alReintentar={adjuntar} />
          </div>
        )}
        <p>Guarda estos datos para consultar el avance en <Enlace a="/seguimiento">Seguimiento</Enlace>:</p>
        <div className="rejilla rejilla-2">
          <div className="credencial"><span>Folio</span><output>{creado.folio}</output></div>
          <div className="credencial"><span>Clave de consulta</span><output>{creado.claveConsulta}</output></div>
        </div>
        <div className="aviso aviso-atencion" role="note">
          <strong>Anótalos ahora.</strong> Por tu privacidad no guardamos ningún dato tuyo, así que la clave <strong>no se puede recuperar</strong>.
        </div>
        <div className="acciones">
          <button type="button" className="boton" onClick={copiar}>Copiar folio y clave</button>
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button type="button" className="boton boton-secundario" onClick={compartir}>Compartir</button>
          )}
          <Enlace a="/" className="boton boton-secundario">Volver al inicio</Enlace>
        </div>
        <p role="status" aria-live="polite">{aviso}</p>
      </section>
      <section className="tarjeta" aria-labelledby="titulo-avance">
        <h2 id="titulo-avance">Avance de tu reporte</h2>
        <LineaProgreso linea={calcularLinea(creado.estatus || 'Recibido', [], creado.fechaCreacion)} />
      </section>
    </>
  );
}

/** Bloque de la revisión con su botón "Editar". */
function BloqueRevision({ titulo, alEditar, children }: { titulo: string; alEditar: () => void; children: ReactNode }) {
  return (
    <section className="tarjeta bloque-revision">
      <div className="fila-titulo">
        <h3>{titulo}</h3>
        <button type="button" className="boton-texto" onClick={alEditar}>Editar<span className="solo-lectores">: {titulo}</span></button>
      </div>
      <dl>{children}</dl>
    </section>
  );
}

/** Contenido del asistente: indicador de pasos, el paso visible y la barra inferior. */
function Asistente({ version, alCrear }: { version: string; alCrear: (c: ReporteCreado, fotos: File[]) => void }) {
  const catalogos = useCarga(() => Promise.all([api.catalogos(), api.municipios()]), []);
  const [f, setF] = useState<Formulario>(FORMULARIO_VACIO);
  const [paso, setPaso] = useState(0);
  const [maximo, setMaximo] = useState(0);
  const [errores, setErrores] = useState<Errores>({});
  const [errorEnvio, setErrorEnvio] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const titulo = useRef<HTMLHeadingElement>(null);
  const resumen = useRef<HTMLDivElement>(null);
  const primeraVez = useRef(true);

  // Al cambiar de paso, el foco va al título del paso (lo anuncian los lectores de pantalla).
  useEffect(() => {
    if (primeraVez.current) { primeraVez.current = false; return; }
    titulo.current?.focus();
    window.scrollTo(0, 0);
  }, [paso]);

  // Aviso del navegador si se intenta cerrar o recargar con datos capturados (no hay borradores).
  useEffect(() => {
    if (!hayDatos(f)) return undefined;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [f]);

  const cambiar = <K extends keyof Formulario>(k: K, v: Formulario[K], campo: CampoError = k) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrores((e) => { if (!(campo in e)) return e; const { [campo]: _, ...resto } = e; return resto; });
  };

  if (catalogos.cargando) return <Esqueleto filas={5} />;
  if (catalogos.error || !catalogos.datos) return <MensajeError error={catalogos.error} alReintentar={catalogos.recargar} />;
  const [cat, municipios] = catalogos.datos;
  const clave = PASOS[paso].clave;
  const ultimo = clave === 'revisar';

  const irA = (i: number) => { setErrores({}); setPaso(i); };
  const continuar = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validarPaso(clave, f);
    setErrores(errs);
    if (Object.keys(errs).length > 0) { setTimeout(() => resumen.current?.focus(), 0); return; }
    if (!ultimo) {
      const siguiente = maximo === PASOS.length - 1 ? PASOS.length - 1 : paso + 1;
      setMaximo((m) => Math.max(m, siguiente));
      setPaso(siguiente);
      return;
    }
    setEnviando(true); setErrorEnvio(null);
    try { alCrear(await api.crearReporte(aNuevoReporte(f, version)), f.fotos); }
    catch (err) { setErrorEnvio(err); } finally { setEnviando(false); }
  };

  const direccion = [[f.calle.trim(), f.numero.trim()].filter(Boolean).join(' '), f.colonia.trim() && `Col. ${f.colonia.trim()}`, f.codigoPostal && `C.P. ${f.codigoPostal}`]
    .filter(Boolean).join(', ');
  const menores = gruposDesde(f).map((g) => `${g.cantidad} · ${EDADES.find((x) => x.rango === g.rango)?.etiqueta ?? g.rango}`);
  const listaErrores = [...new Set(Object.values(errores))];

  return (
    <form onSubmit={continuar} noValidate className="asistente">
      <IndicadorPasos pasos={PASOS.map((p) => p.nombre)} actual={paso} maximo={maximo} alElegir={irA} />
      <h2 ref={titulo} tabIndex={-1} className="titulo-paso">{PASOS[paso].titulo}</h2>
      {listaErrores.length > 0 && (
        <div ref={resumen} tabIndex={-1} className="aviso aviso-error" role="alert">
          <p>Revisa antes de continuar:</p>
          <ul>{listaErrores.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}

      <div className="contenido-paso" key={clave}>
        {clave === 'como' && (
          <>
            <div className="aviso aviso-atencion" role="note">Si una niña, niño o adolescente está en peligro inmediato, llama al <a href="tel:911">911</a>.</div>
            <fieldset className="campo opciones-modo">
              <legend className="solo-lectores">Modo de reporte</legend>
              <label className="opcion-modo">
                <input type="radio" name="modo" checked readOnly />
                <span><strong>Anónimo</strong><br />No se solicita nombre, teléfono ni correo. Recibirás un folio y una clave para consultar el avance.</span>
              </label>
              <label className="opcion-modo deshabilitada">
                <input type="radio" name="modo" disabled aria-describedby="nota-seguimiento" />
                <span><strong>Con seguimiento</strong><br />Con tu cuenta opcional (solo correo) ves el avance en “Mi panel”.</span>
              </label>
              <span id="nota-seguimiento" className="ayuda">El reporte con seguimiento está disponible en la app RIETI. En la web el reporte es anónimo y consultas el avance con tu folio y clave.</span>
            </fieldset>
          </>
        )}

        {clave === 'donde' && (
          <>
            <p className="texto-secundario">Es la dirección del lugar de los hechos, no la tuya.</p>
            <SelectorMunicipio municipios={municipios} valor={f.municipio} alCambiar={(m) => cambiar('municipio', m)} error={errores.municipio} />
            <div className="rejilla-campos">
              <Campo id="calle" etiqueta="Calle" valor={f.calle} alCambiar={(v) => cambiar('calle', v)} error={errores.calle} max={120} />
              <Campo id="numero" etiqueta="Número exterior (opcional)" valor={f.numero} alCambiar={(v) => cambiar('numero', v)} max={20} />
              <Campo id="colonia" etiqueta="Colonia" valor={f.colonia} alCambiar={(v) => cambiar('colonia', v)} error={errores.colonia} max={120} />
              <Campo id="codigoPostal" etiqueta="Código postal" valor={f.codigoPostal} modo="numeric" max={5}
                alCambiar={(v) => cambiar('codigoPostal', v.replace(/\D/g, ''))} error={errores.codigoPostal} />
              <Campo id="referencias" etiqueta="Referencias (opcional)" ayuda="Ej.: frente al mercado, esquina con la calle 5" ancho
                valor={f.referencias} alCambiar={(v) => cambiar('referencias', v)} max={300} />
            </div>
          </>
        )}

        {clave === 'quienes' && (
          <>
            <Opciones nombre="peligro" leyenda="¿La niña, niño o adolescente está en peligro inmediato?" opciones={PELIGRO} valor={f.peligro}
              alCambiar={(v) => cambiar('peligro', v)} error={errores.peligro} />
            {f.peligro === 'Sí' && (
              <div className="aviso aviso-error aviso-911" role="alert">
                <p><strong>Llama al 911 ahora.</strong> RIETI no sustituye los servicios de emergencia ni la denuncia formal. Puedes terminar el reporte después de llamar.</p>
                <a className="boton boton-peligro" href="tel:911">Llamar al 911</a>
              </div>
            )}
            <Opciones nombre="cantidad" leyenda="¿Cuántas niñas, niños o adolescentes viste?" opciones={CANTIDADES} textos={TEXTO_CANTIDAD}
              valor={f.cantidad} alCambiar={(v) => cambiar('cantidad', v)} error={errores.cantidad} />
            <fieldset className="campo" aria-describedby={errores.edades ? 'error-edades' : 'ayuda-edades'}>
              <legend>Edad aproximada</legend>
              <span id="ayuda-edades" className="ayuda">Puedes elegir más de una.</span>
              <div className="opciones">
                {EDADES.map((e) => (
                  <label key={e.rango} className="opcion">
                    <input type="checkbox" name="edades" value={e.rango} checked={f.edades.includes(e.rango)}
                      onChange={(ev) => cambiar('edades', ev.target.checked ? [...f.edades, e.rango] : f.edades.filter((r) => r !== e.rango))} />
                    <span>{e.corto}</span>
                  </label>
                ))}
              </div>
              {errores.edades && <span id="error-edades" className="error-campo">{errores.edades}</span>}
            </fieldset>
            {f.edades.length > 1 && (
              <ContadorEdades conteos={f.conteos} rangos={f.edades} alCambiar={(c) => cambiar('conteos', c, 'grupos')} error={errores.grupos} />
            )}
            {f.edades.length <= 1 && errores.grupos && <span className="error-campo">{errores.grupos}</span>}
          </>
        )}

        {clave === 'que' && (
          <>
            <div className="rejilla-campos">
              <div className="campo">
                <label htmlFor="actividad">¿Qué actividad realizaban?</label>
                <select id="actividad" value={f.actividad} onChange={(e) => cambiar('actividad', e.target.value)}
                  aria-describedby={errores.actividad ? 'error-actividad' : undefined} aria-invalid={errores.actividad ? true : undefined}>
                  <option value="">Elige una opción</option>
                  {cat.actividades.map((a) => <option key={a} value={a}>{textoActividad(a)}</option>)}
                </select>
                {errores.actividad && <span id="error-actividad" className="error-campo">{errores.actividad}</span>}
              </div>
              {f.actividad === 'Otro' && (
                <Campo id="actividadOtro" etiqueta="Describe la actividad" valor={f.actividadOtro}
                  alCambiar={(v) => cambiar('actividadOtro', v)} error={errores.actividadOtro} max={120} />
              )}
            </div>
            <Opciones nombre="riesgo" leyenda="¿Percibes una situación de riesgo?" opciones={cat.riesgos} valor={f.riesgo} alCambiar={(v) => cambiar('riesgo', v)} error={errores.riesgo} />
            <div className="campo">
              <label htmlFor="descripcion">Describe lo que observaste</label>
              <span id="ayuda-descripcion" className="ayuda">Qué viste, a qué hora y señas del lugar. Sin nombres, CURP ni domicilios de las niñas o niños.</span>
              <textarea id="descripcion" maxLength={MAX_DESCRIPCION} value={f.descripcion} onChange={(e) => cambiar('descripcion', e.target.value)}
                aria-describedby={errores.descripcion ? 'ayuda-descripcion error-descripcion' : 'ayuda-descripcion'} aria-invalid={errores.descripcion ? true : undefined} />
              <span className="ayuda">{f.descripcion.length}/{MAX_DESCRIPCION}</span>
              {errores.descripcion && <span id="error-descripcion" className="error-campo">{errores.descripcion}</span>}
            </div>
            <fieldset className="campo bloque-fotos">
              <legend>Fotografía (opcional)</legend>
              <div className="aviso aviso-atencion" role="note" id="advertencia-fotos"><strong>Antes de adjuntar:</strong> {ADVERTENCIA_FOTOS}</div>
              <label className="opcion">
                <input type="checkbox" checked={f.advertenciaLeida} aria-describedby="advertencia-fotos"
                  onChange={(e) => { cambiar('advertenciaLeida', e.target.checked); if (!e.target.checked) cambiar('fotos', [], 'fotos'); }} />
                <span>Leí la advertencia y quiero adjuntar fotos</span>
              </label>
              {f.advertenciaLeida && (
                <>
                  <label className="boton boton-secundario boton-archivo">
                    <input id="fotos" type="file" className="solo-lectores" accept={TIPOS_FOTO.join(',')} multiple disabled={f.fotos.length >= MAX_FOTOS}
                      aria-describedby={errores.fotos ? 'ayuda-fotos error-fotos' : 'ayuda-fotos'}
                      onChange={(e) => {
                        const nuevas = [...f.fotos, ...Array.from(e.target.files ?? [])];
                        e.target.value = '';
                        const error = validarFotos(nuevas);
                        if (error) setErrores((x) => ({ ...x, fotos: error }));
                        else cambiar('fotos', nuevas, 'fotos');
                      }} />
                    Elegir fotos (hasta {MAX_FOTOS})
                  </label>
                  <span id="ayuda-fotos" className="ayuda">JPG, PNG o WebP. Antes de enviarlas se quita la información del teléfono y de ubicación que traen las fotos.</span>
                  {f.fotos.length > 0 && (
                    <ul className="lista-simple">
                      {f.fotos.map((foto, i) => (
                        <li key={`${foto.name}-${i}`}>
                          <span>Foto {i + 1} · {Math.max(1, Math.round(foto.size / 1024))} KB</span>
                          <button type="button" className="boton-texto" onClick={() => cambiar('fotos', f.fotos.filter((_, j) => j !== i), 'fotos')}>
                            Quitar<span className="solo-lectores"> la foto {i + 1}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {errores.fotos && <span id="error-fotos" className="error-campo">{errores.fotos}</span>}
                </>
              )}
            </fieldset>
          </>
        )}

        {clave === 'revisar' && (
          <>
            <p className="texto-secundario">Revisa que todo esté bien. Tu reporte se enviará de forma anónima y recibirás un folio y una clave para consultar el avance.</p>
            <div className="rejilla rejilla-2">
              <BloqueRevision titulo="Dónde" alEditar={() => irA(1)}>
                <dt>Municipio</dt><dd>{f.municipio?.nombre ?? '—'}</dd>
                <dt>Dirección</dt><dd>{direccion || '—'}</dd>
                {f.referencias.trim() && <><dt>Referencias</dt><dd>{f.referencias.trim()}</dd></>}
              </BloqueRevision>
              <BloqueRevision titulo="A quiénes" alEditar={() => irA(2)}>
                <dt>¿Peligro inmediato?</dt><dd>{f.peligro || '—'}</dd>
                <dt>¿Cuántas?</dt><dd>{TEXTO_CANTIDAD[f.cantidad] ?? (f.cantidad || '—')}</dd>
                <dt>Edad aproximada</dt><dd>{EDADES.filter((e) => f.edades.includes(e.rango)).map((e) => e.corto).join(', ') || '—'}</dd>
                {f.edades.length > 1 && (<><dt>Por edad</dt><dd><ul className="lista-simple">{menores.map((m) => <li key={m}>{m}</li>)}</ul></dd></>)}
              </BloqueRevision>
            </div>
            <BloqueRevision titulo="Qué ocurre" alEditar={() => irA(3)}>
              <dt>Actividad</dt><dd>{f.actividad === 'Otro' && f.actividadOtro.trim() ? `Otra actividad: ${f.actividadOtro.trim()}` : f.actividad ? textoActividad(f.actividad) : '—'}</dd>
              <dt>¿Riesgo percibido?</dt><dd>{f.riesgo || '—'}</dd>
              <dt>Descripción</dt><dd className="texto-largo">{f.descripcion.trim() || '—'}</dd>
              <dt>Fotos</dt><dd>{f.fotos.length === 0 ? 'Sin fotos' : `${f.fotos.length} (se adjuntan al enviar)`}</dd>
            </BloqueRevision>
          </>
        )}
      </div>

      {!!errorEnvio && <MensajeError error={errorEnvio} />}
      <div className="barra-asistente">
        <BarraProgreso total={PASOS.length} actual={paso} nombre={PASOS[paso].nombre} />
        <div className="acciones-asistente">
          {paso > 0 && <button type="button" className="boton boton-secundario" onClick={() => irA(paso - 1)}>Atrás</button>}
          <button type="submit" className="boton boton-principal" disabled={enviando}>
            {enviando ? 'Enviando…' : ultimo ? 'Enviar reporte' : maximo === PASOS.length - 1 ? 'Guardar y revisar' : 'Continuar'}
            <span aria-hidden="true" className="flecha">→</span>
          </button>
        </div>
      </div>
    </form>
  );
}

/** "Reportar una situación": aviso → asistente de 4 pasos → folio y clave. */
export function Reportar() {
  useTitulo('Reportar una situación');
  const [version, setVersion] = useState<string | null>(null);
  const [creado, setCreado] = useState<{ reporte: ReporteCreado; fotos: File[] } | null>(null);

  let contenido;
  if (creado) contenido = <PasoListo creado={creado.reporte} fotos={creado.fotos} />;
  else if (!version) contenido = <PasoAviso alAceptar={setVersion} />;
  else contenido = <Asistente version={version} alCrear={(reporte, fotos) => { setCreado({ reporte, fotos }); window.scrollTo(0, 0); }} />;

  return (
    <Marco>
      <h1>Reportar una situación</h1>
      {!creado && <p className="texto-secundario">Si hay peligro inmediato, llama al <a href="tel:911">911</a>.</p>}
      {contenido}
    </Marco>
  );
}
