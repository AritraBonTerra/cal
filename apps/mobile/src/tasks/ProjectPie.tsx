import Svg, { Circle } from "react-native-svg";
import { useColors } from "../lib/theme";

// Things' project pie: a ring that fills as the project completes.
export function ProjectPie({
  done,
  total,
  size = 18,
}: {
  done: number;
  total: number;
  size?: number;
}) {
  const colors = useColors();
  const fraction = total === 0 ? 0 : done / total;
  const r = size * 0.3;
  const c = 2 * Math.PI * r;
  const center = size / 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle
        cx={center}
        cy={center}
        r={r + 1.5}
        fill="none"
        stroke={colors.accent}
        strokeWidth={1.25}
      />
      <Circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke={colors.accent}
        strokeWidth={r * 2}
        strokeDasharray={`${c * fraction} ${c}`}
        transform={`rotate(-90 ${center} ${center})`}
      />
    </Svg>
  );
}
