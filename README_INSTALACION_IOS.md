# EBR Drill Viewer · instalación en iPhone / iPad

Esta carpeta contiene una **PWA (Progressive Web App)** preparada para iPhone y iPad. Procesa **un archivo .ZDA por vez**, localmente, y reconstruye el plano de navegación con los barrenos extraídos de `boom.dat`.

## Qué muestra

- Jumbo, serie, ciclo, fecha y plan de perforación.
- Sección detectada desde el nombre del plan, cuando está disponible.
- Tipo de disparo según barrenos de frente.
- Barrenos de frente y metros perforados.
- Movimiento automático/manual y porcentaje por brazo desde `counters.dat`.
- Inicio y fin reales de perforación usando MWD cuando está disponible.
- Plano referencial reconstruido desde las coordenadas X/Z de `boom.dat`.
- Detalle de un barreno al tocar su punto en el plano.

## Privacidad / operación offline

El archivo ZDA se lee en el navegador del dispositivo. La app no envía el archivo a un servidor.

Después de instalarla y abrirla una vez, los archivos de la aplicación quedan almacenados para uso offline mediante Service Worker. El ZDA que se analice también se procesa localmente.

## Instalación recomendada con GitHub Pages

1. Cree un repositorio, por ejemplo `ebr-drill-viewer`.
2. Suba **el contenido de esta carpeta** a la raíz del repositorio, manteniendo la carpeta `icons`.
3. En GitHub: **Settings → Pages**.
4. En *Build and deployment*, seleccione **Deploy from a branch**.
5. Seleccione la rama `main` y la carpeta `/ (root)`.
6. Espere a que GitHub entregue la dirección HTTPS del sitio.
7. En el iPhone o iPad abra esa dirección **con Safari**.
8. Pulse **Compartir** → **Añadir a pantalla de inicio**.
9. Confirme el nombre **EBR Drill Viewer** y pulse **Añadir**.
10. Abra el nuevo icono desde la pantalla de inicio. Haga una primera apertura con conexión para verificar que todos los archivos quedaron en caché.

A partir de ese momento puede abrir la app sin cobertura y seleccionar un ZDA guardado previamente en la app **Archivos** del iPhone/iPad.

## Uso

1. Abra **EBR Drill Viewer**.
2. Pulse **Seleccionar ZDA**.
3. Elija un archivo `.ZDA` desde **Archivos**.
4. La app procesa automáticamente ese ciclo.
5. En el plano puede activar/desactivar IDs, dirección de barrenos y contorno de sección.
6. Toque un punto rojo para ver el ID, tipo, brazo, secuencia y longitud del barreno.

## Sobre un archivo .IPA

Un `.IPA` instalable directamente como aplicación nativa requiere **firma de Apple**. Para distribuirlo fuera de App Store se necesita una estrategia de firma/distribución (por ejemplo Apple Developer, TestFlight o MDM corporativo). Por eso esta versión se entrega como PWA: se instala desde Safari y no requiere App Store ni cuenta Apple Developer.

## Archivos

- `index.html`: interfaz principal.
- `app.js`: lectura ZDA y reconstrucción del plano.
- `styles.css`: interfaz móvil.
- `manifest.webmanifest`: definición de la app instalable.
- `service-worker.js`: caché para uso offline.
- `jszip.min.js`: lector ZIP local utilizado para abrir el contenedor ZDA.
- `icons/`: iconos para iPhone/iPad/PWA.

## Nota técnica

La lógica de esta versión se basa en el parser ZDA ya utilizado en EBR Drill Analytics: `round-*.txt` para metadatos, `boom.dat` para geometría y detalle de barrenos, `counters.dat` para tiempos automático/manual y archivos MWD para la ventana temporal de perforación. El plano es una reconstrucción referencial; no es una imagen original del software del equipo.
