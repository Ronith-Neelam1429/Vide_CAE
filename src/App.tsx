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
      const hasContactSurface = hasDesign || store.showBody;
      const canTransform = hasDesign || store.showBody;
      const key = event.key.toLowerCase();

      if (key === "c" && hasContactSurface) {
        store.setTool("contact");
        store.setSidebarTab("contacts");
      } else if (key === "g" && canTransform) {
        store.setTool("translate");
      } else if (key === "r" && canTransform) {
        store.setTool("rotate");
      } else if (key === "s" && canTransform && !event.metaKey && !event.ctrlKey) {
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
  const sidebarTab = useExperimentStore((state) => state.sidebarTab);
  const loadCatalog = useExperimentStore((state) => state.loadCatalog);

  // Pull the tissue and material tables from the solver once at startup so the
  // pickers offer exactly what the backend supports.
  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  return (
    <div className={`app-shell${sidebarTab === "results" ? " app-shell--results" : ""}`}>
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
