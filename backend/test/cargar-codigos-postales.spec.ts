import { extraerPares } from '../src/scripts/cargar-codigos-postales';

/** Muestra sintética con el formato de SEPOMEX (no son filas reales del catálogo). */
const MUESTRA = [
  'Nota legal del catálogo',
  'd_codigo|d_asenta|d_tipo_asenta|D_mnpio|d_estado|d_ciudad|d_CP|c_estado|c_oficina|c_CP|c_tipo_asenta|c_mnpio|id_asenta_cpcons|d_zona|c_cve_ciudad',
  '52900|Colonia A|Colonia|Municipio X|México|Ciudad|52901|15|52901||09|013|0001|Urbano|01',
  '52900|Colonia B|Colonia|Municipio X|México|Ciudad|52901|15|52901||09|013|0002|Urbano|01',
  '06000|Centro|Colonia|Cuauhtémoc|Ciudad de México|Ciudad|06001|09|06001||09|015|0001|Urbano|01',
  '50000|Colonia C|Colonia|Municipio Y|México|Ciudad|50001|15|50001||09|106|0001|Urbano|01',
  'línea rota',
].join('\r\n');

describe('carga del catálogo de códigos postales', () => {
  it('extrae solo el Estado de México, sin duplicados, con la clave INEGI del municipio', () => {
    expect(extraerPares(MUESTRA)).toEqual([
      { codigoPostal: '52900', claveInegi: '15013' },
      { codigoPostal: '50000', claveInegi: '15106' },
    ]);
  });

  it('rechaza un archivo con otro formato', () => {
    expect(() => extraerPares('a\nb|c\n')).toThrow('formato esperado');
  });
});
