import { useState } from "react";
import { Stethoscope, Users, Package, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import Card from "../components/ui/Card";
import { useServices, useResources, useCommodities, useSyncDirectories } from "../api/directories";

type Tab = "services" | "resources" | "commodities";

const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "services", label: "Услуги", icon: <Stethoscope size={13} /> },
  { key: "resources", label: "Врачи / Ресурсы", icon: <Users size={13} /> },
  { key: "commodities", label: "Товары", icon: <Package size={13} /> },
];

function formatSyncedAt(iso: string | null | undefined): string {
  if (!iso) return "никогда";
  try {
    return format(parseISO(iso), "d MMM yyyy, HH:mm", { locale: ru });
  } catch {
    return iso;
  }
}

export default function Directories() {
  const [tab, setTab] = useState<Tab>("services");
  const sync = useSyncDirectories();

  const { data: servicesData, isLoading: servicesLoading } = useServices();
  const { data: resourcesData, isLoading: resourcesLoading } = useResources();
  const { data: commoditiesData, isLoading: commoditiesLoading } = useCommodities();

  const services = servicesData?.services ?? [];
  const resources = resourcesData?.resources ?? [];
  const commodities = commoditiesData?.commodities ?? [];

  const syncedAt =
    servicesData?.synced_at ??
    resourcesData?.synced_at ??
    commoditiesData?.synced_at ?? null;

  const isEmpty = services.length === 0 && resources.length === 0 && commodities.length === 0;
  const currentLoading = tab === "services" ? servicesLoading : tab === "resources" ? resourcesLoading : commoditiesLoading;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-[3px] p-1 rounded-xl bg-[rgba(91,76,245,0.07)] w-fit">
            {tabs.map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1 px-3 py-[5px] rounded-[9px] text-[12px] font-semibold transition-all border-none ${
                  tab === key
                    ? "bg-white text-accent2 shadow-[0_2px_8px_rgba(91,76,245,0.15)]"
                    : "text-text-muted bg-transparent cursor-pointer"
                }`}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {syncedAt && !isEmpty && (
              <span className="text-[11px] text-text-muted">
                Обновлено: {formatSyncedAt(syncedAt)}
              </span>
            )}
            <button
              onClick={() => sync.mutate()}
              disabled={sync.isPending}
              className="flex items-center gap-1.5 px-4 py-[7px] rounded-xl text-[12px] font-semibold text-white border-none cursor-pointer disabled:opacity-60 transition-all"
              style={{ background: "linear-gradient(135deg,#5B4CF5,#3B7FED)" }}
            >
              <RefreshCw size={12} className={sync.isPending ? "animate-spin" : ""} />
              {sync.isPending ? "Загрузка из 1Denta..." : "Обновить из 1Denta"}
            </button>
          </div>
        </div>

        {/* Sync result message */}
        {sync.isSuccess && sync.data && (
          <div className="mb-4 px-4 py-3 rounded-xl flex items-start gap-2 text-[12.5px]"
            style={{ background: sync.data.ok ? "rgba(0,201,167,0.08)" : "rgba(245,166,35,0.08)", border: `1px solid ${sync.data.ok ? "rgba(0,201,167,0.2)" : "rgba(245,166,35,0.2)"}` }}>
            {sync.data.ok
              ? <CheckCircle size={14} className="text-[#00c9a7] flex-shrink-0 mt-0.5" />
              : <AlertCircle size={14} className="text-[#f5a623] flex-shrink-0 mt-0.5" />}
            <div>
              <span className="font-semibold">
                {sync.data.ok ? "Данные обновлены. " : "Частичное обновление. "}
              </span>
              {Object.entries(sync.data.counts).map(([k, v]) => (
                <span key={k} className="mr-2">
                  {k === "services" ? "Услуг" : k === "resources" ? "Врачей" : "Товаров"}: {v}
                </span>
              ))}
              {Object.entries(sync.data.errors ?? {}).map(([k, v]) => (
                <div key={k} className="text-[#c52048] mt-1">{k}: {v}</div>
              ))}
            </div>
          </div>
        )}

        {sync.isError && (
          <div className="mb-4 px-4 py-3 rounded-xl flex items-center gap-2 text-[12.5px]"
            style={{ background: "rgba(197,32,72,0.07)", border: "1px solid rgba(197,32,72,0.15)" }}>
            <AlertCircle size={14} className="text-[#c52048]" />
            <span>Ошибка подключения к 1Denta. Проверьте настройки интеграции.</span>
          </div>
        )}

        {/* Empty state with sync prompt */}
        {isEmpty && !currentLoading && !sync.isPending && (
          <div className="text-center py-12">
            <div className="text-[14px] font-semibold text-text-main mb-2">Данные не загружены</div>
            <div className="text-[12.5px] text-text-muted mb-4">
              Нажмите «Обновить из 1Denta» чтобы загрузить справочники
            </div>
          </div>
        )}

        {/* Services */}
        {tab === "services" && !isEmpty && (
          servicesLoading ? <Loading /> :
          services.length === 0 ? <Empty text="Нет данных об услугах" /> : (
            <table className="w-full border-collapse">
              <thead>
                <tr>{["ID", "Название", "Категория", "Цена", "Длительность"].map((h) => <TH key={h}>{h}</TH>)}</tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <TR key={s.id}>
                    <TD mono>{String(s.id)}</TD>
                    <TD bold>{s.name}</TD>
                    <TD>{s.categoryName || "—"}</TD>
                    <TD>{s.price ? `${s.price} ₽` : "—"}</TD>
                    <TD>{s.duration ? `${s.duration} мин` : "—"}</TD>
                  </TR>
                ))}
              </tbody>
            </table>
          )
        )}

        {/* Resources */}
        {tab === "resources" && !isEmpty && (
          resourcesLoading ? <Loading /> :
          resources.length === 0 ? <Empty text="Нет данных о врачах" /> : (
            <table className="w-full border-collapse">
              <thead>
                <tr>{["ID", "Имя", "Описание"].map((h) => <TH key={h}>{h}</TH>)}</tr>
              </thead>
              <tbody>
                {resources.map((r) => (
                  <TR key={r.id}>
                    <TD mono>{String(r.id)}</TD>
                    <TD bold>{r.name}</TD>
                    <TD>{r.description || "—"}</TD>
                  </TR>
                ))}
              </tbody>
            </table>
          )
        )}

        {/* Commodities */}
        {tab === "commodities" && !isEmpty && (
          commoditiesLoading ? <Loading /> :
          commodities.length === 0 ? <Empty text="Нет данных о товарах" /> : (
            <table className="w-full border-collapse">
              <thead>
                <tr>{["ID", "Название", "Категория", "Цена"].map((h) => <TH key={h}>{h}</TH>)}</tr>
              </thead>
              <tbody>
                {commodities.map((c) => (
                  <TR key={c.id}>
                    <TD mono>{String(c.id)}</TD>
                    <TD bold>{c.name}</TD>
                    <TD>{c.categoryName || "—"}</TD>
                    <TD>{c.price ? `${c.price} ₽` : "—"}</TD>
                  </TR>
                ))}
              </tbody>
            </table>
          )
        )}
      </Card>
    </div>
  );
}

function Loading() {
  return <div className="text-center text-text-muted py-12 text-[13px]">Загрузка...</div>;
}

function Empty({ text }: { text: string }) {
  return <div className="text-center text-text-muted py-12 text-[13px]">{text}</div>;
}

function TH({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left text-[10.5px] font-bold text-text-muted uppercase tracking-[0.8px] pb-[10px] px-[12px]"
      style={{ borderBottom: "1px solid rgba(91,76,245,0.08)" }}>
      {children}
    </th>
  );
}

function TR({ children }: { children: React.ReactNode }) {
  return (
    <tr className="hover:bg-[rgba(91,76,245,0.03)]"
      style={{ borderBottom: "1px solid rgba(91,76,245,0.05)" }}>
      {children}
    </tr>
  );
}

function TD({ children, mono, bold }: { children: React.ReactNode; mono?: boolean; bold?: boolean }) {
  return (
    <td className={`py-[10px] px-[12px] text-[12.5px] ${mono ? "font-mono" : ""} ${bold ? "font-semibold" : "text-text-muted"}`}>
      {children}
    </td>
  );
}
