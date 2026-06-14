import { PRESETS } from "../../viewModel/selectors/presets";
import { Button } from "@/shared/view/components/ui/button";
import { useSimulationStore } from "../../store";

export function PresetButtons() {
  const applyPreset = useSimulationStore((s) => s.applyPreset);
  const isWorkerReady = useSimulationStore((s) => s.isWorkerReady);

  return (
    <div className="flex flex-wrap gap-1.5">
      {PRESETS.map((preset) => (
        <Button
          key={preset.id}
          variant="secondary"
          size="sm"
          disabled={!isWorkerReady}
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
