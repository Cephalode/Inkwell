import { useState } from 'react';
import { HiOutlineCog6Tooth, HiChevronDown, HiChevronUp } from 'react-icons/hi2';
import { useKnowledgeGraphStore } from '../../store/knowledgeGraphStore';

interface SliderConfig {
  key: 'chargeStrength' | 'linkDistance' | 'linkStrength' | 'centerStrength' | 'nodeSize' | 'cooldownTime' | 'velocityDecay';
  label: string;
  min: number;
  max: number;
  step: number;
}

const forceSliders: SliderConfig[] = [
  { key: 'chargeStrength', label: 'Charge Strength', min: -500, max: 0, step: 10 },
  { key: 'linkDistance', label: 'Link Distance', min: 10, max: 300, step: 5 },
  { key: 'linkStrength', label: 'Link Strength', min: 0, max: 1, step: 0.05 },
  { key: 'centerStrength', label: 'Center Gravity', min: 0, max: 1, step: 0.05 },
];

const appearanceSliders: SliderConfig[] = [
  { key: 'nodeSize', label: 'Node Size', min: 2, max: 20, step: 1 },
];

const simSliders: SliderConfig[] = [
  { key: 'velocityDecay', label: 'Velocity Decay', min: 0, max: 1, step: 0.05 },
  { key: 'cooldownTime', label: 'Cooldown (ms)', min: 1000, max: 30000, step: 1000 },
];

function SliderRow({ config, value, onChange }: {
  config: SliderConfig;
  value: number;
  onChange: (val: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{config.label}</span>
        <span className="text-xs font-mono text-teal-400 tabular-nums w-12 text-right">
          {config.step < 1 ? value.toFixed(2) : value}
        </span>
      </div>
      <input
        type="range"
        min={config.min}
        max={config.max}
        step={config.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-3
          [&::-webkit-slider-thumb]:h-3
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-teal-500
          [&::-webkit-slider-thumb]:hover:bg-teal-400
          [&::-webkit-slider-thumb]:transition-colors
          [&::-webkit-slider-thumb]:shadow-md
          [&::-moz-range-thumb]:w-3
          [&::-moz-range-thumb]:h-3
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-teal-500
          [&::-moz-range-thumb]:border-0
          [&::-moz-range-thumb]:hover:bg-teal-400"
      />
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </span>
      <div className="flex-1 border-t border-slate-700/50" />
    </div>
  );
}

export function GraphControls() {
  const { simulationControls, setSimulationControls } = useKnowledgeGraphStore();
  const [expanded, setExpanded] = useState(false);

  const handleChange = (key: SliderConfig['key'], value: number) => {
    setSimulationControls({ [key]: value });
  };

  return (
    <div className="absolute bottom-14 left-4 z-10 w-56">
      <div className="bg-slate-800/90 backdrop-blur-sm border border-slate-700/50 rounded-xl shadow-xl overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-3 py-2.5 text-slate-100 hover:bg-slate-700/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <HiOutlineCog6Tooth className="w-4 h-4 text-teal-500" />
            <span className="text-sm font-medium">Physics</span>
          </div>
          {expanded ? (
            <HiChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <HiChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {expanded && (
          <div className="px-3 pb-3 space-y-3">
            {/* Forces */}
            <SectionHeader title="Forces" />
            <div className="space-y-2.5">
              {forceSliders.map((cfg) => (
                <SliderRow
                  key={cfg.key}
                  config={cfg}
                  value={simulationControls[cfg.key]}
                  onChange={(v) => handleChange(cfg.key, v)}
                />
              ))}
            </div>

            {/* Appearance */}
            <SectionHeader title="Appearance" />
            <div className="space-y-2.5">
              {appearanceSliders.map((cfg) => (
                <SliderRow
                  key={cfg.key}
                  config={cfg}
                  value={simulationControls[cfg.key]}
                  onChange={(v) => handleChange(cfg.key, v)}
                />
              ))}
              {/* Boolean toggle for nodeSizeByConnections */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Size by Degree</span>
                <button
                  role="switch"
                  aria-checked={simulationControls.nodeSizeByConnections}
                  onClick={() =>
                    setSimulationControls({
                      nodeSizeByConnections: !simulationControls.nodeSizeByConnections,
                    })
                  }
                  className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-500/50 ${
                    simulationControls.nodeSizeByConnections ? 'bg-teal-500' : 'bg-slate-600'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      simulationControls.nodeSizeByConnections ? 'translate-x-3' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Simulation */}
            <SectionHeader title="Simulation" />
            <div className="space-y-2.5">
              {simSliders.map((cfg) => (
                <SliderRow
                  key={cfg.key}
                  config={cfg}
                  value={simulationControls[cfg.key]}
                  onChange={(v) => handleChange(cfg.key, v)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
