import React, { useState } from "react";
import { DateRange } from "react-date-range";
import { subDays, startOfMonth, startOfYear, format, isAfter } from "date-fns";
import "react-date-range/dist/styles.css";
import "react-date-range/dist/theme/default.css";

const DateRangeSelector = ({ onApply, initialRange }) => {
  const sidebarOptions = [
    { label: "Today", range: [new Date(), new Date()] },
    { label: "Yesterday", range: [subDays(new Date(), 1), subDays(new Date(), 1)] },
    { label: "Last 7 days", range: [subDays(new Date(), 6), new Date()] },
    { label: "Last 30 days", range: [subDays(new Date(), 29), new Date()] },
    { label: "Last 90 days", range: [subDays(new Date(), 89), new Date()] },
    { label: "This month", range: [startOfMonth(new Date()), new Date()] },
    { label: "This year", range: [startOfYear(new Date()), new Date()] },
  ];

  const [state, setState] = useState([
    {
      startDate: initialRange?.startDate || subDays(new Date(), 29),
      endDate: initialRange?.endDate || new Date(),
      key: "selection",
    },
  ]);

  const [selectedLabel, setSelectedLabel] = useState(initialRange?.label || "Last 30 days");

  const handleSidebarClick = (label, range) => {
    setSelectedLabel(label);
    setState([{ startDate: range[0], endDate: range[1], key: "selection" }]);
  };

  const handleDateChange = (item) => {
    const { startDate, endDate } = item.selection;
    const today = new Date();
    const safeEndDate = isAfter(endDate, today) ? today : endDate;

    setSelectedLabel("Custom Range");
    setState([{ startDate, endDate: safeEndDate, key: "selection" }]);
  };

  const handleApply = () => {
    const formattedRange = {
      startDate: state[0].startDate,
      endDate: state[0].endDate,
      from: format(state[0].startDate, "yyyy-MM-dd"),
      to: format(state[0].endDate, "yyyy-MM-dd"),
      label: selectedLabel,
    };
    onApply(formattedRange);
  };

  return (
    <div className="flex flex-col md:flex-row bg-[#161616] text-white rounded-xl shadow-2xl border border-gray-800 overflow-hidden w-full max-w-2xl">
      
      {/* Sidebar */}
      <div className="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-gray-800 p-2 space-y-1">
        <div className="px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-widest">
          Quick Select
        </div>
        {sidebarOptions.map((opt) => (
          <div
            key={opt.label}
            onClick={() => handleSidebarClick(opt.label, opt.range)}
            className={`px-4 py-2.5 text-sm cursor-pointer rounded-lg transition-colors ${
              selectedLabel === opt.label
                ? "bg-green-500/15 text-green-400 font-semibold"
                : "text-gray-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            {opt.label}
          </div>
        ))}
      </div>

      {/* Calendar */}
      <div className="p-4 flex flex-col items-center bg-[#1a1a1a]">
        
        <style>{`
          .rdrCalendarWrapper {
            background: transparent !important;
            color: #e5e7eb !important;
          }

          .rdrMonthAndYearWrapper {
            color: #ffffff !important;
          }

          .rdrMonthAndYearPickers select {
            background: #2a2a2a !important;
            color: #ffffff !important;
            border: 1px solid #444 !important;
            border-radius: 6px;
            padding: 2px 6px;
          }

          .rdrWeekDays {
            color: #9ca3af !important;
          }

          .rdrDayNumber span {
            color: #e5e7eb !important;
          }

          .rdrDayPassive {
            opacity: 0.25 !important;
          }

          .rdrDayToday .rdrDayNumber span:after {
            background: #22c55e !important;
          }

          .rdrSelected,
          .rdrStartEdge,
          .rdrEndEdge {
            background: #22c55e !important;
            color: #000 !important;
          }

          .rdrInRange {
            background: rgba(34, 197, 94, 0.2) !important;
          }

          .rdrDayInPreview {
            border: 1px solid #22c55e !important;
          }

          .rdrDateDisplayWrapper {
            background: transparent !important;
          }

          .rdrDateDisplayItem {
            background: #2a2a2a !important;
            border: 1px solid #444 !important;
            color: #fff !important;
          }

          .rdrDateDisplayItem input {
            color: #fff !important;
          }
        `}</style>

        <DateRange
          editableDateInputs={true}
          onChange={handleDateChange}
          moveRangeOnFirstSelection={false}
          ranges={state}
          maxDate={new Date()}
          rangeColors={["#22c55e"]}
          weekdayDisplayFormat="EEEEEE"
        />

        <div className="w-full flex justify-between items-center mt-6 pt-4 border-t border-gray-800">
          <div className="text-xs text-gray-400">
            {format(state[0].startDate, "MMM dd, yyyy")} —{" "}
            {format(state[0].endDate, "MMM dd, yyyy")}
          </div>

          <button
            className="px-6 py-2 bg-green-500 hover:bg-green-600 text-black font-bold text-sm rounded-lg transition-all shadow-lg shadow-green-500/20 active:scale-95"
            onClick={handleApply}
          >
            Apply Range
          </button>
        </div>
      </div>
    </div>
  );
};

export default DateRangeSelector;