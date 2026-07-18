import { useLocation, useNavigate } from "react-router-dom";
import LoyaltySettings from "./loyalty/LoyaltySettings";
import LoyaltyStatsPage from "./loyalty/LoyaltyStats";
import LoyaltyReviews from "./loyalty/LoyaltyReviews";
import LoyaltyRatings from "./loyalty/LoyaltyRatings";

const TABS = [
  { key: "settings", label: "Настройки", path: "/loyalty/settings" },
  { key: "stats", label: "Статистика", path: "/loyalty/stats" },
  { key: "reviews", label: "Отзывы", path: "/loyalty/reviews" },
  { key: "ratings", label: "Рейтинги", path: "/loyalty/ratings" },
];

export default function Loyalty() {
  const location = useLocation();
  const navigate = useNavigate();
  const active = TABS.find((t) => location.pathname.startsWith(t.path))?.key ?? "settings";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-[3px] p-1 rounded-xl bg-[rgba(91,76,245,0.07)] w-fit">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => navigate(t.path)}
              className={`px-5 py-[7px] rounded-[9px] text-[12.5px] font-semibold transition-all border-none cursor-pointer ${active === t.key ? "bg-white text-accent2 shadow-[0_2px_8px_rgba(91,76,245,0.15)]" : "text-text-muted bg-transparent"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {active === "settings" && <LoyaltySettings />}
      {active === "stats" && <LoyaltyStatsPage />}
      {active === "reviews" && <LoyaltyReviews />}
      {active === "ratings" && <LoyaltyRatings />}
    </div>
  );
}
