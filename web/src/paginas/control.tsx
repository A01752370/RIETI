import { FormEvent, useEffect, useState } from 'react';
import { Alerta, api, Municipio, Parametro, PersonaPersonal } from '../api';
import { Esqueleto, MensajeError, useCarga, Vacio } from '../componentes';
import { Enlace } from '../enrutador';
import { formatearFecha } from '../estatus';
import { ConSesion } from './personal';

/**
 * Control territorial (Fase 7): alertas de punto recurrente para todo el personal y
 * administración (asignaciones, parámetros, dependencias y bitácora de accesos) solo
 * para el Administrador. El servidor valida cada permiso; la interfaz solo oculta.
 */

// ---------- Alertas ----------

/** Una alerta con su acción de atender o reabrir. */
function TarjetaAlerta({ a, alCambiar }: { a: Alerta; alCambiar: () => void }) {
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const cambiar = async (e: FormEvent, estatus: 'atendida' | 'abierta') => {
    e.preventDefault();
    setEnviando(true); setError(null);
    try { await api.atenderAlerta(a.id, estatus, comentario.trim()); alCambiar(); } catch (err) { setError(err); } finally { setEnviando(false); }
  };
  return (
    <li className={a.estatus === 'abierta' ? 'tarjeta tarjeta-alerta' : 'tarjeta'}>
      <div className="fila-titulo">
        <strong>{a.municipio ?? 'Municipio no indicado'} · {a.reportes} reportes cerca</strong>
        <span className={a.estatus === 'abierta' ? 'insignia-prioridad' : 'insignia-neutra'}>{a.estatus === 'abierta' ? 'Abierta' : 'Atendida'}</span>
      </div>
      <p className="pequeno">Punto aproximado: {a.latitud.toFixed(4)}, {a.longitud.toFixed(4)} · Detectada {formatearFecha(a.fechaCreacion)} · Última actualización {formatearFecha(a.fechaActualizacion)}</p>
      {a.relacionados.length > 0 && (
        <p className="pequeno">Reportes: {a.relacionados.map((r, i) => <span key={r.id}>{i > 0 && ', '}<Enlace a={`/personal/reportes/${r.id}`}>{r.folio}</Enlace></span>)}</p>
      )}
      {a.comentario && <p className="pequeno texto-largo">Comentario: {a.comentario}</p>}
      {a.estatus === 'abierta' ? (
        <form onSubmit={(e) => cambiar(e, 'atendida')} noValidate>
          <div className="campo">
            <label htmlFor={`alerta-${a.id}`}>Qué se hizo (obligatorio)</label>
            <input id={`alerta-${a.id}`} type="text" maxLength={500} value={comentario} onChange={(e) => setComentario(e.target.value)} />
          </div>
          <button type="submit" className="boton" disabled={enviando || !comentario.trim()}>Marcar como atendida</button>
        </form>
      ) : (
        <form onSubmit={(e) => cambiar(e, 'abierta')}><button type="submit" className="boton-texto" disabled={enviando}>Reabrir</button></form>
      )}
      {!!error && <MensajeError error={error} />}
    </li>
  );
}

function ContenidoAlertas() {
  const [estatus, setEstatus] = useState<'abierta' | 'atendida' | 'todas'>('abierta');
  const lista = useCarga(() => api.alertas(estatus), [estatus]);
  return (
    <>
      <h1>Alertas de punto recurrente</h1>
      <p className="texto-secundario">
        Se abre una alerta cuando hay varios reportes cerca en poco tiempo (los parámetros los define la administración).
        Solo ves las de tus municipios. No se envían correos ni notificaciones.
      </p>
      <div className="campo campo-corto">
        <label htmlFor="alertas-estatus">Mostrar</label>
        <select id="alertas-estatus" value={estatus} onChange={(e) => setEstatus(e.target.value as typeof estatus)}>
          <option value="abierta">Abiertas</option>
          <option value="atendida">Atendidas</option>
          <option value="todas">Todas</option>
        </select>
      </div>
      {lista.cargando && <Esqueleto filas={3} />}
      {!!lista.error && <MensajeError error={lista.error} alReintentar={lista.recargar} />}
      {lista.datos && !lista.cargando && (lista.datos.length === 0
        ? <Vacio>No hay alertas {estatus === 'abierta' ? 'abiertas' : estatus === 'atendida' ? 'atendidas' : ''}.</Vacio>
        : <ul className="lista-reportes">{lista.datos.map((a) => <TarjetaAlerta key={a.id} a={a} alCambiar={lista.recargar} />)}</ul>)}
    </>
  );
}

/** Página de alertas. */
export function Alertas() {
  return <ConSesion titulo="Alertas"><ContenidoAlertas /></ConSesion>;
}

// ---------- Administración ----------

/** Lista de municipios elegidos, editable con casillas y búsqueda (pura en estado). */
function EditorMunicipios({ persona, municipios, alGuardar }: { persona: PersonaPersonal; municipios: Municipio[]; alGuardar: (p: PersonaPersonal) => void }) {
  const [elegidos, setElegidos] = useState<Set<number>>(() => new Set(persona.municipios.map((m) => m.id)));
  const [buscar, setBuscar] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const visibles = municipios.filter((m) => elegidos.has(m.id) || (buscar.trim() && normal(m.nombre).includes(normal(buscar.trim()))));
  const alternar = (id: number) => setElegidos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const guardar = async () => {
    setEnviando(true); setError(null);
    try { alGuardar(await api.asignarMunicipios(persona.id, [...elegidos])); } catch (err) { setError(err); } finally { setEnviando(false); }
  };
  return (
    <div className="editor-municipios">
      <div className="campo">
        <label htmlFor={`buscar-mun-${persona.id}`}>Agregar municipio</label>
        <input id={`buscar-mun-${persona.id}`} type="search" value={buscar} placeholder="Escribe el nombre" onChange={(e) => setBuscar(e.target.value)} />
      </div>
      <fieldset className="grupo-opciones">
        <legend>Municipios asignados ({elegidos.size})</legend>
        {visibles.length === 0 && <p className="pequeno texto-secundario">Sin municipios: esta persona no verá ningún reporte.</p>}
        {visibles.map((m) => (
          <label key={m.id} className="opcion"><input type="checkbox" checked={elegidos.has(m.id)} onChange={() => alternar(m.id)} /><span>{m.nombre}</span></label>
        ))}
      </fieldset>
      {!!error && <MensajeError error={error} />}
      <button type="button" className="boton" onClick={guardar} disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar asignación'}</button>
    </div>
  );
}

function SeccionPersonal() {
  const personal = useCarga(api.personal, []);
  const municipios = useCarga(api.municipios, []);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState('');
  return (
    <section className="tarjeta" aria-labelledby="t-personal">
      <h2 id="t-personal">Personal y municipios</h2>
      <p className="pequeno texto-secundario">
        El Administrador y el Coordinador regional ven todos los municipios. Cada enlace municipal solo ve los que tenga asignados.
        El perfil se define con el grupo de la cuenta (ver el runbook); aquí solo se asignan municipios.
      </p>
      <p role="status" className="mensaje-guardado">{mensaje}</p>
      {(personal.cargando || municipios.cargando) && <Esqueleto filas={3} />}
      {!!personal.error && <MensajeError error={personal.error} alReintentar={personal.recargar} />}
      {personal.datos && municipios.datos && (
        <div className="tabla-envoltura">
          <table>
            <thead><tr><th scope="col">Correo</th><th scope="col">Perfil</th><th scope="col">Municipios</th><th scope="col"><span className="solo-lectores">Acciones</span></th></tr></thead>
            <tbody>
              {personal.datos.map((p) => (
                <tr key={p.id}>
                  <td>{p.correo}{!p.activo && ' (desactivada)'}</td>
                  <td>{p.perfil}</td>
                  <td>
                    {p.regional ? 'Todos' : p.municipios.length === 0 ? 'Ninguno' : p.municipios.map((m) => m.nombre).join(', ')}
                    {abierto === p.id && !p.regional && (
                      <EditorMunicipios persona={p} municipios={municipios.datos!}
                        alGuardar={() => { setAbierto(null); setMensaje(`Asignación de ${p.correo} guardada.`); personal.recargar(); }} />
                    )}
                  </td>
                  <td>{!p.regional && (
                    <button type="button" className="boton-texto" aria-expanded={abierto === p.id} onClick={() => setAbierto(abierto === p.id ? null : p.id)}>
                      {abierto === p.id ? 'Cerrar' : 'Asignar municipios'}
                    </button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Nombre legible de cada parámetro. */
const NOMBRE_PARAMETRO: Record<string, string> = {
  duplicados_radio_m: 'Radio para sugerir duplicados (metros)',
  duplicados_dias: 'Ventana para sugerir duplicados (días)',
  alerta_radio_m: 'Radio de la alerta de punto recurrente (metros)',
  alerta_dias: 'Ventana de la alerta (días)',
  alerta_minimo: 'Reportes mínimos para abrir una alerta',
  accesos_conservacion_dias: 'Conservación de la bitácora de accesos (días)',
};

function SeccionParametros() {
  const conf = useCarga(api.configuracion, []);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [mensaje, setMensaje] = useState('');
  useEffect(() => { if (conf.datos) setValores(Object.fromEntries(conf.datos.map((p) => [p.clave, String(p.valor)]))); }, [conf.datos]);
  const cambiados = (conf.datos ?? []).filter((p: Parametro) => valores[p.clave] !== undefined && Number(valores[p.clave]) !== p.valor);
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setMensaje('');
    try {
      await api.guardarConfiguracion(Object.fromEntries(cambiados.map((p) => [p.clave, Number(valores[p.clave])])));
      setMensaje('Parámetros guardados.'); conf.recargar();
    } catch (err) { setError(err); }
  };
  return (
    <section className="tarjeta" aria-labelledby="t-parametros">
      <h2 id="t-parametros">Parámetros de duplicados y alertas</h2>
      {conf.cargando && <Esqueleto filas={3} />}
      {!!conf.error && <MensajeError error={conf.error} alReintentar={conf.recargar} />}
      {conf.datos && (
        <form onSubmit={guardar} noValidate className="rejilla rejilla-2">
          {conf.datos.map((p) => (
            <div className="campo" key={p.clave}>
              <label htmlFor={`p-${p.clave}`}>{NOMBRE_PARAMETRO[p.clave] ?? p.descripcion}</label>
              <span className="ayuda" id={`ayuda-${p.clave}`}>Entre {p.minimo} y {p.maximo}.</span>
              <input id={`p-${p.clave}`} type="number" inputMode="numeric" min={p.minimo} max={p.maximo} aria-describedby={`ayuda-${p.clave}`}
                value={valores[p.clave] ?? ''} onChange={(e) => setValores((v) => ({ ...v, [p.clave]: e.target.value }))} />
            </div>
          ))}
          <div className="acciones">
            <button type="submit" className="boton" disabled={cambiados.length === 0}>Guardar parámetros</button>
            <span role="status" className="mensaje-guardado">{mensaje}</span>
          </div>
          {!!error && <MensajeError error={error} />}
        </form>
      )}
      <p className="pequeno texto-secundario">La conservación se aplica con el procedimiento del runbook (la bitácora es de solo inserción).</p>
    </section>
  );
}

function SeccionDependencias() {
  const deps = useCarga(api.dependencias, []);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<unknown>(null);
  const agregar = async (e: FormEvent) => {
    e.preventDefault(); setError(null);
    try { await api.crearDependencia(nombre.trim()); setNombre(''); deps.recargar(); } catch (err) { setError(err); }
  };
  const alternar = async (id: number, activo: boolean) => {
    setError(null);
    try { await api.editarDependencia(id, { activo }); deps.recargar(); } catch (err) { setError(err); }
  };
  return (
    <section className="tarjeta" aria-labelledby="t-dependencias">
      <h2 id="t-dependencias">Dependencias</h2>
      <p className="pequeno texto-secundario">Catálogo provisional hasta recibir el oficial del socio formador. Desactivar una dependencia la oculta del selector sin borrar los expedientes que la usan.</p>
      {deps.cargando && <Esqueleto filas={2} />}
      {deps.datos && (
        <ul className="lista-simple">
          {deps.datos.map((d) => (
            <li key={d.id}>
              <span className={d.activo ? '' : 'texto-secundario'}>{d.nombre}{!d.activo && ' (inactiva)'}</span>
              <button type="button" className="boton-texto" onClick={() => alternar(d.id, !d.activo)}>{d.activo ? 'Desactivar' : 'Activar'}</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={agregar} noValidate className="fila-busqueda">
        <label htmlFor="nueva-dependencia" className="solo-lectores">Nueva dependencia</label>
        <input id="nueva-dependencia" type="text" maxLength={120} placeholder="Nueva dependencia" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <button type="submit" className="boton boton-secundario" disabled={!nombre.trim()}>Agregar</button>
      </form>
      {!!error && <MensajeError error={error} />}
    </section>
  );
}

function SeccionAccesos() {
  const [folio, setFolio] = useState('');
  const [filtro, setFiltro] = useState<{ folio?: string; pagina: number }>({ pagina: 1 });
  const accesos = useCarga(() => api.accesos(filtro), [JSON.stringify(filtro)]);
  const paginas = accesos.datos ? Math.max(1, Math.ceil(accesos.datos.total / accesos.datos.tamano)) : 1;
  return (
    <section className="tarjeta" aria-labelledby="t-accesos">
      <h2 id="t-accesos">Bitácora de accesos</h2>
      <p className="pequeno texto-secundario">Quién abrió qué expediente o exportó la bandeja, y cuándo. Es de solo lectura: nadie puede modificarla desde el sistema.</p>
      <form className="fila-busqueda" role="search" onSubmit={(e) => { e.preventDefault(); setFiltro({ folio: folio.trim().toUpperCase() || undefined, pagina: 1 }); }}>
        <label htmlFor="accesos-folio" className="solo-lectores">Folio</label>
        <input id="accesos-folio" type="search" maxLength={30} placeholder="Folio completo" value={folio} onChange={(e) => setFolio(e.target.value)} />
        <button type="submit" className="boton boton-secundario">Filtrar</button>
      </form>
      {accesos.cargando && <Esqueleto filas={3} />}
      {!!accesos.error && <MensajeError error={accesos.error} alReintentar={accesos.recargar} />}
      {accesos.datos && !accesos.cargando && (accesos.datos.elementos.length === 0 ? <Vacio>Sin accesos registrados.</Vacio> : (
        <div className="tabla-envoltura">
          <table>
            <thead><tr><th scope="col">Fecha</th><th scope="col">Persona</th><th scope="col">Acción</th><th scope="col">Folio</th><th scope="col">Detalle</th></tr></thead>
            <tbody>{accesos.datos.elementos.map((a) => (
              <tr key={a.id}><td>{formatearFecha(a.fecha)}</td><td>{a.usuario}</td><td>{a.accion === 'ver' ? 'Consultó' : a.accion === 'exportar' ? 'Exportó' : 'Vio foto'}</td><td>{a.folio ?? '—'}</td><td>{a.detalle ?? ''}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ))}
      {paginas > 1 && (
        <nav className="paginacion" aria-label="Páginas de la bitácora de accesos">
          <button type="button" className="boton boton-secundario" disabled={filtro.pagina <= 1} onClick={() => setFiltro((f) => ({ ...f, pagina: f.pagina - 1 }))}>Anterior</button>
          <span>Página {filtro.pagina} de {paginas}</span>
          <button type="button" className="boton boton-secundario" disabled={filtro.pagina >= paginas} onClick={() => setFiltro((f) => ({ ...f, pagina: f.pagina + 1 }))}>Siguiente</button>
        </nav>
      )}
    </section>
  );
}

function ContenidoAdministracion() {
  return (
    <>
      <h1>Administración</h1>
      <SeccionPersonal />
      <SeccionParametros />
      <SeccionDependencias />
      <SeccionAccesos />
    </>
  );
}

/** Página de administración (solo Administrador; el servidor responde 403 a cualquier otro perfil). */
export function Administracion() {
  return <ConSesion titulo="Administración"><ContenidoAdministracion /></ConSesion>;
}
