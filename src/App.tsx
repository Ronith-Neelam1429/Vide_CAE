import { useEffect } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { StatusBar } from "./components/layout/StatusBar";
import { TopBar } from "./components/layout/TopBar";
import { Viewport } from "./components/viewport/Viewport";
import { useExperimentStore } from "./store/experimentStore";
import "./styles/theme.css";
import "./styles/shell.css";

function useToolHotkeys() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      const store = useExperimentStore.getState();
      const hasDesign = store.design !== null;
      const key = event.key.toLowerCase();

      if (key === "c" && hasDesign) {
        store.setTool("contact");
        store.setSidebarTab("contacts");
      } else if (key === "g" && hasDesign) {
        store.setTool("translate");
      } else if (key === "r" && hasDesign) {
        store.setTool("rotate");
      } else if (key === "s" && hasDesign && !event.metaKey && !event.ctrlKey) {
        store.setTool("scale");
      } else if (key === "escape") {
        store.setTool("orbit");
      } else if (
        (key === "backspace" || key === "delete") &&
        store.selectedContactId
      ) {
        store.removeContactPoint(store.selectedContactId);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

function App() {
  useToolHotkeys();

  return (
    <div className="app-shell">
      <TopBar />
      <div className="app-shell__body">
        <Sidebar />
        <Viewport />
      </div>
      <StatusBar />
    </div>
  );
}

export default App;
