import { FormEvent, ReactNode, useState } from 'react';
import { api, fijarSesion, Municipio, ReporteDetalle } from '../api';
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

/** Bandeja con filtros por estatus y municipio. */
function ContenidoBandeja() {
  const [estatus, setEstatus] = useState('');
  const [municipio, setMunicipio] = useState<Municipio | null>(null);
  const municipios = useCarga(api.municipios, []);
  const lista = useCarga(() => api.reportes({ estatus: estatus || undefined, municipioId: municipio?.id }), [estatus, municipio?.id]);

  return (
    <>
      <h1>Bandeja de reportes</h1>
      <div className="filtros tarjeta">
        <div className="campo">
          <label htmlFor="filtro-estatus">Estatus</label>
          <select id="filtro-estatus" value={estatus} onChange={(e) => setEstatus(e.target.value)}>
            <option value="">Todos</option>
            {ESTATUS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        {municipios.datos && (
          <SelectorMunicipio etiqueta="Municipio" municipios={municipios.datos} valor={municipio} alCambiar={setMunicipio} />
        )}
        {municipio && <button type="button" className="boton boton-secundario" onClick={() => setMunicipio(null)}>Quitar filtro de municipio</button>}
      </div>
      {lista.cargando && <Esqueleto filas={4} />}
      {!!lista.error && <MensajeError error={lista.error} alReintentar={lista.recargar} />}
      {lista.datos && !lista.cargando && (
        lista.datos.elementos.length === 0
          ? <Vacio>No hay reportes con estos filtros.</Vacio>
          : (
            <>
              <p className="texto-secundario" role="status">{lista.datos.total} reporte(s){lista.datos.total > lista.datos.elementos.length ? `, se muestran los ${lista.datos.elementos.length} más recientes` : ''}.</p>
              <ul className="lista-reportes">
                {lista.datos.elementos.map((r) => (
                  <li key={r.id}>
                    <Enlace a={`/personal/reportes/${r.id}`}>
                      <div className="tarjeta">
                        <div className="fila-titulo"><strong>{r.folio}</strong><EtiquetaEstatus estatus={r.estatus} /></div>
                        <span>{r.municipio ?? 'Municipio no indicado'} · {r.ubicacion}</span>
                        <span className="pequeno texto-secundario">{r.actividad} · {r.cantidadNinos} menor(es) de {r.edadAproximada} años · Riesgo: {r.situacionRiesgo} · {formatearFecha(r.fechaCreacion)}</span>
                      </div>
                    </Enlace>
                  </li>
                ))}
              </ul>
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
            <dt>Lugar</dt><dd>{r.ubicacion}</dd>
            {r.latitud !== null && r.longitud !== null && (<><dt>Coordenadas</dt><dd>{r.latitud.toFixed(5)}, {r.longitud.toFixed(5)}</dd></>)}
            <dt>Actividad</dt><dd>{r.actividad}</dd>
            <dt>Menores</dt><dd>{r.cantidadNinos} de {r.edadAproximada} años</dd>
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

function ContenidoPanel() {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [municipio, setMunicipio] = useState<Municipio | null>(null);
  const municipios = useCarga(api.municipios, []);
  const datos = useCarga(
    () => api.estadisticas({ desde: desde || undefined, hasta: hasta || undefined, municipioId: municipio?.id }),
    [desde, hasta, municipio?.id],
  );
  const d = datos.datos;
  return (
    <>
      <h1>Panel de reportes</h1>
      <p className="texto-secundario">Solo datos agregados: no se muestran folios ni datos de los reportes.</p>
      <div className="filtros tarjeta">
        <div className="campo"><label htmlFor="desde">Desde</label><input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
        <div className="campo"><label htmlFor="hasta">Hasta</label><input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
        {municipios.datos && <SelectorMunicipio etiqueta="Municipio" municipios={municipios.datos} valor={municipio} alCambiar={setMunicipio} />}
        {(desde || hasta || municipio) && (
          <button type="button" className="boton boton-secundario" onClick={() => { setDesde(''); setHasta(''); setMunicipio(null); }}>Quitar filtros</button>
        )}
      </div>
      {datos.cargando && <Esqueleto filas={3} />}
      {!!datos.error && <MensajeError error={datos.error} alReintentar={datos.recargar} />}
      {d && !datos.cargando && (
        d.total === 0
          ? <Vacio>No hay reportes con estos filtros.</Vacio>
          : (
            <>
              <div className="tarjetas-cifras">
                <div className="tarjeta"><span className="cifra">{d.total}</span><p>Reportes en total</p></div>
                <div className="tarjeta"><span className="cifra">{d.nuevosUltimos7Dias}</span><p>Nuevos en los últimos 7 días</p></div>
                {d.porEstatus.filter((e) => e.total > 0).slice(0, 2).map((e) => (
                  <div key={e.etiqueta} className="tarjeta"><span className="cifra">{e.total}</span><p><EtiquetaEstatus estatus={e.etiqueta} /></p></div>
                ))}
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
            </>
          )
      )}
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
