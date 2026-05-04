import type { ToolMeta } from "./types";
import { humanizeToolName } from "./format";

export const TOOL_META: Record<string, ToolMeta> = {
  get_preferences: { label: "Load traveler profile", category: "Profile", tone: "slate" },
  update_preferences: { label: "Update traveler profile", category: "Profile", tone: "slate" },
  build_profile: { label: "Build inferred profile", category: "Profile", tone: "slate" },
  add_booking: { label: "Add booking history", category: "Profile", tone: "slate" },
  onboard_profile: { label: "Profile onboarding", category: "Profile", tone: "slate" },
  interview_trip: { label: "Trip interview", category: "Profile", tone: "slate" },

  explore_destinations: { label: "Explore destinations", category: "Discovery", tone: "green" },
  weekend_getaway: { label: "Find weekend getaways", category: "Discovery", tone: "green" },
  suggest_dates: { label: "Suggest cheaper dates", category: "Discovery", tone: "green" },
  search_dates: { label: "Search date prices", category: "Discovery", tone: "green" },
  search_deals: { label: "Search travel deals", category: "Discovery", tone: "green" },
  destination_info: { label: "Check destination context", category: "Discovery", tone: "green" },
  travel_guide: { label: "Open travel guide", category: "Discovery", tone: "green" },
  get_weather: { label: "Check weather", category: "Discovery", tone: "green" },
  local_events: { label: "Find local events", category: "Discovery", tone: "green" },
  nearby_places: { label: "Find nearby places", category: "Discovery", tone: "green" },
  plan_trip: { label: "Plan trip package", category: "Discovery", tone: "green" },

  search_flights: { label: "Search flights", category: "Transport", tone: "sky" },
  plan_flight_bundle: { label: "Rank flight bundles", category: "Transport", tone: "sky" },
  find_interactive: { label: "Interactive flight search", category: "Transport", tone: "sky" },
  search_route: { label: "Search routes", category: "Transport", tone: "sky" },
  search_ground: { label: "Search ground transport", category: "Transport", tone: "sky" },
  search_airport_transfers: { label: "Search airport transfers", category: "Transport", tone: "sky" },
  get_baggage_rules: { label: "Check baggage rules", category: "Transport", tone: "sky" },
  search_lounges: { label: "Search airport lounges", category: "Transport", tone: "sky" },
  search_hidden_city: { label: "Analyze hidden-city fares", category: "Transport", tone: "sky" },
  search_awards: { label: "Search award sweet spots", category: "Transport", tone: "sky" },

  search_hotels: { label: "Search hotels", category: "Lodging", tone: "violet" },
  search_hotel_by_name: { label: "Find hotel by name", category: "Lodging", tone: "violet" },
  hotel_rooms: { label: "Check hotel rooms", category: "Lodging", tone: "violet" },
  hotel_prices: { label: "Compare hotel prices", category: "Lodging", tone: "violet" },
  hotel_reviews: { label: "Read hotel reviews", category: "Lodging", tone: "violet" },
  detect_accommodation_hacks: { label: "Find lodging hacks", category: "Lodging", tone: "violet" },
  watch_room_availability: { label: "Watch room availability", category: "Lodging", tone: "violet" },

  assess_trip: { label: "Assess trip viability", category: "Viability", tone: "amber" },
  calculate_trip_cost: { label: "Calculate trip cost", category: "Viability", tone: "amber" },
  check_visa: { label: "Check visa rules", category: "Viability", tone: "amber" },
  calculate_points_value: { label: "Value points redemption", category: "Viability", tone: "amber" },
  detect_travel_hacks: { label: "Find travel hacks", category: "Viability", tone: "amber" },
  optimize_booking: { label: "Optimize booking", category: "Viability", tone: "amber" },
  optimize_trip_dates: { label: "Optimize trip dates", category: "Viability", tone: "amber" },
  find_trip_window: { label: "Find trip window", category: "Viability", tone: "amber" },
  optimize_multi_city: { label: "Optimize multi-city route", category: "Viability", tone: "amber" },
  search_restaurants: { label: "Search restaurants", category: "Viability", tone: "amber" },

  create_trip: { label: "Create saved trip", category: "Itinerary", tone: "rose" },
  list_trips: { label: "List saved trips", category: "Itinerary", tone: "rose" },
  get_trip: { label: "Load saved trip", category: "Itinerary", tone: "rose" },
  update_trip: { label: "Update saved trip", category: "Itinerary", tone: "rose" },
  mark_trip_booked: { label: "Mark trip booked", category: "Itinerary", tone: "rose" },
  export_ics: { label: "Export calendar", category: "Itinerary", tone: "rose" },
  watch_price: { label: "Create price watch", category: "Itinerary", tone: "rose" },
  watch_opportunities: { label: "Watch opportunities", category: "Itinerary", tone: "rose" },
  list_opportunity_watches: { label: "List opportunity watches", category: "Itinerary", tone: "rose" },

  suggest_providers: { label: "Suggest providers", category: "Provider Admin", tone: "slate" },
  list_providers: { label: "List providers", category: "Provider Admin", tone: "slate" },
  configure_provider: { label: "Configure provider", category: "Provider Admin", tone: "slate" },
  test_provider: { label: "Test provider", category: "Provider Admin", tone: "slate" },
  provider_health: { label: "Check provider health", category: "Provider Admin", tone: "slate" },
  remove_provider: { label: "Remove provider", category: "Provider Admin", tone: "slate" },

  test_tool_with_progress: { label: "Test progress events", category: "Diagnostics", tone: "slate" },
};

export const TONE_CLASSES: Record<ToolMeta["tone"], string> = {
  sky: "border-sky-200 bg-sky-50 text-sky-700",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
  slate: "border-slate-200 bg-slate-50 text-slate-600",
};

export const TRVL_TOOL_NAMES = Object.keys(TOOL_META);

export function getToolMeta(name: string): ToolMeta {
  return (
    TOOL_META[name] ?? {
      label: humanizeToolName(name || "MCP tool call"),
      category: "TRVL MCP",
      tone: "slate",
    }
  );
}
