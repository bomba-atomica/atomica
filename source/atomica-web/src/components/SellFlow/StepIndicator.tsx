import type { SellFlowStep } from "../../hooks/useSellFlow";

const STEPS: { id: SellFlowStep; label: string }[] = [
  { id: "connect", label: "Connect" },
  { id: "lock", label: "Lock" },
  { id: "confirming", label: "Confirm" },
  { id: "generating-proof", label: "Proof" },
  { id: "submitting-proof", label: "Submit" },
  { id: "minting", label: "Mint" },
  { id: "creating-auction", label: "Auction" },
  { id: "monitoring", label: "Monitor" },
];

const STEP_ORDER: Record<SellFlowStep, number> = {
  connect: 0,
  lock: 1,
  confirming: 2,
  "generating-proof": 3,
  "submitting-proof": 4,
  minting: 5,
  "creating-auction": 6,
  monitoring: 7,
};

interface Props {
  current: SellFlowStep;
}

export function StepIndicator({ current }: Props) {
  const currentIndex = STEP_ORDER[current];

  return (
    <div className="flex items-center gap-0 mb-5">
      {STEPS.map((step, i) => {
        const isDone = i < currentIndex;
        const isActive = i === currentIndex;
        const isPending = i > currentIndex;

        return (
          <div key={step.id} className="flex items-center flex-1 min-w-0">
            {/* Circle */}
            <div className="flex flex-col items-center flex-shrink-0">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border transition-colors ${
                  isDone
                    ? "bg-zinc-300 border-zinc-300 text-zinc-900"
                    : isActive
                      ? "bg-zinc-100 border-zinc-100 text-zinc-900"
                      : "bg-transparent border-zinc-700 text-zinc-600"
                }`}
              >
                {isDone ? "✓" : i + 1}
              </div>
              <span
                className={`text-[9px] mt-0.5 whitespace-nowrap ${
                  isActive
                    ? "text-zinc-300"
                    : isDone
                      ? "text-zinc-400"
                      : "text-zinc-600"
                }`}
              >
                {step.label}
              </span>
            </div>
            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div
                className={`h-px flex-1 mx-1 transition-colors ${
                  isPending ? "bg-zinc-800" : "bg-zinc-500"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
