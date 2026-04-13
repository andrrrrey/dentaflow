import { BrowserRouter, Routes, Route } from "react-router-dom";

function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div
        className="px-16 py-12 rounded-glass backdrop-blur-glass text-center"
        style={{
          background: "rgba(255,255,255,0.65)",
          border: "1.5px solid rgba(255,255,255,0.85)",
          boxShadow: "0 8px 32px rgba(120,140,180,0.18)",
        }}
      >
        <h1 className="text-5xl font-extrabold tracking-tight">
          <span className="bg-gradient-to-r from-accent2 via-accent to-accent3 bg-clip-text text-transparent">
            DentaFlow
          </span>
        </h1>
        <p className="mt-3 text-text-muted text-lg font-medium">
          Dental Clinic Management Dashboard
        </p>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
