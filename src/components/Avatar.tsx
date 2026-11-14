import type { Gender } from '@/engine/types';

/** Photos de profil illustrées (sans visage), selon le genre choisi. */
export function Avatar({ gender, size = 64, className }: { gender?: Gender | null; size?: number; className?: string }) {
  const common = { width: size, height: size, viewBox: '0 0 120 120', className, role: 'img' as const };
  if (gender === 'female') {
    return (
      <svg {...common} aria-label="Photo de profil : femme">
        <defs><clipPath id="av-f"><circle cx="60" cy="60" r="60" /></clipPath></defs>
        <g clipPath="url(#av-f)">
          <rect width="120" height="120" fill="#FCEFF0" />
          <path d="M14 70c0-24 18-42 34-46 22-6 52 8 58 34 4 18-6 34-16 44H20z" fill="#F4D3D3" />
          <path d="M16 126c2-22 14-36 30-42h28c16 6 28 20 30 42z" fill="#B87474" />
          <path d="M60 14c-20 0-33 16-33 38 0 14 4 28 10 40l-14 8c8 8 22 14 37 14s29-6 37-14l-14-8c6-12 10-26 10-40 0-22-13-38-33-38z" fill="#D5ADAF" />
          <path d="M60 22c-14 0-23 12-23 30 0 14 4 26 9 36 4 6 9 10 14 10s10-4 14-10c5-10 9-22 9-36 0-18-9-30-23-30z" fill="#B87474" />
          <ellipse cx="60" cy="52" rx="17" ry="25" fill="#F5D2C9" />
          <path d="M46 94c6 8 22 8 28 0l10 8c-10 10-38 10-48 0z" fill="#9E6062" opacity=".85" />
        </g>
      </svg>
    );
  }
  return (
    <svg {...common} aria-label="Photo de profil : homme">
      <defs><clipPath id="av-m"><circle cx="60" cy="60" r="60" /></clipPath></defs>
      <g clipPath="url(#av-m)">
        <rect width="120" height="120" fill="#F2EBDD" />
        <path d="M18 128c2-26 14-40 30-44h24c16 4 28 18 30 44z" fill="#FFFFFF" stroke="#1d1d1d" strokeWidth="1.3" />
        <path d="M36 30c4-14 14-18 24-18s20 4 24 18c4 14 6 40 6 58l-8 4c-2-14-4-28-4-40H42c0 12-2 26-4 40l-8-4c0-18 2-44 6-58z" fill="#FFFFFF" stroke="#1d1d1d" strokeWidth="1.3" />
        <path d="M32 90c6 2 10 0 14-6l-4-14c-2 8-6 16-10 20z" fill="#E4EAF2" />
        <ellipse cx="60" cy="52" rx="16" ry="22" fill="#F4C79A" />
        <path d="M44 68c4 12 28 12 32 0l2 6c-6 12-30 12-36 0z" fill="#1d1d1d" />
        <rect x="34" y="18" width="52" height="9" rx="4.5" fill="#1d1d1d" />
        <path d="M44 38c6-6 26-6 32 0-8-2-24-2-32 0z" fill="#FFFFFF" />
      </g>
    </svg>
  );
}
