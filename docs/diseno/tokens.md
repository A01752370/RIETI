# Tokens de diseño (web y Android)

> Fuente de los valores: `web/src/tokens.css` y `app/src/main/java/mx/sipinna/rieti/ui/theme/Color.kt` (deben coincidir).
> Contraste calculado con la fórmula WCAG 2.x contra blanco (#FFFFFF) y contra los fondos tintados.

## Logos

| Archivo | Qué es | Uso |
|---|---|---|
| `assets/logos/logo_sipinna.png` (1920×571, RGBA, fondo transparente) | Logo horizontal institucional del SIPINNA de Atizapán de Zaragoza | Identidad institucional: encabezado, pie y "¿Quién recibe tu reporte?" (web); marca institucional (Android). |
| `assets/logos/logo_rieti.png` (508×492, RGBA, fondo transparente) | Logo del proyecto: "RIETI — Ruta Intermunicipal para la Erradicación del Trabajo Infantil" | Identidad de la app y del sitio. |

Reglas:
- Siempre sobre fondo claro, sin recortar, deformar ni recolorear.
- Margen de seguridad con `padding`, porque el logo de RIETI casi no tiene margen propio.
- Siempre con texto alternativo y con ancho y alto definidos.
- Las copias en `web/public/logos` son los mismos píxeles recomprimidos sin pérdida.

## Colores

Los tonos de los logos que no alcanzan 4.5:1 se oscurecieron **conservando el tono** (HSL). Los originales en pastel quedan solo para decoración.

| Token | Valor | Origen | Contraste vs blanco | Uso |
|---|---|---|---|---|
| primario | `#007482` | teal SIPINNA `#0092A3` oscurecido | 5.50:1 (≥4.88 en tintes) | Botones, enlaces, cifras |
| primario-oscuro | `#00626D` | — | 7.08:1 | Hover, presionado |
| secundario | `#486090` | índigo SIPINNA, original | 6.27:1 | Bordes de aviso, énfasis |
| acento | `#BB3970` | rosa SIPINNA `#D5769E` oscurecido | 5.34:1 | Énfasis puntual |
| texto | `#1E120D` | texto del logo SIPINNA | 18.30:1 | Texto principal, foco visible |
| texto-secundario | `#6B6B6B` | gris RIETI `#909090` oscurecido | 5.33:1 | Ayudas y notas |
| error | `#C62828` | — | 5.62:1 | Errores |
| superficie / tinte-primario / tinte-acento | `#F3F4F8` / `#E6F4F6` / `#FBEFF4` | — | (fondos; texto ≥16:1) | Tarjetas |
| Decorativos (no texto) | `#0092A3`, `#54AAC1`, `#D5769E`, `#A185AB` | originales de los logos | 2.3–3.7:1 | Adornos e imágenes |

## Estatus (iguales en web y Android)

Texto blanco sobre el color. Siempre con **icono y nombre**, nunca solo el color.

| Estatus | Color | Contraste | Icono |
|---|---|---|---|
| Recibido | `#546E7A` | 5.40:1 | sobre (correo) |
| En revisión | `#1565C0` | 5.75:1 | lupa |
| En atención | `#C15700` | 4.53:1 | persona (antes `#EF6C00`, 3.08:1: no cumplía) |
| Canalizado | `#6A1B9A` | 9.39:1 | flecha |
| Concluido | `#2E7D32` | 5.13:1 | palomita en círculo |
| Descartado | `#757575` | 4.61:1 | equis |

En las gráficas se usan los mismos colores **más** etiquetas directas con el nombre y el valor, de modo que se entienden sin distinguir colores (daltonismo).

## Tipografía y espaciado

- **Tipografía:** la del sistema (`system-ui`, Roboto en Android), sin fuentes externas. Escala: 14 / 16 / 18 / 22 / 28 / 36 px; interlineado 1.5. En Android se usa `sp`, que respeta el tamaño de letra del teléfono.
- **Espaciado:** escala de 4 px (4, 8, 12, 16, 24, 32, 48).
- **Objetivos táctiles:** ≥ 44 px (web) y ≥ 48 dp (Android).
- **Radio:** 12 px.
