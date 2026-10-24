import type { Depth } from "@/lib/types"

/** Pin radius (px) by flood depth, shared by Replay and Reports. */
export const DEPTH_R: Record<Depth, number> = { ankle: 3, knee: 4, waist: 5, chest: 6 }

export const DEPTH_LABEL: Record<Depth, string> = { ankle: "Ankle", knee: "Knee", waist: "Waist", chest: "Chest or higher" }
