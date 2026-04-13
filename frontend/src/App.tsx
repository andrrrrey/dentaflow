import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import Card from "./components/ui/Card";

/* ---------- placeholder pages ---------- */

function Dashboard() {
  return (
    <Card>
      <h2 className="text-lg font-extrabold">Главная — Обзор клиники</h2>
      <p className="text-sm text-text-muted mt-2">
        Дашборд с KPI и аналитикой будет здесь.
      </p>
    </Card>
  );
}

function Communications() {
  return (
    <Card>
      <h2 className="text-lg font-extrabold">Коммуникации</h2>
      <p className="text-sm text-text-muted mt-2">
        Чаты и сообщения пациентов.
      </p>
    </Card>
  );
}

function Pipeline() {
  return (
    <Card>
      <h2 className="text-lg font-extrabold">Воронка пациентов</h2>
      <p className="text-sm text-text-muted mt-2">
        Канбан-доска воронки продаж.
      </p>
    </Card>
  );
}

function Login() {
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
          Вход в систему
        </p>
      </div>
    </div>
  );
}

/* ---------- app ---------- */

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Login renders without AppLayout */}
        <Route path="/login" element={<Login />} />

        {/* All other routes use AppLayout */}
        <Route
          path="/"
          element={
            <AppLayout title="Главная">
              <Dashboard />
            </AppLayout>
          }
        />
        <Route
          path="/communications"
          element={
            <AppLayout title="Коммуникации">
              <Communications />
            </AppLayout>
          }
        />
        <Route
          path="/pipeline"
          element={
            <AppLayout title="Воронка пациентов">
              <Pipeline />
            </AppLayout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
