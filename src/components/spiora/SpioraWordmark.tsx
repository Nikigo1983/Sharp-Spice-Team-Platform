/** Official SPIORA wordmark + tagline for dark transparent surfaces. */
export function SpioraWordmark({
  className,
  title = "SPIORA",
  showTagline = true,
}: {
  className?: string;
  title?: string;
  showTagline?: boolean;
}) {
  const height = showTagline ? 132 : 96;

  return (
    <svg
      className={className}
      viewBox={`0 0 560 ${height}`}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Transparent background — adapts to page */}
      <g
        fill="#FFFFFF"
        fontFamily="Inter, Arial, Helvetica, sans-serif"
        fontSize="72"
        fontWeight="700"
      >
        <text x="0" y="74">
          S
        </text>
        <text x="78" y="74">
          P
        </text>
        <text x="158" y="74">
          I
        </text>
        <text x="312" y="74">
          R
        </text>
      </g>

      {/* Power-button O — brand orange */}
      <g transform="translate(210 8)">
        <path
          d="M18 24 A30 30 0 1 0 54 24"
          fill="none"
          stroke="#F4981A"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <line
          x1="36"
          y1="4"
          x2="36"
          y2="40"
          stroke="#F4981A"
          strokeWidth="10"
          strokeLinecap="round"
        />
      </g>

      {/* Chevron A */}
      <path
        d="M398 86 L442 14 L486 86"
        fill="none"
        stroke="#F4981A"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {showTagline ? (
        <g
          fontFamily="Raleway, Inter, Arial, sans-serif"
          fontSize="13"
          fontWeight="500"
          letterSpacing="0.28em"
        >
          <text x="0" y="118" fill="#FFFFFF">
            ONE PLATFORM.
          </text>
          <text x="228" y="118" fill="#F4981A">
            INFINITE SOLUTIONS.
          </text>
        </g>
      ) : null}
    </svg>
  );
}
