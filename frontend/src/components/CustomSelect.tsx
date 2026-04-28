"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  description?: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  accentColor?: string;
  className?: string;
}

export default function CustomSelect({
  value,
  onChange,
  options,
  disabled = false,
  accentColor = "#00d4aa",
  className = "",
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* ── Trigger Button ── */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex items-center justify-between w-full gap-2 px-3.5 py-2.5 rounded-xl transition-all duration-300 text-left group"
        style={{
          background: isOpen
            ? `linear-gradient(135deg, ${accentColor}18, ${accentColor}08)`
            : "rgba(0,0,0,0.3)",
          border: isOpen
            ? `1.5px solid ${accentColor}55`
            : "1.5px solid rgba(255,255,255,0.07)",
          boxShadow: isOpen
            ? `0 0 16px ${accentColor}12, inset 0 1px 0 rgba(255,255,255,0.04)`
            : "none",
          opacity: disabled ? 0.45 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <span className="flex items-center gap-2.5 min-w-0 flex-1">
          {selectedOption?.icon && (
            <span
              className="flex items-center justify-center w-6 h-6 shrink-0 rounded-lg transition-all duration-300"
              style={{
                background: `${accentColor}20`,
                color: accentColor,
                boxShadow: `0 0 8px ${accentColor}15`,
              }}
            >
              {selectedOption.icon}
            </span>
          )}
          <div className="flex flex-col min-w-0">
            <span
              className="text-[11px] font-semibold truncate tracking-wide transition-colors duration-300"
              style={{ color: isOpen ? accentColor : "rgba(230,235,245,0.92)" }}
            >
              {selectedOption?.label || "Select..."}
            </span>
            {selectedOption?.description && (
              <span className="text-[9px] text-slate-500 truncate">{selectedOption.description}</span>
            )}
          </div>
        </span>
        <ChevronDown
          className="w-3.5 h-3.5 shrink-0 transition-all duration-300"
          style={{
            color: isOpen ? accentColor : "rgba(148,163,184,0.5)",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {/* ── Inline Expandable Options ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div
              className="mt-1.5 rounded-xl overflow-hidden"
              style={{
                background: "rgba(6,10,20,0.88)",
                backdropFilter: "blur(20px)",
                border: `1px solid ${accentColor}20`,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 16px rgba(0,0,0,0.3)`,
              }}
            >
              <div className="py-1 max-h-56 overflow-y-auto custom-scrollbar">
                {options.map((option) => {
                  const isSelected = option.value === value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        onChange(option.value);
                        setIsOpen(false);
                      }}
                      className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left transition-all duration-200 relative group/item"
                      style={{
                        background: isSelected
                          ? `${accentColor}12`
                          : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isSelected
                          ? `${accentColor}12`
                          : "transparent";
                      }}
                    >
                      {/* Left accent bar for active */}
                      <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] rounded-r-full transition-all duration-300"
                        style={{
                          height: isSelected ? "16px" : "0px",
                          background: accentColor,
                          opacity: isSelected ? 1 : 0,
                        }}
                      />

                      {/* Icon */}
                      {option.icon && (
                        <span
                          className="flex items-center justify-center w-6 h-6 shrink-0 rounded-lg transition-all duration-200"
                          style={{
                            background: isSelected
                              ? `${accentColor}22`
                              : "rgba(255,255,255,0.04)",
                            color: isSelected ? accentColor : "rgba(148,163,184,0.6)",
                            boxShadow: isSelected ? `0 0 8px ${accentColor}12` : "none",
                          }}
                        >
                          {option.icon}
                        </span>
                      )}

                      {/* Label + Description */}
                      <div className="flex flex-col min-w-0 flex-1">
                        <span
                          className="text-[11px] font-medium truncate transition-colors duration-200"
                          style={{
                            color: isSelected
                              ? accentColor
                              : "rgba(226,232,240,0.8)",
                          }}
                        >
                          {option.label}
                        </span>
                        {option.description && (
                          <span className="text-[9px] text-slate-500/70 truncate mt-0.5">
                            {option.description}
                          </span>
                        )}
                      </div>

                      {/* Checkmark */}
                      {isSelected && (
                        <Check
                          className="w-3.5 h-3.5 shrink-0"
                          style={{ color: accentColor }}
                          strokeWidth={2.5}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
