import {
  Semaforo, CacheLru, direccionDesdeNominatim, enCajaEdomex, Espaciador, latATeselaY, lonATeselaX, redondearParaGeocodificar, teselaPermitida,
} from '../src/geo/geo-utilidades';

describe('caja del Estado de México', () => {
  it('Atizapán está dentro; Monterrey y Cancún no', () => {
    expect(enCajaEdomex(19.5594, -99.2512)).toBe(true);
    expect(enCajaEdomex(25.6866, -100.3161)).toBe(false);
    expect(enCajaEdomex(21.1619, -86.8515)).toBe(false);
  });
});

describe('teselas', () => {
  it('calcula x/y como OSM (Atizapán a zoom 16)', () => {
    // Referencia conocida del esquema XYZ: la Ciudad de México a zoom 10 es la tesela 230/455.
    expect(lonATeselaX(-99.1332, 10)).toBe(230);
    expect(latATeselaY(19.4326, 10)).toBe(455);
    expect(lonATeselaX(-99.2512, 16)).toBe(14699);
    expect(latATeselaY(19.5594, 16)).toBe(29136);
  });

  it('solo sirve teselas del Estado de México y con zoom permitido', () => {
    expect(teselaPermitida(16, 14699, 29136)).toBe(true);
    expect(teselaPermitida(16, 0, 0)).toBe(false);          // otro lado del mundo
    expect(teselaPermitida(19, 117592, 233088)).toBe(false); // zoom de más
    expect(teselaPermitida(5, 7, 14)).toBe(false);          // zoom de menos
    expect(teselaPermitida(16.5, 14699, 29136)).toBe(false);
  });
});

describe('geocodificación', () => {
  it('redondea a 4 decimales antes de consultar al tercero', () => {
    expect(redondearParaGeocodificar(19.559412)).toBe(19.5594);
    expect(redondearParaGeocodificar(-99.251287)).toBe(-99.2513);
  });

  it('traduce la respuesta de Nominatim a la dirección del formulario', () => {
    expect(direccionDesdeNominatim({
      address: { road: 'Avenida Adolfo López Mateos', house_number: '12', suburb: 'Centro', postcode: '52900', city: 'Ciudad López Mateos' },
    })).toEqual({ calle: 'Avenida Adolfo López Mateos', numeroExterior: '12', colonia: 'Centro', codigoPostal: '52900' });
  });

  it('descarta códigos postales mal formados y tolera campos faltantes', () => {
    expect(direccionDesdeNominatim({ address: { neighbourhood: 'Las Alamedas', postcode: '52970-1' } }))
      .toEqual({ calle: null, numeroExterior: null, colonia: 'Las Alamedas', codigoPostal: null });
    expect(direccionDesdeNominatim({})).toEqual({ calle: null, numeroExterior: null, colonia: null, codigoPostal: null });
  });
});

describe('caché LRU', () => {
  it('expulsa la menos usada y respeta la caducidad', () => {
    let t = 0;
    const c = new CacheLru<number>(2, 1000, () => t);
    c.guardar('a', 1); c.guardar('b', 2);
    expect(c.obtener('a')).toBe(1); // 'a' pasa a ser la más reciente
    c.guardar('c', 3);              // expulsa 'b'
    expect(c.obtener('b')).toBeUndefined();
    expect(c.tamano).toBe(2);
    t = 1001;
    expect(c.obtener('a')).toBeUndefined();
  });
});

describe('espaciador (1 petición por segundo)', () => {
  it('espacia las llamadas y rechaza si la espera es demasiado larga', () => {
    const t = 0;
    const e = new Espaciador(1000, 2500, () => t);
    expect(e.reservar()).toBe(0);
    expect(e.reservar()).toBe(1000);
    expect(e.reservar()).toBe(2000);
    expect(e.reservar()).toBeNull(); // la cuarta tendría que esperar 3 s
  });
});

describe('semáforo de descargas', () => {
  it('deja pasar hasta el máximo, encola el resto y lo despierta al liberar', async () => {
    const sem = new Semaforo(2, 2);
    expect(await sem.adquirir(1000)).toBe(true);
    expect(await sem.adquirir(1000)).toBe(true);
    const tercero = sem.adquirir(1000);
    expect(sem.enEspera).toBe(1);
    sem.liberar();
    expect(await tercero).toBe(true);
    expect(sem.ocupados).toBe(2);
  });

  it('rechaza si la cola está llena o se agota la espera', async () => {
    const sem = new Semaforo(1, 1);
    await sem.adquirir(1000);
    const enCola = sem.adquirir(20);
    expect(await sem.adquirir(1000)).toBe(false); // cola llena
    expect(await enCola).toBe(false);              // espera agotada
    expect(sem.enEspera).toBe(0);
  });
});
