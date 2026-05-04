import { z } from "zod";

export const addBookingSchema = z.object({
    "type": z.string().describe("Booking type"),
    "provider": z.string().describe("Provider"),
    "date": z.string().describe("Booking date").optional(),
    "travel_date": z.string().describe("Travel or check-in date").optional(),
    "from": z.string().describe("Origin").optional(),
    "to": z.string().describe("Destination").optional(),
    "price": z.number().describe("Total price").optional(),
    "currency": z.string().describe("Currency").optional(),
    "nights": z.number().int().describe("Number of nights").optional(),
    "stars": z.number().int().describe("Hotel stars").optional(),
    "source": z.string().describe("Data source").optional(),
    "reference": z.string().describe("Booking reference").optional(),
    "notes": z.string().describe("Notes").optional()
  }).strict();

export const assessTripSchema = z.object({
    "origin": z.string().describe("Origin airport IATA code"),
    "destination": z.string().describe("Destination airport IATA code"),
    "depart_date": z.string().describe("Departure date YYYY-MM-DD"),
    "return_date": z.string().describe("Return date YYYY-MM-DD"),
    "guests": z.number().int().describe("Number of guests").optional(),
    "passport": z.string().describe("Passport country code").optional(),
    "currency": z.string().describe("Display currency").optional()
  }).strict();

export const buildProfileSchema = z.object({
    "source": z.string().describe("Profile source: email, manual, or empty").optional()
  }).strict();

export const calculatePointsValueSchema = z.object({
    "cash_price": z.number().describe("Cash price of the redemption"),
    "points_required": z.number().int().describe("Points required"),
    "program": z.string().describe("Loyalty program slug")
  }).strict();

export const calculateTripCostSchema = z.object({
    "origin": z.string().describe("Origin airport IATA code"),
    "destination": z.string().describe("Destination airport IATA code"),
    "depart_date": z.string().describe("Departure date in YYYY-MM-DD format"),
    "return_date": z.string().describe("Return date in YYYY-MM-DD format"),
    "guests": z.number().int().describe("Number of guests").optional(),
    "currency": z.string().describe("Display currency").optional()
  }).strict();

export const checkVisaSchema = z.object({
    "passport": z.string().describe("Passport country code (ISO 3166-1 alpha-2, e.g. FI, US, GB, JP)"),
    "destination": z.string().describe("Destination country code (ISO 3166-1 alpha-2, e.g. JP, TH, US, DE)")
  }).strict();

export const configureProviderSchema = z.object({
    "id": z.string().describe("Provider identifier"),
    "name": z.string().describe("Provider name"),
    "category": z.string().describe("Provider category,enum=hotel,enum=hotels,enum=flight,enum=flights,enum=ground,enum=restaurant,enum=restaurants,enum=review,enum=reviews"),
    "endpoint": z.string().describe("Provider search endpoint URL"),
    "method": z.string().describe("HTTP method,enum=GET,enum=POST").optional(),
    "headers": z.object({}).catchall(z.string()).describe("Extra HTTP headers").optional(),
    "query_params": z.object({}).catchall(z.string()).describe("URL query parameters").optional(),
    "body_template": z.string().describe("Request body template with placeholders").optional(),
    "auth_type": z.string().describe("Authentication type,enum=none,enum=header,enum=preflight").optional(),
    "auth_preflight_url": z.string().describe("URL for preflight auth request").optional(),
    "auth_extractions": z.object({}).catchall(z.object({
    "pattern": z.string(),
    "variable": z.string(),
    "header": z.string(),
    "url": z.string().optional(),
    "default": z.string().optional()
  }).strict()).describe("Preflight auth extraction rules").optional(),
    "results_path": z.string().describe("JSONPath to the results array"),
    "field_mapping": z.object({}).catchall(z.string()).describe("Field mapping from trvl fields to provider JSON paths"),
    "rate_limit_rps": z.number().describe("Maximum requests per second,minimum=0").optional(),
    "tls_fingerprint": z.string().describe("TLS fingerprint profile").optional(),
    "cookies_source": z.string().describe("Cookie source strategy").optional(),
    "browser_escape_hatch": z.boolean().describe("Open browser when WAF cookies are required").optional()
  }).strict();

export const createTripSchema = z.object({
    "name": z.string().describe("Trip name"),
    "legs": z.array(z.object({
    "type": z.string().describe("Leg type (flight, train, bus, ferry, hotel, activity)"),
    "from": z.string().describe("Origin city or location"),
    "to": z.string().describe("Destination city or location"),
    "provider": z.string().describe("Provider (airline, hotel, etc.)").optional(),
    "start_time": z.string().describe("ISO datetime (e.g. 2025-06-01T10:00)").optional(),
    "end_time": z.string().describe("ISO datetime").optional(),
    "price": z.number().describe("Leg price,minimum=0").optional(),
    "currency": z.string().describe("Currency code (e.g. USD)").optional(),
    "booking_url": z.string().describe("Booking URL").optional(),
    "confirmed": z.boolean().describe("Whether leg is confirmed/booked").optional(),
    "reference": z.string().describe("Booking reference or PNR").optional()
  }).strict()).describe("Initial legs in chronological order").nullable().optional()
  }).strict();

export const destinationInfoSchema = z.object({
    "location": z.string().describe("City or location name"),
    "travel_dates": z.string().describe("Optional date range as YYYY-MM-DD,YYYY-MM-DD").optional()
  }).strict();

export const detectAccommodationHacksSchema = z.object({
    "city": z.string().describe("City name"),
    "checkin": z.string().describe("Check-in date (YYYY-MM-DD)"),
    "checkout": z.string().describe("Check-out date (YYYY-MM-DD)"),
    "currency": z.string().describe("Display currency,pattern=^[A-Z]{3}$").optional(),
    "max_splits": z.number().int().describe("Maximum properties to split across,minimum=2,maximum=3").optional(),
    "guests": z.number().int().describe("Number of guests,minimum=1").optional()
  }).strict();

export const detectTravelHacksSchema = z.object({
    "origin": z.string().describe("Origin airport IATA code"),
    "destination": z.string().describe("Destination airport IATA code"),
    "date": z.string().describe("Departure date"),
    "return_date": z.string().describe("Return date").optional(),
    "currency": z.string().describe("Display currency").optional(),
    "carry_on": z.boolean().describe("Carry-on-only trip").optional()
  }).strict();

export const exploreDestinationsSchema = z.object({
    "origin": z.string().describe("Departure airport IATA code (e.g. SEA, JFK, LHR),pattern=^[A-Z]{3}$"),
    "start_date": z.string().describe("Departure date (YYYY-MM-DD); defaults to 7 days from now").optional(),
    "end_date": z.string().describe("Return date (YYYY-MM-DD); omit for one-way").optional(),
    "trip_type": z.string().describe("Trip type,enum=round-trip,enum=one-way").optional()
  }).strict();

export const exportIcsSchema = z.object({
    "trip_id": z.string().describe("Trip ID")
  }).strict();

export const findInteractiveSchema = z.object({
    "origin": z.string().describe("Origin IATA code(s), comma-separated, or 'home' to expand from preferences.home_airports"),
    "destination": z.string().describe("Destination IATA code(s), comma-separated"),
    "departure_date": z.string().describe("ISO 8601 calendar date, e.g. 2026-04-23"),
    "return_date": z.string().optional(),
    "cabin": z.string().describe("Cabin class: economy, premium_economy, business, first").optional(),
    "min_layover_minutes": z.number().int().optional(),
    "layover_at": z.array(z.string()).nullable().optional(),
    "no_early_connection": z.boolean().describe("Drop flights whose post-overnight leg departs before preferences.early_connection_floor (default 10:00)").optional(),
    "lounge_required": z.boolean().describe("Drop flights where a layover airport lacks lounge coverage from user's cards").optional(),
    "hidden_city": z.boolean().describe("Also consider hidden-city candidates").optional(),
    "top_n": z.number().int().optional()
  }).strict();

export const findTripWindowSchema = z.object({
    "destination": z.string().describe("Destination city or IATA code"),
    "origin": z.string().describe("Origin city or IATA code").optional(),
    "window_start": z.string().describe("Window start date YYYY-MM-DD"),
    "window_end": z.string().describe("Window end date YYYY-MM-DD"),
    "busy_intervals": z.array(z.object({
    "start": z.string(),
    "end": z.string(),
    "reason": z.string().optional()
  }).strict()).describe("Busy calendar intervals").nullable().optional(),
    "preferred_intervals": z.array(z.object({
    "start": z.string(),
    "end": z.string(),
    "reason": z.string().optional()
  }).strict()).describe("Preferred calendar intervals").nullable().optional(),
    "min_nights": z.number().int().describe("Minimum trip nights").optional(),
    "max_nights": z.number().int().describe("Maximum trip nights").optional(),
    "max_candidates": z.number().int().describe("Maximum candidates to return").optional(),
    "budget": z.number().describe("Maximum budget").optional()
  }).strict();

export const getBaggageRulesSchema = z.object({
    "airline_code": z.string().describe("IATA airline code (e.g. KL, FR, U2) or \"all\" to list all airlines")
  }).strict();

export const getPreferencesSchema = z.object({}).strict();

export const getTripSchema = z.object({
    "id": z.string().describe("Trip ID")
  }).strict();

export const getWeatherSchema = z.object({
    "city": z.string().describe("City name (e.g. Prague, Helsinki, Tokyo)"),
    "from_date": z.string().describe("Start date (YYYY-MM-DD, default: today)").optional(),
    "to_date": z.string().describe("End date (YYYY-MM-DD, default: today+6)").optional()
  }).strict();

export const hotelPricesSchema = z.object({
    "hotel_id": z.string().describe("Google Hotels property ID from search_hotels results"),
    "check_in": z.string().describe("Check-in date (YYYY-MM-DD)"),
    "check_out": z.string().describe("Check-out date (YYYY-MM-DD)"),
    "currency": z.string().describe("Currency code,pattern=^[A-Z]{3}$").optional()
  }).strict();

export const hotelReviewsSchema = z.object({
    "hotel_id": z.string().describe("Google Hotels property ID from search_hotels results"),
    "limit": z.number().int().describe("Maximum reviews to return,minimum=1").optional(),
    "sort": z.string().describe("Sort order,enum=newest,enum=highest,enum=lowest").optional()
  }).strict();

export const hotelRoomsSchema = z.object({
    "hotel_name": z.string().describe("Hotel name and optional city"),
    "check_in": z.string().describe("Check-in date (YYYY-MM-DD)"),
    "check_out": z.string().describe("Check-out date (YYYY-MM-DD)"),
    "currency": z.string().describe("Currency code,pattern=^[A-Z]{3}$").optional(),
    "booking_url": z.string().describe("Booking.com hotel URL from search_hotels results").optional()
  }).strict();

export const interviewTripSchema = z.object({}).strict();

export const listOpportunityWatchesSchema = z.object({}).strict();

export const listProvidersSchema = z.object({}).strict();

export const listTripsSchema = z.object({}).strict();

export const localEventsSchema = z.object({
    "location": z.string().describe("City or location name"),
    "start_date": z.string().describe("Start date in YYYY-MM-DD format"),
    "end_date": z.string().describe("End date in YYYY-MM-DD format")
  }).strict();

export const markTripBookedSchema = z.object({
    "trip_id": z.string().describe("Trip ID"),
    "provider": z.string().describe("Booking provider"),
    "reference": z.string().describe("Booking reference")
  }).strict();

export const nearbyPlacesSchema = z.object({
    "lat": z.number().describe("Latitude"),
    "lon": z.number().describe("Longitude"),
    "category": z.string().describe("Place category").optional(),
    "radius": z.number().int().describe("Search radius in meters").optional()
  }).strict();

export const onboardProfileSchema = z.object({
    "phase": z.number().int().describe("Onboarding phase")
  }).strict();

export const optimizeBookingSchema = z.object({
    "origin": z.string().describe("Origin airport IATA code"),
    "destination": z.string().describe("Destination airport IATA code"),
    "departure_date": z.string().describe("Departure date YYYY-MM-DD"),
    "return_date": z.string().describe("Return date YYYY-MM-DD"),
    "flex_days": z.number().int().describe("Date flexibility +/- days").optional(),
    "guests": z.number().int().describe("Number of guests").optional(),
    "currency": z.string().describe("Display currency").optional(),
    "max_results": z.number().int().describe("Maximum results to return").optional(),
    "max_api_calls": z.number().int().describe("API call budget").optional(),
    "need_checked_bag": z.boolean().describe("Need checked bag").optional(),
    "carry_on_only": z.boolean().describe("Carry-on-only trip").optional()
  }).strict();

export const optimizeMultiCitySchema = z.object({
    "home_airport": z.string().describe("Home airport IATA code,pattern=^[A-Z]{3}$"),
    "cities": z.array(z.string()).describe("City IATA codes to visit").nullable(),
    "depart_date": z.string().describe("Departure date (YYYY-MM-DD)"),
    "return_date": z.string().describe("Return date (YYYY-MM-DD)").optional()
  }).strict();

export const optimizeTripDatesSchema = z.object({
    "origin": z.string().describe("Origin airport IATA code"),
    "destination": z.string().describe("Destination airport IATA code"),
    "from_date": z.string().describe("Start date in YYYY-MM-DD format"),
    "to_date": z.string().describe("End date in YYYY-MM-DD format"),
    "trip_length": z.number().int().describe("Trip length in days").optional(),
    "guests": z.number().int().describe("Number of guests").optional(),
    "currency": z.string().describe("Display currency").optional()
  }).strict();

export const planFlightBundleSchema = z.object({
    "origin": z.string().describe("Origin IATA codes, comma-separated or 'home'").optional(),
    "destination": z.string().describe("Destination IATA codes, comma-separated"),
    "departure_date": z.string().describe("ISO 8601 date"),
    "return_date": z.string().describe("Return date").optional(),
    "cabin": z.string().describe("Cabin class").optional(),
    "min_layover_minutes": z.number().int().describe("Minimum layover minutes").optional(),
    "layover_at": z.array(z.string()).describe("Layover airport IATA codes").nullable().optional(),
    "no_early_connection": z.boolean().describe("Avoid early connections").optional(),
    "lounge_required": z.boolean().describe("Require lounge access").optional(),
    "hidden_city": z.boolean().describe("Allow hidden city").optional(),
    "top_n": z.number().int().describe("Return top N results").optional()
  }).strict();

export const planTripSchema = z.object({
    "origin": z.string().describe("Origin IATA airport code,pattern=^[A-Z]{3}$"),
    "destination": z.string().describe("Destination IATA airport code,pattern=^[A-Z]{3}$"),
    "depart_date": z.string().describe("Departure date (YYYY-MM-DD)"),
    "return_date": z.string().describe("Return date (YYYY-MM-DD)"),
    "guests": z.number().int().describe("Number of guests,minimum=1").optional(),
    "currency": z.string().describe("Display currency,pattern=^[A-Z]{3}$").optional()
  }).strict();

export const providerHealthSchema = z.object({}).strict();

export const removeProviderSchema = z.object({
    "id": z.string().describe("Provider ID")
  }).strict();

export const searchAirportTransfersSchema = z.object({
    "airport_code": z.string().describe("Arrival airport IATA code,pattern=^[A-Z]{3}$"),
    "destination": z.string().describe("Hotel, address, district, or city destination"),
    "date": z.string().describe("Travel date (YYYY-MM-DD)"),
    "arrival_time": z.string().describe("Earliest local departure time,pattern=^([01][0-9]|2[0-3]):[0-5][0-9]$").optional(),
    "currency": z.string().describe("Price currency,pattern=^[A-Z]{3}$").optional(),
    "type": z.string().describe("Transport type filter,enum=bus,enum=train,enum=taxi,enum=tram,enum=metro,enum=mixed").optional(),
    "max_price": z.number().describe("Maximum price,minimum=0").optional(),
    "providers": z.array(z.string()).describe("Provider filters").nullable().optional()
  }).strict();

export const searchAwardsSchema = z.object({
    "seats": z.array(z.object({
    "program": z.string().describe("Award program code"),
    "origin": z.string().describe("Origin IATA code"),
    "destination": z.string().describe("Destination IATA code"),
    "date": z.string().describe("Travel date YYYY-MM-DD"),
    "cabin": z.string().describe("Cabin class"),
    "miles_cost": z.number().int().describe("Native program miles cost"),
    "cash_fees": z.number().describe("Cash taxes and fees"),
    "cash_equivalent": z.number().describe("Comparable cash fare"),
    "bookable_segments": z.number().int().describe("Bookable segment count").optional()
  }).strict()).describe("Award seat fixtures").nullable(),
    "balances": z.array(z.object({
    "program": z.string().describe("Points program code"),
    "balance": z.number().int().describe("Current points balance")
  }).strict()).describe("User point balances").nullable(),
    "transfer_ratios": z.array(z.object({
    "source": z.string().describe("Source points program"),
    "target": z.string().describe("Target award program"),
    "numerator": z.number().describe("Source units"),
    "denominator": z.number().describe("Target units")
  }).strict()).describe("Custom transfer ratios").nullable().optional(),
    "min_cpp": z.number().describe("Minimum cents per point").optional(),
    "cabin": z.string().describe("Cabin filter").optional(),
    "origin": z.string().describe("Origin IATA filter").optional(),
    "destination": z.string().describe("Destination IATA filter").optional()
  }).strict();

export const searchDatesSchema = z.object({
    "origin": z.string().describe("Departure airport IATA code,pattern=^[A-Z]{3}$"),
    "destination": z.string().describe("Arrival airport IATA code,pattern=^[A-Z]{3}$"),
    "start_date": z.string().describe("Start date (YYYY-MM-DD)"),
    "end_date": z.string().describe("End date (YYYY-MM-DD)"),
    "trip_duration": z.number().int().describe("Trip duration in days for round-trip searches,minimum=1").optional(),
    "is_round_trip": z.boolean().describe("Whether to search round-trip fares").optional()
  }).strict();

export const searchDealsSchema = z.object({
    "origins": z.array(z.string()).describe("Origin airport codes").nullable(),
    "max_price": z.number().describe("Maximum price in USD,minimum=0").optional(),
    "type": z.string().describe("Deal type filter").optional(),
    "hours": z.number().int().describe("Hours to look back,minimum=1").optional()
  }).strict();

export const searchFlightsSchema = z.object({
    "origin": z.string().describe("Departure airport IATA code (e.g., HEL, JFK) or city name (e.g., Paris, Tokyo). Must be a real airport or city — do not pass placeholders like NEARBY, ANY, or FLEXIBLE."),
    "destination": z.string().describe("Arrival airport IATA code (e.g., NRT, LAX) or city name (e.g., London, Barcelona). Must be a real airport or city — do not pass placeholders like NEARBY, ANY, or FLEXIBLE."),
    "departure_date": z.string().describe("Departure date (YYYY-MM-DD)"),
    "return_date": z.string().describe("Return date for round-trip searches (YYYY-MM-DD)").optional(),
    "cabin_class": z.string().describe("Cabin class,enum=economy,enum=premium_economy,enum=business,enum=first").optional(),
    "max_stops": z.string().describe("Maximum stops,enum=any,enum=nonstop,enum=one_stop,enum=two_plus").optional(),
    "sort_by": z.string().describe("Sort order,enum=cheapest,enum=duration,enum=departure,enum=arrival").optional(),
    "alliances": z.string().describe("Filter by airline alliance (comma-separated): STAR_ALLIANCE, ONEWORLD, SKYTEAM (default: no filter)").optional(),
    "depart_after": z.string().describe("Earliest departure time HH:MM,pattern=^([01]\\d|2[0-3]):[0-5]\\d$").optional(),
    "depart_before": z.string().describe("Latest departure time HH:MM,pattern=^([01]\\d|2[0-3]):[0-5]\\d$").optional(),
    "max_price": z.number().describe("Maximum price in whole currency units,minimum=0").optional(),
    "max_duration": z.number().int().describe("Maximum total flight duration in minutes,minimum=0").optional(),
    "exclude_basic": z.boolean().describe("Exclude basic economy fares (default: false). Server-side filter.").optional(),
    "less_emissions": z.boolean().describe("Only show flights with lower CO2 emissions (default: false)").optional(),
    "carry_on_bags": z.number().int().describe("Require N carry-on bags included in price,minimum=0").optional(),
    "checked_bags": z.number().int().describe("Checked bags pricing hint,minimum=0").optional(),
    "require_checked_bag": z.boolean().describe("Only show flights with ≥1 free checked bag included (default: false). Client-side post-filter on response data.").optional(),
    "currency": z.string().describe("Target currency for prices,pattern=^[A-Z]{3}$").optional(),
    "min_layover_minutes": z.number().int().describe("Only keep flights with a layover of at least N minutes,minimum=0").optional(),
    "layover_at": z.string().describe("Restrict qualifying layovers to these IATA codes (comma-separated, empty = any airport). Post-fetch filter.").optional(),
    "no_early_connection": z.boolean().describe("Drop flights whose post-overnight leg departs before preferences.early_connection_floor (default 10:00).").optional(),
    "lounge_required": z.boolean().describe("Drop flights where a layover airport lacks lounge coverage from user's cards.").optional(),
    "first_result": z.boolean().describe("Return only the first result with a valid price after sorting. Combine with sort_by to get e.g. the shortest priced flight (duration) or cheapest. Default: false.").optional(),
    "provider": z.string().describe("Flight provider (empty/default/google/google_flights/kiwi=default merged search, skiplagged=Skiplagged MCP).").optional()
  }).strict();

export const searchGroundSchema = z.object({
    "from": z.string().describe("Departure city"),
    "to": z.string().describe("Arrival city"),
    "date": z.string().describe("Departure date (YYYY-MM-DD)"),
    "currency": z.string().describe("Price currency,pattern=^[A-Z]{3}$").optional(),
    "type": z.string().describe("Transport type filter,enum=bus,enum=train,enum=ferry,enum=taxi,enum=shuttle").optional(),
    "max_price": z.number().describe("Maximum price,minimum=0").optional(),
    "providers": z.array(z.string()).describe("Provider filters").nullable().optional(),
    "allow_browser_fallbacks": z.boolean().describe("Allow browser booking").optional()
  }).strict();

export const searchHiddenCitySchema = z.object({
    "offers": z.array(z.object({
    "origin": z.string().describe("Origin IATA code"),
    "hub": z.string().describe("Layover airport IATA code"),
    "hub_beyond": z.string().describe("Ticketed final airport IATA code"),
    "carrier": z.string().describe("Airline IATA code").optional(),
    "price": z.number().describe("Ticket price"),
    "currency": z.string().describe("Price currency").optional(),
    "carry_on_only": z.boolean().describe("Whether itinerary is carry-on only").optional(),
    "separate_tickets": z.boolean().describe("Whether itinerary uses separate tickets").optional(),
    "layover_minutes": z.number().int().describe("Layover duration in minutes").optional()
  }).strict()).describe("Priced hidden-city matrix offers").nullable(),
    "allow_hidden_city": z.boolean().describe("Explicit user risk approval").optional(),
    "direct_baseline": z.number().describe("Known direct origin-to-hub price").optional(),
    "depart_date": z.string().describe("Departure date YYYY-MM-DD").optional(),
    "max_layover_risk": z.number().int().describe("Risk score ceiling").optional(),
    "top_k": z.number().int().describe("Maximum candidates").optional()
  }).strict();

export const searchHotelByNameSchema = z.object({
    "name": z.string().describe("Hotel name"),
    "location": z.string().describe("City or location").optional(),
    "check_in": z.string().describe("Check-in date YYYY-MM-DD"),
    "check_out": z.string().describe("Check-out date YYYY-MM-DD"),
    "currency": z.string().describe("Display currency").optional()
  }).strict();

export const searchHotelsSchema = z.object({
    "location": z.string().describe("Location name or address"),
    "check_in": z.string().describe("Check-in date (YYYY-MM-DD)"),
    "check_out": z.string().describe("Check-out date (YYYY-MM-DD)"),
    "guests": z.number().int().describe("Number of guests,minimum=1").optional(),
    "stars": z.number().int().describe("Minimum star rating,minimum=1,maximum=5").optional(),
    "sort": z.string().describe("Sort order,enum=price,enum=rating,enum=distance,enum=stars").optional(),
    "min_price": z.number().describe("Minimum price per night,minimum=0").optional(),
    "max_price": z.number().describe("Maximum price per night,minimum=0").optional(),
    "min_rating": z.number().describe("Minimum guest rating,minimum=0,maximum=10").optional(),
    "max_distance": z.number().describe("Maximum distance from city center in km,minimum=0").optional(),
    "amenities": z.array(z.string()).describe("Required amenities").nullable().optional(),
    "enrich_amenities": z.boolean().describe("Fetch detail pages for top results to get full amenity lists").optional(),
    "free_cancellation": z.boolean().describe("Only show hotels with free cancellation").optional(),
    "property_type": z.string().describe("Property type,enum=hotel,enum=apartment,enum=hostel,enum=resort,enum=bnb,enum=villa").optional(),
    "brand": z.string().describe("Hotel brand or chain filter").optional(),
    "eco_certified": z.boolean().describe("Only show eco-certified hotels").optional(),
    "min_bedrooms": z.number().int().describe("Minimum bedrooms,minimum=0").optional(),
    "min_bathrooms": z.number().int().describe("Minimum bathrooms,minimum=0").optional(),
    "min_beds": z.number().int().describe("Minimum beds,minimum=0").optional(),
    "room_type": z.string().describe("Room type,enum=entire_home,enum=private_room,enum=shared_room,enum=hotel_room").optional(),
    "superhost": z.boolean().describe("Only show Superhost listings").optional(),
    "instant_book": z.boolean().describe("Only show instant-bookable listings").optional(),
    "max_distance_m": z.number().int().describe("Maximum distance from city center in meters,minimum=0").optional(),
    "sustainable": z.boolean().describe("Only show sustainable properties").optional(),
    "meal_plan": z.boolean().describe("Only show properties with breakfast or meals included").optional(),
    "include_sold_out": z.boolean().describe("Include sold-out properties").optional()
  }).strict();

export const searchLoungesSchema = z.object({
    "airport": z.string().describe("Airport IATA code")
  }).strict();

export const searchRestaurantsSchema = z.object({
    "location": z.string().describe("City or neighborhood"),
    "cuisine": z.string().describe("Cuisine filter").optional(),
    "budget": z.string().describe("Budget filter").optional(),
    "limit": z.number().int().describe("Maximum results").optional()
  }).strict();

export const searchRouteSchema = z.object({
    "origin": z.string().describe("Origin city name or IATA code"),
    "destination": z.string().describe("Destination city name or IATA code"),
    "date": z.string().describe("Travel date YYYY-MM-DD"),
    "depart_after": z.string().describe("Earliest departure time").optional(),
    "arrive_by": z.string().describe("Latest arrival time").optional(),
    "max_transfers": z.number().int().describe("Maximum mode changes").optional(),
    "max_price": z.number().describe("Maximum total price").optional(),
    "currency": z.string().describe("Display currency").optional(),
    "prefer": z.string().describe("Preferred transport mode").optional(),
    "avoid": z.string().describe("Avoid transport mode").optional(),
    "sort": z.string().describe("Sort by: price, duration, transfers").optional(),
    "allow_browser_fallbacks": z.boolean().describe("Allow browser fallbacks").optional()
  }).strict();

export const suggestDatesSchema = z.object({
    "origin": z.string().describe("Origin airport IATA code"),
    "destination": z.string().describe("Destination airport IATA code"),
    "target_date": z.string().describe("Target date YYYY-MM-DD"),
    "flex_days": z.number().int().describe("Flexibility +/- days").optional(),
    "round_trip": z.boolean().describe("Round trip").optional(),
    "duration": z.number().int().describe("Trip duration in days").optional()
  }).strict();

export const suggestProvidersSchema = z.object({
    "category": z.string().describe("Provider category filter,enum=hotels,enum=ground,enum=restaurants,enum=reviews").optional()
  }).strict();

export const testProviderSchema = z.object({
    "id": z.string().describe("Provider ID to test"),
    "location": z.string().describe("Test location").optional(),
    "checkin": z.string().describe("Test check-in date (YYYY-MM-DD)").optional(),
    "checkout": z.string().describe("Test check-out date (YYYY-MM-DD)").optional()
  }).strict();

export const testToolWithProgressSchema = z.object({}).strict();

export const travelGuideSchema = z.object({
    "location": z.string().describe("City or location name")
  }).strict();

export const updatePreferencesSchema = z.object({
    "home_airports": z.array(z.string()).describe("Home airport IATA codes").nullable().optional(),
    "display_currency": z.string().describe("Display currency,pattern=^[A-Z]{3}$").optional(),
    "min_hotel_stars": z.number().int().describe("Minimum hotel stars,minimum=1,maximum=5").optional(),
    "min_hotel_rating": z.number().describe("Minimum hotel rating,minimum=0,maximum=10").optional(),
    "no_dormitories": z.boolean().describe("Exclude shared rooms").optional(),
    "carry_on_only": z.boolean().describe("Carry-on only").optional(),
    "notes": z.string().describe("Free-text notes").optional()
  }).strict();

export const updateTripSchema = z.object({
    "trip_id": z.string().describe("Trip ID"),
    "name": z.string().describe("New trip name").optional(),
    "notes": z.string().describe("Trip notes").optional(),
    "status": z.string().describe("Trip status,enum=planning,enum=booked,enum=in_progress,enum=completed,enum=cancelled").optional(),
    "tags": z.array(z.string()).describe("Replace trip tags").nullable().optional(),
    "legs": z.array(z.object({
    "type": z.string().describe("Leg type (flight, train, bus, ferry, hotel, activity)"),
    "from": z.string().describe("Origin city or location"),
    "to": z.string().describe("Destination city or location"),
    "provider": z.string().describe("Provider (airline, hotel, etc.)").optional(),
    "start_time": z.string().describe("ISO datetime (e.g. 2025-06-01T10:00)").optional(),
    "end_time": z.string().describe("ISO datetime").optional(),
    "price": z.number().describe("Leg price,minimum=0").optional(),
    "currency": z.string().describe("Currency code (e.g. USD)").optional(),
    "booking_url": z.string().describe("Booking URL").optional(),
    "confirmed": z.boolean().describe("Whether leg is confirmed/booked").optional(),
    "reference": z.string().describe("Booking reference or PNR").optional()
  }).strict()).describe("Trip legs in chronological order").nullable().optional()
  }).strict();

export const watchOpportunitiesSchema = z.object({
    "favourites": z.array(z.string()).describe("Destination IATA codes").nullable().optional(),
    "window_from": z.string().describe("Window start: YYYY-MM-DD or next_Nd").optional(),
    "window_to": z.string().describe("Window end: YYYY-MM-DD or next_Nd").optional(),
    "min_score": z.number().int().describe("Minimum composite score 0-100").optional(),
    "min_nights": z.number().int().describe("Minimum trip length in nights").optional(),
    "max_nights": z.number().int().describe("Maximum trip length in nights").optional()
  }).strict();

export const watchPriceSchema = z.object({
    "type": z.string().describe("Watch type: flight or hotel"),
    "origin": z.string().describe("Flight origin").optional(),
    "destination": z.string().describe("Flight destination").optional(),
    "location": z.string().describe("Hotel location").optional(),
    "date": z.string().describe("Flight date or hotel check-in").optional(),
    "target_price": z.number().describe("Alert threshold price"),
    "currency": z.string().describe("Currency").optional()
  }).strict();

export const watchRoomAvailabilitySchema = z.object({
    "hotel_name": z.string().describe("Hotel name and optional city"),
    "check_in": z.string().describe("Check-in date (YYYY-MM-DD)"),
    "check_out": z.string().describe("Check-out date (YYYY-MM-DD)"),
    "keywords": z.array(z.string()).describe("Room keywords that must all match").nullable(),
    "below": z.number().describe("Alert only below this price,minimum=0").optional(),
    "currency": z.string().describe("Currency code,pattern=^[A-Z]{3}$").optional()
  }).strict();

export const weekendGetawaySchema = z.object({
    "origin": z.string().describe("Departure airport IATA code"),
    "departure_date": z.string().describe("Departure date (YYYY-MM-DD)"),
    "return_date": z.string().describe("Return date (YYYY-MM-DD)"),
    "max_budget": z.number().describe("Maximum total budget in USD").optional()
  }).strict();
