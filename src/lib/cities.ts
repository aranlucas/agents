export interface CityCoord {
  lat: number;
  lng: number;
}

export const CITIES: Record<string, CityCoord> = {
  "Seattle, WA": { lat: 47.6062, lng: -122.3321 },
  "Seattle": { lat: 47.6062, lng: -122.3321 },
  "Vancouver, BC": { lat: 49.2827, lng: -123.1207 },
  "Vancouver": { lat: 49.2827, lng: -123.1207 },
  "Whistler, BC": { lat: 50.1163, lng: -122.9574 },
  "Whistler": { lat: 50.1163, lng: -122.9574 },
  "Portland, OR": { lat: 45.5152, lng: -122.6784 },
  "Portland": { lat: 45.5152, lng: -122.6784 },
  "San Francisco, CA": { lat: 37.7749, lng: -122.4194 },
  "San Francisco": { lat: 37.7749, lng: -122.4194 },
  "Los Angeles, CA": { lat: 34.0522, lng: -118.2437 },
  "Los Angeles": { lat: 34.0522, lng: -118.2437 },
  "Las Vegas, NV": { lat: 36.1699, lng: -115.1398 },
  "Las Vegas": { lat: 36.1699, lng: -115.1398 },
  "Denver, CO": { lat: 39.7392, lng: -104.9903 },
  "Denver": { lat: 39.7392, lng: -104.9903 },
  "New York, NY": { lat: 40.7128, lng: -74.006 },
  "New York": { lat: 40.7128, lng: -74.006 },
  "Chicago, IL": { lat: 41.8781, lng: -87.6298 },
  "Chicago": { lat: 41.8781, lng: -87.6298 },
  "Miami, FL": { lat: 25.7617, lng: -80.1918 },
  "Miami": { lat: 25.7617, lng: -80.1918 },
  "Boston, MA": { lat: 42.3601, lng: -71.0589 },
  "Boston": { lat: 42.3601, lng: -71.0589 },
  "Phoenix, AZ": { lat: 33.4484, lng: -112.074 },
  "Phoenix": { lat: 33.4484, lng: -112.074 },
  "Austin, TX": { lat: 30.2672, lng: -97.7431 },
  "Austin": { lat: 30.2672, lng: -97.7431 },
};
