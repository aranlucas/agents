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
