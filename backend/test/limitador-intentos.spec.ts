import { LimitadorIntentos } from '../src/reportes/limitador-intentos';

describe('LimitadorIntentos', () => {
  let t = 0;
  const reloj = () => t;
  beforeEach(() => { t = 1_000_000; });

  it('bloquea tras el máximo de fallos y se libera al vencer la ventana', () => {
    const l = new LimitadorIntentos(3, 60_000, reloj);
    l.registrarFallo('RIETI-2026-000001');
    l.registrarFallo('RIETI-2026-000001');
    expect(l.estaBloqueado('RIETI-2026-000001')).toBe(false);
    l.registrarFallo('RIETI-2026-000001');
    expect(l.estaBloqueado('RIETI-2026-000001')).toBe(true);
    t += 60_000;
    expect(l.estaBloqueado('RIETI-2026-000001')).toBe(false);
  });

  it('cuenta cada folio por separado', () => {
    const l = new LimitadorIntentos(1, 60_000, reloj);
    l.registrarFallo('RIETI-2026-000001');
    expect(l.estaBloqueado('RIETI-2026-000001')).toBe(true);
    expect(l.estaBloqueado('RIETI-2026-000002')).toBe(false);
  });

  it('un acierto reinicia el contador', () => {
    const l = new LimitadorIntentos(2, 60_000, reloj);
    l.registrarFallo('F');
    l.reiniciar('F');
    l.registrarFallo('F');
    expect(l.estaBloqueado('F')).toBe(false);
  });
});
