/**
 * Claves de 3 letras de cada municipio para el folio `RIETI-<CLAVE>-<AAAA>-<NNNNNN>` (Fase 6).
 *
 * ATZ (Atizapán de Zaragoza), NAU (Naucalpan de Juárez), TLA (Tlalnepantla de Baz) y
 * CIZ (Cuautitlán Izcalli) las indicó el socio formador. **El resto es provisional**,
 * generado a partir del nombre (sin artículos), y se reemplazará por el catálogo oficial
 * cuando la institución lo entregue (se carga como datos: `municipio.clave_folio`).
 * Cada clave es única.
 */
export const CLAVES_FOLIO: ReadonlyArray<readonly [claveInegi: string, clave: string]> = [
  ['15001', 'ACA'], // Acambay de Ruíz Castañeda
  ['15002', 'ACO'], // Acolman
  ['15003', 'ACU'], // Aculco
  ['15004', 'ALM'], // Almoloya de Alquisiras
  ['15005', 'ALJ'], // Almoloya de Juárez
  ['15006', 'ALR'], // Almoloya del Río
  ['15007', 'AMA'], // Amanalco
  ['15008', 'AMT'], // Amatepec
  ['15009', 'AME'], // Amecameca
  ['15010', 'APA'], // Apaxco
  ['15011', 'ATE'], // Atenco
  ['15012', 'ATI'], // Atizapán
  ['15013', 'ATZ'], // Atizapán de Zaragoza
  ['15014', 'ATL'], // Atlacomulco
  ['15015', 'ATA'], // Atlautla
  ['15016', 'AXA'], // Axapusco
  ['15017', 'AYA'], // Ayapango
  ['15018', 'CAL'], // Calimaya
  ['15019', 'CAP'], // Capulhuac
  ['15020', 'COA'], // Coacalco de Berriozábal
  ['15021', 'COH'], // Coatepec Harinas
  ['15022', 'COC'], // Cocotitlán
  ['15023', 'COY'], // Coyotepec
  ['15024', 'CUA'], // Cuautitlán
  ['15025', 'CHA'], // Chalco
  ['15026', 'CHM'], // Chapa de Mota
  ['15027', 'CHP'], // Chapultepec
  ['15028', 'CHI'], // Chiautla
  ['15029', 'CHC'], // Chicoloapan
  ['15030', 'CHB'], // Chiconcuac
  ['15031', 'CHD'], // Chimalhuacán
  ['15032', 'DON'], // Donato Guerra
  ['15033', 'ECA'], // Ecatepec de Morelos
  ['15034', 'ECT'], // Ecatzingo
  ['15035', 'HUE'], // Huehuetoca
  ['15036', 'HYP'], // Hueypoxtla
  ['15037', 'HUI'], // Huixquilucan
  ['15038', 'ISI'], // Isidro Fabela
  ['15039', 'IXT'], // Ixtapaluca
  ['15040', 'IXS'], // Ixtapan de la Sal
  ['15041', 'IXO'], // Ixtapan del Oro
  ['15042', 'IXA'], // Ixtlahuaca
  ['15043', 'XAL'], // Xalatlaco
  ['15044', 'JAL'], // Jaltenco
  ['15045', 'JIL'], // Jilotepec
  ['15046', 'JLT'], // Jilotzingo
  ['15047', 'JIQ'], // Jiquipilco
  ['15048', 'JOC'], // Jocotitlán
  ['15049', 'JOQ'], // Joquicingo
  ['15050', 'JUC'], // Juchitepec
  ['15051', 'LER'], // Lerma
  ['15052', 'MAL'], // Malinalco
  ['15053', 'MEL'], // Melchor Ocampo
  ['15054', 'MET'], // Metepec
  ['15055', 'MEX'], // Mexicaltzingo
  ['15056', 'MOR'], // Morelos
  ['15057', 'NAU'], // Naucalpan de Juárez
  ['15058', 'NEZ'], // Nezahualcóyotl
  ['15059', 'NEX'], // Nextlalpan
  ['15060', 'NIC'], // Nicolás Romero
  ['15061', 'NOP'], // Nopaltepec
  ['15062', 'OCO'], // Ocoyoacac
  ['15063', 'OCU'], // Ocuilan
  ['15064', 'ORO'], // El Oro
  ['15065', 'OTU'], // Otumba
  ['15066', 'OTZ'], // Otzoloapan
  ['15067', 'OTA'], // Otzolotepec
  ['15068', 'OZU'], // Ozumba
  ['15069', 'PAP'], // Papalotla
  ['15070', 'PAZ'], // La Paz
  ['15071', 'POL'], // Polotitlán
  ['15072', 'RAY'], // Rayón
  ['15073', 'SAN'], // San Antonio la Isla
  ['15074', 'SAF'], // San Felipe del Progreso
  ['15075', 'SAM'], // San Martín de las Pirámides
  ['15076', 'SMA'], // San Mateo Atenco
  ['15077', 'SAS'], // San Simón de Guerrero
  ['15078', 'SAT'], // Santo Tomás
  ['15079', 'SOY'], // Soyaniquilpan de Juárez
  ['15080', 'SUL'], // Sultepec
  ['15081', 'TEC'], // Tecámac
  ['15082', 'TEJ'], // Tejupilco
  ['15083', 'TEM'], // Temamatla
  ['15084', 'TMS'], // Temascalapa
  ['15085', 'TEA'], // Temascalcingo
  ['15086', 'TEB'], // Temascaltepec
  ['15087', 'TMY'], // Temoaya
  ['15088', 'TEN'], // Tenancingo
  ['15089', 'TAI'], // Tenango del Aire
  ['15090', 'TEV'], // Tenango del Valle
  ['15091', 'TEO'], // Teoloyucan
  ['15092', 'TTH'], // Teotihuacán
  ['15093', 'TEP'], // Tepetlaoxtoc
  ['15094', 'TPT'], // Tepetlixpa
  ['15095', 'TED'], // Tepotzotlán
  ['15096', 'TEQ'], // Tequixquiac
  ['15097', 'TEX'], // Texcaltitlán
  ['15098', 'TXC'], // Texcalyacac
  ['15099', 'TEE'], // Texcoco
  ['15100', 'TEZ'], // Tezoyuca
  ['15101', 'TIA'], // Tianguistenco
  ['15102', 'TIM'], // Timilpan
  ['15103', 'TLL'], // Tlalmanalco
  ['15104', 'TLA'], // Tlalnepantla de Baz
  ['15105', 'TLT'], // Tlatlaya
  ['15106', 'TOL'], // Toluca
  ['15107', 'TON'], // Tonatico
  ['15108', 'TUL'], // Tultepec
  ['15109', 'TUA'], // Tultitlán
  ['15110', 'VAL'], // Valle de Bravo
  ['15111', 'VIL'], // Villa de Allende
  ['15112', 'VIC'], // Villa del Carbón
  ['15113', 'VIG'], // Villa Guerrero
  ['15114', 'VIV'], // Villa Victoria
  ['15115', 'XON'], // Xonacatlán
  ['15116', 'ZAC'], // Zacazonapan
  ['15117', 'ZCL'], // Zacualpan
  ['15118', 'ZIN'], // Zinacantepec
  ['15119', 'ZUM'], // Zumpahuacán
  ['15120', 'ZMP'], // Zumpango
  ['15121', 'CIZ'], // Cuautitlán Izcalli
  ['15122', 'VAC'], // Valle de Chalco Solidaridad
  ['15123', 'LUV'], // Luvianos
  ['15124', 'SAJ'], // San José del Rincón
  ['15125', 'TNN'], // Tonanitla
];
