import type { AppMode } from "@/shared/types";

interface ModeSwitchProps {
  modes: { id: AppMode; label: string }[];
  active: AppMode;
  onChange: (mode: AppMode) => void;
}

export function ModeSwitch({ modes, active, onChange }: ModeSwitchProps) {
  return (
    <div className="flex gap-1 bg-lab-dark rounded-lg p-0.5">
      {modes.map((m) => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          className={`px-4 py-1 text-sm rounded-md transition-colors ${
            active === m.id
              ? "bg-lab-accent text-white"
              : "text-lab-border hover:text-white"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
