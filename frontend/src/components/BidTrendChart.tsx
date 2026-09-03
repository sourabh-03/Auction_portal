import React from 'react';
import { fmtINR, fmtTime } from '../utils/format';

export interface PricePoint {
  timestamp: string;
  price: number;
  vendorId?: string;
  label?: string;
}

/**
 * Price-over-time line chart, straight off BidLogEntry via
 * AuctionViewService.getTeamSnapshot's priceHistory — no separate tracked
 * series. English Reverse: every individual bid as a muted point (identity
 * disclosed on hover via a native <title>, not by color — with up to 10+
 * vendors, giving each its own hue would mean an unbounded, uncalibrated
 * categorical palette), plus a bold step-line tracing the running lowest
 * bid (the L1 trajectory — the one line that actually answers "how has the
 * price compressed"). Japanese Clock: a single step-line, the call price at
 * each tick — one series needs no legend, the panel title already names it.
 */
export function BidTrendChart({
  points,
  format,
  dark,
  height = 180,
}: {
  points: PricePoint[];
  format: 'english' | 'japanese';
  dark?: boolean;
  height?: number;
}) {
  const ink = dark ? 'var(--on-dark)' : 'var(--text)';
  const mute = dark ? 'var(--on-dark-mute)' : 'var(--text-mute)';
  const faint = dark ? 'var(--on-dark-faint)' : 'var(--text-faint)';
  const gridLine = dark ? 'var(--steel-line)' : 'var(--line-soft)';
  const dotColor = dark ? 'var(--on-dark-mute)' : 'var(--text-faint)';
  const leadColor = '#2F6B4F'; // same green used for L1 everywhere else in the app

  if (points.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: mute, fontSize: 12 }}>
        No bids yet — the chart will plot as they come in.
      </div>
    );
  }

  const width = 640;
  const padL = 64;
  const padR = 16;
  const padT = format === 'english' ? 28 : 14;
  const padB = 24;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const times = points.map((p) => new Date(p.timestamp).getTime());
  const prices = points.map((p) => p.price);
  const minT = Math.min(...times);
  const maxT = Math.max(...times, minT + 1);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices, minP + 1);

  const x = (t: number) => padL + ((t - minT) / (maxT - minT)) * plotW;
  const y = (p: number) => padT + (1 - (p - minP) / (maxP - minP)) * plotH;

  // Running minimum = the leading price at each point in time (English only).
  let running = Infinity;
  const leadPoints = points.map((p) => {
    running = Math.min(running, p.price);
    return { t: new Date(p.timestamp).getTime(), price: running };
  });
  const leadPath = leadPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.t)} ${y(p.price)}`).join(' ');

  // Japanese: a step line (price only changes at discrete ticks).
  const stepPath = points
    .map((p, i) => {
      const px = x(new Date(p.timestamp).getTime());
      const py = y(p.price);
      if (i === 0) return `M ${px} ${py}`;
      const prevY = y(points[i - 1].price);
      return `L ${px} ${prevY} L ${px} ${py}`;
    })
    .join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Price over time">
      {/* horizontal gridlines at min/max price */}
      <line x1={padL} y1={y(maxP)} x2={width - padR} y2={y(maxP)} stroke={gridLine} strokeWidth={1} />
      <line x1={padL} y1={y(minP)} x2={width - padR} y2={y(minP)} stroke={gridLine} strokeWidth={1} />
      <text x={padL - 8} y={y(maxP) + 4} textAnchor="end" fontSize={10} fill={faint} fontFamily="var(--mono)">
        {fmtINR(maxP)}
      </text>
      <text x={padL - 8} y={y(minP) + 4} textAnchor="end" fontSize={10} fill={faint} fontFamily="var(--mono)">
        {fmtINR(minP)}
      </text>

      {format === 'english' ? (
        <>
          {points.map((p, i) => (
            <circle key={i} cx={x(new Date(p.timestamp).getTime())} cy={y(p.price)} r={3.5} fill={dotColor}>
              <title>
                {(p.label ?? 'Bid')} — {fmtINR(p.price)} at {fmtTime(p.timestamp)}
              </title>
            </circle>
          ))}
          <path d={leadPath} fill="none" stroke={leadColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <path d={stepPath} fill="none" stroke={ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {points.map((p, i) => (
            <circle key={i} cx={x(new Date(p.timestamp).getTime())} cy={y(p.price)} r={3} fill={ink}>
              <title>
                {fmtINR(p.price)} at {fmtTime(p.timestamp)}
              </title>
            </circle>
          ))}
        </>
      )}

      <text x={padL} y={height - 6} fontSize={10} fill={faint} fontFamily="var(--mono)">
        {fmtTime(points[0].timestamp)}
      </text>
      <text x={width - padR} y={height - 6} textAnchor="end" fontSize={10} fill={faint} fontFamily="var(--mono)">
        {fmtTime(points[points.length - 1].timestamp)}
      </text>

      {format === 'english' && (
        <g transform={`translate(${padL}, 12)`}>
          <circle cx={0} cy={0} r={3} fill={dotColor} />
          <text x={8} y={3} fontSize={10} fill={mute}>Individual bids</text>
          <line x1={100} y1={0} x2={116} y2={0} stroke={leadColor} strokeWidth={2} />
          <text x={121} y={3} fontSize={10} fill={mute}>Leading price</text>
        </g>
      )}
    </svg>
  );
}
