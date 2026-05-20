// Travel agent state — matches what agents/travel writes to ADK shared state
export type DocStatus = 'idle' | 'drafting' | 'ready_to_book' | 'booked'

export type TripState = {
  destination?: string
  start_date?: string
  end_date?: string
  travelers?: number
  budget_usd?: number
  headline?: string
  summary?: string
  itinerary?: string
  flights?: string
  status?: DocStatus
  review_summary?: string
}

// Grocery agent state — matches what agents/grocery writes to ADK shared state
export type GroceryState = {
  shopping_list?: string[]
  cart?: CartItem[]
  pantry?: PantryItem[]
  meal_plan?: string
  weekly_deals?: string
  status?: 'idle' | 'planning' | 'ready'
  notes?: string
  review_summary?: string
  // Kroger auth — set by the frontend, read by the agent's header_provider
  kroger_connected?: boolean
  kroger_token?: string
}

export type CartItem = {
  name: string
  quantity: number
  price?: number
  upc?: string
}

export type PantryItem = {
  name: string
  quantity: string
  expires?: string
}

// User preferences — shared across both agents
export type TransportMode = 'flight' | 'road_trip'
export type BudgetTier = 'shoestring' | 'comfort' | 'premium' | 'luxury'
export type Vibe =
  | 'relaxed'
  | 'adventure'
  | 'foodie'
  | 'culture'
  | 'nightlife'
  | 'family'
export type Pace = 'slow' | 'balanced' | 'packed'

export type Preferences = {
  travelerName: string
  homeAirport: string
  transportMode: TransportMode
  budgetTier: BudgetTier
  vibe: Vibe
  pace: Pace
  interests: string[]
}
