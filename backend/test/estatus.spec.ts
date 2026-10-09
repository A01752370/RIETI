import { ESTATUS, transicionesPermitidas, validarTransicion } from '../src/reportes/estatus';

describe('máquina de estados del reporte', () => {
  const { RECIBIDO, EN_REVISION, EN_ATENCION, CANALIZADO, CONCLUIDO, DESCARTADO } = ESTATUS;

  it.each([
    [RECIBIDO, EN_REVISION],
    [EN_REVISION, EN_ATENCION],
    [EN_REVISION, CANALIZADO],
    [EN_ATENCION, CANALIZADO],
    [EN_ATENCION, CONCLUIDO],
    [CANALIZADO, CONCLUIDO],
  ])('permite %s → %s', (desde, hacia) => {
    expect(validarTransicion(desde, hacia)).toBeNull();
  });

  it.each([
    [RECIBIDO, CONCLUIDO],
    [RECIBIDO, CANALIZADO],
    [EN_ATENCION, RECIBIDO],
    [CANALIZADO, EN_REVISION],
    [DESCARTADO, EN_REVISION],
    [RECIBIDO, RECIBIDO],
  ])('rechaza %s → %s', (desde, hacia) => {
    expect(validarTransicion(desde, hacia)?.codigo).toBe('TRANSICION_INVALIDA');
  });

  it('Descartado es terminal', () => {
    expect(transicionesPermitidas(DESCARTADO)).toEqual([]);
  });

  it('descartar exige motivo', () => {
    expect(validarTransicion(RECIBIDO, DESCARTADO)?.codigo).toBe('MOTIVO_REQUERIDO');
    expect(validarTransicion(RECIBIDO, DESCARTADO, null, '   ')?.codigo).toBe('MOTIVO_REQUERIDO');
    expect(validarTransicion(RECIBIDO, DESCARTADO, null, 'Reporte duplicado')).toBeNull();
  });

  it('reabrir un caso concluido exige comentario (reincidencia)', () => {
    expect(validarTransicion(CONCLUIDO, EN_ATENCION)?.codigo).toBe('COMENTARIO_REQUERIDO');
    expect(validarTransicion(CONCLUIDO, EN_ATENCION, 'Se volvió a observar')).toBeNull();
  });

  it('rechaza estatus fuera del catálogo canónico', () => {
    expect(validarTransicion(RECIBIDO, 'Cerrado')?.codigo).toBe('ESTATUS_DESCONOCIDO');
    expect(transicionesPermitidas('Atendido')).toEqual([]);
  });
});
