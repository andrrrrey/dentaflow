import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { api } from "../api/client";
import Discounts from "./marketing/Discounts";
import GiftCertificates from "./marketing/GiftCertificates";

const TABS = [
  { key: "discounts", label: "Скидки и бонусы", path: "/marketing/discounts" },
  { key: "certificates", label: "Подарочные сертификаты", path: "/marketing/certificates" },
];

export default function Marketing() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const active = TABS.find((t) => location.pathname.startsWith(t.path))?.key ?? "discounts";

  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/marketing/sync-1denta");
      return data as { synced_certificates: number; synced_discounts: number; message: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discounts"] });
      queryClient.invalidateQueries({ queryKey: ["certificates"] });
    },
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-tabs + sync */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-[3px] p-1 rounded-xl bg-[rgba(91,76,245,0.07)] w-fit">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => navigate(t.path)}
              className={`px-5 py-[7px] rounded-[9px] text-[12.5px] font-semibold transition-all border-none cursor-pointer ${active === t.key ? "bg-white text-accent2 shadow-[0_2px_8px_rgba(91,76,245,0.15)]" : "text-text-muted bg-transparent"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="flex items-center gap-2 px-4 py-[8px] rounded-[10px] text-[12px] font-semibold border-none cursor-pointer transition-all disabled:opacity-50"
          style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}
        >
          <RefreshCw size={13} className={syncMutation.isPending ? "animate-spin" : ""} />
          {syncMutation.isPending ? "Синхронизация..." : "Загрузить из 1Denta"}
        </button>
      </div>

      {syncMutation.isSuccess && (
        <div className="text-[12px] text-[#00c9a7] font-medium">
          Импортировано: {syncMutation.data.synced_discounts} скидок, {syncMutation.data.synced_certificates} сертификатов
        </div>
      )}

      {active === "discounts" ? <Discounts /> : <GiftCertificates />}
    </div>
  );
}
