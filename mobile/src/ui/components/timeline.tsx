import { type ReactNode, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { alpha, useTheme } from '../theme';

export type Rail = 'NONE' | 'SOLID' | 'DOTTED' | 'FADED';
export type Node = 'NONE' | 'STOP' | 'SMALL' | 'ENDPOINT' | 'TERMINUS' | 'VEHICLE';
export interface RailSpec {
  style: Rail;
  color: string;
}

const RAIL_W = 30;

function RailSegment({ spec, y0, y1 }: { spec: RailSpec; y0: number; y1: number }) {
  const cx = RAIL_W / 2;
  if (y1 <= y0 || spec.style === 'NONE') return null;
  if (spec.style === 'DOTTED') {
    const dots: number[] = [];
    for (let y = y0 + 4; y < y1; y += 8) dots.push(y);
    return (
      <>
        {dots.map((y) => (
          <Circle key={y} cx={cx} cy={y} r={2} fill={spec.color} />
        ))}
      </>
    );
  }
  const color = spec.style === 'FADED' ? alpha(spec.color, 0.3) : spec.color;
  return <Line x1={cx} y1={y0} x2={cx} y2={y1} stroke={color} strokeWidth={5} />;
}

/**
 * One row of a vertical journey timeline: optional time column, a rail with a node, and
 * content. Rows stack seamlessly, so the rail looks continuous.
 */
export function TimelineRow({
  above,
  below,
  node,
  nodeColor,
  nodeY = 22,
  timeWidth = 58,
  time,
  children,
  onPress,
  dim,
  testID,
}: {
  above: RailSpec | null;
  below: RailSpec | null;
  node: Node;
  nodeColor: string;
  nodeY?: number;
  timeWidth?: number;
  time?: ReactNode;
  children: ReactNode;
  onPress?: () => void;
  /** Drawn faded (a stop the vehicle has passed). */
  dim?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  const [h, setH] = useState(0);
  const surface = t.c.surface;
  const cx = RAIL_W / 2;
  const onLayout = (e: LayoutChangeEvent) => setH(e.nativeEvent.layout.height);
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper style={[styles.row, dim && { opacity: 0.5 }]} onLayout={onLayout} onPress={onPress} testID={testID}>
      {timeWidth > 0 && <View style={{ width: timeWidth, paddingLeft: 14, paddingTop: Math.max(nodeY - 10, 0) }}>{time}</View>}
      <View style={{ width: RAIL_W }}>
        {h > 0 && (
          <Svg width={RAIL_W} height={h} style={StyleSheet.absoluteFill}>
            {above && <RailSegment spec={above} y0={0} y1={node === 'NONE' ? h : nodeY} />}
            {below && <RailSegment spec={below} y0={node === 'NONE' ? 0 : nodeY} y1={h} />}
            {node === 'SMALL' && (
              <>
                <Circle cx={cx} cy={nodeY} r={4} fill={surface} />
                <Circle cx={cx} cy={nodeY} r={4} stroke={nodeColor} strokeWidth={2} fill="none" />
              </>
            )}
            {node === 'STOP' && (
              <>
                <Circle cx={cx} cy={nodeY} r={7} fill={surface} />
                <Circle cx={cx} cy={nodeY} r={6} stroke={nodeColor} strokeWidth={3} fill="none" />
              </>
            )}
            {node === 'TERMINUS' && (
              <>
                <Circle cx={cx} cy={nodeY} r={8} fill={nodeColor} />
                <Circle cx={cx} cy={nodeY} r={3} fill={surface} />
              </>
            )}
            {node === 'ENDPOINT' && (
              <>
                <Circle cx={cx} cy={nodeY} r={8} fill={nodeColor} />
                <Circle cx={cx} cy={nodeY} r={3.5} fill={surface} />
              </>
            )}
            {node === 'VEHICLE' && (
              <>
                <Circle cx={cx} cy={nodeY} r={9} fill={surface} />
                <Circle cx={cx} cy={nodeY} r={7} fill={nodeColor} />
              </>
            )}
          </Svg>
        )}
      </View>
      <View style={styles.content}>{children}</View>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  content: { flex: 1, paddingLeft: 6, paddingRight: 16 },
});
