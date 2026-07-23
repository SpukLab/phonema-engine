# CHANGELOG

Formato: cada sprint es un capítulo. Intención artística, no revisión técnica.
El resultado se evalúa mirando, no leyendo código.

---

## Sprint 05c — "Instrumentación, no calibración"

**Estado: PENDING (falta re-correr el experimento con la telemetría nueva)**

**Build en vivo:** https://spuklab.github.io/phonema-engine/

### Lo que pasó

El experimento A/B (con/sin `RevelationSensor`) dio una diferencia de
cámara de **0.01% a 0.04%** entre condiciones — imperceptible. La
conclusión correcta no es "el sensor no funciona", es **"no teníamos
instrumentación suficiente para saber por qué"**. Tres hipótesis, ninguna
descartada todavía:

- **H1 — ganancia demasiado baja.** El factor ×30 nunca se calibró contra
  un valor real de `heterogeneity`; pudo haber quedado muy por debajo de
  lo necesario.
- **H2 — el sensor llega tarde.** La Narrative Review reportó los
  momentos de atención en t=2s, 2s, 5s — mucho antes de que el sensor
  haga su primer readback (~20 frames). Puede estar perfectamente
  calibrado para un evento que, para el espectador, ya pasó.
- **H3 — la variable observada es la equivocada.** Quizás lo que predice
  atención no es heterogeneidad espacial en un instante, sino su
  velocidad de cambio (`dH/dt`), o directamente otra cosa (aparición de
  estructura, ruptura de simetría).

No se puede elegir entre H1/H2/H3 sin datos — por eso este capítulo es
solo instrumentación, no otro ajuste de números.

### Qué se agregó

- `RevelationSensor` ahora expone, además de `heterogeneity` (suavizado):
  `rawHeterogeneity` (sin suavizar), `dHdt` (su derivada respecto al
  tiempo simulado), y `framesSinceLastReadback` (qué tan atrasada puede
  estar la señal en un instante dado).
- `App.getEvaluationSnapshot()` ahora incluye todo eso más `cameraTarget`
  (adonde iría la cámara sin el sensor), `cameraOffset` y `zoomApplied`
  (lo que el sensor efectivamente movió) — separando explícitamente la
  deriva autónoma de la intervención del sensor en los datos, no solo
  en el código.
- Evaluation Mode ahora muestrea denso en 0-10s (`0,1,2,3,5,8,10s`)
  además de los puntos anteriores — es exactamente la ventana que la
  Narrative Review marcó como relevante y que antes no medíamos.

### Cómo correr el experimento otra vez

Mismos comandos de siempre (`with-revelation` / `without-revelation`).
Esta vez, además de mirar las imágenes, hay que comparar:

```
rawHeterogeneity, dHdt, sensorDelayFrames   (¿qué vio el sensor y cuándo?)
cameraOffset, zoomApplied                    (¿qué hizo con eso?)
```

contra los timestamps de tu Narrative Review (t=2s, 2s, 5s). Si
`dHdt` tiene un pico claro cerca de esos segundos y `heterogeneity` no,
eso apunta a H3. Si el pico existe pero `sensorDelayFrames` muestra que
la señal llegó tarde, apunta a H2. Si no hay ningún pico reconocible en
ninguna variable cerca de t=2-5s, apunta a H1 — o a que la variable
correcta todavía no está instrumentada.

---

## Sprint 05 — "Sistema de Revelación"

**Estado: PENDING ART REVIEW** (falta correr Evaluation Mode y completar la Narrative Review de abajo)

**Build en vivo:** https://spuklab.github.io/phonema-engine/
**Cómo correrlo local:** `npm install && npm run dev`

### Regla nueva adoptada este sprint

Antes de modificar la física (`diffusion`, `reactionStrength`, `thermalNoise`,
etc.), demostrar que el problema no se resuelve con cámara, luz o puesta en
escena. Este sprint es esa demostración: el hallazgo del Sprint 04
(`varianceV` colapsando a ~0 hacia t=180s) no se resolvió tocando la
ecuación — se lo aborda dándole a cámara y luz información sobre lo que
ya está pasando en el campo.

### Objetivo

Separar dos preguntas que se estaban confundiendo: "¿el organismo tiene
estructura interna?" y "¿el espectador percibe un acontecimiento?". No
son la misma pregunta, y la segunda es la que realmente importa para una
instalación.

### Qué cambió

- **RevelationSensor** (nuevo, acotado): reduce el campo a una grilla de
  16×16 en GPU cada frame (barato) y hace un readback a CPU unas pocas
  veces por segundo (no cada frame). Expone dos señales suavizadas:
  `heterogeneity` (cuánta variación espacial de actividad hay ahora
  mismo — el proxy directo del hallazgo de sincronización del Sprint 04)
  y `peakUV` (dónde está la tensión más alta ahora mismo).
- **El sensor nunca escribe a la simulación.** Solo lo consumen cámara y
  luz, y solo como una inclinación sobre su propia deriva autónoma —
  nunca la reemplazan.
- Cámara: acercamiento sutil (hasta ~4%) cuando la heterogeneidad detectada
  sube.
- Luz: inclinación hacia la región de mayor tensión (hasta 25% de peso),
  sumada a la deriva lenta que ya tenía, nunca en su lugar.
- Esto es la implementación parcial y acotada de `docs/DIRECTOR_DESIGN.md`
  — específicamente las secciones de interacción con Cámara e Iluminación.
  No se implementó clima sobre la Simulation, ni modos (Instalación/
  Cinemático) — eso sigue congelado hasta que haga falta.
- Evaluation Mode ahora muestrea cada 15-30s (9 frames en vez de 4) para
  poder juzgar mejor si hay un momento identificable de "algo pasó".

### Lo que NO cambié (a propósito)

`diffusion=40`, `reactionStrength=0.35`, `thermalNoise=0.05`,
`epsilon=0.015`, `gamma=0.85`, `wCoupling=2.2` — exactamente iguales al
Sprint 04. Si la sincronización espacial (`varianceV`→0) sigue pasando,
va a seguir pasando — este sprint no la resuelve, prueba si la *percepción*
de acontecimiento se puede lograr sin resolverla primero.

### Narrative Review (completar mirando el organismo correr, no las capturas sueltas)

```
¿Pasó algo?                                    SI / NO

¿Un espectador podría describir
un antes y un después?                         SI / NO

Cambio percibido máximo:                       0-10

Momentos de atención:
  t = ___
  t = ___
  t = ___

¿La imagen invita a seguir observando?         SI / NO

Tiempo estimado antes de habituación:          ___ segundos
```

### Los tres factores sin calibrar (dicho explícitamente)

El factor de normalización de `heterogeneity` (×30, tanto en cámara como
en luz) y los pesos máximos (4% zoom, 25% inclinación de luz) son una
primera aproximación razonada, no calibrada contra el organismo corriendo
en vivo. No tengo forma de saber si 30 es el número correcto sin verlo —
puede que el acercamiento sea imperceptible, o exagerado. Es lo primero
que ajustaría con tu observación.

### Experimento A/B (agregado — el único pedido para este cierre de sprint)

Se agregó un toggle (`?revelation=off`) para poder correr exactamente la
misma física con y sin el sesgo de cámara/luz del sensor, y comparar. Sin
esto, la pregunta "¿el organismo parece más interesante porque el
observador cambió, aun con la física idéntica?" es imposible de responder
con evidencia.

Correlo así:

```
npm run build
npx serve dist -p 4173 &
sleep 2
npm run evaluate -- "http://localhost:4173" with-revelation
npm run evaluate -- "http://localhost:4173?revelation=off" without-revelation
```

Esto genera `evaluation/with-revelation/` y `evaluation/without-revelation/`,
cada una con sus 9 frames y su `review.json`. Subime ambas carpetas
completas y la Narrative Review de cada una (mirando el organismo correr,
no las capturas sueltas) — con eso hago la comparación real, no antes.

---

## Sprint 04 — "La Primera Revelación"

**Estado: PENDING ART REVIEW** (ver sección final — no es un tecnicismo, es una regla que pediste explícitamente)

**Build en vivo:** https://spuklab.github.io/phonema-engine/
**Cómo correrlo local:** `npm install && npm run dev`

### Objetivo

Que el organismo pase largos períodos en aparente quietud y, sin ninguna
animación programada, algo se reorganice — que el espectador sienta
"algo acaba de pasar", emergiendo únicamente del estado físico interno.

### Qué cambió

- **Recalibración del ciclo tensión/liberación**: el régimen anterior
  ciclaba cada ~20s — demasiado frecuente para leerse como "evento",
  más como respiración continua. Verificado numéricamente sobre 240s
  simulados (`tools/fhn_check.py`), el nuevo régimen
  (`epsilon:0.015, gamma:0.85, wCoupling:2.2`) muestra liberaciones
  nítidas cada ~42-44s, con tramos largos de meseta entre medio.
- **Luz más oscura**: rim de 0.15→0.10, brillo subsuperficial base de
  0.12→0.08. Menos "gratis" para compensar la penumbra.
- **Más ruptura de silueta por historia**: `uAgeDisplacementScale` de
  0.24→0.30.
- **Evaluation Mode real**, implementado en el motor mismo (no un script
  aparte que simula el render):
  - `Simulation.readStats()` lee el estado real desde la GPU
    (`readRenderTargetPixels`) — promedio y varianza de V, W, S.
  - `App.advanceDeterministic(segundos)` avanza la simulación con paso
    fijo, sin depender del reloj real — reproducible en cualquier
    máquina.
  - `?eval=1` en la URL expone `window.__phonema` con `advanceTo()`,
    `getSnapshot()` y el canvas — sin ningún costo en el uso normal.
  - `tools/evaluate.mjs` (Playwright) navega con el renderer real,
    avanza a t=0/30/60/180s, captura PNG real, y calcula métricas de
    píxeles reales (ocupación en pantalla, histograma de luminancia,
    % de superficie en sombra) directamente sobre la captura.

### Por qué el estado es PENDING ART REVIEW, no COMPLETE

No pude ejecutar `tools/evaluate.mjs` yo mismo. Intenté instalar el
navegador headless que Playwright necesita
(`npx playwright install chromium`) y la descarga falló porque
`cdn.playwright.dev` no está en la lista de dominios que mi entorno de
trabajo tiene permitido alcanzar — la misma restricción de red que ya
había encontrado con Puppeteer y con Chromium por apt/snap en sprints
anteriores. El código existe, compila, y debería funcionar en tu
máquina sin restricciones de red. Pero no generé las imágenes ni el
`review.json`, y por eso este sprint no está completo bajo tu propia
regla.

### Lo que necesito de vos para cerrar este sprint

```
npm install
npx playwright install chromium
npm run build
npx serve dist -p 4173 &
npm run evaluate -- http://localhost:4173
```

Eso debería generar `evaluation/Frame_000.png`, `Frame_030.png`,
`Frame_060.png`, `Frame_180.png` y `evaluation/review.json`. Subime esos
archivos y ahí sí escribo el ART REVIEW basado únicamente en lo que
esas imágenes muestran — no antes.

---

## Sprint 03 — "Historia Geológica"

**Build en vivo:** https://spuklab.github.io/phonema-engine/
**Cómo correrlo local:** `npm install && npm run dev`

### Objetivo

Dejar de generar material. Empezar a generar historia. Que el organismo
no parezca un shader sobre una esfera, sino algo que ya vivió mucho
tiempo antes de que la cámara empezara a mirarlo.

### Qué cambió

- Nueva cantidad física: **desgaste acumulado (S)**. Crece cada vez que
  una región atraviesa un evento de tensión fuerte, y prácticamente no
  decae — es una cicatriz, no un ciclo más. Se siembra ya rica y
  asimétrica desde el primer frame: no hay ningún momento en que el
  organismo sea simétrico o "recién nacido".
- Esa misma cantidad ahora **rompe la silueta esférica de raíz**: las
  regiones más desgastadas colapsan hacia adentro de forma permanente.
  No es una capa de ruido — es la consecuencia geométrica directa de la
  propia historia de tensión del organismo.
- La estructura mesoscópica ya no es una sola familia de ruido en toda
  la superficie: hay una variante "joven" (suave) y una variante "vieja"
  (fracturada, tipo veta cristalizada), mezcladas según el desgaste
  local. Regiones distintas deberían leerse como materialmente distintas,
  no como la misma textura con otra semilla.
- La pátina ahora es proporcional al desgaste local — las zonas viejas
  se manchan más, las jóvenes casi nada.
- Luz de relleno bajada drásticamente (de 0.4 a 0.12) y brillo
  subsuperficial de base reducido a la mitad — la intención es que haya
  penumbra real, no que la luz explique toda la superficie.
- Encuadre más cerrado (FOV 32°→24°, cámara más cerca) — lente de
  observación científica, no de producto.

### Qué observar

- ¿La silueta general ya deja de leerse como "esfera con relieve"? ¿Hay
  asimetría real de forma, no solo de textura?
- ¿Se notan regiones que parecen genuinamente más viejas que otras — no
  solo más oscuras, sino estructuralmente distintas?
- ¿Quedan partes del organismo en penumbra real durante la observación,
  o la luz sigue revelando todo?
- ¿La escala sigue siendo ambigua de forma interesante, o ahora es
  simplemente confusa?

### Lo que no pude verificar yo mismo

Todo lo de arriba es lo que la implementación *debería* producir, no lo
que vi. Igual que en sprints anteriores: sin navegador en mi entorno, no
puedo confirmar que el desgaste se lea como "geología" y no como manchas
raras, ni que el balance joven/viejo esté bien calibrado. Eso es lo que
sigue.

---

## Sprint 02 — "El Primer Aliento"

**Build en vivo:** https://spuklab.github.io/phonema-engine/
**Cómo correrlo local:** `npm install && npm run dev`

### Objetivo

Que el organismo deje de decaer hacia el silencio y empiece a alternar,
por sí solo, entre quietud, tensión, liberación y reorganización — sin
ningún guion detrás.

### Qué cambió

- El organismo ahora tiene una segunda variable interna lenta (tensión
  acumulada) que inhibe su propio impulso a estabilizarse. Cuando la
  tensión crece lo suficiente, fuerza una liberación; después la tensión
  se disipa y el ciclo puede volver a empezar en otro lugar de la
  superficie. Esto no está animado — es la física del campo.
- La materia tiene ahora una veta fija (como fibra o estratos de roca),
  no una textura isotrópica genérica.
- Se agregó oclusión falsa en los pliegues de esa veta — es lo que da
  sensación real de profundidad de cerca.
- Manchas de pátina fijas, muy tenues (óxido/liquen).
- La tensión interna ahora también agita el brillo óptico y la
  traslucidez — el material "responde" a su propio estado, sin que la
  tensión dibuje una forma reconocible propia.
- Cámara y luz tienen deriva propia, mucho más lenta que antes, con
  períodos deliberadamente no repetitivos (9 a 16 minutos) — dentro del
  primer minuto el movimiento debería sentirse casi quieto.

### Qué observar

- Durante el primer minuto: ¿hay al menos un momento de quietud, uno de
  tensión visible y una liberación? ¿O sigue pareciendo un único proceso
  continuo?
- Mirando de cerca: ¿la superficie se siente tallada, con pliegues reales,
  o todavía se ve como una textura pegada encima?
- ¿La pátina se lee como una imperfección natural del material, o como
  una mancha digital?
- ¿Notás el movimiento de cámara o luz en algún momento puntual, o se
  siente como observación quieta?

### Lo que no pude verificar yo mismo

No tengo navegador en mi entorno de trabajo — todo lo de arriba viene de
verificación numérica (la física) y matemática (estabilidad), nunca de
haber visto el render. La evaluación real es la tuya.

