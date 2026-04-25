export type FlightLeg = {
  airline: string;
  flight_number: string;
  departure_airport: string;
  departure_datetime: string;
  arrival_airport: string;
  arrival_datetime: string;
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
