import React, { useMemo } from 'react';

type IconName =
  | 'jn-logo'
  | 'jn-logo-solid'
  | 'code'
  | 'graduation-cap'
  | 'presentation'
  | 'chevron-right'
  | 'chevron-down'
  | 'chevron-left'
  | 'database'
  | 'settings'
  | 'calculator'
  | 'save'
  | 'log-out'
  | 'pencil'
  | 'trash-2'
  | 'plus'
  | 'filter'
  | 'arrow-down'
  | 'arrow-up'
  | 'upload'
  | 'download'
  | 'user'
  | 'clock'
  | 'play'
  | 'check-circle'
  | 'file-text'
  | 'flag'
  | 'refresh-cw'
  | 'x'
  | 'brain'
  | 'loader-2'
  | 'arrow-left';

interface IconProps {
  name: IconName | string;
  className?: string;
}

const MAIN_PATH_D = "M13.71,7.63v3a30.69,30.69,0,0,0,.29,3.3h-.06l-.87-2L10.85,7.63H8.51v5.74c0,1.16-.37,1.51-1.07,1.51A1.38,1.38,0,0,1,6.25,14L4.79,15.08a3.09,3.09,0,0,0,2.94,1.65c2,0,2.93-1.44,2.93-3.19V10.68l.7,1.57,2.21,4.31h2.18V7.63Z";
const DOT_PATH_D = "M17.64,15.4a1.27,1.27,0,1,1,2.54,0,1.27,1.27,0,1,1-2.54,0Z";

const computeInnerPoints = () => {
  const fallback = [
    { x: 13.7, y: 11.2 },
    { x: 13.9, y: 13.9 },
    { x: 13.5, y: 16.6 }
  ];
  return fallback;
};

const Icon: React.FC<IconProps> = ({ name, className }) => {
  const viewBox = name === 'jn-logo' || name === 'jn-logo-solid' ? '0 0 15.39 9.1' : '0 0 24 24';
  const innerPoints = useMemo(() => computeInnerPoints(), []);

  const renderX = (x: number, y: number, key: string) => (
    <g key={key}>
      <line x1={x - 0.15} y1={y - 0.15} x2={x + 0.15} y2={y + 0.15} />
      <line x1={x + 0.15} y1={y - 0.15} x2={x - 0.15} y2={y + 0.15} />
    </g>
  );

  const renderDefaultIcon = () => {
    switch (name) {
      case 'code':
        return (
          <>
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </>
        );
      case 'graduation-cap':
        return (
          <>
            <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
            <path d="M6 12v5c3 3 9 3 12 0v-5" />
          </>
        );
      case 'presentation':
        return (
          <>
            <path d="M2 3h20" />
            <path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3" />
            <path d="M7 21l5-5 5 5" />
          </>
        );
      case 'chevron-right':
        return <polyline points="9 18 15 12 9 6" />;
      case 'chevron-down':
        return <polyline points="6 9 12 15 18 9" />;
      case 'chevron-left':
        return <polyline points="15 18 9 12 15 6" />;
      case 'database':
        return (
          <>
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          </>
        );
      case 'settings':
        return (
          <>
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </>
        );
      case 'calculator':
        return (
          <>
            <rect x="4" y="2" width="16" height="20" rx="2" />
            <line x1="8" y1="6" x2="16" y2="6" />
            <line x1="16" y1="14" x2="16" y2="18" />
            <path d="M16 10h.01" />
            <path d="M12 10h.01" />
            <path d="M8 10h.01" />
            <path d="M12 14h.01" />
            <path d="M8 14h.01" />
            <path d="M12 18h.01" />
            <path d="M8 18h.01" />
          </>
        );
      case 'save':
        return (
          <>
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </>
        );
      case 'log-out':
        return (
          <>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </>
        );
      case 'pencil':
        return <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />;
      case 'trash-2':
        return (
          <>
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </>
        );
      case 'plus':
        return (
          <>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </>
        );
      case 'filter':
        return <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />;
      case 'arrow-down':
        return (
          <>
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
          </>
        );
      case 'arrow-up':
        return (
          <>
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </>
        );
      case 'upload':
        return (
          <>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </>
        );
      case 'download':
        return (
          <>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </>
        );
      case 'user':
        return (
          <>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </>
        );
      case 'clock':
        return (
          <>
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </>
        );
      case 'play':
        return <polygon points="5 3 19 12 5 21 5 3" />;
      case 'check-circle':
        return (
          <>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </>
        );
      case 'file-text':
        return (
          <>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </>
        );
      case 'flag':
        return (
          <>
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <line x1="4" y1="22" x2="4" y2="15" />
          </>
        );
      case 'refresh-cw':
        return (
          <>
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </>
        );
      case 'x':
        return (
          <>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </>
        );
      case 'brain':
        return (
          <>
            <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
            <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
          </>
        );
      case 'loader-2':
        return <path d="M21 12a9 9 0 1 1-6.219-8.56" />;
      case 'arrow-left':
        return (
          <>
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </>
        );
      default:
        return null;
    }
  };

  if (name === 'jn-logo') {
    const points = [
      { x: 8.51, y: 7.63 },
      { x: 8.51, y: 13.37 },
      { x: 4.79, y: 15.08 },
      { x: 7.73, y: 16.73 },
      { x: 10.66, y: 13.54 },
      { x: 10.66, y: 10.68 },
      { x: 10.85, y: 7.63 },
      { x: 13.71, y: 7.63 },
      ...innerPoints,
      { x: 15.75, y: 7.63 },
      { x: 15.75, y: 16.56 },
      { x: 18.91, y: 15.4 }
    ];

    return (
      <svg
        className={className}
        viewBox={viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ overflow: 'visible' }}
      >
        <g transform="translate(-4.79 -7.63)" className="jn-logo-group">
          <g className="wireframe-layer text-cyan-400" fill="none" strokeWidth={0.04} strokeLinecap="round" strokeLinejoin="round">
            <path className="wireframe-path" d={MAIN_PATH_D} />
            <path className="wireframe-circle" d={DOT_PATH_D} />
          </g>

          <g className="vertices-layer" stroke="currentColor" strokeWidth={0.06} strokeLinecap="square">
            {points.map((point, idx) => renderX(point.x, point.y, `x-${idx}`))}
          </g>

          <g className="surface-layer" stroke="none">
            <path className="final-path" d={MAIN_PATH_D} />
            <path className="final-path" d={DOT_PATH_D} />
          </g>
        </g>
      </svg>
    );
  }

  if (name === 'jn-logo-solid') {
    return (
      <svg
        className={className}
        viewBox={viewBox}
        fill="none"
        stroke="none"
        style={{ overflow: 'visible' }}
      >
        <g transform="translate(-4.79 -7.63)" className="jn-logo-group">
          <path d={MAIN_PATH_D} fill="currentColor" />
          <path d={DOT_PATH_D} fill="currentColor" />
        </g>
      </svg>
    );
  }

  return (
    <svg
      className={className}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ overflow: 'visible' }}
    >
      {renderDefaultIcon()}
    </svg>
  );
};

export default Icon;
