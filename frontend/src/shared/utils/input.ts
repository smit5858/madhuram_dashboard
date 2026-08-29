import type { WheelEvent } from "react";

// Browsers change a focused number input's value when the user scrolls the mouse
// wheel over it (Chrome/Edge treat wheel-over-focused as an up/down step). Blurring
// on wheel removes that special handling — the page keeps scrolling normally since
// this never calls preventDefault().
export const blurNumberInputOnWheel = (e: WheelEvent<HTMLInputElement>) => {
  e.currentTarget.blur();
};
