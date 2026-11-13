"use client";

import { useState } from "react";
import {
  DATE_RANGE_EMPTY_FOOTER,
  formatRangeDay,
  isSameDay,
  nextDateRange,
  rangeCompleteFooter,
} from "@/lib/date-range-selection";

function fmt(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function countDays(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

interface DateRangePickerProps {
  rangeStart: Date | null;
  rangeEnd: Date | null;
  onChange: (start: Date | null, end: Date | null) => void;
  initialMonth?: Date;
  singleDate?: boolean;
  /**
   * When provided (typically with `singleDate`), each cell whose date matches one
   * of these is rendered as selected. Use for multi-select pickers that want the
   * calendar to reflect the full picked set, not just the most recent click.
   */
  selectedDates?: Date[];
}

export default function DateRangePicker({
  rangeStart,
  rangeEnd,
  onChange,
  initialMonth,
  singleDate,
  selectedDates,
}: DateRangePickerProps) {
  const todayRef = new Date();
  todayRef.setHours(0, 0, 0, 0);

  const [viewMonth, setViewMonth] = useState<Date>(() => {
    if (initialMonth) return new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1);
    if (rangeStart) return new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    return new Date(todayRef.getFullYear(), todayRef.getMonth(), 1);
  });
  const [hoverDate, setHoverDate] = useState<Date | null>(null);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const effectiveEnd = singleDate
    ? null
    : rangeEnd ??
      (rangeStart && hoverDate && hoverDate >= rangeStart ? hoverDate : null);

  const handleDayClick = (date: Date) => {
    if (date < todayRef) return;
    if (singleDate) {
      if (rangeStart && isSameDay(date, rangeStart)) {
        onChange(null, null);
      } else {
        onChange(date, null);
      }
      return;
    }
    const next = nextDateRange(rangeStart, rangeEnd, date);
    onChange(next.start, next.end);
  };

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < firstDow; i++) {
    cells.push(<div key={`e${i}`} className="pointer-events-none" aria-hidden />);
  }

  const selectedSet = selectedDates ?? [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const isPast = date < todayRef;
    const isToday = isSameDay(date, todayRef);
    const isStart = rangeStart ? isSameDay(date, rangeStart) : false;
    const isEnd = rangeEnd ? isSameDay(date, rangeEnd) : false;
    const isMultiSelected = selectedSet.some((s) => isSameDay(s, date));
    const inRange =
      rangeStart && effectiveEnd ? date > rangeStart && date < effectiveEnd : false;
    const cellDow = (firstDow + d - 1) % 7;
    const isLastInRow = cellDow === 6;
    const isFirstInRow = cellDow === 0;
    const showBandRight = isStart && effectiveEnd !== null && !isLastInRow;
    const showBandLeft = (rangeEnd ? isEnd : false) && rangeStart !== null && !isFirstInRow;
    const showBandFull = inRange;
    const showStartTag = !singleDate && isStart;
    const showEndTag = !singleDate && isEnd && rangeStart !== null && !isStart;

    const selectedClass = showEndTag
      ? "bg-[#08647E] text-white font-semibold shadow-sm"
      : isStart || isEnd || isMultiSelected
        ? "bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white font-semibold shadow-sm"
        : isToday && !inRange
          ? "border-[1.5px] border-[#0E96B0] text-[#0E96B0] font-semibold hover:bg-[#E6F7FB]/90"
          : inRange
            ? "text-[#0D2B35] font-medium hover:bg-[#0E96B0]/15"
            : isPast
              ? ""
              : "text-[#0D2B35] hover:bg-[#0E96B0]/12 hover:ring-1 hover:ring-[#0E96B0]/25";

    cells.push(
      <div key={d} className="relative h-12 flex items-center justify-center select-none">
        {showBandFull && (
          <div className="absolute inset-y-1 inset-x-0 bg-[#0E96B0]/12 pointer-events-none z-0" />
        )}
        {showBandRight && (
          <div className="absolute inset-y-1 left-1/2 right-0 bg-[#0E96B0]/12 pointer-events-none z-0" />
        )}
        {showBandLeft && (
          <div className="absolute inset-y-1 left-0 right-1/2 bg-[#0E96B0]/12 pointer-events-none z-0" />
        )}
        <button
          type="button"
          disabled={isPast}
          onClick={() => handleDayClick(date)}
          onMouseEnter={() => !isPast && setHoverDate(date)}
          onMouseLeave={() => setHoverDate(null)}
          aria-label={
            showStartTag ? `${d}, Start` : showEndTag ? `${d}, End` : undefined
          }
          className={`relative z-10 min-h-[44px] min-w-[44px] max-w-full rounded-xl flex flex-col items-center justify-center text-sm transition-colors touch-manipulation leading-none
            ${isPast ? "text-[#C8DDE6] cursor-default" : "cursor-pointer"}
            ${selectedClass}`}
        >
          <span>{d}</span>
          {showStartTag && (
            <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wide">Start</span>
          )}
          {showEndTag && (
            <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wide">End</span>
          )}
        </button>
      </div>,
    );
  }

  const rangeDayCount =
    rangeStart && rangeEnd ? countDays(rangeStart, rangeEnd) : 0;
  const isSingleCalendarDay =
    rangeStart && rangeEnd && isSameDay(rangeStart, rangeEnd);

  return (
    <div className="border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl overflow-hidden transition-colors hover:border-[#0E96B0]/38">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(14,150,176,0.10)] bg-[#F4FAFB]">
        <button
          type="button"
          onClick={() => setViewMonth(new Date(year, month - 1, 1))}
          className="w-9 h-9 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-[#E6F7FB] text-[#5A8399] hover:text-[#0E96B0] transition-colors touch-manipulation"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="text-[14px] font-semibold text-[#0D2B35]">
          {viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </span>
        <button
          type="button"
          onClick={() => setViewMonth(new Date(year, month + 1, 1))}
          className="w-9 h-9 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-[#E6F7FB] text-[#5A8399] hover:text-[#0E96B0] transition-colors touch-manipulation"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div className="p-3">
        <div className="grid grid-cols-7 mb-1">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((l) => (
            <div
              key={l}
              className="text-center text-[11px] font-semibold text-[#5A8399] tracking-[0.3px] py-1"
            >
              {l}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">{cells}</div>
      </div>

      <div className="border-t border-[rgba(14,150,176,0.10)] px-4 py-2.5 bg-[#F4FAFB] flex items-center justify-between gap-2">
        {singleDate ? (
          (selectedDates?.length ?? 0) > 0 ? (
            <span className="text-[13px] font-semibold text-[#0D2B35]">
              {selectedDates!.length} date{selectedDates!.length === 1 ? "" : "s"} selected
            </span>
          ) : rangeStart ? (
            <span className="text-[13px] font-semibold text-[#0D2B35]">{fmt(rangeStart)}</span>
          ) : (
            <span className="text-[13px] text-[#5A8399]">Select a date</span>
          )
        ) : rangeStart && rangeEnd ? (
          <>
            <span className="text-[13px] font-semibold text-[#0D2B35]">
              {isSingleCalendarDay
                ? formatRangeDay(rangeStart)
                : rangeCompleteFooter(rangeStart, rangeEnd)}
            </span>
            <span className="text-[12px] text-[#0E96B0] font-medium">
              {isSingleCalendarDay ? "1 day" : `${rangeDayCount} days`}
            </span>
          </>
        ) : rangeStart ? (
          <span className="text-[13px] font-semibold text-[#0D2B35]">
            Start: {formatRangeDay(rangeStart)}.
            <span className="font-medium text-[#08647E]"> Now tap the end date.</span>
          </span>
        ) : (
          <span className="text-[13px] text-[#5A8399]">{DATE_RANGE_EMPTY_FOOTER}</span>
        )}
      </div>
    </div>
  );
}
