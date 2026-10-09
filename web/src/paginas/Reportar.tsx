import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, Municipio, ReporteCreado } from '../api';
import { Esqueleto, Marco, MensajeError, useCarga } from '../componentes';
import { Enlace, useTitulo } from '../enrutador';
import { SelectorMunicipio } from '../SelectorMunicipio';

/** Opciones de cantidad y su valor aproximado (igual que en la app Android). */
export const CANTIDADES: Record<string, number> = { '1': 1, '2 a 3': 2, '4 o más': 4 };
export const MAX_DESCRIPCION = 2000;
export const MAX_UBICACION = 300;

/** Valores del formulario. */
export interface Formulario {
  municipio: Municipio | null;
  ubicacion: string;
  cantidad: string;
  edad: string;
  actividad: string;
  riesgo: string;
  descripcion: string;
}

export const FORMULARIO_VACIO: Formulario = { municipio: null, ubicacion: '', cantidad: '', edad: '', actividad: '', riesgo: '', descripcion: '' };

/**
 * Valida el formulario antes de enviarlo (el servidor vuelve a validar todo).
 * @returns errores por campo; vacío si todo está bien
 */
export function validarFormulario(f: Formulario): Partial<Record<keyof Formulario, string>> {
  const e: Partial<Record<keyof Formulario, string>> = {};
  if (!f.municipio) e.municipio = 'Elige el municipio donde ocurre.';
  if (!f.ubicacion.trim()) e.ubicacion = 'Escribe una referencia del lugar (calle, colonia o punto conocido).';
  else if (f.ubicacion.length > MAX_UBICACION) e.ubicacion = `Usa máximo ${MAX_UBICACION} caracteres.`;
  if (!(f.cantidad in CANTIDADES)) e.cantidad = 'Elige cuántas niñas o niños viste.';
  if (!f.edad) e.edad = 'Elige la edad aproximada.';
  if (!f.actividad) e.actividad = 'Elige la actividad que observaste.';
  if (!f.riesgo) e.riesgo = 'Indica si percibes una situación de riesgo.';
  if (!f.descripcion.trim()) e.descripcion = 'Describe brevemente lo que observaste.';
  else if (f.descripcion.length > MAX_DESCRIPCION) e.descripcion = `Usa máximo ${MAX_DESCRIPCION} caracteres.`;
  return e;
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
      {aviso.datos.parrafos.map((p) => <p key={p}>{p}</p>)}
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
  const [errores, setErrores] = useState<Partial<Record<keyof Formulario, string>>>({});
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
      setCreado(await api.crearReporte({
        municipioId: f.municipio!.id, ubicacion: f.ubicacion.trim(), cantidadNinos: CANTIDADES[f.cantidad],
        edadAproximada: f.edad, actividad: f.actividad, situacionRiesgo: f.riesgo, descripcion: f.descripcion.trim(),
        avisoPrivacidadVersion: version!,
      }));
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

        <div className="campo">
          <label htmlFor="ubicacion">¿Dónde ocurre?</label>
          <span id="ayuda-ubicacion" className="ayuda">Calle, colonia o punto de referencia. No escribas tu propia dirección.</span>
          <input id="ubicacion" type="text" maxLength={MAX_UBICACION} value={f.ubicacion} onChange={(e) => cambiar('ubicacion', e.target.value)}
            aria-describedby={errores.ubicacion ? 'ayuda-ubicacion error-ubicacion' : 'ayuda-ubicacion'} aria-invalid={errores.ubicacion ? true : undefined} />
          {errores.ubicacion && <span id="error-ubicacion" className="error-campo">{errores.ubicacion}</span>}
        </div>

        <Opciones nombre="cantidad" leyenda="¿Cuántas niñas o niños viste?" opciones={Object.keys(CANTIDADES)} valor={f.cantidad} alCambiar={(v) => cambiar('cantidad', v)} error={errores.cantidad} />
        <Opciones nombre="edad" leyenda="Edad aproximada (años)" opciones={cat.rangosEdad} valor={f.edad} alCambiar={(v) => cambiar('edad', v)} error={errores.edad} />
        <Opciones nombre="actividad" leyenda="¿Qué actividad realizaban?" opciones={cat.actividades} valor={f.actividad} alCambiar={(v) => cambiar('actividad', v)} error={errores.actividad} />
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
