import { FormEvent, lazy, ReactNode, Suspense, useState } from 'react';
import { api, fijarSesion, Municipio, ReporteDetalle, DireccionRespuesta, GrupoMenores, ConteoProtegido, descargarCsv, FiltrosBandeja, FiltrosPanel } from '../api';
import { Esqueleto, Marco, MensajeError, useCarga, useSesion, Vacio } from '../componentes';
import { Enlace, useTitulo } from '../enrutador';
import { claseEstatus, ESTATUS, EtiquetaEstatus, formatearFecha } from '../estatus';
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
      fijarSesion({ token: r.accessToken, correo: r.correo });
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
function ConSesion({ titulo, children }: { titulo: string; children: ReactNode }) {
  useTitulo(titulo);
  const sesion = useSesion();
  return <Marco personal>{sesion ? children : <Acceso />}</Marco>;
}

/** Filtros iniciales desde la URL (p. ej. el panel enlaza a `?sinAtenderDias=7`). */
function filtrosDeUrl(): { estatus: string; sinAtenderDias: string } {
  const q = new URLSearchParams(window.location.search);
  return { estatus: q.get('estatus') ?? '', sinAtenderDias: q.get('sinAtenderDias') ?? '' };
}

/** Bandeja con filtros, búsqueda por folio, orden, paginación y exportación CSV (Fase 3). */
function ContenidoBandeja() {
  const inicial = filtrosDeUrl();
  const [estatus, setEstatus] = useState(inicial.estatus);
  const [municipio, setMunicipio] = useState<Municipio | null>(null);
  const [actividad, setActividad] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [folioTexto, setFolioTexto] = useState('');
  const [folio, setFolio] = useState('');
  const [sinAtenderDias, setSinAtenderDias] = useState(inicial.sinAtenderDias);
  const [orden, setOrden] = useState<'recientes' | 'antiguos'>('recientes');
  const [pagina, setPagina] = useState(1);
  const [exportando, setExportando] = useState(false);
  const [errorExportar, setErrorExportar] = useState<unknown>(null);
  const municipios = useCarga(api.municipios, []);
  const catalogos = useCarga(api.catalogos, []);

  const filtros: FiltrosBandeja = {
    estatus: estatus || undefined, municipioId: municipio?.id, actividad: actividad || undefined,
    desde: desde || undefined, hasta: hasta || undefined, folio: folio || undefined,
    sinAtenderDias: sinAtenderDias ? Number(sinAtenderDias) : undefined, orden,
  };
  const clave = JSON.stringify(filtros);
  const lista = useCarga(() => api.reportes({ ...filtros, pagina }), [clave, pagina]);
  /** Cualquier cambio de filtro regresa a la primera página. */
  const conFiltro = <T,>(fijar: (v: T) => void) => (v: T) => { fijar(v); setPagina(1); };
  const hayFiltros = Boolean(estatus || municipio || actividad || desde || hasta || folio || sinAtenderDias);

  const exportar = async () => {
    setExportando(true); setErrorExportar(null);
    try { await descargarCsv(filtros); } catch (e) { setErrorExportar(e); } finally { setExportando(false); }
  };

  const paginas = lista.datos ? Math.max(1, Math.ceil(lista.datos.total / lista.datos.tamano)) : 1;
  return (
    <>
      <h1>Bandeja de reportes</h1>
      <form className="filtros tarjeta" role="search" aria-label="Filtros de la bandeja"
        onSubmit={(e) => { e.preventDefault(); setFolio(folioTexto.trim()); setPagina(1); }}>
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
          <select id="filtro-estatus" value={estatus} onChange={(e) => conFiltro(setEstatus)(e.target.value)}>
            <option value="">Todos</option>
            {ESTATUS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="filtro-actividad">Actividad</label>
          <select id="filtro-actividad" value={actividad} onChange={(e) => conFiltro(setActividad)(e.target.value)}>
            <option value="">Todas</option>
            {catalogos.datos?.actividades.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {municipios.datos && (
          <SelectorMunicipio etiqueta="Municipio" municipios={municipios.datos} valor={municipio} alCambiar={conFiltro(setMunicipio)} />
        )}
        <div className="campo"><label htmlFor="b-desde">Desde</label><input id="b-desde" type="date" value={desde} onChange={(e) => conFiltro(setDesde)(e.target.value)} /></div>
        <div className="campo"><label htmlFor="b-hasta">Hasta</label><input id="b-hasta" type="date" value={hasta} onChange={(e) => conFiltro(setHasta)(e.target.value)} /></div>
        <div className="campo">
          <label htmlFor="filtro-sin-atender">Sin atender</label>
          <select id="filtro-sin-atender" value={sinAtenderDias} onChange={(e) => conFiltro(setSinAtenderDias)(e.target.value)}>
            <option value="">Todos</option>
            <option value="7">Más de 7 días</option>
            <option value="15">Más de 15 días</option>
            <option value="30">Más de 30 días</option>
          </select>
        </div>
        <div className="campo">
          <label htmlFor="orden">Orden</label>
          <select id="orden" value={orden} onChange={(e) => conFiltro(setOrden)(e.target.value as 'recientes' | 'antiguos')}>
            <option value="recientes">Más recientes primero</option>
            <option value="antiguos">Más antiguos primero</option>
          </select>
        </div>
        <div className="acciones">
          {hayFiltros && (
            <button type="button" className="boton boton-secundario" onClick={() => {
              setEstatus(''); setMunicipio(null); setActividad(''); setDesde(''); setHasta(''); setFolio(''); setFolioTexto(''); setSinAtenderDias(''); setPagina(1);
            }}>Quitar filtros</button>
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
                      </div>
                    </Enlace>
                  </li>
                ))}
              </ul>
              {paginas > 1 && (
                <nav className="paginacion" aria-label="Páginas de la bandeja">
                  <button type="button" className="boton boton-secundario" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
                  <span>Página {pagina} de {paginas}</span>
                  <button type="button" className="boton boton-secundario" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>Siguiente</button>
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

/** Cambio de estatus (solo opciones válidas que manda el servidor) y notas. */
function Seguimiento({ r, alGuardar }: { r: ReporteDetalle; alGuardar: (d: ReporteDetalle) => void }) {
  const [destino, setDestino] = useState('');
  const [comentario, setComentario] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true); setError(null); setMensaje('');
    try {
      const d = destino ? await api.cambiarEstatus(r.id, destino, comentario, motivo) : await api.agregarNota(r.id, comentario);
      alGuardar(d);
      setMensaje(destino ? `Estatus cambiado a ${destino}.` : 'Nota agregada.');
      setDestino(''); setComentario(''); setMotivo('');
    } catch (err) { setError(err); } finally { setEnviando(false); }
  };

  return (
    <form onSubmit={guardar} className="tarjeta" noValidate>
      <h2>Seguimiento</h2>
      {r.transicionesPermitidas.length === 0
        ? <p>Este caso está en un estatus final y ya no puede cambiar.</p>
        : (
          <div className="campo">
            <label htmlFor="destino">Cambiar estatus a</label>
            <select id="destino" value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="">Sin cambio (solo agregar nota)</option>
              {r.transicionesPermitidas.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <span className="ayuda">Solo aparecen los cambios permitidos desde “{r.estatus}”.</span>
          </div>
        )}
      {destino === 'Descartado' && (
        <div className="campo">
          <label htmlFor="motivo">Motivo del descarte (obligatorio)</label>
          <input id="motivo" type="text" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
      )}
      <div className="campo">
        <label htmlFor="comentario">{destino ? 'Comentario del cambio' : 'Nota de seguimiento'}</label>
        <textarea id="comentario" maxLength={2000} value={comentario} onChange={(e) => setComentario(e.target.value)} />
      </div>
      {!!error && <MensajeError error={error} />}
      <p role="status" aria-live="polite">{mensaje}</p>
      <button type="submit" className="boton" disabled={enviando || (!destino && !comentario.trim()) || (destino === 'Descartado' && !motivo.trim())}>
        {enviando ? 'Guardando…' : destino ? `Cambiar a “${destino}”` : 'Agregar nota'}
      </button>
    </form>
  );
}

/** Detalle de un reporte. */
function ContenidoDetalle({ id }: { id: number }) {
  const detalle = useCarga(() => api.detalle(id), [id]);
  const [actual, setActual] = useState<ReporteDetalle | null>(null);
  const r = actual ?? detalle.datos;
  if (detalle.cargando && !r) return <Esqueleto filas={5} />;
  if (detalle.error || !r) return <MensajeError error={detalle.error} alReintentar={detalle.recargar} />;
  return (
    <>
      <p><Enlace a="/personal">← Volver a la bandeja</Enlace></p>
      <div className="fila-titulo"><h1>{r.folio}</h1><EtiquetaEstatus estatus={r.estatus} /></div>
      <div className="rejilla rejilla-2">
        <section className="tarjeta">
          <h2>Datos del reporte</h2>
          <dl>
            <dt>Registrado</dt><dd>{formatearFecha(r.fechaCreacion)}</dd>
            <dt>Municipio</dt><dd>{r.municipio ?? 'No indicado'}</dd>
            {textoDireccion(r.direccion) ? (
              <>
                <dt>Dirección</dt><dd>{textoDireccion(r.direccion)}</dd>
                {r.direccion?.referencias && (<><dt>Referencias</dt><dd>{r.direccion.referencias}</dd></>)}
              </>
            ) : (<><dt>Lugar</dt><dd>{r.ubicacion}</dd></>)}
            {r.latitud !== null && r.longitud !== null && (<><dt>Coordenadas</dt><dd>{r.latitud.toFixed(5)}, {r.longitud.toFixed(5)}</dd></>)}
            <dt>Actividad</dt><dd>{r.actividadOtro ? `${r.actividad}: ${r.actividadOtro}` : r.actividad}</dd>
            <dt>Menores</dt><dd>{textoMenores(r.grupos, r.cantidadNinos, r.edadAproximada)}</dd>
            <dt>¿Riesgo percibido?</dt><dd>{r.situacionRiesgo}</dd>
            <dt>Descripción</dt><dd>{r.descripcion}</dd>
            {r.motivoDescarte && (<><dt>Motivo de descarte</dt><dd>{r.motivoDescarte}</dd></>)}
          </dl>
        </section>
        <Seguimiento r={r} alGuardar={setActual} />
      </div>
      <section>
        <h2>Bitácora</h2>
        <ol className="proceso">
          {[...r.historial].reverse().map((h, i) => (
            <li key={i}>
              <EtiquetaEstatus estatus={h.estatus} />
              <div>
                <span className="pequeno">{formatearFecha(h.fecha)} · {h.autor ?? 'Registro automático'}</span>
                {h.comentario && <p>{h.comentario}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>
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
  const resumen = datos.map((d) => `${d.etiqueta}: ${d.total}`).join(', ');
  return (
    <svg className="grafica" role="img" aria-label={`Reportes por estatus. ${resumen}.`} viewBox={`0 0 ${ancho} ${datos.length * alto + 8}`} width={ancho} height={datos.length * alto + 8}>
      {datos.map((d, i) => {
        const w = Math.round(((ancho - izq - 60) * d.total) / max);
        return (
          <g key={d.etiqueta} transform={`translate(0 ${i * alto + 4})`}>
            <title>{`${d.etiqueta}: ${d.total} reporte(s)`}</title>
            <text x={izq - 8} y={20} textAnchor="end">{d.etiqueta}</text>
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

/** Mapa de calor cargado bajo demanda (Leaflet solo se descarga para el personal que abre el panel). */
const MapaCalorDiferido = lazy(() => import('../MapaCalor'));

function ContenidoPanel() {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [municipio, setMunicipio] = useState<Municipio | null>(null);
  const [estatus, setEstatus] = useState('');
  const [actividad, setActividad] = useState('');
  const [dias, setDias] = useState(7);
  const municipios = useCarga(api.municipios, []);
  const catalogos = useCarga(api.catalogos, []);
  const f: FiltrosPanel = { desde: desde || undefined, hasta: hasta || undefined, municipioId: municipio?.id, estatus: estatus || undefined, actividad: actividad || undefined };
  const clave = JSON.stringify(f);
  const datos = useCarga(() => Promise.all([api.estadisticas(f), api.distribuciones(f), api.tiempos(f), api.mapaCalor(f)]), [clave]);
  const sinAtender = useCarga(() => api.sinAtender({ ...f, dias }), [clave, dias]);
  const hayFiltros = Boolean(desde || hasta || municipio || estatus || actividad);

  return (
    <>
      <h1>Panel de reportes</h1>
      <p className="texto-secundario">Solo datos agregados: no se muestran folios ni datos de los reportes. Los conteos muy pequeños se ocultan para no identificar casos.</p>
      <div className="filtros tarjeta">
        <div className="campo"><label htmlFor="desde">Desde</label><input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
        <div className="campo"><label htmlFor="hasta">Hasta</label><input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
        {municipios.datos && <SelectorMunicipio etiqueta="Municipio" municipios={municipios.datos} valor={municipio} alCambiar={setMunicipio} />}
        <div className="campo">
          <label htmlFor="p-estatus">Estatus</label>
          <select id="p-estatus" value={estatus} onChange={(e) => setEstatus(e.target.value)}>
            <option value="">Todos</option>
            {ESTATUS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="p-actividad">Actividad</label>
          <select id="p-actividad" value={actividad} onChange={(e) => setActividad(e.target.value)}>
            <option value="">Todas</option>
            {catalogos.datos?.actividades.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {hayFiltros && (
          <button type="button" className="boton boton-secundario" onClick={() => { setDesde(''); setHasta(''); setMunicipio(null); setEstatus(''); setActividad(''); }}>Quitar filtros</button>
        )}
      </div>
      {datos.cargando && <Esqueleto filas={3} />}
      {!!datos.error && <MensajeError error={datos.error} alReintentar={datos.recargar} />}
      {datos.datos && !datos.cargando && (() => {
        const [d, dist, tiempos, calor] = datos.datos;
        if (d.total === 0) return <Vacio>No hay reportes con estos filtros.</Vacio>;
        const resumenMapa = `${calor.celdas.length} zona(s) con al menos ${calor.umbral} reportes; ${calor.ocultas} zona(s) con menos no se muestran; ${calor.sinUbicacion} reporte(s) sin punto en el mapa.`;
        return (
          <>
            <div className="tarjetas-cifras">
              <div className="tarjeta"><span className="cifra">{d.total}</span><p>Reportes en total</p></div>
              <div className="tarjeta"><span className="cifra">{d.nuevosUltimos7Dias}</span><p>Nuevos en los últimos 7 días</p></div>
              <div className="tarjeta"><span className="cifra">{d.pendientes}</span><p>Pendientes de atender (Recibido o En revisión)</p></div>
              <div className="tarjeta">
                <span className="cifra">{sinAtender.datos?.total ?? '…'}</span>
                <p>
                  <label htmlFor="dias-sin-atender">Sin cambios en más de </label>
                  <select id="dias-sin-atender" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
                    {[3, 7, 15, 30].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select> días
                </p>
                <Enlace a={`/personal/reportes?sinAtenderDias=${dias}`}>Ver en la bandeja</Enlace>
              </div>
            </div>
            {d.sinMunicipio > 0 && <p className="pequeno texto-secundario">{d.sinMunicipio} reporte(s) no indican municipio (se enviaron antes del selector de municipios).</p>}
            <section className="tarjeta">
              <h2>Por estatus, en el orden del proceso</h2>
              <BarrasPorEstatus datos={d.porEstatus} />
              <TablaAlternativa titulo="reportes por estatus" datos={d.porEstatus} columna="Estatus" />
            </section>
            <section className="tarjeta">
              <h2>Por mes</h2>
              <SeriePorMes datos={d.porMes} />
              <TablaAlternativa titulo="reportes por mes" datos={d.porMes} columna="Mes" />
            </section>
            <section className="tarjeta">
              <h2>Mapa de calor</h2>
              <p className="pequeno texto-secundario">{resumenMapa} Cada zona mide unos 550 m; el mapa no muestra ubicaciones exactas.</p>
              {calor.celdas.length === 0
                ? <Vacio>No hay zonas con suficientes reportes para mostrar.</Vacio>
                : <Suspense fallback={<Esqueleto />}><MapaCalorDiferido celdas={calor.celdas} resumen={resumenMapa} /></Suspense>}
            </section>
            <section className="tarjeta">
              <h2>Por municipio</h2>
              <BarrasConteo titulo="Reportes por municipio" datos={dist.porMunicipio} umbral={dist.umbral} />
              <TablaProtegida titulo="reportes por municipio" datos={dist.porMunicipio} columna="Municipio" umbral={dist.umbral} />
            </section>
            <section className="tarjeta">
              <h2>Por actividad</h2>
              <BarrasConteo titulo="Reportes por actividad" datos={dist.porActividad} umbral={dist.umbral} maximo={15} />
              <TablaProtegida titulo="reportes por actividad" datos={dist.porActividad} columna="Actividad" umbral={dist.umbral} />
            </section>
            <section className="tarjeta">
              <h2>Niñas, niños y adolescentes por grupo de edad</h2>
              <BarrasConteo titulo="Menores por grupo de edad" datos={dist.porGrupoEdad} umbral={dist.umbral} />
              <TablaProtegida titulo="menores por grupo de edad" datos={dist.porGrupoEdad} columna="Grupo de edad" umbral={dist.umbral} />
            </section>
            <section className="tarjeta">
              <h2>Tiempo promedio en cada estatus</h2>
              <div className="tabla-envoltura">
                <table>
                  <thead><tr><th scope="col">Estatus</th><th scope="col">Tiempo promedio</th><th scope="col">Casos medidos</th></tr></thead>
                  <tbody>{tiempos.porEstatus.map((t) => (
                    <tr key={t.estatus}><td><EtiquetaEstatus estatus={t.estatus} /></td><td>{formatearHoras(t.horasPromedio)}</td><td>{t.casos}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <p className="pequeno texto-secundario">Se mide el tiempo hasta el siguiente cambio de estatus; con menos de {tiempos.umbral} casos no se calcula.</p>
            </section>
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
