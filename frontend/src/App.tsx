import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import PipelinePage from "./pages/Pipeline";
import Communications from "./pages/Communications";
import Login from "./pages/Login";
import Patients from "./pages/Patients";
import PatientCard from "./pages/PatientCard";
import Schedule from "./pages/Schedule";
import CallsQC from "./pages/CallsQC";
import ScriptsQC from "./pages/ScriptsQC";
import Reactivation from "./pages/Reactivation";
import Analytics from "./pages/Analytics";
import Marketing from "./pages/Marketing";
import Staff from "./pages/Staff";
import Settings from "./pages/Settings";
import Referral from "./pages/Referral";

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
        <Route
          path="/patients"
          element={
            <ProtectedRoute>
              <AppLayout title="Пациенты">
                <Patients />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/patients/:id"
          element={
            <ProtectedRoute>
              <AppLayout title="Карточка пациента">
                <PatientCard />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/schedule"
          element={
            <ProtectedRoute>
              <AppLayout title="Расписание">
                <Schedule />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/calls"
          element={
            <ProtectedRoute>
              <AppLayout title="Контроль звонков">
                <CallsQC />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/scripts"
          element={
            <ProtectedRoute>
              <AppLayout title="Контроль скриптов">
                <ScriptsQC />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/reactivation"
          element={
            <ProtectedRoute>
              <AppLayout title="Реактивация пациентов">
                <Reactivation />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <AppLayout title="Аналитика">
                <Analytics />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/marketing"
          element={
            <ProtectedRoute>
              <AppLayout title="Маркетинг">
                <Marketing />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff"
          element={
            <ProtectedRoute>
              <AppLayout title="Сотрудники">
                <Staff />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <AppLayout title="Настройки">
                <Settings />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/referral"
          element={
            <ProtectedRoute>
              <AppLayout title="Реферальная программа">
                <Referral />
              </AppLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
