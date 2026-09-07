/** Inline SPIORA wordmark for dark surfaces (survey, etc.). */
export function SpioraWordmark({
  className,
  title = "SPIORA",
}: {
  className?: string;
  title?: string;
}) {
  const gradId = "spioraWordmarkGrad";

  return (
    <svg
      className={className}
      viewBox="0 0 520 96"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F4981A" />
          <stop offset="100%" stopColor="#E82916" />
        </linearGradient>
      </defs>

      <g
        fill="#FFFFFF"
        fontFamily="Inter, Arial, Helvetica, sans-serif"
        fontSize="68"
        fontWeight="700"
      >
        <text x="0" y="72">
          S
        </text>
        <text x="72" y="72">
          P
        </text>
        <text x="148" y="72">
          I
        </text>
        <text x="292" y="72">
          R
        </text>
      </g>

      {/* Power-button O between I and R */}
      <g transform="translate(196 10)">
        <path
          d="M16 22 A28 28 0 1 0 48 22"
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="9.5"
          strokeLinecap="round"
        />
        <line
          x1="32"
          y1="4"
          x2="32"
          y2="38"
          stroke={`url(#${gradId})`}
          strokeWidth="9.5"
          strokeLinecap="round"
        />
      </g>

      {/* Chevron A */}
      <path
        d="M372 80 L412 16 L452 80"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
