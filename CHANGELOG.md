# CHANGELOG

Formato: cada sprint es un capítulo. Intención artística, no revisión técnica.
El resultado se evalúa mirando, no leyendo código.

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

