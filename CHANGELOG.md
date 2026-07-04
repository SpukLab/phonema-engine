# CHANGELOG

Formato: cada sprint es un capítulo. Intención artística, no revisión técnica.
El resultado se evalúa mirando, no leyendo código.

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
