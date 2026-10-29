import ReactDOM from "react-dom/client";
import "./lib/monaco";
import "./styles.css";
import App from "./App";

// No StrictMode: its double-mount would spawn every shell twice in dev
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
