import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, Municipio, NuevoReporte, ReporteCreado } from '../api';
import { Esqueleto, Marco, MensajeError, useCarga, TextoAviso } from '../componentes';
import { Enlace, useTitulo } from '../enrutador';
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

/** Valores del formulario. */
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
type CampoError = keyof Formulario | 'grupos';

/**
 * Valida el formulario antes de enviarlo (el servidor vuelve a validar todo).
 * @returns errores por campo; vacío si todo está bien
 */
export function validarFormulario(f: Formulario): Partial<Record<CampoError, string>> {
  const e: Partial<Record<CampoError, string>> = {};
  if (!f.municipio) e.municipio = 'Elige el municipio donde ocurre.';
  if (!f.calle.trim()) e.calle = 'Escribe la calle.';
  if (!f.colonia.trim()) e.colonia = 'Escribe la colonia.';
  if (!/^\d{5}$/.test(f.codigoPostal)) e.codigoPostal = 'El código postal debe tener 5 dígitos.';
  else if (!esCodigoPostalEdomex(f.codigoPostal)) e.codigoPostal = 'El código postal no es del Estado de México (empieza con 50 a 57).';
  const total = totalMenores(f.conteos);
  if (total < 1) e.grupos = 'Indica cuántas niñas, niños o adolescentes viste.';
  else if (total > TOTAL_MAXIMO) e.grupos = `El total no puede pasar de ${TOTAL_MAXIMO}.`;
  if (!f.actividad) e.actividad = 'Elige la actividad que observaste.';
  else if (f.actividad === 'Otro' && !f.actividadOtro.trim()) e.actividadOtro = 'Describe la actividad que observaste.';
  if (!f.riesgo) e.riesgo = 'Indica si percibes una situación de riesgo.';
  if (!f.descripcion.trim()) e.descripcion = 'Describe brevemente lo que observaste.';
  else if (f.descripcion.length > MAX_DESCRIPCION) e.descripcion = `Usa máximo ${MAX_DESCRIPCION} caracteres.`;
  return e;
}

/** Cuerpo de `POST /reportes` con el formato nuevo. */
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

/** Campo de texto con etiqueta, ayuda y error accesibles. */
function Campo({ id, etiqueta, valor, alCambiar, error, ayuda, max, modo }: {
  id: string; etiqueta: string; valor: string; alCambiar: (v: string) => void; error?: string; ayuda?: string; max: number;
  modo?: 'numeric';
}) {
  const describe = [ayuda && `ayuda-${id}`, error && `error-${id}`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="campo">
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
      <span className="ayuda">Suma uno por cada persona en su grupo de edad.</span>
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

/** Paso 1: aviso de privacidad (obligatorio, con su versión; D-18). */
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
        <button type="button" className="boton" disabled={!acepto} onClick={() => alAceptar(aviso.datos!.version)}>Continuar</button>
      </div>
    </section>
  );
}

/** Paso 3: folio y clave, con copiar, compartir y advertencia. */
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
  );
}

/** "Reportar una situación": aviso → formulario → folio y clave. */
export function Reportar() {
  useTitulo('Reportar una situación');
  const [version, setVersion] = useState<string | null>(null);
  const [creado, setCreado] = useState<ReporteCreado | null>(null);
  const [f, setF] = useState<Formulario>(FORMULARIO_VACIO);
  const [errores, setErrores] = useState<Partial<Record<CampoError, string>>>({});
  const [errorEnvio, setErrorEnvio] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const resumen = useRef<HTMLDivElement>(null);
  const catalogos = useCarga(() => Promise.all([api.catalogos(), api.municipios()]), []);

  const cambiar = <K extends keyof Formulario>(k: K, v: Formulario[K]) => setF((x) => ({ ...x, [k]: v }));

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validarFormulario(f);
    setErrores(errs);
    if (Object.keys(errs).length > 0) { setTimeout(() => resumen.current?.focus(), 0); return; }
    setEnviando(true); setErrorEnvio(null);
    try {
      setCreado(await api.crearReporte(aNuevoReporte(f, version!)));
      window.scrollTo(0, 0);
    } catch (err) { setErrorEnvio(err); } finally { setEnviando(false); }
  };

  let contenido;
  if (creado) contenido = <PasoListo creado={creado} />;
  else if (!version) contenido = <PasoAviso alAceptar={setVersion} />;
  else if (catalogos.cargando) contenido = <Esqueleto filas={5} />;
  else if (catalogos.error || !catalogos.datos) contenido = <MensajeError error={catalogos.error} alReintentar={catalogos.recargar} />;
  else {
    const [cat, municipios] = catalogos.datos;
    const hayErrores = Object.keys(errores).length > 0;
    contenido = (
      <form onSubmit={enviar} noValidate>
        {hayErrores && (
          <div ref={resumen} tabIndex={-1} className="aviso aviso-error" role="alert">
            <p>Revisa estos datos antes de enviar:</p>
            <ul>{Object.values(errores).map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        )}
        <fieldset className="campo">
          <legend>¿Cómo quieres reportar?</legend>
          <div className="opciones">
            <label className="opcion"><input type="radio" name="modalidad" checked readOnly /><span>De forma anónima</span></label>
            <label className="opcion"><input type="radio" name="modalidad" disabled aria-describedby="nota-contacto" /><span>Con datos de contacto (no disponible)</span></label>
          </div>
          <span id="nota-contacto" className="ayuda">
            Por ahora solo se aceptan reportes anónimos: para guardar datos de contacto primero debemos poder protegerlos con cifrado.
          </span>
        </fieldset>

        <SelectorMunicipio municipios={municipios} valor={f.municipio} alCambiar={(m) => cambiar('municipio', m)} error={errores.municipio} />

        <fieldset className="campo">
          <legend>¿Dónde ocurre?</legend>
          <span className="ayuda">Dirección del lugar de los hechos, no la tuya.</span>
          <Campo id="calle" etiqueta="Calle" valor={f.calle} alCambiar={(v) => cambiar('calle', v)} error={errores.calle} max={120} />
          <Campo id="numero" etiqueta="Número exterior (opcional)" valor={f.numero} alCambiar={(v) => cambiar('numero', v)} max={20} />
          <Campo id="colonia" etiqueta="Colonia" valor={f.colonia} alCambiar={(v) => cambiar('colonia', v)} error={errores.colonia} max={120} />
          <Campo id="codigoPostal" etiqueta="Código postal" valor={f.codigoPostal} modo="numeric" max={5}
            alCambiar={(v) => cambiar('codigoPostal', v.replace(/\D/g, ''))} error={errores.codigoPostal} />
          <Campo id="referencias" etiqueta="Referencias (opcional)" ayuda="Ej.: frente al mercado, esquina con la calle 5"
            valor={f.referencias} alCambiar={(v) => cambiar('referencias', v)} max={300} />
        </fieldset>

        <ContadorEdades conteos={f.conteos} alCambiar={(c) => cambiar('conteos', c)} error={errores.grupos} />

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
        <Opciones nombre="riesgo" leyenda="¿Percibes una situación de riesgo?" opciones={cat.riesgos} valor={f.riesgo} alCambiar={(v) => cambiar('riesgo', v)} error={errores.riesgo} />

        <div className="campo">
          <label htmlFor="descripcion">Describe lo que observaste</label>
          <span id="ayuda-descripcion" className="ayuda">Qué viste, a qué hora y señas del lugar. Sin nombres, CURP ni domicilios de las niñas o niños.</span>
          <textarea id="descripcion" maxLength={MAX_DESCRIPCION} value={f.descripcion} onChange={(e) => cambiar('descripcion', e.target.value)}
            aria-describedby={errores.descripcion ? 'ayuda-descripcion error-descripcion' : 'ayuda-descripcion'} aria-invalid={errores.descripcion ? true : undefined} />
          <span className="ayuda">{f.descripcion.length}/{MAX_DESCRIPCION}</span>
          {errores.descripcion && <span id="error-descripcion" className="error-campo">{errores.descripcion}</span>}
        </div>

        {!!errorEnvio && <MensajeError error={errorEnvio} />}
        <button type="submit" className="boton boton-bloque" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar reporte'}</button>
      </form>
    );
  }

  return (
    <Marco>
      <h1>Reportar una situación</h1>
      {!creado && <p className="texto-secundario">Si hay peligro inmediato, llama al <a href="tel:911">911</a>.</p>}
      {contenido}
    </Marco>
  );
}
