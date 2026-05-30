/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.tsx", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        // KVV S-Bahn / tram line colors (used via inline style, kept here for reference)
        line: { s2: "#A3257F", s6: "#6E4C9E", s9: "#E2001A" },
      },
    },
  },
  plugins: [],
};
