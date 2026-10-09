import { ReactNode, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ErrorApi, MENSAJES, fijarSesion, obtenerSesion, suscribirSesion } from './api';
import { Enlace, navegar } from './enrutador';

/** Medidas reales de los logos (assets/logos), para reservar espacio y no deformarlos. */
export const LOGOS = {
  sipinna: { src: '/logos/logo_sipinna.png', ancho: 1920, alto: 571 },
  rieti: { src: '/logos/logo_rieti.png', ancho: 508, alto: 492 },
} as const;

/** Texto alternativo de los logos. */
export const ALT = {
  sipinna: 'Sistema Municipal de Protección Integral de Niñas, Niños y Adolescentes (SIPINNA) de Atizapán de Zaragoza',
  rieti: 'RIETI, Ruta Intermunicipal para la Erradicación del Trabajo Infantil',
} as const;

/** Sale de inmediato a un sitio neutral y no deja esta página en "Atrás". */
export function salidaRapida(): void {
  window.location.replace('https://www.google.com/');
}

/** Sesión del personal como estado de React. */
export function useSesion() {
  return useSyncExternalStore(suscribirSesion, obtenerSesion);
}

/** Barra superior: 911/089 siempre visibles y botón de salida rápida. */
function BarraEmergencia() {
  return (
    <div className="barra-emergencia">
      <div className="contenedor">
        <p className="pequeno">
          ¿Peligro inmediato? Llama al <a href="tel:911">911</a>. Denuncia anónima: <a href="tel:089">089</a>.
        </p>
        <button type="button" className="boton-salida" onClick={salidaRapida}>
          Salida rápida
          <span className="solo-lectores"> (abre otro sitio y sale de RIETI)</span>
        </button>
      </div>
    </div>
  );
}

/** Enlaces de la web pública. */
const NAVEGACION_PUBLICA = [
  ['/', 'Inicio'],
  ['/como-funciona', '¿Cómo funciona?'],
  ['/reportar', 'Reportar'],
  ['/seguimiento', 'Seguimiento'],
  ['/red-de-municipios', 'Red de municipios'],
] as const;

/** Encabezado con la identidad del proyecto (RIETI) y la institucional (SIPINNA). */
function Encabezado({ personal }: { personal: boolean }) {
  const sesion = useSesion();
  return (
    <header className="encabezado">
      <div className="contenedor">
        <Enlace a={personal ? '/personal' : '/'} className="marcas">
          <img className="logo logo-rieti" src={LOGOS.rieti.src} width={LOGOS.rieti.ancho} height={LOGOS.rieti.alto} alt={ALT.rieti} />
          <img className="logo logo-sipinna" src={LOGOS.sipinna.src} width={LOGOS.sipinna.ancho} height={LOGOS.sipinna.alto} alt={ALT.sipinna} />
        </Enlace>
        <nav className="navegacion" aria-label={personal ? 'Personal SIPINNA' : 'Principal'}>
          <ul>
            {personal ? (
              <>
                <li><Enlace a="/personal">Bandeja</Enlace></li>
                <li><Enlace a="/personal/panel">Panel</Enlace></li>
                <li><Enlace a="/personal/perfil">Mi perfil</Enlace></li>
                {sesion && (
                  <li>
                    <a href="/" onClick={(e) => { e.preventDefault(); fijarSesion(null); navegar('/'); }}>Cerrar sesión</a>
                  </li>
                )}
              </>
            ) : (
              NAVEGACION_PUBLICA.map(([a, t]) => <li key={a}><Enlace a={a}>{t}</Enlace></li>)
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}

/** Pie con identidad institucional, aviso de privacidad y emergencias. */
function Pie() {
  return (
    <footer className="pie">
      <div className="contenedor">
        <img className="logo logo-sipinna-grande" src={LOGOS.sipinna.src} width={LOGOS.sipinna.ancho} height={LOGOS.sipinna.alto} alt={ALT.sipinna} loading="lazy" />
        <div>
          <ul>
            <li><Enlace a="/aviso-de-privacidad">Aviso de privacidad</Enlace></li>
            <li><Enlace a="/como-funciona">¿Cómo funciona?</Enlace></li>
            <li><Enlace a="/red-de-municipios">Red de municipios</Enlace></li>
            <li><Enlace a="/personal">Acceso del personal</Enlace></li>
          </ul>
          <p className="pequeno">
            RIETI no realiza inspecciones ni sustituye una denuncia formal ante el Ministerio Público.
            Emergencias: <a href="tel:911">911</a> · Denuncia anónima: <a href="tel:089">089</a>.
          </p>
        </div>
      </div>
    </footer>
  );
}

/** Estructura común de todas las páginas. */
export function Marco({ children, personal = false }: { children: ReactNode; personal?: boolean }) {
  return (
    <>
      <a className="saltar-contenido" href="#contenido">Saltar al contenido</a>
      <BarraEmergencia />
      <Encabezado personal={personal} />
      <main id="contenido" tabIndex={-1}>
        <div className="contenedor">{children}</div>
      </main>
      <Pie />
    </>
  );
}

/** Esqueleto de carga (sin contenido falso). */
export function Esqueleto({ filas = 3 }: { filas?: number }) {
  return (
    <div className="esqueleto" role="status" aria-live="polite">
      <span className="solo-lectores">Cargando…</span>
      {Array.from({ length: filas }, (_, i) => <div key={i} />)}
    </div>
  );
}

/** Error con la siguiente acción. */
export function MensajeError({ error, alReintentar }: { error: unknown; alReintentar?: () => void }) {
  const mensaje = error instanceof ErrorApi ? error.message : MENSAJES.INESPERADO;
  const detalle = error instanceof ErrorApi ? error.detalle : [];
  return (
    <div className="aviso aviso-error" role="alert">
      <p>{mensaje}</p>
      {detalle.length > 0 && <ul>{detalle.map((d) => <li key={d}>{d}</li>)}</ul>}
      {alReintentar && <button type="button" className="boton boton-secundario" onClick={alReintentar}>Intentar de nuevo</button>}
    </div>
  );
}

/** Estado vacío con explicación. */
export function Vacio({ children }: { children: ReactNode }) {
  return <div className="aviso" role="status">{children}</div>;
}

/** Resultado de {@link useCarga}. */
export interface Carga<T> { datos: T | null; error: unknown; cargando: boolean; recargar: () => void }

/**
 * Carga datos al montar (y cuando cambian las dependencias) con estados de
 * carga y error. Ignora respuestas viejas si el usuario cambió los filtros.
 */
export function useCarga<T>(cargar: () => Promise<T>, dependencias: unknown[]): Carga<T> {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [cargando, setCargando] = useState(true);
  const turno = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ejecutar = useCallback(cargar, dependencias);

  const recargar = useCallback(() => {
    const mio = ++turno.current;
    setCargando(true);
    setError(null);
    ejecutar()
      .then((d) => { if (mio === turno.current) setDatos(d); })
      .catch((e) => { if (mio === turno.current) setError(e); })
      .finally(() => { if (mio === turno.current) setCargando(false); });
  }, [ejecutar]);

  useEffect(recargar, [recargar]);
  return { datos, error, cargando, recargar };
}
