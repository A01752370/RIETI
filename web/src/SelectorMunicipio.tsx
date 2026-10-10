import { KeyboardEvent, useId, useMemo, useRef, useState } from 'react';
import type { Municipio } from './api';

/** Quita acentos y mayúsculas para buscar ("atizapan" encuentra "Atizapán"). */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Municipios cuyo nombre contiene el texto buscado; primero los que empiezan con él. */
export function filtrarMunicipios(municipios: Municipio[], texto: string): Municipio[] {
  const q = normalizar(texto);
  if (!q) return municipios;
  const coinciden = municipios.filter((m) => normalizar(m.nombre).includes(q));
  return [...coinciden.filter((m) => normalizar(m.nombre).startsWith(q)), ...coinciden.filter((m) => !normalizar(m.nombre).startsWith(q))];
}

interface Props {
  municipios: Municipio[];
  /** Municipio elegido, o null (nunca hay uno preseleccionado). */
  valor: Municipio | null;
  alCambiar: (m: Municipio | null) => void;
  /** Mensaje de error del campo, si lo hay. */
  error?: string;
  etiqueta?: string;
}

/**
 * Selector de municipio con búsqueda (D-16), según el patrón *combobox* de
 * WAI-ARIA: se escribe para filtrar; flechas para moverse; Enter para elegir;
 * Escape para cerrar. Funciona con lector de pantalla (`aria-activedescendant`).
 */
export function SelectorMunicipio({ municipios, valor, alCambiar, error, etiqueta = 'Municipio donde ocurre' }: Props) {
  const id = useId();
  const [texto, setTexto] = useState(valor?.nombre ?? '');
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const lista = useRef<HTMLUListElement>(null);
  const opciones = useMemo(() => filtrarMunicipios(municipios, texto), [municipios, texto]);

  const elegir = (m: Municipio) => {
    alCambiar(m);
    setTexto(m.nombre);
    setAbierto(false);
  };

  const mover = (delta: number) => {
    if (!abierto) { setAbierto(true); return; }
    const siguiente = Math.max(0, Math.min(opciones.length - 1, activo + delta));
    setActivo(siguiente);
    lista.current?.children[siguiente]?.scrollIntoView?.({ block: 'nearest' });
  };

  const alTeclear = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); mover(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mover(-1); }
    else if (e.key === 'Enter' && abierto && opciones[activo]) { e.preventDefault(); elegir(opciones[activo]); }
    else if (e.key === 'Escape') { setAbierto(false); }
  };

  const idLista = `${id}-lista`, idAyuda = `${id}-ayuda`, idError = `${id}-error`;
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <span id={idAyuda} className="ayuda">Escribe para buscar entre los 125 municipios del Estado de México.</span>
      <div className="combobox">
        <input
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={abierto}
          aria-controls={idLista}
          aria-activedescendant={abierto && opciones[activo] ? `${id}-op-${opciones[activo].id}` : undefined}
          aria-describedby={error ? `${idAyuda} ${idError}` : idAyuda}
          aria-invalid={error ? true : undefined}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setAbierto(true);
            setActivo(0);
            if (valor && e.target.value !== valor.nombre) alCambiar(null);
          }}
          onKeyDown={alTeclear}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
        />
        {abierto && (
          <ul id={idLista} role="listbox" ref={lista} className="combobox-lista" aria-label="Municipios">
            {opciones.length === 0 ? (
              <li className="sin-resultados" role="option" aria-selected={false} aria-disabled="true">
                Ningún municipio coincide con “{texto}”.
              </li>
            ) : (
              opciones.map((m, i) => (
                <li
                  key={m.id}
                  id={`${id}-op-${m.id}`}
                  role="option"
                  aria-selected={i === activo}
                  onMouseDown={(e) => { e.preventDefault(); elegir(m); }}
                  onMouseEnter={() => setActivo(i)}
                >
                  {m.nombre}
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      <span className="solo-lectores" role="status" aria-live="polite">
        {abierto ? `${opciones.length} municipios disponibles` : ''}
      </span>
      {error && <span id={idError} className="error-campo">{error}</span>}
    </div>
  );
}
