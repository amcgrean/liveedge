import React from 'react';
import Svg, {
  Polyline,
  Line,
  G,
  Path,
  Circle,
  Rect,
  Polygon,
} from 'react-native-svg';

export type IconName =
  | 'chevronRight' | 'chevronLeft' | 'chevronDown' | 'chevronUp'
  | 'x' | 'check' | 'checkBold' | 'camera' | 'phone' | 'map' | 'pin'
  | 'refresh' | 'truck' | 'user' | 'menu' | 'wifi' | 'wifiOff'
  | 'cloud' | 'cloudOff' | 'arrowRight' | 'arrowLeft' | 'flash' | 'flashOff'
  | 'logout' | 'settings' | 'mail' | 'lock' | 'info' | 'list' | 'plus'
  | 'package' | 'alert' | 'clock' | 'upload' | 'search';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  const content = (() => {
    switch (name) {
      case 'chevronRight': return <Polyline points="9 6 15 12 9 18" />;
      case 'chevronLeft': return <Polyline points="15 6 9 12 15 18" />;
      case 'chevronDown': return <Polyline points="6 9 12 15 18 9" />;
      case 'chevronUp': return <Polyline points="6 15 12 9 18 15" />;
      case 'x': return <G><Line x1="6" y1="6" x2="18" y2="18" /><Line x1="6" y1="18" x2="18" y2="6" /></G>;
      case 'check': return <Polyline points="4 12 10 18 20 6" />;
      case 'checkBold': return <Polyline points="4 12 10 18 20 6" strokeWidth={3} />;
      case 'camera': return (
        <G>
          <Path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <Circle cx="12" cy="13" r="4" />
        </G>
      );
      case 'phone': return (
        <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.86 19.86 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.94.37 1.86.7 2.74a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.88.33 1.8.57 2.74.7A2 2 0 0 1 22 16.92z" />
      );
      case 'map': return (
        <G>
          <Polygon points="1 6 9 3 15 6 23 3 23 18 15 21 9 18 1 21 1 6" />
          <Line x1="9" y1="3" x2="9" y2="18" />
          <Line x1="15" y1="6" x2="15" y2="21" />
        </G>
      );
      case 'pin': return (
        <G>
          <Path d="M12 2a8 8 0 0 0-8 8c0 6 8 12 8 12s8-6 8-12a8 8 0 0 0-8-8z" />
          <Circle cx="12" cy="10" r="3" />
        </G>
      );
      case 'refresh': return (
        <G>
          <Polyline points="23 4 23 10 17 10" />
          <Polyline points="1 20 1 14 7 14" />
          <Path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </G>
      );
      case 'truck': return (
        <G>
          <Rect x="1" y="6" width="13" height="11" />
          <Polyline points="14 9 19 9 22 13 22 17 14 17" />
          <Circle cx="6" cy="20" r="2" />
          <Circle cx="18" cy="20" r="2" />
        </G>
      );
      case 'user': return (
        <G>
          <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <Circle cx="12" cy="7" r="4" />
        </G>
      );
      case 'menu': return (
        <G>
          <Line x1="3" y1="6" x2="21" y2="6" />
          <Line x1="3" y1="12" x2="21" y2="12" />
          <Line x1="3" y1="18" x2="21" y2="18" />
        </G>
      );
      case 'wifi': return (
        <G>
          <Path d="M5 12.55a11 11 0 0 1 14 0" />
          <Path d="M1.42 9a16 16 0 0 1 21.16 0" />
          <Path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <Line x1="12" y1="20" x2="12.01" y2="20" />
        </G>
      );
      case 'wifiOff': return (
        <G>
          <Line x1="1" y1="1" x2="23" y2="23" />
          <Path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <Path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <Path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
          <Path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <Path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <Line x1="12" y1="20" x2="12.01" y2="20" />
        </G>
      );
      case 'cloud': return <Path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />;
      case 'cloudOff': return (
        <G>
          <Path d="M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6" />
          <Path d="M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3" />
          <Line x1="1" y1="1" x2="23" y2="23" />
        </G>
      );
      case 'arrowRight': return (
        <G>
          <Line x1="5" y1="12" x2="19" y2="12" />
          <Polyline points="12 5 19 12 12 19" />
        </G>
      );
      case 'arrowLeft': return (
        <G>
          <Line x1="19" y1="12" x2="5" y2="12" />
          <Polyline points="12 19 5 12 12 19" />
        </G>
      );
      case 'flash': return <Polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />;
      case 'flashOff': return (
        <G>
          <Polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          <Line x1="1" y1="1" x2="23" y2="23" />
        </G>
      );
      case 'logout': return (
        <G>
          <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <Polyline points="16 17 21 12 16 7" />
          <Line x1="21" y1="12" x2="9" y2="12" />
        </G>
      );
      case 'settings': return (
        <G>
          <Circle cx="12" cy="12" r="3" />
          <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </G>
      );
      case 'mail': return (
        <G>
          <Path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <Polyline points="22,6 12,13 2,6" />
        </G>
      );
      case 'lock': return (
        <G>
          <Rect x="3" y="11" width="18" height="11" rx="2" />
          <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </G>
      );
      case 'info': return (
        <G>
          <Circle cx="12" cy="12" r="10" />
          <Line x1="12" y1="16" x2="12" y2="12" />
          <Line x1="12" y1="8" x2="12.01" y2="8" />
        </G>
      );
      case 'list': return (
        <G>
          <Line x1="8" y1="6" x2="21" y2="6" />
          <Line x1="8" y1="12" x2="21" y2="12" />
          <Line x1="8" y1="18" x2="21" y2="18" />
          <Line x1="3" y1="6" x2="3.01" y2="6" />
          <Line x1="3" y1="12" x2="3.01" y2="12" />
          <Line x1="3" y1="18" x2="3.01" y2="18" />
        </G>
      );
      case 'plus': return (
        <G>
          <Line x1="12" y1="5" x2="12" y2="19" />
          <Line x1="5" y1="12" x2="19" y2="12" />
        </G>
      );
      case 'package': return (
        <G>
          <Path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <Polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <Line x1="12" y1="22.08" x2="12" y2="12" />
        </G>
      );
      case 'alert': return (
        <G>
          <Path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <Line x1="12" y1="9" x2="12" y2="13" />
          <Line x1="12" y1="17" x2="12.01" y2="17" />
        </G>
      );
      case 'clock': return (
        <G>
          <Circle cx="12" cy="12" r="10" />
          <Polyline points="12 6 12 12 16 14" />
        </G>
      );
      case 'upload': return (
        <G>
          <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <Polyline points="17 8 12 3 7 8" />
          <Line x1="12" y1="3" x2="12" y2="15" />
        </G>
      );
      case 'search': return (
        <G>
          <Circle cx="11" cy="11" r="7" />
          <Line x1="21" y1="21" x2="16.65" y2="16.65" />
        </G>
      );
      default: return null;
    }
  })();

  return <Svg {...props}>{content}</Svg>;
}
