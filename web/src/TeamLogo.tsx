/**
 * TeamLogo — renders a team logo image with abbreviation fallback.
 * Usage: <TeamLogo abbr="BAL" size={40} />
 */

interface TeamLogoProps {
  abbr: string;
  size?: number;
  className?: string;
}

const cache = new Set<string>();
const broken = new Set<string>();

function logoSrc(abbr: string): string {
  return `/assets/teams/team_${abbr.toLowerCase()}.png`;
}

export function TeamLogo({ abbr, size = 32, className = '' }: TeamLogoProps) {
  const src = logoSrc(abbr);
  const hasBroken = broken.has(abbr);

  return (
    <span
      className={`team-logo ${className}`}
      style={{ width: size, height: size, minWidth: size }}
    >
      {!hasBroken ? (
        <img
          src={src}
          alt={abbr}
          width={size}
          height={size}
          loading="lazy"
          onError={(e) => {
            broken.add(abbr);
            (e.target as HTMLImageElement).style.display = 'none';
            const parent = (e.target as HTMLImageElement).parentElement;
            if (parent) parent.classList.add('team-logo--fallback');
          }}
          onLoad={() => cache.add(abbr)}
        />
      ) : (
        <span className="team-logo-abbr">{abbr}</span>
      )}
    </span>
  );
}
