import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Images,
  Layer,
  Map,
  type MapRef,
  type StyleSpecification,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { type MutableRefObject, useEffect, useMemo, useRef, useState } from 'react';
import { Easing, type NativeSyntheticEvent, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { GeoPoint } from '../../data/models';
import { contentColorOn, useTheme } from '../theme';
import { DARK_STYLE, LIGHT_STYLE, mapStyle as loadMapStyle } from './darkStyle';
import { angleDiff, useHeading } from './heading';

export interface MapLine {
  points: GeoPoint[];
  color: string;
  width?: number;
  dashed?: boolean;
}

export type MarkerKind = 'STOP' | 'STOP_SMALL' | 'ORIGIN' | 'DESTINATION';

export interface MapMarker {
  point: GeoPoint;
  color: string;
  kind?: MarkerKind;
  id?: string | null;
}

export interface MapVehicle {
  id: string;
  point: GeoPoint;
  bearing: number | null;
  color: string;
  label: string;
  /** Drawn translucent, e.g. when its position stopped updating. */
  faded?: boolean;
}

export interface Padding {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

/** Lets a screen move the camera imperatively (e.g. "my location" button). */
export interface MapController {
  moveTo(p: GeoPoint, zoom?: number): void;
  readonly center: GeoPoint | null;
}

export function useMapController(): MutableRefObject<MapController | null> {
  return useRef<MapController | null>(null);
}

// Drawn at 3x (as @3x files), so they show at ~32 dp (the beam ~88 dp) whatever the screen density.
const IMAGES = {
  'veh-outline-p': { source: require('../../../assets/map/vehicle-outline-pointed.png'), sdf: true },
  'veh-outline-c': { source: require('../../../assets/map/vehicle-outline.png'), sdf: true },
  'veh-body-p': { source: require('../../../assets/map/vehicle-body-pointed.png'), sdf: true },
  'veh-body-c': { source: require('../../../assets/map/vehicle-body.png'), sdf: true },
  'user-heading': require('../../../assets/map/heading-beam.png'),
};

const lngLat = (p: GeoPoint): [number, number] => [p.lon, p.lat];
const lerpPoint = (a: GeoPoint, b: GeoPoint, f: number): GeoPoint => ({ lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f });
const ease = Easing.bezier(0.4, 0, 0.2, 1);
const GLIDE_MS = 1400;

function linesFc(lines: MapLine[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: lines
      .filter((l) => l.points.length >= 2)
      .map((l) => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: l.points.map(lngLat) },
        properties: { color: l.color, width: l.width ?? 5, dashed: l.dashed ?? false },
      })),
  };
}

function markersFc(markers: MapMarker[]): GeoJSON.FeatureCollection {
  const look = (m: MapMarker) => {
    switch (m.kind ?? 'STOP') {
      case 'STOP_SMALL':
        return { r: 3.5, fill: '#FFFFFF', stroke: m.color, sw: 2 };
      case 'ORIGIN':
        return { r: 7, fill: '#FFFFFF', stroke: '#0F1115', sw: 3.5 };
      case 'DESTINATION':
        return { r: 8, fill: m.color, stroke: '#FFFFFF', sw: 3 };
      default:
        return { r: 5.5, fill: '#FFFFFF', stroke: m.color, sw: 3 };
    }
  };
  return {
    type: 'FeatureCollection',
    features: markers.map((m) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: lngLat(m.point) },
      properties: { ...look(m), ...(m.id != null ? { id: m.id } : {}) },
    })),
  };
}

function vehiclesFc(vs: MapVehicle[], focusId: string | null | undefined): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: vs.map((v) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: lngLat(v.point) },
      properties: {
        id: v.id,
        color: v.color,
        focus: v.id === focusId,
        opacity: v.faded ? 0.55 : 1,
        label: v.label.slice(0, 4),
        tcolor: contentColorOn(v.color),
        pointed: v.bearing != null,
        bearing: v.bearing ?? 0,
      },
    })),
  };
}

function userFc(user: GeoPoint | null, heading: number | null): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: user
      ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: lngLat(user) }, properties: heading != null ? { heading } : {} }]
      : [],
  };
}

/** Vehicles glide from where they're drawn to their refreshed position. */
function useGlidingVehicles(given: MapVehicle[]): MapVehicle[] {
  // Screens build the list on every render: only a change in what it holds starts a glide.
  const key = JSON.stringify(given);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const vehicles = useMemo(() => given, [key]);
  const drawn = useRef(new globalThis.Map<string, GeoPoint>());
  const [frame, setFrame] = useState(vehicles);
  useEffect(() => {
    const from = new globalThis.Map(vehicles.map((v) => [v.id, drawn.current.get(v.id) ?? v.point]));
    const moving = vehicles.some((v) => {
      const f = from.get(v.id)!;
      return f.lat !== v.point.lat || f.lon !== v.point.lon;
    });
    const show = (f: number) => {
      const next = vehicles.map((v) => ({ ...v, point: lerpPoint(from.get(v.id)!, v.point, f) }));
      drawn.current = new globalThis.Map(next.map((v) => [v.id, v.point]));
      setFrame(next);
    };
    if (!moving) {
      show(1);
      return;
    }
    const start = Date.now();
    let raf = 0;
    const tick = () => {
      const f = Math.min((Date.now() - start) / GLIDE_MS, 1);
      show(ease(f));
      if (f < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [vehicles]);
  return frame;
}

export interface TransitMapProps {
  style?: ViewStyle;
  lines?: MapLine[];
  markers?: MapMarker[];
  vehicles?: MapVehicle[];
  user?: GeoPoint | null;
  /** Camera fits these points whenever [fitKey] changes. */
  fitPoints?: GeoPoint[];
  fitKey?: string | null;
  initialCenter?: GeoPoint | null;
  initialZoom?: number;
  contentPadding?: Padding;
  controller?: MutableRefObject<MapController | null>;
  onMarkerPress?: (id: string) => void;
  onLongPress?: (p: GeoPoint) => void;
  onCameraIdle?: (center: GeoPoint) => void;
  /** The camera follows this vehicle (by [MapVehicle.id]) as its position refreshes. */
  focusVehicleId?: string | null;
  /** Called when the user drags the map, so the screen can stop following. */
  onUserPan?: () => void;
  /** Where the compass (shown once the map is rotated or tilted) sits, clear of the screen's own buttons. */
  compassStyle?: ViewStyle;
  testID?: string;
}

export function TransitMap({
  style,
  lines = [],
  markers = [],
  vehicles = [],
  user = null,
  fitPoints = [],
  fitKey = null,
  initialCenter,
  initialZoom = 14,
  contentPadding = {},
  controller,
  onMarkerPress,
  onLongPress,
  onCameraIdle,
  focusVehicleId,
  onUserPan,
  compassStyle,
  testID,
}: TransitMapProps) {
  const t = useTheme();
  const camera = useRef<CameraRef>(null);
  const map = useRef<MapRef>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadedStyle, setLoadedStyle] = useState<{ dark: boolean; style: StyleSpecification } | null>(null);
  const [orientation, setOrientation] = useState({ bearing: 0, pitch: 0 });
  const view = useRef({ center: initialCenter ?? fitPoints[0] ?? null, zoom: initialZoom });
  const heading = useHeading(user != null);
  const shown = useGlidingVehicles(vehicles);
  const followingNow = focusVehicleId != null && vehicles.some((v) => v.id === focusVehicleId) ? focusVehicleId : null;

  useEffect(() => {
    let alive = true;
    const dark = t.dark;
    loadMapStyle(dark).then((style) => alive && style && setLoadedStyle({ dark, style }));
    return () => {
      alive = false;
    };
  }, [t.dark]);
  // The plain style URL until the adapted one (labels in the app's language) has loaded.
  const mapStyle: string | StyleSpecification = loadedStyle?.dark === t.dark ? loadedStyle.style : t.dark ? DARK_STYLE : LIGHT_STYLE;

  if (controller) {
    controller.current = {
      moveTo(p, zoom = 15.5) {
        camera.current?.easeTo({ center: lngLat(p), zoom, duration: 600 });
      },
      get center() {
        return view.current.center;
      },
    };
  }

  const pad = (extra: number) => ({
    top: (contentPadding.top ?? 0) + extra,
    bottom: (contentPadding.bottom ?? 0) + extra,
    left: (contentPadding.left ?? 0) + extra,
    right: (contentPadding.right ?? 0) + extra,
  });

  // Follow the focused vehicle: zoom in on it once, then pan along as its position refreshes.
  const focused = vehicles.find((v) => v.id === focusVehicleId);
  const followed = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (focusVehicleId == null || focused == null) {
      followed.current = null;
      return;
    }
    const first = followed.current !== focusVehicleId;
    followed.current = focusVehicleId;
    camera.current?.easeTo({
      center: lngLat(focused.point),
      zoom: first ? Math.max(view.current.zoom, 15.5) : view.current.zoom,
      padding: pad(0),
      duration: first ? 700 : GLIDE_MS,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, focusVehicleId, focused?.point.lat, focused?.point.lon]);

  useEffect(() => {
    if (!loaded || fitKey == null || fitPoints.length === 0) return;
    // While following a vehicle, don't yank the camera back to the whole route.
    if (followingNow != null) return;
    const distinct = fitPoints.filter((p, i) => fitPoints.findIndex((q) => q.lat === p.lat && q.lon === p.lon) === i);
    if (distinct.length === 1) {
      // Camera padding keeps the point centred in the visible area above a bottom sheet.
      camera.current?.jumpTo({ center: lngLat(distinct[0]), zoom: 15.5, padding: pad(0) });
    } else {
      const lons = distinct.map((p) => p.lon);
      const lats = distinct.map((p) => p.lat);
      camera.current?.fitBounds([Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)], { padding: pad(36), duration: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, fitKey]);

  const onRegionWillChange = (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    if (e.nativeEvent.userInteraction) onUserPan?.();
  };
  const onRegionIsChanging = (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const { bearing, pitch } = e.nativeEvent;
    if (Math.abs(bearing - orientation.bearing) > 0.5 || Math.abs(pitch - orientation.pitch) > 0.5) setOrientation({ bearing, pitch });
  };
  const onRegionDidChange = (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const { center, zoom, bearing, pitch } = e.nativeEvent;
    const c = { lat: center[1], lon: center[0] };
    view.current = { center: c, zoom };
    setOrientation({ bearing, pitch });
    onCameraIdle?.(c);
  };

  const center = initialCenter ?? fitPoints[0] ?? { lat: 32.08, lon: 34.79 };
  const lineData = useMemo(() => linesFc(lines), [lines]);
  const markerData = useMemo(() => markersFc(markers), [markers]);
  const halo = t.dark ? '#171A20' : '#FFFFFF';
  const featureId = (e: { nativeEvent: { features?: GeoJSON.Feature[] } }) => {
    const id = e.nativeEvent.features?.find((f) => f.properties?.id != null)?.properties?.id;
    if (id != null) onMarkerPress?.(String(id));
  };

  return (
    <View style={[{ overflow: 'hidden' }, style]} testID={testID}>
      <Map
        ref={map}
        style={StyleSheet.absoluteFill}
        mapStyle={mapStyle}
        logo={false}
        compass={false}
        // The OpenStreetMap / OpenFreeMap credit, as in the Kotlin app: the attribution button, bottom left.
        attribution
        attributionPosition={{ bottom: 8, left: 8 }}
        touchRotate
        touchPitch
        onLongPress={(e) => onLongPress?.({ lat: e.nativeEvent.lngLat[1], lon: e.nativeEvent.lngLat[0] })}
        onRegionWillChange={onRegionWillChange}
        onRegionIsChanging={onRegionIsChanging}
        onRegionDidChange={onRegionDidChange}
        onDidFinishLoadingStyle={() => setLoaded(true)}
      >
        <Camera ref={camera} initialViewState={{ center: lngLat(center), zoom: initialZoom }} />
        <Images images={IMAGES} />
        <GeoJSONSource id="m-lines" data={lineData}>
          {/* Casing under solid lines keeps them legible over busy map areas. */}
          <Layer
            id="m-lines-casing"
            type="line"
            filter={['==', ['get', 'dashed'], false]}
            paint={{ 'line-color': halo, 'line-width': ['+', ['get', 'width'], 3] }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
          <Layer
            id="m-lines-solid"
            type="line"
            filter={['==', ['get', 'dashed'], false]}
            paint={{ 'line-color': ['to-color', ['get', 'color']], 'line-width': ['get', 'width'] }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
          <Layer
            id="m-lines-dashed"
            type="line"
            filter={['==', ['get', 'dashed'], true]}
            paint={{ 'line-color': ['to-color', ['get', 'color']], 'line-width': ['get', 'width'], 'line-dasharray': [0.2, 1.6] }}
            layout={{ 'line-cap': 'round' }}
          />
        </GeoJSONSource>
        <GeoJSONSource id="m-markers" data={markerData} onPress={onMarkerPress ? featureId : undefined}>
          <Layer
            id="m-markers"
            type="circle"
            paint={{
              'circle-radius': ['get', 'r'],
              'circle-color': ['to-color', ['get', 'fill']],
              'circle-stroke-color': ['to-color', ['get', 'stroke']],
              'circle-stroke-width': ['get', 'sw'],
            }}
          />
        </GeoJSONSource>
        <GeoJSONSource id="m-user" data={userFc(user, heading)}>
          <Layer
            id="m-user-heading"
            type="symbol"
            filter={['has', 'heading']}
            layout={{
              'icon-image': 'user-heading',
              'icon-rotate': ['get', 'heading'],
              'icon-rotation-alignment': 'map',
              'icon-pitch-alignment': 'map',
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            }}
          />
          <Layer id="m-user-halo" type="circle" paint={{ 'circle-radius': 16, 'circle-color': '#1F6FEB', 'circle-opacity': 0.16 }} />
          <Layer
            id="m-user"
            type="circle"
            paint={{ 'circle-radius': 7, 'circle-color': '#1F6FEB', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2.5 }}
          />
        </GeoJSONSource>
        <GeoJSONSource id="m-vehicles" data={vehiclesFc(shown, focusVehicleId)} onPress={onMarkerPress ? featureId : undefined}>
          {/* Soft halo marking the vehicle the camera is following. */}
          <Layer
            id="m-vehicles-focus"
            type="circle"
            filter={['==', ['get', 'focus'], true]}
            paint={{
              'circle-radius': 26,
              'circle-color': ['to-color', ['get', 'color']],
              'circle-opacity': 0.22,
              'circle-stroke-color': ['to-color', ['get', 'color']],
              'circle-stroke-width': 1.5,
              'circle-stroke-opacity': 0.5,
            }}
          />
          <Layer
            id="m-vehicles-outline"
            type="symbol"
            paint={{ 'icon-color': '#FFFFFF', 'icon-opacity': ['get', 'opacity'] }}
            layout={{
              'icon-image': ['case', ['get', 'pointed'], 'veh-outline-p', 'veh-outline-c'],
              'icon-rotate': ['get', 'bearing'],
              'icon-rotation-alignment': 'map',
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            }}
          />
          <Layer
            id="m-vehicles"
            type="symbol"
            paint={{
              'icon-color': ['to-color', ['get', 'color']],
              'icon-opacity': ['get', 'opacity'],
              'text-color': ['to-color', ['get', 'tcolor']],
            }}
            layout={{
              'icon-image': ['case', ['get', 'pointed'], 'veh-body-p', 'veh-body-c'],
              'icon-rotate': ['get', 'bearing'],
              'icon-rotation-alignment': 'map',
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
              'text-field': ['get', 'label'],
              'text-font': ['Noto Sans Bold'],
              'text-size': 11,
              'text-allow-overlap': true,
              'text-ignore-placement': true,
            }}
          />
        </GeoJSONSource>
      </Map>
      {(Math.abs(angleDiff(orientation.bearing, 0)) > 1 || orientation.pitch > 1) && (
        <Compass
          bearing={orientation.bearing}
          style={compassStyle ?? { top: 16, right: 16 }}
          onPress={() => {
            const c = view.current.center ?? center;
            camera.current?.easeTo({ center: lngLat(c), bearing: 0, pitch: 0, duration: 400 });
          }}
        />
      )}
    </View>
  );
}

/** North needle turned with the map; tapping it puts north back up and the map flat. */
function Compass({ bearing, style, onPress }: { bearing: number; style: ViewStyle; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="Reset map to north"
      accessibilityRole="button"
      style={[styles.compass, { backgroundColor: t.c.surface }, style]}
      testID="map_compass"
    >
      <View style={{ transform: [{ rotate: `${-bearing}deg` }] }}>
        <Svg width={40} height={40}>
          <Path d="M20 7.2 L25.2 20 L14.8 20 Z" fill="#E5484D" />
          <Path d="M20 32.8 L25.2 20 L14.8 20 Z" fill={t.c.outline} />
        </Svg>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  compass: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
});
