import { useRef, useState } from 'react';
import type { GridState } from '../core/state';
import type { Cell, GridSpec } from '../core/trace';

export type GridTool = 'wall' | 'start' | 'end';

interface Props {
  state: GridState;
  tool?: GridTool;
  onEdit?: (spec: GridSpec) => void;
}

const SIZE = 28;

export function GridView({ state, tool = 'wall', onEdit }: Props) {
  const { spec, cells, info, current } = state;
  const walls = new Set(spec.walls);
  const [hover, setHover] = useState<number | null>(null);
  const [draft, setDraft] = useState<Set<number> | null>(null); // walls while dragging
  const paint = useRef<boolean | null>(null);

  const shownWalls = draft ?? walls;
  const startId = spec.start[0] * spec.cols + spec.start[1];
  const endId = spec.end[0] * spec.cols + spec.end[1];
  const toCell = (id: number): Cell => [Math.floor(id / spec.cols), id % spec.cols];

  const down = (id: number) => {
    if (!onEdit) return;
    if (tool === 'wall') {
      if (id === startId || id === endId) return;
      paint.current = !walls.has(id);
      const next = new Set(walls);
      if (paint.current) next.add(id);
      else next.delete(id);
      setDraft(next);
    } else if (!walls.has(id) && id !== startId && id !== endId) {
      onEdit({ ...spec, [tool]: toCell(id) });
    }
  };
  const enter = (id: number) => {
    setHover(id);
    if (paint.current === null || !draft || id === startId || id === endId) return;
    const next = new Set(draft);
    if (paint.current) next.add(id);
    else next.delete(id);
    setDraft(next);
  };
  const up = () => {
    if (draft && onEdit) onEdit({ ...spec, walls: [...draft] });
    paint.current = null;
    setDraft(null);
  };

  const hoverInfo = hover !== null && info[hover];

  return (
    <div className="grid-wrap">
      <svg
        className={`grid-view ${onEdit ? 'editable' : ''}`}
        viewBox={`0 0 ${spec.cols * SIZE} ${spec.rows * SIZE}`}
        onPointerUp={up}
        onPointerLeave={() => {
          setHover(null);
          up();
        }}
        role="img"
        aria-label="Grid"
      >
        {Array.from({ length: spec.rows * spec.cols }, (_, id) => {
          const r = Math.floor(id / spec.cols), c = id % spec.cols;
          let cls = 'cell';
          if (shownWalls.has(id)) cls += ' wall';
          else if (cells[id]) cls += ` c-${cells[id]}`;
          if (state.changed.includes(id)) cls += ' changed';
          const f = info[id]?.f ?? info[id]?.d;
          return (
            <g key={id} onPointerDown={() => down(id)} onPointerEnter={() => enter(id)}>
              <rect className={cls} x={c * SIZE + 1} y={r * SIZE + 1} width={SIZE - 2} height={SIZE - 2} rx={4} />
              {f !== undefined && !shownWalls.has(id) && id !== startId && id !== endId && (
                <text className="cell-text" x={c * SIZE + SIZE / 2} y={r * SIZE + SIZE / 2 + 4} textAnchor="middle">
                  {f}
                </text>
              )}
            </g>
          );
        })}
        {[[startId, 'S', 'start'], [endId, 'G', 'end']].map(([id, label, cls]) => {
          const [r, c] = toCell(id as number);
          return (
            <g key={cls} className={`endpoint ${cls}`} pointerEvents="none">
              <rect x={c * SIZE + 1} y={r * SIZE + 1} width={SIZE - 2} height={SIZE - 2} rx={4} />
              <text x={c * SIZE + SIZE / 2} y={r * SIZE + SIZE / 2 + 5} textAnchor="middle">
                {label}
              </text>
            </g>
          );
        })}
        {current !== null && (
          <rect
            className="current-cell"
            x={(current % spec.cols) * SIZE}
            y={Math.floor(current / spec.cols) * SIZE}
            width={SIZE}
            height={SIZE}
            rx={5}
            pointerEvents="none"
          />
        )}
      </svg>
      <div className="grid-hover">
        {hover !== null ? (
          <>
            ({toCell(hover).join(', ')}) {cells[hover] ?? (walls.has(hover) ? 'wall' : '')}
            {hoverInfo && ' · ' + Object.entries(hoverInfo).map(([k, v]) => `${k}=${v}`).join(' ')}
          </>
        ) : (
          <span className="muted">Hover a cell for details</span>
        )}
      </div>
    </div>
  );
}
