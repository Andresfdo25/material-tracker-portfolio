/* uiScale.ts — la traducción de coordenadas que exige el `zoom` global (lote 49).
 *
 * Toda la UI se dibuja dentro de un `body { zoom: var(--ui-scale) }`. Ese zoom NO es un
 * transform: reflowea como el zoom del navegador, y por eso encoge la app entera —
 * tipografía, paddings, iconos y bordes a la vez— sin tocar un solo px de los inline
 * styles. Pero deja una costura, y es la única:
 *
 *   `getBoundingClientRect()` devuelve px de PANTALLA (ya multiplicados por el zoom),
 *   mientras que un `top`/`left` que escribimos sobre un elemento zoomeado se interpreta
 *   en px LOCALES (y se multiplica por el zoom al pintar).
 *
 * Así que el ida y vuelta rect → style se desalinea: con escala 0.8, un `top: 400px`
 * tomado de un rect aterriza en 320. Todo popover `position: fixed` que se ancle a un
 * botón tiene que dividir por la escala primero. Medido en el navegador, no deducido.
 *
 * `inset: 0` NO necesita esto (0 escalado sigue siendo 0, y el bloque contenedor de un
 * fixed es el viewport sin zoom): el overlay de `Modal` sigue tapando la pantalla entera.
 * Lo que sí hay que compensar son los altos en `vh`, porque las unidades de viewport se
 * resuelven sin zoom y después se encogen — de ahí los `calc(… / var(--ui-scale))`.
 */

/** La escala vigente, leída del token para no depender de en qué elemento vive el zoom. */
export function uiScale(): number {
  const n = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Viewport en px LOCALES — los mismos en los que se miden `offsetHeight` y `offsetWidth`. */
export function localViewport(): { vw: number; vh: number } {
  const s = uiScale();
  return { vw: window.innerWidth / s, vh: window.innerHeight / s };
}

/** El rect del ancla, traducido a px locales para poder escribirlo como `top`/`left`. */
export function localRect(el: HTMLElement): { top: number; bottom: number; left: number; right: number } {
  const s = uiScale();
  const r = el.getBoundingClientRect();
  return { top: r.top / s, bottom: r.bottom / s, left: r.left / s, right: r.right / s };
}

/** Ancla un panel portaleado justo debajo del botón, sin que se salga por la derecha.
 *  `panelW` incluye el margen que cada popover ya reservaba. */
export function anchorBelow(btn: HTMLElement, panelW: number): { top: number; left: number } {
  const r = localRect(btn);
  return { top: r.bottom + 4, left: Math.max(8, Math.min(r.left, localViewport().vw - panelW)) };
}
