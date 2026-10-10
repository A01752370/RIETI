import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { coincide, useRuta } from './enrutador';
import { AvisoPrivacidad, ComoFunciona, Inicio, NoEncontrada, RedDeMunicipios, Seguimiento } from './paginas/publicas';
import { Reportar } from './paginas/Reportar';
import { Bandeja, Detalle, Panel, Perfil } from './paginas/personal';
import './estilos.css';

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
    default: return <NoEncontrada />;
  }
}

const raiz = document.getElementById('raiz');
if (raiz) createRoot(raiz).render(<StrictMode><App /></StrictMode>);
