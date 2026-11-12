import type { Config } from 'tailwindcss';

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        surface2: v('surface2'),
        ink: v('ink'),
        muted: v('muted'),
        line: v('line'),
        primary: v('primary'),
        deep: v('deep'),
        ivory: v('ivory'),
        gold: v('gold'),
        blue: v('blue'),
        'blue-soft': v('blue-soft'),
        'primary-ink': v('primary-ink'),
        soft: v('soft'),
        good: v('good'),
        'good-soft': v('good-soft'),
        warn: v('warn'),
        'warn-soft': v('warn-soft'),
        hard: v('hard'),
        'hard-soft': v('hard-soft'),
        alert: v('alert'),
        'alert-soft': v('alert-soft'),
        neutral: v('neutral'),
        'neutral-ink': v('neutral-ink'),
      },
      fontFamily: {
        sans: ['-apple-system', '"Segoe UI"', 'Helvetica', 'Arial', 'sans-serif'],
        display: ['"Iowan Old Style"', '"Palatino Linotype"', 'Palatino', '"Book Antiqua"', 'Georgia', 'serif'],
        arabic: ['"Amiri Quran"', '"Geeza Pro"', 'serif'],
      },
      borderRadius: { xl2: '1.25rem' },
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow) / 0.05), 0 8px 24px -12px rgb(var(--shadow) / 0.12)',
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        fade: { from: { opacity: '0' }, to: { opacity: '1' } },
        pop: { '0%': { transform: 'scale(.96)' }, '60%': { transform: 'scale(1.02)' }, '100%': { transform: 'scale(1)' } },
      },
      animation: {
        'fade-up': 'fade-up .35s cubic-bezier(.2,.7,.2,1) both',
        'sheet-up': 'sheet-up .3s cubic-bezier(.2,.8,.2,1) both',
        fade: 'fade .25s ease both',
        pop: 'pop .3s ease both',
      },
    },
  },
  plugins: [],
} satisfies Config;
