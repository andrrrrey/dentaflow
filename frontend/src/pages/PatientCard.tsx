import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import clsx from "clsx";
import { usePatientDetail } from "../api/patients";
import PatientHeader from "../components/patient/PatientHeader";
import MedHistory from "../components/patient/MedHistory";
import CommHistory from "../components/patient/CommHistory";
import DealsHistory from "../components/patient/DealsHistory";
import TasksList from "../components/patient/TasksList";
import AIAnalysis from "../components/patient/AIAnalysis";
import PatientStats from "../components/patient/PatientStats";

type TabKey = "1denta" | "stats" | "communications" | "crm" | "tasks";

const TABS: { key: TabKey; label: string }[] = [
  { key: "1denta", label: "История визитов" },
  { key: "stats", label: "Статистика" },
  { key: "communications", label: "Коммуникации" },
  { key: "crm", label: "CRM" },
  { key: "tasks", label: "Задачи" },
];

export default function PatientCard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: patient, isLoading } = usePatientDetail(id);
  const [activeTab, setActiveTab] = useState<TabKey>("1denta");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-text-muted text-[14px]">Загрузка...</div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="text-text-muted text-[14px]">Пациент не найден</div>
        <button
          onClick={() => navigate("/patients")}
          className="text-accent2 text-[13px] font-semibold hover:underline cursor-pointer bg-transparent border-none"
        >
          Вернуться к списку
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[16px]">
      {/* Back button */}
      <button
        onClick={() => navigate("/patients")}
        className="flex items-center gap-1.5 text-[13px] font-semibold text-text-muted hover:text-accent2 transition-colors cursor-pointer bg-transparent border-none w-fit"
      >
        <ArrowLeft size={16} />
        Пациенты
      </button>

      {/* Patient Header */}
      <PatientHeader patient={patient} />

      {/* Main content: tabs + AI */}
      <div className="flex flex-col lg:flex-row gap-[16px]">
        {/* Left: Tabs */}
        <div className="flex-1 min-w-0">
          {/* Tab navigation */}
          <div
            className="flex gap-1 p-[4px] rounded-[14px] mb-[14px]"
            style={{
              background: "rgba(255,255,255,0.55)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.85)",
            }}
          >
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={clsx(
                  "px-[14px] py-[8px] rounded-[10px] text-[12.5px] font-semibold transition-all duration-150 cursor-pointer border-none flex-1",
                  activeTab === tab.key
                    ? "text-white"
                    : "text-text-muted bg-transparent hover:bg-[rgba(91,76,245,0.06)]",
                )}
                style={
                  activeTab === tab.key
                    ? {
                        background: "linear-gradient(135deg, #5B4CF5, #3B7FED)",
                        boxShadow: "0 2px 8px rgba(91,76,245,0.25)",
                      }
                    : undefined
                }
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === "1denta" && (
            <MedHistory appointments={patient.appointments} />
          )}
          {activeTab === "stats" && (
            <PatientStats stats={patient.stats} rawData={patient.raw_1denta_data} appointments={patient.appointments} />
          )}
          {activeTab === "communications" && (
            <CommHistory communications={patient.communications} />
          )}
          {activeTab === "crm" && (
            <DealsHistory deals={patient.deals} />
          )}
          {activeTab === "tasks" && (
            <TasksList tasks={patient.tasks} patientId={patient.id} patientName={patient.name} />
          )}
        </div>

        {/* Right: AI Analysis */}
        <div className="lg:w-[340px] flex-shrink-0">
          <AIAnalysis analysis={patient.ai_analysis} patientId={patient.id} />
        </div>
      </div>
    </div>
  );
}
