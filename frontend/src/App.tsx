import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import PipelinePage from "./pages/Pipeline";
import Communications from "./pages/Communications";
import Login from "./pages/Login";

/* ---------- app ---------- */

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Login renders without AppLayout */}
        <Route path="/login" element={<Login />} />

        {/* All other routes use AppLayout + ProtectedRoute */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout title="Главная">
                <Dashboard />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/communications"
          element={
            <ProtectedRoute>
              <AppLayout title="Коммуникации">
                <Communications />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/pipeline"
          element={
            <ProtectedRoute>
              <AppLayout title="Воронка пациентов">
                <PipelinePage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
