# EBR Drill Viewer v1.1.1 — iPhone, iPad y Android

## Novedad v1.1.1
Esta actualización agrega **Tipo de roca** al resumen del ciclo y al detalle. El valor se obtiene del campo `drill_plan` del ZDA y admite valores como `III-A`, `III-B`, `IV-A` o cualquier variante equivalente encontrada en el campo. Si no puede identificarse, la app muestra `No identificado` y conserva el `drill_plan` completo en el detalle para diagnóstico.

## Novedad v1.1
Esta versión agrega, después del plano de navegación, el gráfico **Distribución de longitud perforada en roca por tipo de barreno**.

El gráfico se genera directamente desde los barrenos leídos en `boom.dat` y muestra por cada tipo disponible (Bottom, Easer, Cut, Contour, Reaming y Casing):

- puntos individuales de cada barreno;
- caja Q1–Q3;
- mediana;
- mínimo y máximo real;
- promedio;
- número de barrenos `n`;
- detalle al tocar un punto;
- botón de pantalla completa.

Los bigotes representan **mínimo y máximo real**, igual que en el gráfico de EBR Drill Analytics.

## Actualizar GitHub Pages
En el repositorio `ebr-drill-viewer-mobile`, reemplace los archivos de la versión anterior por los incluidos en esta carpeta. Como mínimo deben actualizarse:

- `index.html`
- `app.js`
- `styles.css`
- `service-worker.js`
- `manifest.webmanifest`

Es recomendable subir todo el contenido de la carpeta para mantener la versión sincronizada.

Después espere a que **Actions → pages build and deployment** aparezca con check verde. Abra la URL de GitHub Pages y confirme que al pie se vea **v1.1.1**.

Si el iPhone/iPad continúa mostrando la versión anterior, cierre por completo la PWA y Safari y vuelva a abrir. Si persiste, elimine el icono de la pantalla de inicio, abra de nuevo la URL en Safari y use **Compartir → Añadir a pantalla de inicio**.

## Uso
1. Abra EBR Drill Viewer.
2. Pulse **Seleccionar ZDA**.
3. Seleccione un archivo desde Archivos.
4. Revise el resumen y el plano de navegación.
5. Desplácese al gráfico de cajas. En teléfono puede deslizar horizontalmente o usar **⛶**.
6. Toque un punto del gráfico para identificar el barreno y su longitud.

El procesamiento se realiza localmente en el dispositivo. El ZDA no se envía a GitHub Pages ni a otro servidor.
