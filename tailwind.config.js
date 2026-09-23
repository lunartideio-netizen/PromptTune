/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // We enforce strict light mode by never adding 'dark' class
  theme: {
    extend: {
      colors: {
        mac: {
          canvas: "#FAF9F6",
          canvasAlt: "#F4F2EB",
          surface: "rgba(255, 255, 255, 0.78)",
          surfaceElevated: "#FFFFFF",
          border: "rgba(0, 0, 0, 0.06)",
          borderHover: "rgba(0, 0, 0, 0.12)",
          textPrimary: "#1D1D1F",
          textSecondary: "#48484A",
          textMuted: "#6E6E73",
          accentBlue: "#0A84FF",
          accentBlueHover: "#0071E3",
          accentGreen: "#34C759",
          accentCoral: "#FF6B4A",
          accentAmber: "#FF9F0A",
          accentPurple: "#AF52DE",
        },
        diff: {
          addBg: "rgba(52, 199, 89, 0.12)",
          addBorder: "rgba(52, 199, 89, 0.3)",
          addText: "#15803D",
          delBg: "rgba(255, 59, 48, 0.12)",
          delBorder: "rgba(255, 59, 48, 0.3)",
          delText: "#B91C1C",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          '"SF Pro Display"',
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
        mono: [
          '"SF Mono"',
          "Menlo",
          "Monaco",
          "Consolas",
          '"Liberation Mono"',
          '"Courier New"',
          "monospace",
        ],
      },
      boxShadow: {
        mac: "0 4px 20px -2px rgba(0, 0, 0, 0.04)",
        macElevated: "0 12px 36px -4px rgba(0, 0, 0, 0.08), 0 4px 12px -2px rgba(0, 0, 0, 0.04)",
        macModal: "0 24px 60px -12px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.08)",
        macHover: "0 8px 24px -4px rgba(0, 0, 0, 0.06)",
      },
      keyframes: {
        bounceSubtle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
      animation: {
        'bounce-subtle': 'bounceSubtle 2s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
