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

// Grocery agent state — matches what agents/grocery will write to ADK shared state
export type GroceryState = {
  shopping_list?: string[]
  cart?: CartItem[]
  pantry?: PantryItem[]
  meal_plan?: string
  weekly_deals?: string
  status?: 'idle' | 'planning' | 'ready'
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
export type Preferences = {
  travelerName: string
  homeAirport: string
  transportMode: 'flight' | 'road_trip'
  budgetTier: string
  vibe: string
  pace: string
  interests: string[]
}
