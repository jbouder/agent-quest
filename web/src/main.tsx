import { Provider } from "jotai";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";
import { connectSocket } from "@/lib/socket";
import { gameStore } from "@/store/gameAtoms";
import "./index.css";

connectSocket();

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

createRoot(root).render(
  <StrictMode>
    <Provider store={gameStore}>
      <App />
    </Provider>
  </StrictMode>,
);
