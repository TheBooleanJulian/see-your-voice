import { Fragment } from 'react';
import { findFillers } from '../speech/fillers';
import type { TranscriptSegment } from '../speech/recognition';
import { fmtDuration } from './format';

interface Props {
  segments: TranscriptSegment[];
  fillers: string[];
  interim?: string;
}

/** Transcript with filler words marked and low-confidence segments underlined. */
export function TranscriptView({ segments, fillers, interim }: Props) {
  // Detect on the joined text so context rules see across segment boundaries.
  const text = segments.map((s) => s.text).join(' ');
  const hits = findFillers(text, fillers);
  let offset = 0;

  return (
    <p className="transcript" aria-label="Transcript">
      {segments.map((seg, i) => {
        const start = offset;
        const end = start + seg.text.length;
        offset = end + 1;
        const mine = hits.filter((h) => h.start >= start && h.end <= end);
        const parts: React.ReactNode[] = [];
        let cursor = start;
        for (const h of mine) {
          if (h.start > cursor) parts.push(text.slice(cursor, h.start));
          parts.push(
            <mark key={h.start} title={`Filler: “${h.phrase}”`}>
              {text.slice(h.start, h.end)}
              <span className="sr-only"> (filler)</span>
            </mark>,
          );
          cursor = h.end;
        }
        if (cursor < end) parts.push(text.slice(cursor, end));
        const low = seg.confidence > 0 && seg.confidence < 0.7;
        return (
          <Fragment key={i}>
            <span
              className={low ? 'seg lowconf' : 'seg'}
              title={`${fmtDuration(seg.t)}${seg.confidence > 0 ? ` · recognition confidence ${Math.round(seg.confidence * 100)}%` : ''}`}
            >
              {parts}
            </span>{' '}
          </Fragment>
        );
      })}
      {interim ? <span className="interim">{interim}</span> : null}
    </p>
  );
}
