export type FlightLeg = {
  airline: string;
  airline_code: string;
  flight_number: string;
  departure_airport: string;
  departure_time: string;
  arrival_airport: string;
  arrival_time: string;
  duration: number; // minutes
};

export type Flight = {
  price: number;
  currency: string;
  legs: FlightLeg[];
  stops?: number;
};

export type FlightSearchResult = {
  flights?: Flight[];
  error?: string;
};

export type DatePrice = {
  date: string[]; // [departureISO] or [departureISO, returnISO]
  price: number;
  currency: string;
  return_date: string | null;
};

export type DateSearchResult = {
  dates?: DatePrice[];
  cheapest_dates?: DatePrice[];
  error?: string;
};

// --- Shared agent state (useCoAgent) ---

export interface StoredFlightResult {
  id: string;
  args: Record<string, string>;
  flights: Flight[];
  ts: number;
}

export interface StoredDateResult {
  id: string;
  args: Record<string, string>;
  dates: DatePrice[];
  ts: number;
}

export interface AgentState {
  flight_results?: StoredFlightResult[];
  date_results?: StoredDateResult[];
  active_trip?: ActiveTrip;
  hotel_results?: StoredHotelResult[];
  route_results?: StoredRouteResult[];
  viability_results?: StoredViabilityResult[];
  [key: string]: unknown;
}

// --- Active Trip Types ---

export interface HotelOption {
  name: string;
  price: number;
  currency: string;
  [key: string]: unknown;
}

export interface RouteOption {
  price: number;
  currency: string;
  duration?: number;
  transfers?: number;
  legs?: unknown[];
  [key: string]: unknown;
}

export interface ViabilityCheck {
  dimension: string;
  status: string;
  summary: string;
}

export interface ViabilityInfo {
  verdict: string;
  checks: ViabilityCheck[];
  total_cost: number;
  currency: string;
}

export interface TripLeg {
  type: string;
  from: string;
  to: string;
  provider?: string;
  confirmed: boolean;
  start_time?: string;
  end_time?: string;
  price?: number;
  currency?: string;
  reference?: string;
  hotels?: HotelOption[];
}

export interface ActiveTrip {
  id?: string;
  name?: string;
  status?: string;
  origin?: string;
  destination?: string;
  legs?: TripLeg[];
  transport?: { options?: RouteOption[]; routes?: RouteOption[] };
  lodging?: { options: HotelOption[] };
  viability?: ViabilityInfo;
  bookings?: unknown[];
  tags?: string[];
  notes?: string;
  source_updated_at?: string;
  updated_at?: number | string;
  [key: string]: unknown;
}

// --- Stored Result Types for New Categories ---

export interface StoredHotelResult {
  id: string;
  args: Record<string, string>;
  hotels: HotelOption[];
  ts: number;
}

export interface StoredRouteResult {
  id: string;
  args: Record<string, string>;
  routes: RouteOption[];
  ts: number;
}

export interface StoredViabilityResult {
  id: string;
  args: Record<string, string>;
  verdict: string;
  checks: ViabilityCheck[];
  total_cost: number;
  currency: string;
  ts: number;
}

export interface ArcDatum {
  id: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
  strokeWidth: number;
}
