interface NomerchiLogoProps {
  size?: number;
  className?: string;
}

export function NomerchiLogo({ size = 48, className = "" }: NomerchiLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id="shadowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e40af" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#5b21b6" stopOpacity="0.3" />
        </linearGradient>
      </defs>

      <rect width="100" height="100" rx="22" fill="url(#bgGrad)" />

      <rect width="100" height="100" rx="22" fill="white" fillOpacity="0.06" />

      <ellipse cx="50" cy="78" rx="16" ry="5" fill="black" fillOpacity="0.25" />

      <path
        d="M50 18C37.85 18 28 27.85 28 40C28 54.5 50 82 50 82C50 82 72 54.5 72 40C72 27.85 62.15 18 50 18Z"
        fill="white"
        fillOpacity="0.95"
      />
      <circle cx="50" cy="40" r="9" fill="url(#bgGrad)" />
      <circle cx="50" cy="40" r="4.5" fill="white" fillOpacity="0.9" />
    </svg>
  );
}

export function NomerchiLogoFull({ size = 48, className = "" }: NomerchiLogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <NomerchiLogo size={size} />
      <span
        style={{ fontSize: size * 0.5, fontWeight: 700, letterSpacing: "-0.02em" }}
        className="bg-gradient-to-r from-blue-500 to-violet-500 bg-clip-text text-transparent"
      >
        Nomerchi
      </span>
    </div>
  );
}
