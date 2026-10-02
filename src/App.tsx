import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { cycleTheme, useTheme } from './components/theme';
import { CodeConverter } from './pages/CodeConverter';
import { Gallery } from './pages/Gallery';
import { Playground } from './pages/Playground';
import { Visualize } from './pages/Visualize';

export default function App() {
  const theme = useTheme();
  return (
    <HashRouter>
      <nav className="topbar">
        <NavLink to="/" className="brand" end>
          <span className="logo" aria-hidden>
            ◆
          </span>
          AlgoViz
        </NavLink>
        <NavLink to="/" end>
          Gallery
        </NavLink>
        <NavLink to="/playground">Playground</NavLink>
        <NavLink to="/convert">Code Converter</NavLink>
        <span className="spacer" />
        <button className="ghost icon" onClick={cycleTheme} aria-label="Toggle theme" title="Toggle theme">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Gallery />} />
          <Route path="/algo/:id" element={<Visualize />} />
          <Route path="/playground" element={<Playground />} />
          <Route path="/convert" element={<CodeConverter />} />
        </Routes>
      </main>
    </HashRouter>
  );
}
