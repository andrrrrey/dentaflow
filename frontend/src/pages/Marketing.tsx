import { useLocation, useNavigate } from "react-router-dom";
import Discounts from "./marketing/Discounts";
import GiftCertificates from "./marketing/GiftCertificates";

const TABS = [
  { key: "discounts", label: "Скидки и бонусы", path: "/marketing/discounts" },
  { key: "certificates", label: "Подарочные сертификаты", path: "/marketing/certificates" },
];

export default function Marketing() {
  const location = useLocation();
  const navigate = useNavigate();
  const active = TABS.find((t) => location.pathname.startsWith(t.path))?.key ?? "discounts";

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-tabs */}
      <div className="flex gap-[3px] p-1 rounded-xl bg-[rgba(91,76,245,0.07)] w-fit">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => navigate(t.path)}
            className={`px-5 py-[7px] rounded-[9px] text-[12.5px] font-semibold transition-all border-none cursor-pointer ${active === t.key ? "bg-white text-accent2 shadow-[0_2px_8px_rgba(91,76,245,0.15)]" : "text-text-muted bg-transparent"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {active === "discounts" ? <Discounts /> : <GiftCertificates />}
    </div>
  );
}
