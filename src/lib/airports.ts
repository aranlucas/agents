export interface AirportCoord {
  lat: number;
  lng: number;
}

export const AIRPORTS: Record<string, AirportCoord> = {
  SEA: { lat: 47.4502, lng: -122.3088 },
  SFO: { lat: 37.6213, lng: -122.379 },
  LAX: { lat: 33.9425, lng: -118.4081 },
  LAS: { lat: 36.084, lng: -115.1537 },
  DEN: { lat: 39.8561, lng: -104.6737 },
  ORD: { lat: 41.9742, lng: -87.9073 },
  JFK: { lat: 40.6413, lng: -73.7781 },
  PDX: { lat: 45.5898, lng: -122.5951 },
  PHX: { lat: 33.4373, lng: -112.0078 },
  BOI: { lat: 43.5644, lng: -116.2228 },
  YVR: { lat: 49.1967, lng: -123.1815 },
  SAN: { lat: 32.7338, lng: -117.1933 },
  MIA: { lat: 25.7959, lng: -80.287 },
  BOS: { lat: 42.3656, lng: -71.0096 },
  ATL: { lat: 33.6407, lng: -84.4277 },
  ANC: { lat: 61.1743, lng: -149.996 },
  HNL: { lat: 21.3245, lng: -157.9251 },
  MSP: { lat: 44.8848, lng: -93.2223 },
  SLC: { lat: 40.7884, lng: -111.9778 },
  OAK: { lat: 37.7213, lng: -122.2208 },
  SJC: { lat: 37.3626, lng: -121.9291 },
  SMF: { lat: 38.6954, lng: -121.5908 },
  RNO: { lat: 39.4991, lng: -119.7681 },
  ABQ: { lat: 35.0402, lng: -106.6091 },
  TUS: { lat: 32.1161, lng: -110.941 },
  EUG: { lat: 44.1246, lng: -123.212 },
  MFR: { lat: 42.3742, lng: -122.8735 },
  GEG: { lat: 47.6199, lng: -117.5339 },
};
