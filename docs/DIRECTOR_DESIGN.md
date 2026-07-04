# El Director — Documento de Diseño Técnico

## 0. Principio rector

El Director no anima. No secuencia. No decide qué le pasa al organismo.

El Director modifica el clima. El organismo sigue siendo el único responsable de su propio comportamiento: la física (Simulation) es quien traduce ese clima en forma visible.

Analogía de trabajo: el Director es a este proyecto lo que un director de documental es a un animal salvaje. No le dice al animal qué hacer. Elige dónde poner la cámara, cuánto dura la luz de la tarde, cuánto tiempo se queda observando antes de cortar. El animal hace lo que el animal hace.

Invariante de arquitectura: **el Director nunca escribe estado**. Solo escribe parámetros de contexto que otros sistemas (Simulation, Camera, Lighting) ya exponen como sus propios ajustes internos. Si el Director necesitara tocar algo que ese sistema no expone todavía, la solución es agregarle ese parámetro al sistema — nunca que el Director lo alcance por atrás.

---

## 1. Responsabilidades

- Mantener un pequeño conjunto de **parámetros de clima global** (targets, no valores instantáneos).
- Ajustar esos targets **lentamente**, en una escala de tiempo muy por debajo del frame rate.
- Operar en uno de dos modos (Instalación / Cinemático), cada uno con su propia lógica de decisión, pero el mismo contrato de salida hacia el resto del sistema.
- Detectar (Modo Instalación) o esculpir (Modo Cinemático) la trayectoria de esos parámetros en el tiempo.
- No conocer nada sobre shaders, geometría, ni sobre el campo mismo. Solo conoce estadísticas agregadas del campo, nunca el campo.

## 2. Lo que el Director NO hace (explícito, porque es fácil de violar sin querer)

- No escribe en la textura de estado.
- No dispara "eventos" narrativos con timestamps fijos.
- No decide la posición de cámara frame a frame.
- No interpola nada él mismo — cada sistema consumidor interpola su propio parámetro hacia el target que el Director publica, a su propio ritmo.
- No sabe que existe el audio todavía. Cuando exista, entra como un input más, nunca como un atajo directo a Simulation/Camera/Lighting.

---

## 3. Inputs

Todos de baja frecuencia, todos agregados (nunca el campo crudo):

| Input | Fuente | Descripción |
|---|---|---|
| `meanField` | Simulation | Promedio espacial del canal de valor. Proxy de "hacia dónde se inclinó el organismo". |
| `meanActivity` | Simulation | Promedio de \|rate\| — cuánta actividad hay ahora mismo. |
| `domainDiversity` | Simulation | Métrica barata de variedad espacial (ej. varianza espacial, o cruces de signo por fila muestreada). Proxy de monotonía. |
| `timeSinceLastReorg` | Director (estado propio) | Tiempo desde el último evento de reorganización que el Director permitió. |
| `sessionElapsed` | reloj global | Para Modo Cinemático, posición dentro del arco. |
| `mode` + `arcDuration` | configuración externa | Instalación vs Cinemático, y duración del arco si aplica. |
| `audioFeatures` (futuro) | Audio analysis | Energía, onset, tilt espectral. Placeholder — no existe esta sprint. |

El Director lee estas estadísticas a su propia cadencia (ver §4); no las escucha en cada frame.

## 4. Outputs — parámetros de clima

Todos son **targets**, no valores finales. Cada sistema consumidor decide cómo y a qué velocidad acercarse a su target (su propia constante de suavizado). Esto es lo que mantiene al Director "fino": nunca necesita saber el frame rate ni el paso de tiempo de nadie más.

| Parámetro | Destino | Rol |
|---|---|---|
| `diffusionTarget` | Simulation | Ancho de las paredes de dominio. |
| `reactionTarget` | Simulation | Fuerza del término biestable — motor principal. |
| `instabilityTarget` | Simulation | Amplitud del ruido térmico. |
| `recoverySpeedTarget` | Simulation (futuro) | Qué tan rápido el campo vuelve a un régimen estable tras una perturbación. Requiere que Simulation exponga este parámetro — no existe aún. |
| `memoryPersistenceTarget` | Simulation (futuro) | Cuánto "recuerda" el campo su propio pasado — probablemente un término de acoplamiento con un promedio móvil. También requiere trabajo futuro en Simulation. |
| `reorgProbability` | Simulation | Tasa (no el evento en sí) de que el propio ruido térmico produzca una nucleación grande. El Director sube o baja la probabilidad; la Simulation decide si, cuándo y dónde ocurre. |
| `cameraCuriosity` | Camera | Amplitud/frecuencia del deambular autónomo de cámara. |
| `observationDistance` | Camera | Distancia de encuadre objetivo. |
| `lightingAggressiveness` | Lighting | Contraste/intensidad de la luz clave. |
| `atmosphereDensity` | Lighting/futuro post-proceso | Densidad de niebla/velo, si se implementa. |

## 5. Frecuencia de actualización

- El Director **no corre por frame**. Corre en un tick propio, propuesto en **cada 2–8 segundos**, configurable.
- En cada tick: lee inputs agregados → decide nuevos targets → los publica.
- Los sistemas consumidores hacen su propio *easing* continuo hacia el último target publicado, en su propio loop de render — esto desacopla completamente la cadencia del Director del frame rate.
- Evaluación de eventos raros (reorganización) ocurre en el mismo tick, como una tirada de probabilidad contra `reorgProbability`, no como un temporizador fijo.

## 6. Interacción con Simulation

- Simulation expone un método del estilo `setClimate(partial<ClimateParams>)`.
- Simulation es responsable de su propia estabilidad: si el Director pide un salto grande (ej. `reactionTarget` de 1.0 a 3.0), Simulation decide internamente si lo aplica de inmediato o lo suaviza — el Director no necesita saber los límites de estabilidad numérica que ya establecimos (explicit-Euler, substeps). Esa responsabilidad queda donde siempre estuvo.
- `recoverySpeedTarget` y `memoryPersistenceTarget` son aspiracionales: hoy Simulation no tiene un mecanismo de "memoria" ni de "velocidad de recuperación" explícito. Este documento no prescribe cómo implementarlo — eso es una decisión de Simulation en un sprint futuro, no una que el Director le imponga.

## 7. Interacción con Camera

- Camera ya tiene un deambular autónomo (drift senoidal simple). El Director no reemplaza esa autonomía — le da una "personalidad" cambiante:
  - `cameraCuriosity` alto → el deambular explora un rango más amplio, cambia de intención con más frecuencia.
  - `observationDistance` → define el radio objetivo de encuadre; Camera decide su propio camino hacia ahí.
- Camera sigue eligiendo su trayectoria momento a momento. El Director solo mueve los bordes de esa exploración.

## 8. Interacción con Lighting

- Hoy "Lighting" son uniforms directos en el material del organismo (`uKeyLightColor`, intensidades implícitas, etc.).
- El Director ajustaría targets de alto nivel (`lightingAggressiveness`, `atmosphereDensity`) que un futuro sistema de Lighting (todavía no existe como clase separada) traduciría a esos uniforms concretos, con su propio suavizado.
- No se propone crear esa clase Lighting ahora — se documenta la costura para cuando exista.

## 9. Interacción con Audio (futuro, no implementado esta sprint)

- El Audio nunca debe tener una vía directa a Simulation, Camera o Lighting.
- Cuando exista, sus features (energía, onsets, tilt espectral) entran al Director como inputs adicionales, exactamente igual que `meanActivity` o `domainDiversity` hoy.
- Esto preserva la invariante central: el Director es la única autoridad sobre el clima. Si el audio pudiera saltarse al Director, tendríamos dos fuentes de verdad compitiendo por los mismos parámetros — el tipo de deuda arquitectónica que este documento existe para evitar.

## 10. Modo Instalación

- Objetivo: riqueza visual sostenida durante horas, sin monotonía prolongada.
- Mecanismo: un bucle homeostático, no un guion. El Director mantiene un promedio móvil largo de `domainDiversity` / `meanActivity`. Si ese promedio cae por debajo de un umbral durante más de X minutos, sube gradualmente `instabilityTarget`, `reactionTarget` y/o `reorgProbability` hasta que la variedad vuelve — y después los relaja de nuevo. Sin arco, sin narrativa: solo evitar que el sistema se quede dormido visualmente.

## 11. Modo Cinemático

- Objetivo: un arco emocional acotado en el tiempo (calma → tensión → clímax → recuperación).
- Mecanismo: una posición de arco `p = sessionElapsed / arcDuration` (0→1), mapeada a través de una curva que desplaza los targets — más `instabilityTarget` y `cameraCuriosity` cerca del clímax, más calma y `observationDistance` mayor en la recuperación.
- Importante: la curva mueve **probabilidades y climas**, nunca fuerza un estado visual específico en un instante dado. El organismo puede "decidir" no tener su clímax exactamente donde el arco lo sugiere — el Director solo inclinó las condiciones para que sea más probable.

## 12. No-objetivos explícitos de este documento

- No define la estructura de datos final de `ClimateParams` — eso se decide al implementar.
- No implementa `recoverySpeedTarget` ni `memoryPersistenceTarget` — señala que Simulation necesitará crecer para soportarlos.
- No crea una clase Lighting — señala la costura para cuando exista.
- No toca Audio — señala la costura para cuando exista.
- No se implementa nada de esto todavía, por instrucción explícita.
