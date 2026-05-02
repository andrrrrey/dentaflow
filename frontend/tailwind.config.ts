import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: "#3B7FED",
        accent2: "#5B4CF5",
        accent3: "#00C9A7",
        danger: "#F44B6E",
        warn: "#F5A623",
        "text-main": "#1e293b",
        "text-muted": "#64748b",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        glass: "20px",
        card: "18px",
      },
      backdropBlur: {
        glass: "16px",
        "glass-lg": "24px",
      },
    },
  },
  plugins: [],
};

export default config;
