import { FormEvent, lazy, ReactNode, RefObject, Suspense, useEffect, useRef, useState } from 'react';
import {
  api, CambiosExpediente, ConteoProtegido, descargarCsv, DireccionRespuesta, Embudo, EventoBitacora, Expediente, fijarSesion, FiltrosBandeja,
  FiltrosPanel, GrupoMenores, Municipio, obtenerSesion, ReporteDetalle, ReporteRelacionado, TiempoHito, TipoEvento,
} from '../api';
import { Esqueleto, Marco, MensajeError, useCarga, useSesion, Vacio } from '../componentes';
import { Enlace, navegar, useTitulo } from '../enrutador';
import { claseEstatus, ESTATUS, EtiquetaEstatus, etiquetaEstatus, formatearFecha, IconoEstatus } from '../estatus';
import { calcularLinea, LineaProgreso } from '../progreso';
import { SelectorMunicipio } from '../SelectorMunicipio';

/** Formulario de inicio de sesión del personal (Cognito detrás del API). */
function Acceso() {
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true); setError(null);
    try {
      const r = await api.login(correo.trim(), password);
      setPassword('');
      fijarSesion({ token: r.accessToken, correo: r.correo, esAdministrador: r.esAdministrador === true });
    } catch (err) { setError(err); } finally { setEnviando(false); }
  };

  return (
    <form onSubmit={entrar} className="tarjeta" noValidate>
      <h1>Acceso del personal SIPINNA</h1>
      <p className="texto-secundario">Usa la cuenta que te asignó la administración. Si recargas la página tendrás que volver a entrar.</p>
      <div className="campo">
        <label htmlFor="correo">Correo</label>
        <input id="correo" type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
      </div>
      <div className="campo">
        <label htmlFor="password">Contraseña</label>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {!!error && <MensajeError error={error} />}
      <button type="submit" className="boton" disabled={enviando || !correo || !password}>{enviando ? 'Entrando…' : 'Entrar'}</button>
    </form>
  );
}

/** Envuelve las páginas del personal: si no hay sesión, muestra el acceso. */
export function ConSesion({ titulo, children }: { titulo: string; children: ReactNode }) {
  useTitulo(titulo);
  const sesion = useSesion();
  return <Marco personal>{sesion ? children : <Acceso />}</Marco>;
}

// ---------- Utilidades puras (probadas) ----------

/** Filtros de la bandeja con la página, tal como viajan en la URL. */
export type FiltrosUrl = FiltrosBandeja & { pagina: number };

/**
 * Lee los filtros de la bandeja desde la URL (`?estatus=…&riesgo=Sí&pendientes=true&pagina=2`).
 * Así un enlace directo o el panel abren la bandeja ya filtrada, y el detalle sabe volver a ella.
 */
export function filtrosDesdeUrl(search: string): FiltrosUrl {
  const q = new URLSearchParams(search);
  const texto = (k: string) => q.get(k) || undefined;
  const entero = (k: string) => { const n = Number(q.get(k)); return Number.isInteger(n) && n > 0 ? n : undefined; };
  return {
    estatus: texto('estatus'), municipioId: entero('municipioId'), actividad: texto('actividad'),
    desde: texto('desde'), hasta: texto('hasta'), folio: texto('folio'), sinAtenderDias: entero('sinAtenderDias'),
    riesgo: texto('riesgo'), pendientes: q.get('pendientes') === 'true' || undefined, prioridad: texto('prioridad'),
    vencidos: q.get('vencidos') === 'true' || undefined, verificacion: texto('verificacion'),
    // Fase 6: por omisión la bandeja se ordena por prioridad (Alta primero).
    orden: q.get('orden') === 'antiguos' ? 'antiguos' : q.get('orden') === 'recientes' ? 'recientes' : 'prioridad', pagina: entero('pagina') ?? 1,
  };
}

/** Cadena de consulta de los filtros (sin vacíos; sin `orden=prioridad` ni `pagina=1`, que son los valores por omisión). */
export function urlDeFiltros(f: FiltrosUrl): string {
  const p = new URLSearchParams();
  const poner = (k: string, v: string | number | boolean | undefined) => { if (v !== undefined && v !== '' && v !== false) p.set(k, String(v)); };
  poner('estatus', f.estatus); poner('municipioId', f.municipioId); poner('actividad', f.actividad);
  poner('desde', f.desde); poner('hasta', f.hasta); poner('folio', f.folio); poner('sinAtenderDias', f.sinAtenderDias);
  poner('riesgo', f.riesgo); poner('pendientes', f.pendientes); poner('prioridad', f.prioridad);
  poner('vencidos', f.vencidos); poner('verificacion', f.verificacion);
  if (f.orden && f.orden !== 'prioridad') poner('orden', f.orden);
  if (f.pagina > 1) poner('pagina', f.pagina);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Reportes de la última bandeja mostrada (en memoria), para "anterior/siguiente" en el detalle. */
let contextoBandeja: { ids: number[]; consulta: string } | null = null;

/** Posición de un reporte dentro de la lista de la bandeja. */
export function vecinos(ids: number[], id: number): { anterior?: number; siguiente?: number; posicion: number; total: number } {
  const i = ids.indexOf(id);
  if (i < 0) return { posicion: 0, total: ids.length };
  return { anterior: ids[i - 1], siguiente: ids[i + 1], posicion: i + 1, total: ids.length };
}

/** Tiempo transcurrido medido (no es un plazo): "45 min", "5 h", "3 días y 4 h", "21 días". Igual que la app. */
export function transcurrido(desdeIso: string, ahora: Date = new Date()): string | null {
  const desde = new Date(desdeIso).getTime();
  if (Number.isNaN(desde)) return null;
  const minutos = Math.max(0, Math.floor((ahora.getTime() - desde) / 60_000));
  const horas = Math.floor(minutos / 60);
  const dias = Math.floor(horas / 24);
  const d = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;
  if (minutos < 1) return 'menos de 1 min';
  if (minutos < 60) return `${minutos} min`;
  if (horas < 24) return `${horas} h`;
  if (dias < 7 && horas % 24 > 0) return `${d(dias)} y ${horas % 24} h`;
  return d(dias);
}

/** Clase del evento; si el servidor es anterior a la Fase 5 se calcula con la misma regla que el servidor. */
export function tipoEvento(historial: EventoBitacora[], i: number): TipoEvento {
  return historial[i].tipo ?? (i === 0 ? 'registro' : historial[i].estatus !== historial[i - 1].estatus ? 'cambio' : 'nota');
}

/** Fecha en que el caso entró a su estatus vigente (del servidor o calculada con la bitácora). */
export function fechaEstatusActual(r: ReporteDetalle): string {
  if (r.fechaEstatusActual) return r.fechaEstatusActual;
  for (let i = r.historial.length - 1; i >= 0; i--) if (esCambio(tipoEvento(r.historial, i))) return r.historial[i].fecha;
  return r.fechaCreacion;
}

/** ¿El evento movió el estatus? (las notas, acciones y cambios de expediente no). */
export const esCambio = (t: TipoEvento): boolean => t === 'registro' || t === 'cambio';

/** Fecha `AAAA-MM-DD` de hoy en la Ciudad de México. */
export function hoyMx(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

/** "15 ene 2026" a partir de `AAAA-MM-DD` (sin desfase de zona horaria). */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Diferencia entre el expediente actual y el formulario: solo lo que cambió, con `null`
 * para borrar. Pura (probada): así no se escribe en la bitácora un cambio que no existe.
 */
export function cambiosExpediente(e: Expediente, f: FormularioExpediente): CambiosExpediente {
  const c: CambiosExpediente = {};
  const num = (v: string): number | null => (v === '' ? null : Number(v));
  if (num(f.idResponsable) !== (e.responsable?.id ?? null)) c.idResponsable = num(f.idResponsable);
  if (num(f.idDependencia) !== (e.dependencia?.id ?? null)) c.idDependencia = num(f.idDependencia);
  if (num(f.idModalidad) !== (e.modalidad?.id ?? null)) c.idModalidad = num(f.idModalidad);
  if ((f.fechaSeguimiento || null) !== e.fechaSeguimiento) c.fechaSeguimiento = f.fechaSeguimiento || null;
  if (f.verificacion !== e.verificacion) c.verificacion = f.verificacion;
  for (const k of ['nnaIdentificados', 'nnaCanalizados', 'nnaNinas', 'nnaNinos'] as const) {
    if (num(f[k]) !== e[k]) c[k] = num(f[k]);
  }
  return c;
}

/** Valores del formulario del expediente (texto, como los controles). */
export interface FormularioExpediente {
  idResponsable: string; idDependencia: string; idModalidad: string; fechaSeguimiento: string; verificacion: string;
  nnaIdentificados: string; nnaCanalizados: string; nnaNinas: string; nnaNinos: string;
}

/** Formulario inicial a partir del expediente. */
export function formularioDe(e: Expediente): FormularioExpediente {
  const t = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
  return {
    idResponsable: t(e.responsable?.id), idDependencia: t(e.dependencia?.id), idModalidad: t(e.modalidad?.id),
    fechaSeguimiento: e.fechaSeguimiento ?? '', verificacion: e.verificacion,
    nnaIdentificados: t(e.nnaIdentificados), nnaCanalizados: t(e.nnaCanalizados), nnaNinas: t(e.nnaNinas), nnaNinos: t(e.nnaNinos),
  };
}

/** Texto de un tiempo hasta un hito; con pocos casos dice "datos insuficientes" en lugar de un promedio engañoso. */
export function textoHito(h: TiempoHito | undefined): { valor: string; detalle: string } {
  if (!h) return { valor: '—', detalle: 'El servidor aún no calcula este dato.' };
  if (h.horasPromedio === null) return { valor: 'Datos insuficientes', detalle: `${h.casos} de ${h.minimoCasos} casos necesarios para calcularlo.` };
  return { valor: formatearHoras(h.horasPromedio), detalle: `Mediana: ${formatearHoras(h.horasMediana)} · ${h.casos} casos medidos.` };
}

// ---------- Bandeja ----------

/** Bandeja con filtros (en la URL), búsqueda por folio, orden, paginación y exportación CSV (Fases 3 y 5). */
function ContenidoBandeja() {
  const [f, setF] = useState<FiltrosUrl>(() => filtrosDesdeUrl(window.location.search));
  const [folioTexto, setFolioTexto] = useState(f.folio ?? '');
  const [exportando, setExportando] = useState(false);
  const [errorExportar, setErrorExportar] = useState<unknown>(null);
  const municipios = useCarga(api.municipios, []);
  const catalogos = useCarga(api.catalogos, []);

  const { pagina, ...filtros } = f;
  const clave = JSON.stringify(f);
  const lista = useCarga(() => api.reportes({ ...filtros, pagina }), [clave]);
  // La URL refleja los filtros: el enlace se puede compartir y el detalle sabe a qué bandeja volver.
  useEffect(() => { window.history.replaceState(null, '', `/personal${urlDeFiltros(f)}`); }, [clave]);
  useEffect(() => {
    if (lista.datos) contextoBandeja = { ids: lista.datos.elementos.map((r) => r.id), consulta: urlDeFiltros(f) };
  }, [lista.datos]);

  /** Cambia un filtro y regresa a la primera página. */
  const fijar = (cambio: Partial<FiltrosUrl>) => setF((x) => ({ ...x, ...cambio, pagina: cambio.pagina ?? 1 }));
  const municipio = municipios.datos?.find((m) => m.id === f.municipioId) ?? null;
  const hayFiltros = Boolean(f.estatus || f.municipioId || f.actividad || f.desde || f.hasta || f.folio || f.sinAtenderDias || f.riesgo
    || f.pendientes || f.prioridad || f.vencidos || f.verificacion);

  const exportar = async () => {
    setExportando(true); setErrorExportar(null);
    try { await descargarCsv(filtros); } catch (e) { setErrorExportar(e); } finally { setExportando(false); }
  };

  const paginas = lista.datos ? Math.max(1, Math.ceil(lista.datos.total / lista.datos.tamano)) : 1;
  return (
    <>
      <h1>Bandeja de reportes</h1>
      <form className="filtros tarjeta" role="search" aria-label="Filtros de la bandeja"
        onSubmit={(e) => { e.preventDefault(); fijar({ folio: folioTexto.trim() || undefined }); }}>
        <div className="campo">
          <label htmlFor="buscar-folio">Buscar por folio</label>
          <span id="ayuda-folio" className="ayuda">Completo o solo los últimos dígitos (ej. 000123).</span>
          <div className="fila-busqueda">
            <input id="buscar-folio" type="search" maxLength={20} value={folioTexto} aria-describedby="ayuda-folio"
              onChange={(e) => setFolioTexto(e.target.value)} />
            <button type="submit" className="boton">Buscar</button>
          </div>
        </div>
        <div className="campo">
          <label htmlFor="filtro-estatus">Estatus</label>
          <select id="filtro-estatus" value={f.estatus ?? ''} onChange={(e) => fijar({ estatus: e.target.value || undefined })}>
            <option value="">Todos</option>
            {ESTATUS.map((e) => <option key={e} value={e}>{etiquetaEstatus(e)}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="filtro-prioridad">Prioridad</label>
          <select id="filtro-prioridad" value={f.prioridad ?? ''} onChange={(e) => fijar({ prioridad: e.target.value || undefined })}>
            <option value="">Todas</option>
            <option value="Alta">Alta (peligro inmediato)</option>
            <option value="Media">Media (riesgo percibido)</option>
            <option value="Normal">Normal</option>
          </select>
        </div>
        <div className="campo">
          <label htmlFor="filtro-riesgo">Riesgo percibido</label>
          <select id="filtro-riesgo" value={f.riesgo ?? ''} onChange={(e) => fijar({ riesgo: e.target.value || undefined })}>
            <option value="">Todos</option>
            {(catalogos.datos?.riesgos ?? ['Sí', 'No', 'No sé']).map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="filtro-actividad">Actividad</label>
          <select id="filtro-actividad" value={f.actividad ?? ''} onChange={(e) => fijar({ actividad: e.target.value || undefined })}>
            <option value="">Todas</option>
            {catalogos.datos?.actividades.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {municipios.datos && (
          <SelectorMunicipio etiqueta="Municipio" municipios={municipios.datos} valor={municipio} alCambiar={(m: Municipio | null) => fijar({ municipioId: m?.id })} />
        )}
        <div className="campo"><label htmlFor="b-desde">Desde</label><input id="b-desde" type="date" value={f.desde ?? ''} onChange={(e) => fijar({ desde: e.target.value || undefined })} /></div>
        <div className="campo"><label htmlFor="b-hasta">Hasta</label><input id="b-hasta" type="date" value={f.hasta ?? ''} onChange={(e) => fijar({ hasta: e.target.value || undefined })} /></div>
        <div className="campo">
          <label htmlFor="filtro-sin-atender">Sin atender</label>
          <select id="filtro-sin-atender" value={f.sinAtenderDias ?? ''} onChange={(e) => fijar({ sinAtenderDias: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">Todos</option>
            <option value="7">Más de 7 días</option>
            <option value="15">Más de 15 días</option>
            <option value="30">Más de 30 días</option>
          </select>
        </div>
        <div className="campo">
          <label htmlFor="orden">Orden</label>
          <select id="orden" value={f.orden} onChange={(e) => fijar({ orden: e.target.value as 'recientes' | 'antiguos' | 'prioridad' })}>
            <option value="prioridad">Prioridad (alta primero)</option>
            <option value="recientes">Más recientes primero</option>
            <option value="antiguos">Más antiguos primero</option>
          </select>
        </div>
        <div className="campo">
          <label htmlFor="filtro-verificacion">Verificación</label>
          <select id="filtro-verificacion" value={f.verificacion ?? ''} onChange={(e) => fijar({ verificacion: e.target.value || undefined })}>
            <option value="">Todas</option>
            {VERIFICACIONES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <label className="opcion">
          <input type="checkbox" checked={Boolean(f.pendientes)} onChange={(e) => fijar({ pendientes: e.target.checked || undefined })} />
          <span>Solo pendientes (registrados, en revisión o reincidentes)</span>
        </label>
        <label className="opcion">
          <input type="checkbox" checked={Boolean(f.vencidos)} onChange={(e) => fijar({ vencidos: e.target.checked || undefined })} />
          <span>Solo con fecha de seguimiento vencida</span>
        </label>
        <div className="acciones">
          {hayFiltros && (
            <button type="button" className="boton boton-secundario" onClick={() => { setFolioTexto(''); setF({ orden: 'prioridad', pagina: 1 }); }}>Quitar filtros</button>
          )}
          <button type="button" className="boton boton-secundario" onClick={exportar} disabled={exportando}>
            {exportando ? 'Preparando…' : 'Exportar CSV'}
          </button>
        </div>
        <p className="ayuda">El CSV incluye las columnas de la bandeja (sin descripciones ni coordenadas), máximo 5,000 filas.</p>
      </form>
      {!!errorExportar && <MensajeError error={errorExportar} />}
      {lista.cargando && <Esqueleto filas={4} />}
      {!!lista.error && <MensajeError error={lista.error} alReintentar={lista.recargar} />}
      {lista.datos && !lista.cargando && (
        lista.datos.elementos.length === 0
          ? <Vacio>No hay reportes con estos filtros.</Vacio>
          : (
            <>
              <p className="texto-secundario" role="status">{lista.datos.total} reporte(s) · página {pagina} de {paginas}</p>
              <ul className="lista-reportes">
                {lista.datos.elementos.map((r) => (
                  <li key={r.id}>
                    <Enlace a={`/personal/reportes/${r.id}`}>
                      <div className="tarjeta">
                        <div className="fila-titulo"><strong>{r.folio}</strong><EtiquetaEstatus estatus={r.estatus} /></div>
                        <span>{r.municipio ?? 'Municipio no indicado'} · {r.ubicacion}</span>
                        <span className="pequeno texto-secundario">{r.actividad} · {r.cantidadNinos} menor(es) · Riesgo: {r.situacionRiesgo} · {formatearFecha(r.fechaCreacion)}</span>
                        <span className="insignias">
                          {r.prioridad === 'Alta' && <span className="insignia-prioridad">Prioridad alta</span>}
                          {r.situacionRiesgo === 'Sí' && <span className="insignia-riesgo">Riesgo percibido</span>}
                          {r.seguimientoVencido && <span className="insignia-vencido">Seguimiento vencido</span>}
                          {r.esDuplicado && <span className="insignia-neutra">Posible duplicado</span>}
                          {r.verificacion && r.verificacion !== 'Sin verificar' && <span className="insignia-neutra">{r.verificacion}</span>}
                        </span>
                      </div>
                    </Enlace>
                  </li>
                ))}
              </ul>
              {paginas > 1 && (
                <nav className="paginacion" aria-label="Páginas de la bandeja">
                  <button type="button" className="boton boton-secundario" disabled={pagina <= 1} onClick={() => fijar({ pagina: pagina - 1 })}>Anterior</button>
                  <span>Página {pagina} de {paginas}</span>
                  <button type="button" className="boton boton-secundario" disabled={pagina >= paginas} onClick={() => fijar({ pagina: pagina + 1 })}>Siguiente</button>
                </nav>
              )}
            </>
          )
      )}
    </>
  );
}

/** Página de la bandeja. */
export function Bandeja() {
  return <ConSesion titulo="Bandeja"><ContenidoBandeja /></ConSesion>;
}

// ---------- Detalle ----------

/** Mini mapa cargado bajo demanda (Leaflet solo se descarga para el personal que abre un detalle con punto). */
const MiniMapaDiferido = lazy(() => import('../MiniMapa'));

/** Largo a partir del cual la descripción se pliega. */
const DESCRIPCION_CORTA = 400;

/**
 * Acciones de seguimiento: botones de las transiciones válidas (máquina de
 * estados del servidor) con su formulario, y la nota interna. Retroalimentación
 * inmediata y sin recargar la página.
 */
function Acciones({ r, alGuardar, refNota }: { r: ReporteDetalle; alGuardar: (d: ReporteDetalle, mensaje: string) => void; refNota: RefObject<HTMLTextAreaElement | null> }) {
  const [destino, setDestino] = useState('');
  const [comentario, setComentario] = useState('');
  const [motivo, setMotivo] = useState('');
  const [resultado, setResultado] = useState('');
  const [nota, setNota] = useState('');
  const [tipoNota, setTipoNota] = useState<'nota' | 'accion'>('nota');
  const [tipoAccion, setTipoAccion] = useState(TIPOS_ACCION[0]);
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  // Fase 6: marcar un caso como Reincidente exige comentario (el servidor lo vuelve a validar).
  const reabrir = destino === 'Reincidente';

  const ejecutar = async (accion: () => Promise<ReporteDetalle>, mensaje: string, limpiar: () => void) => {
    setEnviando(true); setError(null);
    try { alGuardar(await accion(), mensaje); limpiar(); } catch (err) { setError(err); } finally { setEnviando(false); }
  };
  const cambiar = (e: FormEvent) => {
    e.preventDefault();
    void ejecutar(() => api.cambiarEstatus(r.id, destino, comentario, motivo, concluir ? resultado.trim() : undefined),
      `Estatus cambiado a “${etiquetaEstatus(destino)}”.`, () => { setDestino(''); setComentario(''); setMotivo(''); setResultado(''); });
  };
  const guardarNota = (e: FormEvent) => {
    e.preventDefault();
    const texto = tipoNota === 'accion' ? `${tipoAccion}: ${nota.trim()}` : nota.trim();
    void ejecutar(() => api.agregarNota(r.id, texto, tipoNota), tipoNota === 'accion' ? 'Acción registrada.' : 'Nota agregada.', () => setNota(''));
  };
  // Fase 7: al concluir se exige el resultado (el servidor lo vuelve a validar).
  const concluir = destino === 'Concluido';
  const faltaDato = (destino === 'Descartado' && !motivo.trim()) || (reabrir && !comentario.trim()) || (concluir && !resultado.trim());

  return (
    <section className="tarjeta no-imprimir" aria-labelledby="titulo-acciones">
      <h2 id="titulo-acciones">Seguimiento</h2>
      {r.transicionesPermitidas.length === 0
        ? <p>Este caso está en un estatus final y ya no puede cambiar.</p>
        : (
          <>
            <p className="pequeno texto-secundario">Cambiar estatus a:</p>
            <div className="botones-transicion" role="group" aria-label="Cambios de estatus permitidos">
              {r.transicionesPermitidas.map((t) => (
                <button key={t} type="button" aria-pressed={destino === t} className={`boton-transicion borde-${claseEstatus(t)}`}
                  onClick={() => { setDestino(destino === t ? '' : t); setError(null); }}>
                  <IconoEstatus estatus={t} />{etiquetaEstatus(t)}
                </button>
              ))}
            </div>
          </>
        )}
      {destino && (
        <form onSubmit={cambiar} className="formulario-transicion" noValidate>
          {destino === 'Descartado' && (
            <div className="campo">
              <label htmlFor="motivo">Motivo de la cancelación (obligatorio)</label>
              <input id="motivo" type="text" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
          )}
          {concluir && (
            <div className="campo">
              <label htmlFor="resultado">Resultado del caso (obligatorio)</label>
              <span id="ayuda-resultado" className="ayuda">Qué se logró o en qué terminó la atención. Solo lo ve el personal.</span>
              <textarea id="resultado" maxLength={1000} value={resultado} aria-describedby="ayuda-resultado" onChange={(e) => setResultado(e.target.value)} />
            </div>
          )}
          <div className="campo">
            <label htmlFor="comentario">{reabrir ? 'Comentario: por qué volvió a requerir atención (obligatorio)' : 'Comentario del cambio (opcional)'}</label>
            <textarea id="comentario" maxLength={2000} value={comentario} onChange={(e) => setComentario(e.target.value)} />
          </div>
          <div className="acciones">
            <button type="submit" className="boton" disabled={enviando || faltaDato}>{enviando ? 'Guardando…' : `Cambiar a “${etiquetaEstatus(destino)}”`}</button>
            <button type="button" className="boton boton-secundario" onClick={() => setDestino('')}>Cancelar</button>
          </div>
        </form>
      )}
      <form onSubmit={guardarNota} noValidate className="formulario-nota">
        <fieldset className="grupo-opciones">
          <legend>Registrar en la bitácora</legend>
          <label className="opcion"><input type="radio" name="tipo-nota" checked={tipoNota === 'nota'} onChange={() => setTipoNota('nota')} /><span>Nota interna</span></label>
          <label className="opcion"><input type="radio" name="tipo-nota" checked={tipoNota === 'accion'} onChange={() => setTipoNota('accion')} /><span>Acción realizada</span></label>
        </fieldset>
        {tipoNota === 'accion' && (
          <div className="campo">
            <label htmlFor="tipo-accion">Tipo de acción</label>
            <select id="tipo-accion" value={tipoAccion} onChange={(e) => setTipoAccion(e.target.value)}>
              {TIPOS_ACCION.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}
        <div className="campo">
          <label htmlFor="nota">{tipoNota === 'accion' ? 'Qué se hizo' : 'Nota interna'}</label>
          <span id="ayuda-nota" className="ayuda">Solo la ve el personal. No cambia el estatus.</span>
          <textarea id="nota" ref={refNota} maxLength={1900} value={nota} aria-describedby="ayuda-nota" onChange={(e) => setNota(e.target.value)} />
        </div>
        <button type="submit" className="boton boton-secundario" disabled={enviando || !nota.trim()}>
          {enviando ? 'Guardando…' : tipoNota === 'accion' ? 'Registrar acción' : 'Agregar nota'}
        </button>
      </form>
      {!!error && <MensajeError error={error} />}
    </section>
  );
}

/** Barras de menores por grupo de edad (SVG con atributos, sin estilos en línea) y el total. */
export function BarrasMenores({ grupos }: { grupos: GrupoMenores[] }) {
  const total = grupos.reduce((a, g) => a + g.cantidad, 0);
  const max = Math.max(1, ...grupos.map((g) => g.cantidad));
  const alto = 30, izq = 150, ancho = 420;
  const etiqueta = (r: string) => (r === 'Sin determinar' ? 'Edad sin determinar' : `De ${r.replace('-', ' a ')} años`);
  return (
    <svg className="grafica" role="img" aria-label={`Menores por grupo de edad: ${grupos.map((g) => `${etiqueta(g.rango)}: ${g.cantidad}`).join(', ')}. Total: ${total}.`}
      viewBox={`0 0 ${ancho} ${grupos.length * alto + 4}`} width={ancho} height={grupos.length * alto + 4}>
      {grupos.map((g, i) => {
        const w = Math.round(((ancho - izq - 40) * g.cantidad) / max);
        return (
          <g key={g.rango} transform={`translate(0 ${i * alto + 2})`}>
            <text x={izq - 8} y={18} textAnchor="end">{etiqueta(g.rango)}</text>
            <rect x={izq} y={4} width={Math.max(w, 2)} height={18} rx={4} className="relleno-primario" />
            <text x={izq + Math.max(w, 2) + 6} y={18}>{g.cantidad}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Título de cada tipo de evento (el cambio de estatus se arma con el estatus). */
const TITULO_EVENTO: Partial<Record<TipoEvento, string>> = {
  registro: 'Reporte recibido', nota: 'Nota interna', accion: 'Acción realizada', expediente: 'Cambio en el expediente',
};

/** Verificación del expediente (Fase 7). */
export const VERIFICACIONES = ['Sin verificar', 'Verificado', 'Caso confirmado', 'No procede'];
/** Tipos de acción sugeridos; el servidor manda los vigentes en el catálogo del expediente. */
const TIPOS_ACCION = ['Visita', 'Llamada', 'Entrevista', 'Canalización', 'Coordinación interinstitucional', 'Otra'];

/**
 * Expediente interno (Fase 7): responsable, dependencia, seguimiento, verificación,
 * modalidad y conteos de NNA. Solo se envía lo que cambió y el servidor lo deja en la bitácora.
 */
function TarjetaExpediente({ r, alGuardar }: { r: ReporteDetalle; alGuardar: (d: ReporteDetalle, mensaje: string) => void }) {
  const e = r.expediente!;
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState<FormularioExpediente>(() => formularioDe(e));
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const catalogos = useCarga(() => (editando ? api.catalogosExpediente() : Promise.resolve(null)), [editando]);
  const responsables = useCarga(() => (editando ? api.responsables(r.id) : Promise.resolve(null)), [editando, r.id]);
  useEffect(() => { setF(formularioDe(e)); }, [r]);
  const cambios = cambiosExpediente(e, f);
  const hayCambios = Object.keys(cambios).length > 0;
  const poner = (k: keyof FormularioExpediente) => (ev: { target: { value: string } }) => setF((x) => ({ ...x, [k]: ev.target.value }));

  const guardar = async (ev: FormEvent) => {
    ev.preventDefault();
    setEnviando(true); setError(null);
    try { alGuardar(await api.actualizarExpediente(r.id, cambios), 'Expediente actualizado.'); setEditando(false); }
    catch (err) { setError(err); } finally { setEnviando(false); }
  };
  const asignarme = async () => {
    setEnviando(true); setError(null);
    try {
      const yo = (await api.responsables(r.id)).find((p) => p.correo === obtenerSesion()?.correo);
      if (!yo) throw new Error('No encontramos tu cuenta entre el personal de este municipio.');
      alGuardar(await api.actualizarExpediente(r.id, { idResponsable: yo.id }), 'Ahora eres responsable del caso.');
    } catch (err) { setError(err); } finally { setEnviando(false); }
  };
  const conteo = (v: number | null) => (v === null ? '—' : String(v));

  return (
    <section className="tarjeta" aria-labelledby="t-expediente">
      <div className="fila-titulo">
        <h2 id="t-expediente">Expediente</h2>
        {!editando && <button type="button" className="boton-texto no-imprimir" onClick={() => setEditando(true)}>Editar</button>}
      </div>
      {!editando ? (
        <>
          <dl>
            <dt>Responsable</dt><dd>{e.responsable?.correo ?? 'Sin asignar'}</dd>
            <dt>Verificación</dt><dd>{e.verificacion}</dd>
            <dt>Dependencia</dt><dd>{e.dependencia?.nombre ?? '—'}</dd>
            <dt>Próximo seguimiento</dt>
            <dd>{fechaCorta(e.fechaSeguimiento)}{e.seguimientoVencido && <> <span className="insignia-vencido">Vencido</span></>}</dd>
            <dt>Modalidad</dt><dd>{e.modalidad?.nombre ?? '—'}</dd>
            <dt>NNA identificados / canalizados</dt><dd>{conteo(e.nnaIdentificados)} / {conteo(e.nnaCanalizados)}</dd>
            {(e.nnaNinas !== null || e.nnaNinos !== null) && (<><dt>Niñas / niños</dt><dd>{conteo(e.nnaNinas)} / {conteo(e.nnaNinos)}</dd></>)}
            {e.resultado && (<><dt>Resultado</dt><dd className="texto-largo">{e.resultado}</dd></>)}
            {e.fechaCierre && (<><dt>Cierre</dt><dd>{formatearFecha(e.fechaCierre)}</dd></>)}
          </dl>
          {!e.responsable && (
            <button type="button" className="boton boton-secundario no-imprimir" onClick={asignarme} disabled={enviando}>Asignarme este caso</button>
          )}
        </>
      ) : (
        <form onSubmit={guardar} noValidate className="formulario-expediente">
          {(catalogos.cargando || responsables.cargando) && <Esqueleto filas={2} />}
          <div className="campo">
            <label htmlFor="exp-responsable">Responsable</label>
            <select id="exp-responsable" value={f.idResponsable} onChange={poner('idResponsable')}>
              <option value="">Sin asignar</option>
              {e.responsable && !responsables.datos?.some((p) => p.id === e.responsable!.id) && <option value={e.responsable.id}>{e.responsable.correo}</option>}
              {responsables.datos?.map((p) => <option key={p.id} value={p.id}>{p.correo} ({p.perfil})</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="exp-verificacion">Verificación</label>
            <select id="exp-verificacion" value={f.verificacion} onChange={poner('verificacion')}>
              {(catalogos.datos?.verificaciones ?? VERIFICACIONES).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="exp-dependencia">Dependencia a la que se canalizó</label>
            <select id="exp-dependencia" value={f.idDependencia} onChange={poner('idDependencia')}>
              <option value="">Ninguna</option>
              {e.dependencia && !catalogos.datos?.dependencias.some((d) => d.id === e.dependencia!.id) && <option value={e.dependencia.id}>{e.dependencia.nombre}</option>}
              {catalogos.datos?.dependencias.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="exp-fecha">Próxima fecha de seguimiento</label>
            <input id="exp-fecha" type="date" value={f.fechaSeguimiento} onChange={poner('fechaSeguimiento')} />
          </div>
          <div className="campo">
            <label htmlFor="exp-modalidad">Modalidad (la asigna el personal)</label>
            <select id="exp-modalidad" value={f.idModalidad} onChange={poner('idModalidad')}>
              <option value="">Sin determinar</option>
              {catalogos.datos?.modalidades.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
          <div className="rejilla-conteos">
            {([['nnaIdentificados', 'NNA identificados'], ['nnaCanalizados', 'NNA canalizados'], ['nnaNinas', 'Niñas'], ['nnaNinos', 'Niños']] as const).map(([k, t]) => (
              <div className="campo" key={k}>
                <label htmlFor={`exp-${k}`}>{t}</label>
                <input id={`exp-${k}`} type="number" inputMode="numeric" min={0} max={99} value={f[k]} onChange={poner(k)} />
              </div>
            ))}
          </div>
          <p className="ayuda">El sexo es opcional, lo captura solo el personal y únicamente se usa en conteos agregados.</p>
          {!!error && <MensajeError error={error} />}
          <div className="acciones">
            <button type="submit" className="boton" disabled={enviando || !hayCambios}>{enviando ? 'Guardando…' : 'Guardar expediente'}</button>
            <button type="button" className="boton boton-secundario" onClick={() => { setEditando(false); setF(formularioDe(e)); setError(null); }}>Cancelar</button>
          </div>
        </form>
      )}
      {!editando && !!error && <MensajeError error={error} />}
    </section>
  );
}

/**
 * Posible duplicidad (Fase 7): sugerencias del servidor por radio y ventana de días,
 * vínculo manual y reversible. Nunca se fusiona ni se borra un reporte.
 */
function TarjetaDuplicados({ r, alGuardar }: { r: ReporteDetalle; alGuardar: (d: ReporteDetalle, mensaje: string) => void }) {
  const [buscar, setBuscar] = useState(false);
  const cercanos = useCarga(() => (buscar ? api.cercanos(r.id) : Promise.resolve(null)), [buscar, r.id]);
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const ejecutar = async (accion: () => Promise<ReporteDetalle>, mensaje: string) => {
    setEnviando(true); setError(null);
    try { alGuardar(await accion(), mensaje); setBuscar(false); } catch (err) { setError(err); } finally { setEnviando(false); }
  };
  const fila = (x: ReporteRelacionado) => (
    <><Enlace a={`/personal/reportes/${x.id}`}>{x.folio}</Enlace> · {x.estatusEtiqueta} · {formatearFecha(x.fechaCreacion)}{x.distanciaMetros !== undefined && ` · a ${x.distanciaMetros} m`}</>
  );
  const duplicados = r.duplicados ?? [];

  return (
    <section className="tarjeta no-imprimir" aria-labelledby="t-duplicados">
      <h2 id="t-duplicados">Posible duplicidad</h2>
      {r.duplicadoDe ? (
        <>
          <p>Marcado como posible duplicado de {fila(r.duplicadoDe)}.</p>
          <button type="button" className="boton boton-secundario" disabled={enviando}
            onClick={() => ejecutar(() => api.desvincularDuplicado(r.id), 'Se quitó el vínculo de duplicado.')}>Quitar vínculo</button>
        </>
      ) : duplicados.length > 0 ? (
        <>
          <p>Reportes marcados como posibles duplicados de este:</p>
          <ul>{duplicados.map((d) => <li key={d.id}>{fila(d)}</li>)}</ul>
        </>
      ) : (
        <p className="pequeno texto-secundario">Se sugieren reportes cercanos del mismo municipio. Marcar un duplicado no borra ni fusiona nada y se puede deshacer.</p>
      )}
      {!r.duplicadoDe && duplicados.length === 0 && !buscar && (
        <button type="button" className="boton boton-secundario" onClick={() => setBuscar(true)}>Buscar posibles duplicados</button>
      )}
      {buscar && cercanos.cargando && <Esqueleto filas={2} />}
      {buscar && !!cercanos.error && <MensajeError error={cercanos.error} alReintentar={cercanos.recargar} />}
      {buscar && cercanos.datos && (
        cercanos.datos.length === 0
          ? <Vacio>No hay reportes cercanos en el radio y la ventana configurados.</Vacio>
          : (
            <ul className="lista-cercanos">
              {cercanos.datos.map((c) => (
                <li key={c.id}>
                  <span>{fila(c)}</span>
                  <button type="button" className="boton-texto" disabled={enviando}
                    onClick={() => ejecutar(() => api.vincularDuplicado(r.id, c.id), `Marcado como posible duplicado de ${c.folio}.`)}>
                    Este reporte es duplicado de {c.folio}
                  </button>
                </li>
              ))}
            </ul>
          )
      )}
      {!!error && <MensajeError error={error} />}
    </section>
  );
}

/**
 * Fotos del reporte (Fase 8): se piden solo al tocar "Ver fotos"; cada URL caduca en 60 s y
 * consultarlas queda en la bitácora de accesos. No se imprimen en la ficha.
 */
function TarjetaFotos({ r }: { r: ReporteDetalle }) {
  const [abiertas, setAbiertas] = useState(false);
  const fotos = useCarga(() => (abiertas ? api.fotos(r.id) : Promise.resolve(null)), [abiertas, r.id]);
  if (!r.numeroFotos) return null;
  return (
    <section className="tarjeta no-imprimir" aria-labelledby="t-fotos">
      <h2 id="t-fotos">Fotos · {r.numeroFotos}</h2>
      <p className="pequeno texto-secundario">Las aportó quien reportó. Verlas queda registrado en la bitácora de accesos; los enlaces caducan en 1 minuto.</p>
      {!abiertas
        ? <button type="button" className="boton boton-secundario" onClick={() => setAbiertas(true)}>Ver fotos</button>
        : (
          <>
            {fotos.cargando && <Esqueleto filas={2} />}
            {!!fotos.error && <MensajeError error={fotos.error} alReintentar={fotos.recargar} />}
            {fotos.datos && (
              <>
                <div className="rejilla-fotos">
                  {fotos.datos.map((foto, i) => (
                    <a key={foto.id} href={foto.url} target="_blank" rel="noopener noreferrer">
                      <img className="foto-evidencia" src={foto.url} alt={`Foto ${i + 1} del reporte ${r.folio}`} width={foto.ancho} height={foto.alto} loading="lazy" referrerPolicy="no-referrer" />
                    </a>
                  ))}
                </div>
                <button type="button" className="boton-texto" onClick={fotos.recargar}>Volver a cargar (si caducaron)</button>
              </>
            )}
          </>
        )}
    </section>
  );
}

/** Bitácora como línea de tiempo vertical, lo más reciente arriba, distinguiendo registro, cambio de estatus y nota. */
function Bitacora({ historial }: { historial: EventoBitacora[] }) {
  const eventos = historial.map((h, i) => ({ ...h, tipo: tipoEvento(historial, i) })).reverse();
  return (
    <section className="tarjeta" aria-labelledby="titulo-bitacora">
      <h2 id="titulo-bitacora">Bitácora</h2>
      <ol className="bitacora">
        {eventos.map((h, i) => (
          <li key={i} className={`evento evento-${h.tipo}`}>
            <span className={esCambio(h.tipo) ? `marca relleno-fondo-${claseEstatus(h.estatus)}` : `marca marca-${h.tipo}`} aria-hidden="true">
              {h.tipo === 'nota' ? '✎' : h.tipo === 'accion' ? '✓' : h.tipo === 'expediente' ? '≡' : <IconoEstatus estatus={h.estatus} tamano={16} />}
            </span>
            <div>
              <strong>{TITULO_EVENTO[h.tipo] ?? `Cambio de estatus a “${etiquetaEstatus(h.estatus)}”`}</strong>
              <span className="pequeno texto-secundario"> {formatearFecha(h.fecha)}<span className="no-imprimir"> · {h.autor ?? 'Registro automático'}</span></span>
              {h.comentario && <p className="texto-largo">{h.comentario}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Detalle de un reporte para el personal (rediseño de la Fase 5, versión técnica en dos columnas). */
function ContenidoDetalle({ id }: { id: number }) {
  const detalle = useCarga(() => api.detalle(id), [id]);
  const [actual, setActual] = useState<ReporteDetalle | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [completa, setCompleta] = useState(false);
  const refNota = useRef<HTMLTextAreaElement>(null);
  const r = actual && actual.id === id ? actual : detalle.datos;
  const contexto = contextoBandeja;
  const vec = contexto ? vecinos(contexto.ids, id) : { posicion: 0, total: 0 };
  const volver = `/personal${contexto?.consulta ?? ''}`;

  // Atajos de teclado básicos (no actúan mientras se escribe en un campo).
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.altKey || e.ctrlKey || e.metaKey || (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) || t?.isContentEditable) return;
      if (e.key === 'j' && vec.siguiente) navegar(`/personal/reportes/${vec.siguiente}`);
      else if (e.key === 'k' && vec.anterior) navegar(`/personal/reportes/${vec.anterior}`);
      else if (e.key === 'b') navegar(volver);
      else if (e.key === 'n') { e.preventDefault(); refNota.current?.focus(); }
      else return;
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [vec.siguiente, vec.anterior, volver]);
  useEffect(() => { setMensaje(''); setCopiado(false); setCompleta(false); }, [id]);

  if (detalle.cargando && !r) return <Esqueleto filas={5} />;
  if (detalle.error || !r) return <MensajeError error={detalle.error} alReintentar={detalle.recargar} />;

  const desdeAlta = transcurrido(r.fechaCreacion);
  const enEstatus = transcurrido(fechaEstatusActual(r));
  const cambios = r.historial.filter((_, i) => esCambio(tipoEvento(r.historial, i)));
  const grupos = r.grupos?.length ? r.grupos : [{ rango: r.edadAproximada, cantidad: r.cantidadNinos }];
  const direccion = textoDireccion(r.direccion);
  const larga = r.descripcion.length > DESCRIPCION_CORTA;
  const copiar = async () => {
    try { await navigator.clipboard.writeText(r.folio); setCopiado(true); } catch { setCopiado(false); }
  };

  return (
    <>
      <nav className="navegacion-detalle no-imprimir" aria-label="Navegación entre reportes">
        <Enlace a={volver}>← Volver a la bandeja</Enlace>
        {vec.total > 0 && vec.posicion > 0 && (
          <span className="acciones-navegacion">
            {vec.anterior ? <Enlace a={`/personal/reportes/${vec.anterior}`} className="boton boton-secundario">← Anterior</Enlace> : <span className="boton boton-secundario deshabilitado" aria-disabled="true">← Anterior</span>}
            <span className="pequeno texto-secundario">{vec.posicion} de {vec.total}</span>
            {vec.siguiente ? <Enlace a={`/personal/reportes/${vec.siguiente}`} className="boton boton-secundario">Siguiente →</Enlace> : <span className="boton boton-secundario deshabilitado" aria-disabled="true">Siguiente →</span>}
          </span>
        )}
      </nav>

      <header className="encabezado-detalle tarjeta tarjeta-tinte">
        <div className="fila-titulo">
          <h1 className="folio">{r.folio}</h1>
          <button type="button" className="boton-texto no-imprimir" onClick={copiar}>{copiado ? 'Folio copiado' : 'Copiar folio'}</button>
        </div>
        <div className="insignias">
          <EtiquetaEstatus estatus={r.estatus} />
          {r.prioridad === 'Alta' && <span className="insignia-prioridad">Prioridad alta</span>}
          {r.situacionRiesgo === 'Sí' && <span className="insignia-riesgo">Riesgo percibido</span>}
          {r.expediente?.seguimientoVencido && <span className="insignia-vencido">Seguimiento vencido</span>}
          {r.duplicadoDe && <span className="insignia-neutra">Posible duplicado</span>}
        </div>
        <p><strong>{r.municipio ?? 'Municipio no indicado'}</strong></p>
        <p className="pequeno">Alta: {formatearFecha(r.fechaCreacion)}{desdeAlta && ` · hace ${desdeAlta}`}</p>
        {enEstatus && <p className="pequeno"><strong>En “{etiquetaEstatus(r.estatus)}” desde hace {enEstatus}</strong></p>}
        <p role="status" aria-live="polite" className="mensaje-guardado">{mensaje}</p>
        <div className="acciones no-imprimir">
          <button type="button" className="boton boton-secundario" onClick={() => window.print()}>Imprimir ficha</button>
        </div>
      </header>

      <div className="detalle-columnas">
        <div className="columna-datos">
          <section className="tarjeta" aria-labelledby="t-resumen">
            <h2 id="t-resumen">Resumen</h2>
            <dl>
              <dt>Qué</dt><dd>{r.actividadOtro ? `${r.actividad}: ${r.actividadOtro}` : r.actividad}</dd>
              <dt>Dónde</dt><dd>{[r.municipio ?? 'Municipio no indicado', r.direccion?.colonia && `Col. ${r.direccion.colonia}`].filter(Boolean).join(' · ')}</dd>
              <dt>Cuándo</dt><dd>Reportado el {formatearFecha(r.fechaCreacion)}</dd>
            </dl>
          </section>
          <section className="tarjeta" aria-labelledby="t-ubicacion">
            <h2 id="t-ubicacion">Ubicación</h2>
            <dl>
              <dt>{direccion ? 'Dirección' : 'Lugar'}</dt><dd>{direccion ?? r.ubicacion}</dd>
              {r.direccion?.referencias && (<><dt>Referencias</dt><dd>{r.direccion.referencias}</dd></>)}
              {r.latitud !== null && r.longitud !== null && (<><dt>Coordenadas</dt><dd>{r.latitud.toFixed(5)}, {r.longitud.toFixed(5)}</dd></>)}
            </dl>
            {r.latitud !== null && r.longitud !== null
              ? <Suspense fallback={<Esqueleto filas={2} />}><MiniMapaDiferido lat={r.latitud} lng={r.longitud} /></Suspense>
              : <p className="pequeno texto-secundario">El reporte no trae punto en el mapa.</p>}
          </section>
          <section className="tarjeta" aria-labelledby="t-menores">
            <h2 id="t-menores">Menores · {grupos.reduce((a, g) => a + g.cantidad, 0)} en total</h2>
            <BarrasMenores grupos={grupos} />
          </section>
          <section className="tarjeta" aria-labelledby="t-actividad">
            <h2 id="t-actividad">Actividad y riesgo</h2>
            <dl>
              <dt>Actividad</dt><dd>{r.actividadOtro ? `${r.actividad}: ${r.actividadOtro}` : r.actividad}</dd>
              <dt>¿Riesgo percibido?</dt><dd>{r.situacionRiesgo}{r.situacionRiesgo === 'Sí' && <> <span className="insignia-riesgo">Riesgo percibido</span></>}</dd>
              {r.peligroInmediato && (<><dt>¿Peligro inmediato?</dt><dd>{r.peligroInmediato}</dd></>)}
              {r.prioridad && (<><dt>Prioridad</dt><dd>{r.prioridad}</dd></>)}
              {r.motivoDescarte && (<><dt>Motivo de cancelación</dt><dd>{r.motivoDescarte}</dd></>)}
            </dl>
          </section>
          <TarjetaFotos r={r} />
          <section className="tarjeta" aria-labelledby="t-descripcion">
            <h2 id="t-descripcion">Descripción</h2>
            <p className="texto-largo">{larga && !completa ? `${r.descripcion.slice(0, DESCRIPCION_CORTA).trimEnd()}…` : r.descripcion}</p>
            {larga && <button type="button" className="boton-texto no-imprimir" aria-expanded={completa} onClick={() => setCompleta(!completa)}>{completa ? 'Ver menos' : 'Ver todo'}</button>}
          </section>
        </div>

        <div className="columna-seguimiento">
          <section className="tarjeta" aria-labelledby="t-avance">
            <h2 id="t-avance">Avance</h2>
            <LineaProgreso linea={calcularLinea(r.estatus, cambios, r.fechaCreacion)} conSignificado={false} titulo="Avance del caso" />
          </section>
          <Acciones r={r} refNota={refNota} alGuardar={(d, m) => { setActual(d); setMensaje(m); }} />
          {r.expediente && <TarjetaExpediente r={r} alGuardar={(d, m) => { setActual(d); setMensaje(m); }} />}
          {r.expediente && <TarjetaDuplicados r={r} alGuardar={(d, m) => { setActual(d); setMensaje(m); }} />}
          <Bitacora historial={r.historial} />
          <details className="pequeno no-imprimir">
            <summary>Atajos de teclado</summary>
            <ul>
              <li><kbd>j</kbd> siguiente reporte · <kbd>k</kbd> anterior</li>
              <li><kbd>n</kbd> escribir una nota · <kbd>b</kbd> volver a la bandeja</li>
            </ul>
          </details>
        </div>
      </div>
    </>
  );
}

/** Página de detalle. */
export function Detalle({ id }: { id: number }) {
  return <ConSesion titulo="Detalle del reporte"><ContenidoDetalle id={id} /></ConSesion>;
}

// ---------- Panel ----------

/** Barras horizontales con etiqueta directa y tooltip; los colores vienen de clases CSS. */
export function BarrasPorEstatus({ datos }: { datos: { etiqueta: string; total: number }[] }) {
  const max = Math.max(1, ...datos.map((d) => d.total));
  const alto = 34, izq = 110, ancho = 520;
  const resumen = datos.map((d) => `${etiquetaEstatus(d.etiqueta)}: ${d.total}`).join(', ');
  return (
    <svg className="grafica" role="img" aria-label={`Reportes por estatus. ${resumen}.`} viewBox={`0 0 ${ancho} ${datos.length * alto + 8}`} width={ancho} height={datos.length * alto + 8}>
      {datos.map((d, i) => {
        const w = Math.round(((ancho - izq - 60) * d.total) / max);
        return (
          <g key={d.etiqueta} transform={`translate(0 ${i * alto + 4})`}>
            <title>{`${etiquetaEstatus(d.etiqueta)}: ${d.total} reporte(s)`}</title>
            <text x={izq - 8} y={20} textAnchor="end">{etiquetaEstatus(d.etiqueta)}</text>
            <rect x={izq} y={4} width={Math.max(w, 2)} height={22} rx={4} className={`relleno-${claseEstatus(d.etiqueta)}`} />
            <text x={izq + Math.max(w, 2) + 6} y={20}>{d.total}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Serie mensual en barras verticales con valor sobre cada barra. */
export function SeriePorMes({ datos }: { datos: { etiqueta: string; total: number }[] }) {
  const max = Math.max(1, ...datos.map((d) => d.total));
  const paso = 56, alto = 180, base = alto - 28;
  const ancho = Math.max(320, datos.length * paso + 20);
  const resumen = datos.map((d) => `${d.etiqueta}: ${d.total}`).join(', ');
  return (
    <svg className="grafica" role="img" aria-label={`Reportes por mes. ${resumen}.`} viewBox={`0 0 ${ancho} ${alto}`} width={ancho} height={alto}>
      <line className="eje" x1={10} y1={base} x2={ancho - 10} y2={base} />
      {datos.map((d, i) => {
        const h = Math.round(((base - 24) * d.total) / max), x = 20 + i * paso;
        return (
          <g key={d.etiqueta}>
            <title>{`${d.etiqueta}: ${d.total} reporte(s)`}</title>
            <rect x={x} y={base - h} width={36} height={Math.max(h, 1)} rx={3} className="relleno-primario" />
            <text x={x + 18} y={base - h - 6} textAnchor="middle">{d.total}</text>
            <text x={x + 18} y={base + 18} textAnchor="middle">{d.etiqueta}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Tabla alternativa para lectores de pantalla y para copiar los datos. */
function TablaAlternativa({ titulo, datos, columna }: { titulo: string; datos: { etiqueta: string; total: number }[]; columna: string }) {
  return (
    <details>
      <summary>Ver como tabla: {titulo}</summary>
      <div className="tabla-envoltura">
        <table>
          <thead><tr><th scope="col">{columna}</th><th scope="col">Reportes</th></tr></thead>
          <tbody>{datos.map((d) => <tr key={d.etiqueta}><td>{d.etiqueta}</td><td>{d.total}</td></tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

/** Formatea horas como "3 h" o "2.5 días". */
export function formatearHoras(h: number | null): string {
  if (h === null) return '—';
  return h < 48 ? `${Math.round(h * 10) / 10} h` : `${Math.round((h / 24) * 10) / 10} días`;
}

/** Texto de un conteo protegido: el número, o "menos de N" si el servidor lo ocultó. */
export function textoConteo(total: number | null, umbral: number): string {
  return total === null ? `menos de ${umbral}` : String(total);
}

/** Barras horizontales de conteos protegidos (las celdas ocultas se dibujan vacías con su leyenda). */
export function BarrasConteo({ titulo, datos, umbral, maximo = 10 }: { titulo: string; datos: ConteoProtegido[]; umbral: number; maximo?: number }) {
  const visibles = datos.slice(0, maximo);
  const max = Math.max(1, ...visibles.map((d) => d.total ?? 0));
  const alto = 34, izq = 230, ancho = 640;
  const resumen = visibles.map((d) => `${d.etiqueta}: ${textoConteo(d.total, umbral)}`).join(', ');
  return (
    <svg className="grafica" role="img" aria-label={`${titulo}. ${resumen}.`} viewBox={`0 0 ${ancho} ${visibles.length * alto + 8}`} width={ancho} height={visibles.length * alto + 8}>
      {visibles.map((d, i) => {
        const w = d.total === null ? 0 : Math.round(((ancho - izq - 110) * d.total) / max);
        return (
          <g key={d.etiqueta} transform={`translate(0 ${i * alto + 4})`}>
            <title>{`${d.etiqueta}: ${textoConteo(d.total, umbral)}`}</title>
            <text x={izq - 8} y={20} textAnchor="end">{d.etiqueta.length > 30 ? `${d.etiqueta.slice(0, 29)}…` : d.etiqueta}</text>
            <rect x={izq} y={4} width={Math.max(w, 2)} height={22} rx={4} className={d.total === null ? 'relleno-oculto' : 'relleno-primario'} />
            <text x={izq + Math.max(w, 2) + 6} y={20}>{textoConteo(d.total, umbral)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Tabla alternativa de conteos protegidos. */
function TablaProtegida({ titulo, datos, columna, umbral }: { titulo: string; datos: ConteoProtegido[]; columna: string; umbral: number }) {
  return (
    <details>
      <summary>Ver como tabla: {titulo}</summary>
      <div className="tabla-envoltura">
        <table>
          <thead><tr><th scope="col">{columna}</th><th scope="col">Total</th></tr></thead>
          <tbody>{datos.map((d) => <tr key={d.etiqueta}><td>{d.etiqueta}</td><td>{textoConteo(d.total, umbral)}</td></tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

/** Tarjeta de cifra del panel con su explicación y, si aplica, el enlace a la bandeja ya filtrada. */
function Cifra({ valor, titulo, ayuda, enlace, destacada = false, children }: {
  valor: ReactNode; titulo: string; ayuda?: string; enlace?: string; destacada?: boolean; children?: ReactNode;
}) {
  return (
    <div className={destacada ? 'tarjeta tarjeta-cifra tarjeta-alerta' : 'tarjeta tarjeta-cifra'}>
      <span className="cifra">{valor}</span>
      <p className="titulo-cifra">{titulo}</p>
      {ayuda && <p className="pequeno texto-secundario">{ayuda}</p>}
      {children}
      {enlace && <Enlace a={enlace}>Ver en la bandeja</Enlace>}
    </div>
  );
}

/** Mapa de calor cargado bajo demanda (Leaflet solo se descarga para el personal que abre el panel). */
const MapaCalorDiferido = lazy(() => import('../MapaCalor'));

/**
 * Panel para el personal y el socio formador (rediseño de la Fase 5): primero
 * lo que requiere atención (riesgo alto, pendientes, sin atender), luego los
 * tiempos reales del proceso y después las distribuciones. Todos los filtros se
 * aplican a tarjetas, gráficas, mapa y exportación.
 */
function ContenidoPanel() {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [municipio, setMunicipio] = useState<Municipio | null>(null);
  const [estatus, setEstatus] = useState('');
  const [actividad, setActividad] = useState('');
  const [dias, setDias] = useState(7);
  const [exportando, setExportando] = useState(false);
  const [errorExportar, setErrorExportar] = useState<unknown>(null);
  const municipios = useCarga(api.municipios, []);
  const catalogos = useCarga(api.catalogos, []);
  const f: FiltrosPanel = { desde: desde || undefined, hasta: hasta || undefined, municipioId: municipio?.id, estatus: estatus || undefined, actividad: actividad || undefined };
  const clave = JSON.stringify(f);
  const datos = useCarga(() => Promise.all([api.estadisticas(f), api.distribuciones(f), api.tiempos(f), api.mapaCalor(f)]), [clave]);
  // Fase 7: embudo de atención (un servidor anterior responde 404 y el panel sigue sin él).
  const embudo = useCarga(() => api.embudo(f).catch(() => null), [clave]);
  const sinAtender = useCarga(() => api.sinAtender({ ...f, dias }), [clave, dias]);
  const hayFiltros = Boolean(desde || hasta || municipio || estatus || actividad);
  const filtrosBandeja = (extra: Partial<FiltrosUrl>) => `/personal${urlDeFiltros({ ...f, orden: 'prioridad', pagina: 1, ...extra })}`;

  const exportar = async () => {
    setExportando(true); setErrorExportar(null);
    try { await descargarCsv(f); } catch (e) { setErrorExportar(e); } finally { setExportando(false); }
  };

  return (
    <>
      <h1>Panel de reportes</h1>
      <p className="texto-secundario">Solo datos agregados: no se muestran folios ni datos de los reportes. Los conteos muy pequeños se ocultan para no identificar casos.</p>
      <div className="filtros filtros-panel tarjeta" role="group" aria-label="Filtros del panel">
        <div className="campo"><label htmlFor="desde">Desde</label><input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
        <div className="campo"><label htmlFor="hasta">Hasta</label><input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
        {municipios.datos && <SelectorMunicipio etiqueta="Municipio" municipios={municipios.datos} valor={municipio} alCambiar={setMunicipio} />}
        <div className="campo">
          <label htmlFor="p-estatus">Estatus</label>
          <select id="p-estatus" value={estatus} onChange={(e) => setEstatus(e.target.value)}>
            <option value="">Todos</option>
            {ESTATUS.map((e) => <option key={e} value={e}>{etiquetaEstatus(e)}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="p-actividad">Actividad</label>
          <select id="p-actividad" value={actividad} onChange={(e) => setActividad(e.target.value)}>
            <option value="">Todas</option>
            {catalogos.datos?.actividades.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="acciones">
          {hayFiltros && (
            <button type="button" className="boton boton-secundario" onClick={() => { setDesde(''); setHasta(''); setMunicipio(null); setEstatus(''); setActividad(''); }}>Quitar filtros</button>
          )}
          <button type="button" className="boton boton-secundario" onClick={exportar} disabled={exportando}>{exportando ? 'Preparando…' : 'Exportar CSV de lo filtrado'}</button>
        </div>
        <p className="ayuda">Los filtros se aplican a todo el panel y a la exportación. El CSV no incluye descripciones ni coordenadas; requiere el permiso de exportar.</p>
      </div>
      {!!errorExportar && <MensajeError error={errorExportar} />}
      {datos.cargando && <Esqueleto filas={3} />}
      {!!datos.error && <MensajeError error={datos.error} alReintentar={datos.recargar} />}
      {datos.datos && !datos.cargando && (() => {
        const [d, dist, tiempos, calor] = datos.datos;
        if (d.total === 0) return <Vacio>No hay reportes con estos filtros.</Vacio>;
        const resumenMapa = `${calor.celdas.length} zona(s) con al menos ${calor.umbral} reportes; ${calor.ocultas} zona(s) con menos no se muestran; ${calor.sinUbicacion} reporte(s) sin punto en el mapa.`;
        const revision = textoHito(tiempos.hastaPrimeraRevision);
        const conclusion = textoHito(tiempos.hastaConclusion);
        return (
          <>
            <section aria-labelledby="t-atencion">
              <h2 id="t-atencion">Requiere atención</h2>
              <div className="tarjetas-cifras">
                <Cifra valor={d.prioridadAltaPendientes ?? '—'} titulo="Prioridad alta pendientes" destacada={(d.prioridadAltaPendientes ?? 0) > 0}
                  ayuda="Quien reportó indicó peligro inmediato." enlace={filtrosBandeja({ prioridad: 'Alta', pendientes: true })} />
                <Cifra valor={d.riesgoAltoPendientes ?? '—'} titulo="Riesgo percibido pendientes"
                  ayuda="Quien reportó percibió riesgo (prioridad media o alta)." enlace={filtrosBandeja({ riesgo: 'Sí', pendientes: true })} />
                <Cifra valor={d.pendientes} titulo="Pendientes de atender" ayuda="Registrados, en revisión o reincidentes." enlace={filtrosBandeja({ pendientes: true })} />
                <Cifra valor={sinAtender.datos?.total ?? '…'} titulo={`Sin cambios en más de ${dias} días`} ayuda="Pendientes sin ningún movimiento."
                  enlace={filtrosBandeja({ sinAtenderDias: dias })}>
                  <p className="pequeno">
                    <label htmlFor="dias-sin-atender">Días: </label>
                    <select id="dias-sin-atender" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
                      {[3, 7, 15, 30].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </p>
                </Cifra>
                <Cifra valor={d.nuevosUltimos7Dias} titulo="Nuevos en los últimos 7 días" ayuda={`${d.total} reporte(s) en total con estos filtros.`} />
              </div>
            </section>
            {embudo.datos && <SeccionEmbudo e={embudo.datos} enlaceBandeja={filtrosBandeja} />}
            {d.sinMunicipio > 0 && <p className="pequeno texto-secundario">{d.sinMunicipio} reporte(s) no indican municipio (se enviaron antes del selector de municipios).</p>}

            <section aria-labelledby="t-tiempos">
              <h2 id="t-tiempos">Tiempos reales del proceso</h2>
              <div className="tarjetas-cifras">
                <Cifra valor={revision.valor} titulo="Del alta a la primera revisión" ayuda={`Promedio. ${revision.detalle}`} />
                <Cifra valor={conclusion.valor} titulo="Del alta a la conclusión" ayuda={`Promedio. ${conclusion.detalle}`} />
              </div>
              <p className="pequeno texto-secundario">Son tiempos medidos con la bitácora, no plazos de atención. Con pocos casos se muestra “Datos insuficientes” en lugar de un promedio engañoso.</p>
            </section>

            <section className="tarjeta">
              <h2>Reportes por estatus (número de reportes)</h2>
              <BarrasPorEstatus datos={d.porEstatus} />
              <TablaAlternativa titulo="reportes por estatus" datos={d.porEstatus.map((x) => ({ ...x, etiqueta: etiquetaEstatus(x.etiqueta) }))} columna="Estatus" />
            </section>
            <div className="rejilla rejilla-2">
              <section className="tarjeta">
                <h2>Reportes por municipio</h2>
                <BarrasConteo titulo="Reportes por municipio" datos={dist.porMunicipio} umbral={dist.umbral} />
                <TablaProtegida titulo="reportes por municipio" datos={dist.porMunicipio} columna="Municipio" umbral={dist.umbral} />
              </section>
              <section className="tarjeta">
                <h2>Niñas, niños y adolescentes por grupo de edad (personas)</h2>
                <BarrasConteo titulo="Menores por grupo de edad" datos={dist.porGrupoEdad} umbral={dist.umbral} />
                <TablaProtegida titulo="menores por grupo de edad" datos={dist.porGrupoEdad} columna="Grupo de edad" umbral={dist.umbral} />
              </section>
            </div>
            <section className="tarjeta">
              <h2>Reportes por actividad observada</h2>
              <BarrasConteo titulo="Reportes por actividad" datos={dist.porActividad} umbral={dist.umbral} maximo={15} />
              <TablaProtegida titulo="reportes por actividad" datos={dist.porActividad} columna="Actividad" umbral={dist.umbral} />
            </section>
            <section className="tarjeta">
              <h2>Mapa de calor (zonas de ≈ 550 m)</h2>
              <p className="pequeno texto-secundario">{resumenMapa} El mapa no muestra ubicaciones exactas.</p>
              {calor.celdas.length === 0
                ? <Vacio>No hay zonas con suficientes reportes para mostrar.</Vacio>
                : <Suspense fallback={<Esqueleto />}><MapaCalorDiferido celdas={calor.celdas} resumen={resumenMapa} /></Suspense>}
            </section>
            <section className="tarjeta">
              <h2>Reportes recibidos por mes</h2>
              <SeriePorMes datos={d.porMes} />
              <TablaAlternativa titulo="reportes por mes" datos={d.porMes} columna="Mes" />
            </section>
            <details className="tarjeta">
              <summary><strong>Tiempo promedio en cada estatus (detalle)</strong></summary>
              <div className="tabla-envoltura">
                <table>
                  <thead><tr><th scope="col">Estatus</th><th scope="col">Tiempo promedio</th><th scope="col">Casos medidos</th></tr></thead>
                  <tbody>{tiempos.porEstatus.map((t) => (
                    <tr key={t.estatus}><td><EtiquetaEstatus estatus={t.estatus} /></td><td>{t.horasPromedio === null ? 'Datos insuficientes' : formatearHoras(t.horasPromedio)}</td><td>{t.casos}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <p className="pequeno texto-secundario">Se mide el tiempo hasta el siguiente cambio de estatus; con menos de {tiempos.umbral} casos no se calcula.</p>
            </details>
            {sinAtender.datos && sinAtender.datos.total > 0 && (
              <section className="tarjeta">
                <h2>Sin atender por municipio (más de {sinAtender.datos.dias} días)</h2>
                <TablaProtegida titulo="casos sin atender por municipio" datos={sinAtender.datos.porMunicipio} columna="Municipio" umbral={sinAtender.datos.umbral} />
              </section>
            )}
          </>
        );
      })()}
    </>
  );
}

/** Pasos del embudo con su porcentaje respecto del paso anterior (pura, probada). */
export function pasosEmbudo(e: Embudo): { titulo: string; valor: number; porcentaje: number | null; ayuda: string }[] {
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
  return [
    { titulo: 'Reportes recibidos', valor: e.recibidos, porcentaje: null, ayuda: `Sin contar ${e.duplicadosDescontados} posible(s) duplicado(s).` },
    { titulo: 'Verificados', valor: e.verificados, porcentaje: pct(e.verificados, e.recibidos), ayuda: 'Verificación “Verificado” o “Caso confirmado”.' },
    { titulo: 'Casos identificados', valor: e.casosIdentificados, porcentaje: pct(e.casosIdentificados, e.verificados), ayuda: 'Verificación “Caso confirmado”.' },
    { titulo: 'NNA canalizados', valor: e.nnaCanalizados, porcentaje: null, ayuda: `De ${e.nnaIdentificados} NNA identificados que capturó el personal.` },
  ];
}

/** Embudo de atención y controles del expediente (Fase 7). Solo conteos. */
function SeccionEmbudo({ e, enlaceBandeja }: { e: Embudo; enlaceBandeja: (extra: Partial<FiltrosUrl>) => string }) {
  return (
    <section aria-labelledby="t-embudo">
      <h2 id="t-embudo">Embudo de atención</h2>
      <ol className="embudo">
        {pasosEmbudo(e).map((p) => (
          <li key={p.titulo} className="tarjeta tarjeta-cifra">
            <span className="cifra">{p.valor}</span>
            <p className="titulo-cifra">{p.titulo}</p>
            {p.porcentaje !== null && <p className="pequeno">{p.porcentaje}% del paso anterior</p>}
            <p className="pequeno texto-secundario">{p.ayuda}</p>
          </li>
        ))}
      </ol>
      <div className="tarjetas-cifras">
        <Cifra valor={e.seguimientosVencidos} titulo="Seguimientos vencidos" destacada={e.seguimientosVencidos > 0}
          ayuda="Casos abiertos cuya fecha de seguimiento ya pasó." enlace={enlaceBandeja({ vencidos: true })} />
        <Cifra valor={e.alertasAbiertas} titulo="Alertas de punto recurrente" destacada={e.alertasAbiertas > 0} ayuda="Varios reportes cerca en poco tiempo.">
          <Enlace a="/personal/alertas">Ver alertas</Enlace>
        </Cifra>
      </div>
    </section>
  );
}

/** Página del panel. */
export function Panel() {
  return <ConSesion titulo="Panel"><ContenidoPanel /></ConSesion>;
}

/** Perfil del personal y sus permisos según la matriz (D-18). */
function ContenidoPerfil() {
  const perfil = useCarga(api.perfil, []);
  if (perfil.cargando) return <Esqueleto />;
  if (perfil.error || !perfil.datos) return <MensajeError error={perfil.error} alReintentar={perfil.recargar} />;
  const p = perfil.datos;
  return (
    <section className="tarjeta">
      <h1>Mi perfil</h1>
      <p><strong>{p.correo}</strong></p>
      <p>Perfil: <strong>{p.perfil}</strong></p>
      {p.municipios !== undefined && (
        <p>Municipios que atiendes: <strong>{p.municipios === null ? 'todos los municipios participantes' : p.municipios.length === 0 ? 'ninguno asignado (pide a la administración que te asigne)' : p.municipios.map((m) => m.nombre).join(', ')}</strong></p>
      )}
      <h2>Lo que puedes hacer</h2>
      <ul>{p.permisos.map((x) => <li key={x.permiso}>{x.descripcion}</li>)}</ul>
      <p className="pequeno texto-secundario">Los permisos de cada perfil están descritos en la matriz de roles y permisos del proyecto.</p>
    </section>
  );
}

/** Página del perfil. */
export function Perfil() {
  return <ConSesion titulo="Mi perfil"><ContenidoPerfil /></ConSesion>;
}

/** "2 de 0 a 5 años · 1 de 12 a 17 años (total 3)" (igual que la app); con servidores anteriores usa el total y el rango heredados. */
export function textoMenores(grupos: GrupoMenores[] | undefined, cantidad: number, edad: string): string {
  const lista = grupos?.length ? grupos : [{ rango: edad, cantidad }];
  const partes = lista.map((g) => (g.rango === 'Sin determinar' ? `${g.cantidad} de edad sin determinar` : `${g.cantidad} de ${g.rango.replace('-', ' a ')} años`));
  const total = lista.reduce((a, g) => a + g.cantidad, 0);
  return lista.length === 1 ? partes[0] : `${partes.join(' · ')} (total ${total})`;
}

/** Dirección en una línea, o null si el reporte no tiene dirección estructurada. */
export function textoDireccion(d: DireccionRespuesta | null | undefined): string | null {
  if (!d) return null;
  const calle = [d.calle, d.numeroExterior].filter(Boolean).join(' ');
  const partes = [calle, d.colonia && `Col. ${d.colonia}`, d.codigoPostal && `C.P. ${d.codigoPostal}`].filter(Boolean);
  return partes.length ? partes.join(', ') : null;
}
