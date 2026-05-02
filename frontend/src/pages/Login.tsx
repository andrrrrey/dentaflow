import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Ошибка входа";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background:
          "linear-gradient(135deg, #e8eaf6 0%, #f3e5f5 30%, #e3f2fd 60%, #f1f8e9 100%)",
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[400px] rounded-glass p-8"
        style={{
          background: "rgba(255,255,255,0.55)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1.5px solid rgba(255,255,255,0.85)",
          boxShadow:
            "0 8px 32px rgba(120,140,180,0.18), 0 1.5px 6px rgba(91,76,245,0.08)",
        }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold tracking-tight">
            <span className="bg-gradient-to-r from-accent2 via-accent to-accent3 bg-clip-text text-transparent">
              DentaFlow
            </span>
          </h1>
          <p className="mt-2 text-text-muted text-sm font-medium">
            Вход в систему управления клиникой
          </p>
        </div>

        {/* Error */}
        {error && (
          <div
            className="mb-4 rounded-xl px-4 py-3 text-sm font-medium"
            style={{
              background: "rgba(239,68,68,0.08)",
              color: "#dc2626",
              border: "1px solid rgba(239,68,68,0.15)",
            }}
          >
            {error}
          </div>
        )}

        {/* Email */}
        <div className="mb-4">
          <label
            htmlFor="email"
            className="block text-xs font-semibold text-text-muted mb-1.5"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@dentaflow.ru"
            required
            autoComplete="email"
            className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all duration-150 focus:ring-2 focus:ring-accent2/30"
            style={{
              background: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(200,210,230,0.5)",
            }}
          />
        </div>

        {/* Password */}
        <div className="mb-6">
          <label
            htmlFor="password"
            className="block text-xs font-semibold text-text-muted mb-1.5"
          >
            Пароль
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all duration-150 focus:ring-2 focus:ring-accent2/30"
            style={{
              background: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(200,210,230,0.5)",
            }}
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center font-semibold font-sans cursor-pointer transition-all duration-150 border-none text-white rounded-xl py-3 text-sm hover:opacity-90 hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: "linear-gradient(135deg, #5B4CF5, #3B7FED)",
            boxShadow: "0 4px 14px rgba(91,76,245,0.3)",
          }}
        >
          {loading ? (
            <div
              className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin"
            />
          ) : (
            "Войти"
          )}
        </button>

        {/* Dev hint */}
        <p className="mt-5 text-center text-[11px] text-text-muted/60 select-all">
          owner@dentaflow.ru / admin123
        </p>
      </form>
    </div>
  );
}
