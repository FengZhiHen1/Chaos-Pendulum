import { PRESETS } from "@/shared/types";
import { Button } from "@/shared/components/ui/button";
import { useSimulationStore } from "../store";

export function PresetButtons() {
  const applyPreset = useSimulationStore((s) => s.applyPreset);
  const engineError = useSimulationStore((s) => s.engineError);

  return (
    <div className="flex flex-wrap gap-1.5">
      {PRESETS.map((preset) => (
        <Button
          key={preset.id}
          variant="outline"
          size="sm"
          disabled={engineError !== null}
          onClick={() => {
            const err = applyPreset(preset);
            if (err) {
              console.error(`preset validation failed: ${preset.id}`, err);
            }
          }}
          title={preset.description}
        >
          {preset.label}
        </Button>
      ))}
    </div>
  );
}
