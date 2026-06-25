import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// shadcn-standard class combiner: merges conditional classes and de-dupes
// conflicting Tailwind utilities (last one wins).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
