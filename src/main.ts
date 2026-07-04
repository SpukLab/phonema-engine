import { App } from "./core/App";

const container = document.getElementById("app");
if (!container) {
  throw new Error("Missing #app container in index.html");
}

const app = new App(container);
app.start();
