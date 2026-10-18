import { ESTATUS, etiquetaEstatus, transicionesPermitidas, validarTransicion } from '../src/reportes/estatus';

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

  it('Fase 6: un caso concluido se archiva o pasa a Reincidente (con comentario), ya no vuelve directo a atención', () => {
    expect(transicionesPermitidas(CONCLUIDO)).toEqual([ESTATUS.ARCHIVADO, ESTATUS.REINCIDENTE]);
    expect(validarTransicion(CONCLUIDO, EN_ATENCION)?.codigo).toBe('TRANSICION_INVALIDA');
    expect(validarTransicion(CONCLUIDO, ESTATUS.REINCIDENTE)?.codigo).toBe('COMENTARIO_REQUERIDO');
    expect(validarTransicion(CONCLUIDO, ESTATUS.REINCIDENTE, 'Se volvió a observar')).toBeNull();
    expect(validarTransicion(CONCLUIDO, ESTATUS.ARCHIVADO)).toBeNull();
  });

  it('Fase 6: Reincidente vuelve a revisión o seguimiento; Canalizado puede volver a seguimiento; Archivado es terminal', () => {
    expect(transicionesPermitidas(ESTATUS.REINCIDENTE)).toEqual([EN_REVISION, EN_ATENCION]);
    expect(validarTransicion(CANALIZADO, EN_ATENCION)).toBeNull();
    expect(transicionesPermitidas(ESTATUS.ARCHIVADO)).toEqual([]);
  });

  it('Fase 6: etiquetas públicas del catálogo del socio', () => {
    expect([RECIBIDO, EN_ATENCION, DESCARTADO, ESTATUS.ARCHIVADO, ESTATUS.REINCIDENTE].map(etiquetaEstatus))
      .toEqual(['Registrado', 'En seguimiento', 'Cancelado', 'Archivado', 'Reincidente']);
    expect(etiquetaEstatus('Otro')).toBe('Otro');
    expect(validarTransicion(RECIBIDO, CONCLUIDO)?.mensaje).toBe('No se puede pasar de "Registrado" a "Concluido"');
  });

  it('rechaza estatus fuera del catálogo canónico', () => {
    expect(validarTransicion(RECIBIDO, 'Cerrado')?.codigo).toBe('ESTATUS_DESCONOCIDO');
    expect(transicionesPermitidas('Atendido')).toEqual([]);
  });
});
