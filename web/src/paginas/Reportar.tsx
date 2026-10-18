import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { api, Municipio, NuevoReporte, ReporteCreado } from '../api';
import { Esqueleto, Marco, MensajeError, useCarga, TextoAviso } from '../componentes';
import { Enlace, useTitulo } from '../enrutador';
import { BarraProgreso, calcularLinea, IndicadorPasos, LineaProgreso } from '../progreso';
import { SelectorMunicipio } from '../SelectorMunicipio';

export const MAX_DESCRIPCION = 2000;
/** Tope de menores en un reporte (igual que en el servidor y la app). */
export const TOTAL_MAXIMO = 50;
/** Rangos de edad y su texto (igual que en la app Android). */
export const EDADES: { rango: string; etiqueta: string }[] = [
  { rango: '0-5', etiqueta: 'De 0 a 5 años' },
  { rango: '6-11', etiqueta: 'De 6 a 11 años' },
  { rango: '12-17', etiqueta: 'De 12 a 17 años' },
  { rango: 'Sin determinar', etiqueta: 'No estoy seguro/a de la edad' },
];

/** Pasos del asistente (Fase 5), en orden. */
export const PASOS = [
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
  conteos: Record<string, number>;
  actividad: string;
  actividadOtro: string;
  riesgo: string;
  descripcion: string;
}

export const FORMULARIO_VACIO: Formulario = {
  municipio: null, calle: '', numero: '', colonia: '', codigoPostal: '', referencias: '', conteos: {},
  actividad: '', actividadOtro: '', riesgo: '', descripcion: '',
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

/** Paso "A quiénes": menores por grupo de edad. */
export function validarQuienes(f: Formulario): Errores {
  const total = totalMenores(f.conteos);
  if (total < 1) return { grupos: 'Indica cuántas niñas, niños o adolescentes viste.' };
  if (total > TOTAL_MAXIMO) return { grupos: `El total no puede pasar de ${TOTAL_MAXIMO}.` };
  return {};
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
    grupos: EDADES.filter((e) => (f.conteos[e.rango] ?? 0) > 0).map((e) => ({ rango: e.rango, cantidad: f.conteos[e.rango] })),
    actividad: f.actividad,
    ...(f.actividad === 'Otro' ? { actividadOtro: f.actividadOtro.trim() } : {}),
    situacionRiesgo: f.riesgo,
    descripcion: f.descripcion.trim(),
    avisoPrivacidadVersion: version,
  };
}

/** true si la persona ya capturó algo (al salir se le avisa que se perderá). */
export function hayDatos(f: Formulario): boolean {
  return Boolean(f.municipio || f.calle.trim() || f.numero.trim() || f.colonia.trim() || f.codigoPostal || f.referencias.trim()
    || totalMenores(f.conteos) > 0 || f.actividad || f.actividadOtro.trim() || f.riesgo || f.descripcion.trim());
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

/** Contadores por grupo de edad (botones − y + con etiqueta accesible) y total. */
function ContadorEdades({ conteos, alCambiar, error }: {
  conteos: Record<string, number>; alCambiar: (c: Record<string, number>) => void; error?: string;
}) {
  const total = totalMenores(conteos);
  return (
    <fieldset className="campo" aria-describedby={error ? 'error-grupos' : undefined}>
      <legend>¿Cuántas niñas, niños o adolescentes viste?</legend>
      <span className="ayuda">Suma uno por cada persona en su grupo de edad. Si no estás seguro de la edad, usa la última opción.</span>
      <div className="contadores">
        {EDADES.map(({ rango, etiqueta }) => {
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
function Opciones({ nombre, leyenda, opciones, valor, alCambiar, error }: {
  nombre: string; leyenda: string; opciones: string[]; valor: string; alCambiar: (v: string) => void; error?: string;
}) {
  return (
    <fieldset className="campo" aria-describedby={error ? `error-${nombre}` : undefined}>
      <legend>{leyenda}</legend>
      <div className="opciones">
        {opciones.map((o) => (
          <label key={o} className="opcion">
            <input type="radio" name={nombre} value={o} checked={valor === o} onChange={() => alCambiar(o)} />
            <span>{o}</span>
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

/** Folio y clave, con copiar, compartir, advertencia y la línea de avance (hoy en "Recibido"). */
function PasoListo({ creado }: { creado: ReporteCreado }) {
  const titulo = useRef<HTMLHeadingElement>(null);
  const [aviso, setAviso] = useState('');
  useEffect(() => titulo.current?.focus(), []);
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
        <h2 id="titulo-listo" ref={titulo} tabIndex={-1}>Gracias. Recibimos tu reporte.</h2>
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
function Asistente({ version, alCrear }: { version: string; alCrear: (c: ReporteCreado) => void }) {
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
    try { alCrear(await api.crearReporte(aNuevoReporte(f, version))); }
    catch (err) { setErrorEnvio(err); } finally { setEnviando(false); }
  };

  const direccion = [[f.calle.trim(), f.numero.trim()].filter(Boolean).join(' '), f.colonia.trim() && `Col. ${f.colonia.trim()}`, f.codigoPostal && `C.P. ${f.codigoPostal}`]
    .filter(Boolean).join(', ');
  const menores = EDADES.filter((x) => (f.conteos[x.rango] ?? 0) > 0).map((x) => `${f.conteos[x.rango]} · ${x.etiqueta}`);
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

        {clave === 'quienes' && <ContadorEdades conteos={f.conteos} alCambiar={(c) => cambiar('conteos', c, 'grupos')} error={errores.grupos} />}

        {clave === 'que' && (
          <>
            <div className="rejilla-campos">
              <div className="campo">
                <label htmlFor="actividad">¿Qué actividad realizaban?</label>
                <select id="actividad" value={f.actividad} onChange={(e) => cambiar('actividad', e.target.value)}
                  aria-describedby={errores.actividad ? 'error-actividad' : undefined} aria-invalid={errores.actividad ? true : undefined}>
                  <option value="">Elige una opción</option>
                  {cat.actividades.map((a) => <option key={a} value={a}>{a}</option>)}
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
          </>
        )}

        {clave === 'revisar' && (
          <>
            <p className="texto-secundario">Revisa que todo esté bien. Tu reporte se enviará de forma anónima y recibirás un folio y una clave para consultar el avance.</p>
            <div className="rejilla rejilla-2">
              <BloqueRevision titulo="Dónde" alEditar={() => irA(0)}>
                <dt>Municipio</dt><dd>{f.municipio?.nombre ?? '—'}</dd>
                <dt>Dirección</dt><dd>{direccion || '—'}</dd>
                {f.referencias.trim() && <><dt>Referencias</dt><dd>{f.referencias.trim()}</dd></>}
              </BloqueRevision>
              <BloqueRevision titulo="A quiénes" alEditar={() => irA(1)}>
                <dt>Menores ({totalMenores(f.conteos)} en total)</dt>
                <dd>{menores.length ? <ul className="lista-simple">{menores.map((m) => <li key={m}>{m}</li>)}</ul> : '—'}</dd>
              </BloqueRevision>
            </div>
            <BloqueRevision titulo="Qué ocurre" alEditar={() => irA(2)}>
              <dt>Actividad</dt><dd>{f.actividad === 'Otro' && f.actividadOtro.trim() ? `Otro: ${f.actividadOtro.trim()}` : f.actividad || '—'}</dd>
              <dt>¿Riesgo percibido?</dt><dd>{f.riesgo || '—'}</dd>
              <dt>Descripción</dt><dd className="texto-largo">{f.descripcion.trim() || '—'}</dd>
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
  const [creado, setCreado] = useState<ReporteCreado | null>(null);

  let contenido;
  if (creado) contenido = <PasoListo creado={creado} />;
  else if (!version) contenido = <PasoAviso alAceptar={setVersion} />;
  else contenido = <Asistente version={version} alCrear={(c) => { setCreado(c); window.scrollTo(0, 0); }} />;

  return (
    <Marco>
      <h1>Reportar una situación</h1>
      {!creado && <p className="texto-secundario">Si hay peligro inmediato, llama al <a href="tel:911">911</a>.</p>}
      {contenido}
    </Marco>
  );
}
