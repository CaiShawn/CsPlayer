/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 主题色（强调色）语义 token，由 CSS 变量驱动（RGB 三元组 + <alpha-value> 支持透明度）
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          text: 'rgb(var(--color-accent-text) / <alpha-value>)',
          soft: 'rgb(var(--color-accent-soft) / <alpha-value>)',
          hover: 'rgb(var(--color-accent-hover) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
}
