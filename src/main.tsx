// React application bootstrap and root render entrypoint.


import { createRoot } from "react-dom/client";

import App from "./app/App.tsx";
import { ThemeProvider } from "./app/components/theme/ThemeProvider";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>
);
  