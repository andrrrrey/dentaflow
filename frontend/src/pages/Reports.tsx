import { useState } from "react";
import { format, subDays } from "date-fns";
import Card from "../components/ui/Card";
import StatCard from "../components/ui/StatCard";
import { useRevenueReport, usePatientsReport, useServicesReport, useDoctorsReport } from "../api/reports";
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";

const DAY_PAGE = 10;
const DAY_PREVIEW = 7;

export default function Reports() {
  const [dateFrom, setDateFrom] = useState(() => format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [dayExpanded, setDayExpanded] = useState(false);
  const [dayPage, setDayPage] = useState(1);

  const params = { date_from: dateFrom, date_to: dateTo };
  const { data: revenue, isLoading: revLoading } = useRevenueReport(params);
  const { data: patients, isLoading: patLoading } = usePatientsReport(params);
  const { data: services } = useServicesReport(params);
  const { data: doctors } = useDoctorsReport(params);

  const inputStyle = {
    border: "1px solid rgba(91,76,245,0.15)",
    background: "rgba(255,255,255,0.65)",
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Date range */}
      <div className="flex items-center gap-3">
        <label className="text-[12px] font-semibold text-text-muted">Период:</label>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-xl px-3 py-[7px] text-[12.5px] font-medium text-text-main outline-none"
          style={inputStyle}
        />
        <span className="text-text-muted text-[12px]">—</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-xl px-3 py-[7px] text-[12.5px] font-medium text-text-main outline-none"
          style={inputStyle}
        />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Выручка"
          value={revLoading ? "..." : `${(revenue?.total_revenue ?? 0).toLocaleString("ru-RU")} ₽`}
          icon="💰"
        />
        <StatCard
          label="Записей"
          value={revLoading ? "..." : String(revenue?.total_appointments ?? 0)}
          icon="📅"
        />
        <StatCard
          label="Новых пациентов"
          value={patLoading ? "..." : String(patients?.new_patients ?? 0)}
          icon="👤"
        />
        <StatCard
          label="Повторных"
          value={patLoading ? "..." : String(patients?.returning_patients ?? 0)}
          icon="🔄"
        />
      </div>

      {/* Revenue by day */}
      {revenue && revenue.by_day.length > 0 && (() => {
        const allDays = revenue.by_day;
        const totalPages = Math.ceil(allDays.length / DAY_PAGE);
        const visibleRows = dayExpanded
          ? allDays.slice((dayPage - 1) * DAY_PAGE, dayPage * DAY_PAGE)
          : allDays.slice(0, DAY_PREVIEW);
        return (
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[14px] font-bold">Выручка по дням</h3>
              {allDays.length > DAY_PREVIEW && (
                <button
                  onClick={() => { setDayExpanded((e) => !e); setDayPage(1); }}
                  className="flex items-center gap-1 text-[11.5px] font-semibold border-none cursor-pointer rounded-[8px] px-3 py-[5px] transition-colors"
                  style={{ background: "rgba(91,76,245,0.07)", color: "#5B4CF5" }}
                >
                  {dayExpanded ? <><ChevronUp size={13} /> Свернуть</> : <><ChevronDown size={13} /> Показать все ({allDays.length})</>}
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {["Дата", "Записей", "Выручка"].map((h) => (
                      <th key={h} className="text-left text-[10.5px] font-bold text-text-muted uppercase tracking-[0.8px] pb-[10px] px-[12px]" style={{ borderBottom: "1px solid rgba(91,76,245,0.08)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((d) => (
                    <tr key={d.date} className="hover:bg-[rgba(91,76,245,0.03)]" style={{ borderBottom: "1px solid rgba(91,76,245,0.05)" }}>
                      <td className="py-[8px] px-[12px] text-[12.5px] font-medium">{d.date}</td>
                      <td className="py-[8px] px-[12px] text-[12.5px] text-text-muted">{d.count}</td>
                      <td className="py-[8px] px-[12px] text-[12.5px] font-semibold">{d.revenue.toLocaleString("ru-RU")} ₽</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {dayExpanded && totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: "1px solid rgba(91,76,245,0.08)" }}>
                <span className="text-[11px] text-text-muted">Стр. {dayPage} из {totalPages}</span>
                <div className="flex gap-1">
                  <button onClick={() => setDayPage((p) => Math.max(1, p - 1))} disabled={dayPage === 1}
                    className="w-7 h-7 rounded-[7px] flex items-center justify-center border-none cursor-pointer disabled:opacity-40"
                    style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}>
                    <ChevronLeft size={13} />
                  </button>
                  <button onClick={() => setDayPage((p) => Math.min(totalPages, p + 1))} disabled={dayPage === totalPages}
                    className="w-7 h-7 rounded-[7px] flex items-center justify-center border-none cursor-pointer disabled:opacity-40"
                    style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}>
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            )}
          </Card>
        );
      })()}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Services popularity */}
        <Card>
          <h3 className="text-[14px] font-bold mb-3">Популярные услуги</h3>
          {!services?.services?.length ? (
            <div className="text-center text-text-muted py-6 text-[13px]">Нет данных</div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Услуга", "Кол-во", "Выручка"].map((h) => (
                    <th key={h} className="text-left text-[10.5px] font-bold text-text-muted uppercase tracking-[0.8px] pb-[8px] px-[10px]" style={{ borderBottom: "1px solid rgba(91,76,245,0.08)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {services.services.map((s) => (
                  <tr key={s.service} className="hover:bg-[rgba(91,76,245,0.03)]" style={{ borderBottom: "1px solid rgba(91,76,245,0.05)" }}>
                    <td className="py-[7px] px-[10px] text-[12px] font-medium max-w-[200px] truncate">{s.service}</td>
                    <td className="py-[7px] px-[10px] text-[12px] text-text-muted">{s.count}</td>
                    <td className="py-[7px] px-[10px] text-[12px] font-semibold">{s.revenue.toLocaleString("ru-RU")} ₽</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Doctors workload */}
        <Card>
          <h3 className="text-[14px] font-bold mb-3">Нагрузка врачей</h3>
          {!doctors?.doctors?.length ? (
            <div className="text-center text-text-muted py-6 text-[13px]">Нет данных</div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Врач", "Записей", "Завершено", "Выручка"].map((h) => (
                    <th key={h} className="text-left text-[10.5px] font-bold text-text-muted uppercase tracking-[0.8px] pb-[8px] px-[10px]" style={{ borderBottom: "1px solid rgba(91,76,245,0.08)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {doctors.doctors.map((d) => (
                  <tr key={d.doctor_name} className="hover:bg-[rgba(91,76,245,0.03)]" style={{ borderBottom: "1px solid rgba(91,76,245,0.05)" }}>
                    <td className="py-[7px] px-[10px] text-[12px] font-medium">{d.doctor_name}</td>
                    <td className="py-[7px] px-[10px] text-[12px] text-text-muted">{d.count}</td>
                    <td className="py-[7px] px-[10px] text-[12px] text-text-muted">{d.completed}</td>
                    <td className="py-[7px] px-[10px] text-[12px] font-semibold">{d.revenue.toLocaleString("ru-RU")} ₽</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
