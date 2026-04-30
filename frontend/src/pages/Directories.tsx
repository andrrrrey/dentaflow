import { useState } from "react";
import { Stethoscope, Users, Package } from "lucide-react";
import Card from "../components/ui/Card";
import { useServices, useResources, useCommodities } from "../api/directories";

type Tab = "services" | "resources" | "commodities";

const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "services", label: "Услуги", icon: <Stethoscope size={13} /> },
  { key: "resources", label: "Врачи / Ресурсы", icon: <Users size={13} /> },
  { key: "commodities", label: "Товары", icon: <Package size={13} /> },
];

export default function Directories() {
  const [tab, setTab] = useState<Tab>("services");

  const { data: servicesData, isLoading: servicesLoading } = useServices();
  const { data: resourcesData, isLoading: resourcesLoading } = useResources();
  const { data: commoditiesData, isLoading: commoditiesLoading } = useCommodities();

  const services = servicesData?.services ?? [];
  const resources = resourcesData?.resources ?? [];
  const commodities = commoditiesData?.commodities ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        {/* Tabs */}
        <div className="flex gap-[3px] p-1 rounded-xl bg-[rgba(91,76,245,0.07)] w-fit mb-4">
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

        {/* Services */}
        {tab === "services" && (
          servicesLoading ? (
            <Loading />
          ) : services.length === 0 ? (
            <Empty text="Нет данных об услугах" />
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["ID", "Название", "Категория", "Цена", "Длительность"].map((h) => (
                    <TH key={h}>{h}</TH>
                  ))}
                </tr>
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
        {tab === "resources" && (
          resourcesLoading ? (
            <Loading />
          ) : resources.length === 0 ? (
            <Empty text="Нет данных о врачах" />
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["ID", "Имя", "Описание"].map((h) => (
                    <TH key={h}>{h}</TH>
                  ))}
                </tr>
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
        {tab === "commodities" && (
          commoditiesLoading ? (
            <Loading />
          ) : commodities.length === 0 ? (
            <Empty text="Нет данных о товарах" />
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["ID", "Название", "Категория", "Цена"].map((h) => (
                    <TH key={h}>{h}</TH>
                  ))}
                </tr>
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
  return <div className="text-center text-text-muted py-12 text-[13px]">Загрузка данных из 1Denta...</div>;
}

function Empty({ text }: { text: string }) {
  return <div className="text-center text-text-muted py-12 text-[13px]">{text}</div>;
}

function TH({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left text-[10.5px] font-bold text-text-muted uppercase tracking-[0.8px] pb-[10px] px-[12px]" style={{ borderBottom: "1px solid rgba(91,76,245,0.08)" }}>
      {children}
    </th>
  );
}

function TR({ children }: { children: React.ReactNode }) {
  return (
    <tr className="hover:bg-[rgba(91,76,245,0.03)]" style={{ borderBottom: "1px solid rgba(91,76,245,0.05)" }}>
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
