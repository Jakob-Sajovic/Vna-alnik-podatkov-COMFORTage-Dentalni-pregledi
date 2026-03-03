import { FdiToothNumber } from "../model/types";
import { UPPER_RIGHT, UPPER_LEFT, LOWER_LEFT, LOWER_RIGHT } from "../model/constants";

// Get teeth for a specific quadrant (1–4)
export function getQuadrantTeeth(quadrant: 1 | 2 | 3 | 4): FdiToothNumber[] {
  switch (quadrant) {
    case 1: return UPPER_RIGHT;
    case 2: return UPPER_LEFT;
    case 3: return LOWER_LEFT;
    case 4: return LOWER_RIGHT;
  }
}

// Position info for rendering a tooth in the chart
export interface ToothPosition {
  tooth: FdiToothNumber;
  row: "upper" | "lower";
  col: number; // 0-based column index within the row
  quadrant: 1 | 2 | 3 | 4;
}

// Generate chart positions for all 32 teeth (upper row: 18→28, lower row: 38→41)
export function getToothPositions(): ToothPosition[] {
  const positions: ToothPosition[] = [];

  // Upper row: right to left (18..11, 21..28)
  const upperTeeth = [...UPPER_RIGHT, ...UPPER_LEFT];
  upperTeeth.forEach((tooth, col) => {
    const quadrant = tooth >= 20 ? 2 : 1;
    positions.push({ tooth, row: "upper", col, quadrant: quadrant as 1 | 2 });
  });

  // Lower row: left to right (38..31, 41..48)
  const lowerTeeth = [...LOWER_LEFT, ...LOWER_RIGHT];
  lowerTeeth.forEach((tooth, col) => {
    const quadrant = tooth >= 40 ? 4 : 3;
    positions.push({ tooth, row: "lower", col, quadrant: quadrant as 3 | 4 });
  });

  return positions;
}
