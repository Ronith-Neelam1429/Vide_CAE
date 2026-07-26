import { Sidebar } from "./components/layout/Sidebar";
import { StatusBar } from "./components/layout/StatusBar";
import { TopBar } from "./components/layout/TopBar";
import { Viewport } from "./components/viewport/Viewport";
import "./styles/theme.css";
import "./styles/shell.css";

function App() {
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
