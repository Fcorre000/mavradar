import Svg, { Circle, Path, Rect } from 'react-native-svg';

type IconProps = { size?: number; color: string };

const stroke = (color: string, width = 2) => ({
  stroke: color,
  strokeWidth: width,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
});

/** Turn arrow for the detour button. */
export function RouteIcon({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 21V12a4 4 0 0 1 4-4h10" {...stroke(color)} />
      <Path d="M15 4l4 4-4 4" {...stroke(color)} />
    </Svg>
  );
}

export function CheckIcon({ size = 16, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 12.5l4.5 4.5L19 7.5" {...stroke(color, 2.5)} />
    </Svg>
  );
}

export function PlusIcon({ size = 18, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 5v14M5 12h14" {...stroke(color, 2.5)} />
    </Svg>
  );
}

export function ChevronDownIcon({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 9l6 6 6-6" {...stroke(color, 2.2)} />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 6l6 6-6 6" {...stroke(color)} />
    </Svg>
  );
}

export function CloseIcon({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 6l12 12M18 6L6 18" {...stroke(color)} />
    </Svg>
  );
}

export function ClockIcon({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" {...stroke(color)} />
      <Path d="M12 7v5l3 2" {...stroke(color)} />
    </Svg>
  );
}

export function InfoIcon({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" {...stroke(color)} />
      <Path d="M12 11v6M12 7.5v.5" {...stroke(color)} />
    </Svg>
  );
}

export function BellIcon({ size = 22, color, off }: IconProps & { off?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {off ? (
        <Path d="M6 10a6 6 0 0 1 9.3-5M18 10v4l2 3H8M10 20a2 2 0 0 0 4 0M3 3l18 18" {...stroke(color)} />
      ) : (
        <>
          <Path d="M6 10a6 6 0 0 1 12 0v4l2 3H4l2-3z" {...stroke(color)} />
          <Path d="M10 20a2 2 0 0 0 4 0" {...stroke(color)} />
        </>
      )}
    </Svg>
  );
}

export function CloudOffIcon({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 3l18 18" {...stroke(color)} />
      <Path d="M8.5 6.2A6 6 0 0 1 17.7 10H18a4 4 0 0 1 2.3 7.3M16 18H7a4 4 0 0 1-1.2-7.8" {...stroke(color)} />
    </Svg>
  );
}

export function MapOffIcon({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" {...stroke(color)} />
      <Path d="M3 3l18 18" {...stroke(color)} />
    </Svg>
  );
}

export function StarIcon({ size = 24, color, filled }: IconProps & { filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3.5l2.6 5.3 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"
        stroke={color}
        strokeWidth={filled ? 1.5 : 1.8}
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
      />
    </Svg>
  );
}

/** Teardrop pin for the detour. Never a status shape. */
export function DetourPin({ color }: { color: string }) {
  return (
    <Svg width={28} height={36} viewBox="0 0 28 36">
      <Path d="M14 35C14 35 2 21.5 2 13.5a12 12 0 0 1 24 0C26 21.5 14 35 14 35z" fill={color} stroke="#FFFFFF" strokeWidth={2} />
      <Path d="M9 19v-4a3 3 0 0 1 3-3h7M16.5 9.5L19 12l-2.5 2.5" {...stroke('#FFFFFF')} />
    </Svg>
  );
}

/** Two signal lights on a post. Used for the app mark in headers. */
export function SignalIcon({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="7" cy="9" r="4" {...stroke(color)} />
      <Circle cx="17" cy="9" r="4" {...stroke(color)} />
      <Path d="M12 13v8M8 21h8" {...stroke(color)} />
    </Svg>
  );
}

export function Dot({ size = 10, color, hollow }: IconProps & { hollow?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 10 10">
      {hollow ? <Circle cx="5" cy="5" r="4" stroke={color} strokeWidth={2} fill="none" /> : <Rect x="0" y="0" width="10" height="10" rx="5" fill={color} />}
    </Svg>
  );
}
