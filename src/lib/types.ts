export type FlightLeg = {
  airline: string;
  flight_number: string;
  departure_airport: string;
  departure_time: string;
  arrival_airport: string;
  arrival_time: string;
};

export type Flight = {
  price: number;
  duration_min: number;
  stops: number;
  legs: FlightLeg[];
};

export type FlightSearchResult = {
  flights?: Flight[];
  error?: string;
};

export type DatePrice = {
  date: string;
  price: number;
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
