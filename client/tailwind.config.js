/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#A8D8F0',
          dark: '#6AAEC8',
          light: '#DEEEFF',
        },
        accent: {
          DEFAULT: '#FFB7C5',
          dark: '#F5989E',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          bg: '#F5F8FC',
          border: '#E8F0F8',
        },
        text: {
          DEFAULT: '#2C3E50',
          light: '#7F8C9B',
          muted: '#999999',
        },
        success: '#7BC67E',
        danger: '#E8837C',
        warning: '#F0C040',
      },
      borderRadius: {
        card: '1.25rem',
        btn: '1rem',
        input: '1rem',
      },
      fontFamily: {
        sans: ["'Segoe UI'", "'PingFang SC'", "'Microsoft YaHei'", 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 2px 12px rgba(168, 216, 240, 0.25)',
        hover: '0 8px 30px rgba(168, 216, 240, 0.4)',
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.35s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'scale-in': 'scaleIn 0.25s ease-out',
        'shimmer': 'shimmer 1.5s infinite',
        'float': 'floatUpDown 3s ease-in-out infinite',
        'hero-shimmer': 'heroShimmer 6s ease-in-out infinite',
        'colorful-gradient': 'colorfulGradient 20s ease infinite',
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideInLeft: {
          from: { opacity: '0', transform: 'translateX(-20px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.92)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200px 0' },
          '100%': { backgroundPosition: 'calc(200px + 100%) 0' },
        },
        floatUpDown: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        heroShimmer: {
          '0%': { left: '-100%' },
          '50%': { left: '150%' },
          '100%': { left: '150%' },
        },
        colorfulGradient: {
          '0%': { backgroundPosition: '0% 50%' },
          '25%': { backgroundPosition: '100% 0%' },
          '50%': { backgroundPosition: '100% 50%' },
          '75%': { backgroundPosition: '0% 100%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
      },
    },
  },
  plugins: [],
};
