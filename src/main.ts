import { App } from "./core/App";

const container = document.getElementById("app");
if (!container) {
  throw new Error("Missing #app container in index.html");
}

const params = new URLSearchParams(window.location.search);

// Toggle A/B para el experimento pedido tras Sprint 05: correr la misma
// física con y sin el sesgo de cámara/luz del RevelationSensor, y
// comparar. No es una característica creativa nueva — es la
// infraestructura mínima sin la cual ese experimento es imposible.
const revelationEnabled = params.get("revelation") !== "off";

const app = new App(container, { revelationEnabled });

const isEvaluationMode = params.has("eval");

if (isEvaluationMode) {
  // No arranca el loop de animación en tiempo real: Evaluation Mode
  // controla el avance explícitamente vía advanceDeterministic(), para
  // que las capturas sean reproducibles y no dependan de la velocidad
  // real de la máquina que las genera.
  (window as unknown as { __phonema: unknown }).__phonema = {
    advanceTo: (seconds: number) => app.advanceDeterministic(seconds),
    getSnapshot: () => app.getEvaluationSnapshot(),
    canvas: app.domElement
  };
} else {
  app.start();
}
