// Where a version's design lives. The platform works with any of them, or none.
export const MODEL_TOOLS = [
  ["archicad", "Archicad"], ["revit", "Revit"], ["sketchup", "SketchUp"], ["other_bim", "Other BIM / CAD"],
  ["drawings", "Drawings only"], ["ai", "AI assumptions"], ["none", "No model"],
] as const;
export const modelToolLabel = (v: string | null | undefined) => MODEL_TOOLS.find(([k]) => k === v)?.[1] ?? v ?? null;
