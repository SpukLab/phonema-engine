import { App } from "./core/App";

const container = document.getElementById("app");
if (!container) {
  throw new Error("Missing #app container in index.html");
}

const app = new App(container);

const isEvaluationMode = new URLSearchParams(window.location.search).has("eval");

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
