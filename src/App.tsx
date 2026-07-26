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
          target.isContentEditable)
      ) {
        return;
      }

      const hasDesign = useExperimentStore.getState().design !== null;
      const key = event.key.toLowerCase();

      if (key === "g" && hasDesign) {
        useExperimentStore.getState().setTool("translate");
      } else if (key === "r" && hasDesign) {
        useExperimentStore.getState().setTool("rotate");
      } else if (key === "s" && hasDesign && !event.metaKey && !event.ctrlKey) {
        useExperimentStore.getState().setTool("scale");
      } else if (key === "escape") {
        useExperimentStore.getState().setTool("orbit");
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
