import { AVISO_PRIVACIDAD_SECCIONES, AVISO_PRIVACIDAD_TEXTO, AvisosController } from '../src/avisos/aviso-privacidad';

describe('aviso de privacidad', () => {
  const aviso = new AvisosController().vigente();

  it('conserva `parrafos` para las APK instaladas y agrega `secciones`', () => {
    expect(aviso.parrafos.length).toBeGreaterThan(0);
    expect(aviso.secciones.length).toBeGreaterThan(0);
  });

  it('las secciones contienen exactamente los mismos párrafos, en el mismo orden', () => {
    expect(aviso.secciones.flatMap((s) => s.parrafos)).toEqual(aviso.parrafos);
    expect(AVISO_PRIVACIDAD_TEXTO).toEqual(AVISO_PRIVACIDAD_SECCIONES.flatMap((s) => s.parrafos));
  });

  it('cada sección tiene título y al menos un párrafo', () => {
    for (const s of aviso.secciones) {
      expect(s.titulo.trim().length).toBeGreaterThan(0);
      expect(s.parrafos.length).toBeGreaterThan(0);
    }
  });

  it('mantiene el aviso de emergencia y la advertencia sobre datos del menor', () => {
    const texto = aviso.parrafos.join(' ');
    expect(texto).toContain('911');
    expect(texto).toContain('CURP');
  });
});
