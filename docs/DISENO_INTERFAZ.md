# Diseño de la interfaz (T31–T32)

## Navegación
La barra superior tiene cuatro vistas: **Ciudad · Hospital · Estadísticas · Validación**.
- **Ciudad** y **Hospital** comparten la escena del motor.
- **Estadísticas** incluye, plegado, el estado del motor en texto (antes era una pestaña aparte).

## Vista Ciudad (`?red`): el mapa es el protagonista
- **Mapa:** ocupa todo el ancho. El panel de parámetros y el título grande se ocultan en esta vista.
- **Controles flotantes** (arriba a la derecha): buscador de instituciones, zoom, «Ver todo», filtro por condición, capas (mapa, satélite, solo calles) y pantalla completa (tecla F).
- **Indicadores** (abajo a la izquierda): ambulancias prehospitalarias y de remisión, pacientes del mapa y escenario de tráfico, marcado como supuesto.
- **Muñeco «Arrástrame al mapa»** (abajo a la derecha), un personaje propio dibujado en SVG:
  - se arrastra y se suelta sobre el mapa;
  - o se hace clic en él y luego en el mapa (también con Enter; Esc cancela).
- **Panel izquierdo:** formulario del paciente, recomendación, las tres políticas lado a lado y las instituciones evaluadas. Después muestra el **seguimiento del paciente**:
  - una línea de tiempo con las etapas hechas, en curso y pendientes;
  - solo las etapas de su recorrido;
  - tiempos del motor;
  - selector con el historial.
- **Panel derecho:** **ficha de la institución** en pestañas: General, Servicios, EPS, Capacidad y Fuentes. Marcas: ● documentado, ◌ simulado, ? desconocido. Lo técnico (método de ubicación, notas, fuentes con fecha, matriz completa) queda en las pestañas secundarias, sin quitar información.
- **En el mapa:**
  - pin del paciente;
  - ruta recomendada en verde (vista previa);
  - ambulancia hacia el paciente en naranja;
  - traslado en rojo;
  - todo con el reloj de la simulación.

## Remisiones del hospital de origen
- La franja se llama ahora **«Remisión desde el hospital de origen»** y tiene un **selector**: «la más reciente (automático)» o cualquier remisión activa o del historial. Antes saltaba sola al último paciente que entraba al pasillo.
- La hora en que la ambulancia queda libre es la **exacta del motor** (`TRANSFER_END.data.freeAt`, solo en la red). Antes se tomaba del cuadro de animación.

## Estilo
- Tokens de color en `src/ui/city.css`.
- Texto de 14,5–21 px en los paneles, para leer a unos 2 m.
- Tarjetas con sombra suave y animación breve (desactivada con `prefers-reduced-motion`).
- Por debajo de 900 px, los paneles van abajo.
- Los interiores isométricos no cambian.
