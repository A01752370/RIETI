import { FormEvent, useState } from 'react';
import { api, ConsultaPublica, ErrorApi } from '../api';
import { ALT, Esqueleto, LOGOS, Marco, MensajeError, useCarga, Vacio } from '../componentes';
import { Enlace, useTitulo } from '../enrutador';
import { ESTATUS, EtiquetaEstatus, formatearFecha, SIGNIFICADO } from '../estatus';

/** Inicio: qué es RIETI y las dos acciones principales. */
export function Inicio() {
  useTitulo('Inicio');
  return (
    <Marco>
      <section className="heroe" aria-labelledby="titulo-inicio">
        <h1 id="titulo-inicio">Reporta posibles situaciones de trabajo infantil</h1>
        <p>
          Si viste a niñas, niños o adolescentes trabajando en la Ruta Intermunicipal, puedes avisar de forma anónima.
          Al terminar recibirás un folio y una clave para consultar qué pasó con tu reporte.
        </p>
        <div className="acciones">
          <Enlace a="/reportar" className="boton">Reportar una situación</Enlace>
          <Enlace a="/seguimiento" className="boton boton-secundario">Consultar mi reporte</Enlace>
        </div>
      </section>

      <div className="rejilla rejilla-3">
        <section className="tarjeta tarjeta-tinte">
          <h2>Es anónimo</h2>
          <p>No pedimos tu nombre ni tus datos. No escribas nombres, CURP ni domicilios de las niñas, niños o adolescentes.</p>
        </section>
        <section className="tarjeta tarjeta-tinte">
          <h2>Puedes darle seguimiento</h2>
          <p>Con tu folio y tu clave puedes ver en qué etapa va tu reporte. <Enlace a="/como-funciona">Así funciona el proceso</Enlace>.</p>
        </section>
        <section className="tarjeta tarjeta-acento">
          <h2>¿Hay peligro inmediato?</h2>
          <p>No esperes: llama al <a href="tel:911">911</a>. Para denuncia anónima, al <a href="tel:089">089</a>.</p>
        </section>
      </div>

      <section className="tarjeta" aria-labelledby="titulo-quien">
        <h2 id="titulo-quien">¿Quién recibe tu reporte?</h2>
        <img className="logo logo-sipinna-grande" src={LOGOS.sipinna.src} width={LOGOS.sipinna.ancho} height={LOGOS.sipinna.alto} alt={ALT.sipinna} />
        <p>
          Los reportes los recibe y les da seguimiento el Sistema Municipal de Protección Integral de Niñas, Niños y
          Adolescentes (SIPINNA) de Atizapán de Zaragoza.
        </p>
      </section>
    </Marco>
  );
}

/** "¿Cómo funciona?": qué pasa después de enviar un reporte, sin prometer tiempos. */
export function ComoFunciona() {
  useTitulo('¿Cómo funciona?');
  return (
    <Marco>
      <h1>¿Cómo funciona?</h1>
      <ol className="proceso pequeno-espacio">
        <li><strong>1.</strong><div><h2>Envías tu reporte</h2><p>Lees el aviso de privacidad, eliges el municipio y describes lo que viste. No necesitas cuenta.</p></div></li>
        <li><strong>2.</strong><div><h2>Recibes un folio y una clave</h2><p>Guárdalos: la clave no se puede recuperar porque no guardamos ningún dato tuyo.</p></div></li>
        <li><strong>3.</strong><div><h2>El personal le da seguimiento</h2><p>Tu reporte pasa por las etapas de abajo. Cada caso es distinto, así que no hay un tiempo fijo para cada una.</p></div></li>
        <li><strong>4.</strong><div><h2>Consultas cuando quieras</h2><p>En <Enlace a="/seguimiento">Seguimiento</Enlace> ves la etapa actual y cuándo cambió. Por tu seguridad y la de las niñas y niños, no se muestran detalles del caso.</p></div></li>
      </ol>

      <h2>Etapas de un reporte</h2>
      <ul className="proceso">
        {ESTATUS.map((e) => (
          <li key={e}><EtiquetaEstatus estatus={e} /><p>{SIGNIFICADO[e]}</p></li>
        ))}
      </ul>
      <p className="texto-secundario">
        El orden normal es Recibido → En revisión → En atención → Canalizado → Concluido. Un reporte puede terminar como
        Descartado si, después de revisarlo, no puede atenderse.
      </p>
      <div className="acciones"><Enlace a="/reportar" className="boton">Reportar una situación</Enlace></div>
    </Marco>
  );
}

/** Aviso de privacidad vigente, con su versión. */
export function AvisoPrivacidad() {
  useTitulo('Aviso de privacidad');
  const aviso = useCarga(api.aviso, []);
  return (
    <Marco>
      <h1>Aviso de privacidad</h1>
      {aviso.cargando && <Esqueleto />}
      {!!aviso.error && <MensajeError error={aviso.error} alReintentar={aviso.recargar} />}
      {aviso.datos && (
        <>
          {aviso.datos.parrafos.map((p) => <p key={p}>{p}</p>)}
          <p className="texto-secundario pequeno">Versión {aviso.datos.version}</p>
        </>
      )}
    </Marco>
  );
}

/** "Seguimiento de caso": consulta por POST con folio + clave. */
export function Seguimiento() {
  useTitulo('Seguimiento de caso');
  const [folio, setFolio] = useState('');
  const [clave, setClave] = useState('');
  const [resultado, setResultado] = useState<ConsultaPublica | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const [errorFolio, setErrorFolio] = useState('');

  const consultar = async (e: FormEvent) => {
    e.preventDefault();
    const f = folio.trim().toUpperCase().replace(/\s+/g, '');
    if (!/^RIETI-\d{4}-\d{6}$/.test(f)) { setErrorFolio('Escribe el folio completo, por ejemplo RIETI-2026-000123.'); return; }
    setErrorFolio('');
    setEnviando(true); setError(null); setResultado(null);
    try { setResultado(await api.consultar(f, clave)); } catch (err) { setError(err); } finally { setEnviando(false); }
  };

  return (
    <Marco>
      <h1>Seguimiento de caso</h1>
      <p>Escribe el folio y la clave que recibiste al enviar tu reporte.</p>
      <form onSubmit={consultar} noValidate className="tarjeta">
        <div className="campo">
          <label htmlFor="folio">Folio</label>
          <input id="folio" type="text" autoComplete="off" inputMode="text" placeholder="RIETI-2026-000123" value={folio}
            onChange={(e) => setFolio(e.target.value)} aria-invalid={errorFolio ? true : undefined}
            aria-describedby={errorFolio ? 'error-folio' : undefined} required />
          {errorFolio && <span id="error-folio" className="error-campo">{errorFolio}</span>}
        </div>
        <div className="campo">
          <label htmlFor="clave">Clave de consulta</label>
          <input id="clave" type="text" autoComplete="off" placeholder="XXXX-XXXX-XXXX" value={clave}
            onChange={(e) => setClave(e.target.value)} required />
          <span className="ayuda">Puedes escribirla en minúsculas o sin guiones.</span>
        </div>
        <button className="boton" type="submit" disabled={enviando || !folio || !clave}>{enviando ? 'Consultando…' : 'Consultar'}</button>
      </form>

      {!!error && (
        <MensajeError error={error} />
      )}
      {error instanceof ErrorApi && error.codigo === 'FOLIO_O_CLAVE_INCORRECTOS' && (
        <p className="texto-secundario pequeno">Revisa que el folio y la clave estén completos. Después de 5 intentos fallidos el folio se bloquea 15 minutos.</p>
      )}
      {resultado && (
        <section className="tarjeta tarjeta-tinte" aria-live="polite">
          <h2>{resultado.folio}</h2>
          <p>Estado actual: <EtiquetaEstatus estatus={resultado.estatus} /></p>
          <p>{SIGNIFICADO[resultado.estatus]}</p>
          <p className="pequeno">Registrado el {formatearFecha(resultado.fechaCreacion)}.</p>
          <h3>Historial</h3>
          <ol className="proceso">
            {resultado.historial.map((h, i) => (
              <li key={i}><EtiquetaEstatus estatus={h.estatus} /><span>{formatearFecha(h.fecha)}</span></li>
            ))}
          </ol>
        </section>
      )}
    </Marco>
  );
}

/** Directorio de la red de municipios (D-17). */
export function RedDeMunicipios() {
  useTitulo('Red de municipios');
  const red = useCarga(api.red, []);
  return (
    <Marco>
      <h1>Red de municipios</h1>
      <p>Contactos institucionales de los municipios que integran la red.</p>
      {red.datos?.hayDatosDeEjemplo && (
        <div className="aviso aviso-atencion" role="note">
          <strong>Datos de ejemplo: los contactos oficiales serán proporcionados por la institución.</strong>
        </div>
      )}
      {red.cargando && <Esqueleto />}
      {!!red.error && <MensajeError error={red.error} alReintentar={red.recargar} />}
      {red.datos && red.datos.municipios.length === 0 && <Vacio>Todavía no hay municipios con contactos registrados.</Vacio>}
      {red.datos && red.datos.municipios.length > 0 && (
        <div className="rejilla rejilla-2">
          {red.datos.municipios.map((m) => (
            <section key={m.id} className="tarjeta">
              <h2>{m.nombre}</h2>
              <ul>
                {m.contactos.map((c) => (
                  <li key={c.tipo + c.valor}>
                    {c.etiqueta && <>{c.etiqueta}: </>}
                    {c.tipo === 'correo'
                      ? <a href={`mailto:${c.valor}`}>{c.valor}</a>
                      : <a href={c.valor} rel="noopener noreferrer" target="_blank">{c.valor}<span className="solo-lectores"> (abre en otra pestaña)</span></a>}
                    {c.esEjemplo && <span className="texto-secundario pequeno"> (ejemplo)</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Marco>
  );
}

/** Página no encontrada. */
export function NoEncontrada() {
  useTitulo('Página no encontrada');
  return (
    <Marco>
      <h1>No encontramos esta página</h1>
      <p>Puede que el enlace esté incompleto. <Enlace a="/">Volver al inicio</Enlace>.</p>
    </Marco>
  );
}
