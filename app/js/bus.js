// Punto único para pedir que la pantalla se vuelva a pintar, sin dependencias circulares.
let renderFn = () => {};
export const setRender = fn => { renderFn = fn; };
export const rerender = () => renderFn();

// Capacidad de descarga de archivos (la concede el visor de artefactos). null = no disponible.
export const caps = { downloads: null };
