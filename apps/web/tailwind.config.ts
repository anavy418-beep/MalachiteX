import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef8ff",
          100: "#d9edff",
          500: "#0878d8",
          700: "#065495",
          900: "#073156",
        },
      },
    },
  },
  plugins: [],
};

export default config;
