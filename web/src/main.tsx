import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { coincide, useRuta } from './enrutador';
import { AvisoPrivacidad, ComoFunciona, Inicio, NoEncontrada, RedDeMunicipios, Seguimiento } from './paginas/publicas';
import { RegistroInstitucional, Reportar } from './paginas/Reportar';
import { Bandeja, Detalle, Panel, Perfil } from './paginas/personal';
import './estilos.css';

// Fase 7: alertas y administración se descargan solo si el personal las abre.
const Alertas = lazy(() => import('./paginas/control').then((m) => ({ default: m.Alertas })));
const Administracion = lazy(() => import('./paginas/control').then((m) => ({ default: m.Administracion })));

/** Resuelve la página según la ruta actual. */
export function App() {
  const ruta = useRuta().replace(/\/+$/, '') || '/';
  const detalle = coincide('/personal/reportes/:id', ruta);
  if (detalle && /^\d+$/.test(detalle.id)) return <Detalle id={Number(detalle.id)} />;
  switch (ruta) {
    case '/': return <Inicio />;
    case '/como-funciona': return <ComoFunciona />;
    case '/reportar': return <Reportar />;
    case '/seguimiento': return <Seguimiento />;
    case '/red-de-municipios': return <RedDeMunicipios />;
    case '/aviso-de-privacidad': return <AvisoPrivacidad />;
    case '/personal': return <Bandeja />;
    case '/personal/panel': return <Panel />;
    case '/personal/perfil': return <Perfil />;
    case '/personal/registrar': return <RegistroInstitucional />;
    case '/personal/alertas': return <Suspense fallback={null}><Alertas /></Suspense>;
    case '/personal/administracion': return <Suspense fallback={null}><Administracion /></Suspense>;
    default: return <NoEncontrada />;
  }
}

const raiz = document.getElementById('raiz');
if (raiz) createRoot(raiz).render(<StrictMode><App /></StrictMode>);
