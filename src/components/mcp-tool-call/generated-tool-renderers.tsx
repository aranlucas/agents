"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import McpToolCall from "../mcp-tool-call";
import { AssessTripToolCall } from "../tool-calls/assess-trip";
import { CheckVisaToolCall } from "../tool-calls/check-visa";
import { ExploreDestinationsToolCall } from "../tool-calls/explore-destinations";
import { HotelPricesToolCall } from "../tool-calls/hotel-prices";
import { HotelRoomsToolCall } from "../tool-calls/hotel-rooms";
import { LocalEventsToolCall } from "../tool-calls/local-events";
import { PlanFlightBundleToolCall } from "../tool-calls/plan-flight-bundle";
import { PlanTripToolCall } from "../tool-calls/plan-trip";
import { SearchAirportTransfersToolCall } from "../tool-calls/search-airport-transfers";
import { SearchAwardsToolCall } from "../tool-calls/search-awards";
import { SearchDealsToolCall } from "../tool-calls/search-deals";
import { SearchFlightsToolCall } from "../tool-calls/search-flights";
import { SearchGroundToolCall } from "../tool-calls/search-ground";
import { SearchHotelByNameToolCall } from "../tool-calls/search-hotel-by-name";
import { SearchHotelsToolCall } from "../tool-calls/search-hotels";
import { SearchRestaurantsToolCall } from "../tool-calls/search-restaurants";
import { SearchRouteToolCall } from "../tool-calls/search-route";
import { WeekendGetawayToolCall } from "../tool-calls/weekend-getaway";
import {
  addBookingSchema,
  assessTripSchema,
  buildProfileSchema,
  calculatePointsValueSchema,
  calculateTripCostSchema,
  checkVisaSchema,
  configureProviderSchema,
  createTripSchema,
  destinationInfoSchema,
  detectAccommodationHacksSchema,
  detectTravelHacksSchema,
  exploreDestinationsSchema,
  exportIcsSchema,
  findInteractiveSchema,
  findTripWindowSchema,
  getBaggageRulesSchema,
  getPreferencesSchema,
  getTripSchema,
  getWeatherSchema,
  hotelPricesSchema,
  hotelReviewsSchema,
  hotelRoomsSchema,
  interviewTripSchema,
  listOpportunityWatchesSchema,
  listProvidersSchema,
  listTripsSchema,
  localEventsSchema,
  markTripBookedSchema,
  nearbyPlacesSchema,
  onboardProfileSchema,
  optimizeBookingSchema,
  optimizeMultiCitySchema,
  optimizeTripDatesSchema,
  planFlightBundleSchema,
  planTripSchema,
  providerHealthSchema,
  removeProviderSchema,
  searchAirportTransfersSchema,
  searchAwardsSchema,
  searchDatesSchema,
  searchDealsSchema,
  searchFlightsSchema,
  searchGroundSchema,
  searchHiddenCitySchema,
  searchHotelByNameSchema,
  searchHotelsSchema,
  searchLoungesSchema,
  searchRestaurantsSchema,
  searchRouteSchema,
  suggestDatesSchema,
  suggestProvidersSchema,
  testProviderSchema,
  testToolWithProgressSchema,
  travelGuideSchema,
  updatePreferencesSchema,
  updateTripSchema,
  watchOpportunitiesSchema,
  watchPriceSchema,
  watchRoomAvailabilitySchema,
  weekendGetawaySchema,
} from "./generated-tool-schemas";

export function TrvlToolRenderRegistrations() {
  useRenderTool({
    name: "add_booking",
    parameters: addBookingSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="add_booking" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "assess_trip",
    parameters: assessTripSchema,
    render: ({ status, parameters, result }) => (
      <AssessTripToolCall status={status} name="assess_trip" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "build_profile",
    parameters: buildProfileSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="build_profile" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "calculate_points_value",
    parameters: calculatePointsValueSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="calculate_points_value" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "calculate_trip_cost",
    parameters: calculateTripCostSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="calculate_trip_cost" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "check_visa",
    parameters: checkVisaSchema,
    render: ({ status, parameters, result }) => (
      <CheckVisaToolCall status={status} name="check_visa" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "configure_provider",
    parameters: configureProviderSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="configure_provider" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "create_trip",
    parameters: createTripSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="create_trip" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "destination_info",
    parameters: destinationInfoSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="destination_info" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "detect_accommodation_hacks",
    parameters: detectAccommodationHacksSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="detect_accommodation_hacks" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "detect_travel_hacks",
    parameters: detectTravelHacksSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="detect_travel_hacks" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "explore_destinations",
    parameters: exploreDestinationsSchema,
    render: ({ status, parameters, result }) => (
      <ExploreDestinationsToolCall status={status} name="explore_destinations" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "export_ics",
    parameters: exportIcsSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="export_ics" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "find_interactive",
    parameters: findInteractiveSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="find_interactive" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "find_trip_window",
    parameters: findTripWindowSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="find_trip_window" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "get_baggage_rules",
    parameters: getBaggageRulesSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="get_baggage_rules" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "get_preferences",
    parameters: getPreferencesSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="get_preferences" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "get_trip",
    parameters: getTripSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="get_trip" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "get_weather",
    parameters: getWeatherSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="get_weather" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "hotel_prices",
    parameters: hotelPricesSchema,
    render: ({ status, parameters, result }) => (
      <HotelPricesToolCall status={status} name="hotel_prices" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "hotel_reviews",
    parameters: hotelReviewsSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="hotel_reviews" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "hotel_rooms",
    parameters: hotelRoomsSchema,
    render: ({ status, parameters, result }) => (
      <HotelRoomsToolCall status={status} name="hotel_rooms" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "interview_trip",
    parameters: interviewTripSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="interview_trip" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "list_opportunity_watches",
    parameters: listOpportunityWatchesSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="list_opportunity_watches" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "list_providers",
    parameters: listProvidersSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="list_providers" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "list_trips",
    parameters: listTripsSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="list_trips" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "local_events",
    parameters: localEventsSchema,
    render: ({ status, parameters, result }) => (
      <LocalEventsToolCall status={status} name="local_events" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "mark_trip_booked",
    parameters: markTripBookedSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="mark_trip_booked" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "nearby_places",
    parameters: nearbyPlacesSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="nearby_places" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "onboard_profile",
    parameters: onboardProfileSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="onboard_profile" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "optimize_booking",
    parameters: optimizeBookingSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="optimize_booking" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "optimize_multi_city",
    parameters: optimizeMultiCitySchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="optimize_multi_city" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "optimize_trip_dates",
    parameters: optimizeTripDatesSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="optimize_trip_dates" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "plan_flight_bundle",
    parameters: planFlightBundleSchema,
    render: ({ status, parameters, result }) => (
      <PlanFlightBundleToolCall status={status} name="plan_flight_bundle" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "plan_trip",
    parameters: planTripSchema,
    render: ({ status, parameters, result }) => (
      <PlanTripToolCall status={status} name="plan_trip" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "provider_health",
    parameters: providerHealthSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="provider_health" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "remove_provider",
    parameters: removeProviderSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="remove_provider" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "search_airport_transfers",
    parameters: searchAirportTransfersSchema,
    render: ({ status, parameters, result }) => (
      <SearchAirportTransfersToolCall status={status} name="search_airport_transfers" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "search_awards",
    parameters: searchAwardsSchema,
    render: ({ status, parameters, result }) => (
      <SearchAwardsToolCall status={status} name="search_awards" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "search_dates",
    parameters: searchDatesSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="search_dates" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "search_deals",
    parameters: searchDealsSchema,
    render: ({ status, parameters, result }) => (
      <SearchDealsToolCall status={status} name="search_deals" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "search_flights",
    parameters: searchFlightsSchema,
    render: ({ status, parameters, result }) => (
      <SearchFlightsToolCall status={status} name="search_flights" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "search_ground",
    parameters: searchGroundSchema,
    render: ({ status, parameters, result }) => (
      <SearchGroundToolCall status={status} name="search_ground" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "search_hidden_city",
    parameters: searchHiddenCitySchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="search_hidden_city" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "search_hotel_by_name",
    parameters: searchHotelByNameSchema,
    render: ({ status, parameters, result }) => (
      <SearchHotelByNameToolCall status={status} name="search_hotel_by_name" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "search_hotels",
    parameters: searchHotelsSchema,
    render: ({ status, parameters, result }) => (
      <SearchHotelsToolCall status={status} name="search_hotels" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "search_lounges",
    parameters: searchLoungesSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="search_lounges" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "search_restaurants",
    parameters: searchRestaurantsSchema,
    render: ({ status, parameters, result }) => (
      <SearchRestaurantsToolCall status={status} name="search_restaurants" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "search_route",
    parameters: searchRouteSchema,
    render: ({ status, parameters, result }) => (
      <SearchRouteToolCall status={status} name="search_route" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "suggest_dates",
    parameters: suggestDatesSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="suggest_dates" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "suggest_providers",
    parameters: suggestProvidersSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="suggest_providers" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "test_provider",
    parameters: testProviderSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="test_provider" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "test_tool_with_progress",
    parameters: testToolWithProgressSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="test_tool_with_progress" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "travel_guide",
    parameters: travelGuideSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="travel_guide" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "update_preferences",
    parameters: updatePreferencesSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="update_preferences" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "update_trip",
    parameters: updateTripSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="update_trip" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "watch_opportunities",
    parameters: watchOpportunitiesSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="watch_opportunities" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "watch_price",
    parameters: watchPriceSchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="watch_price" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "watch_room_availability",
    parameters: watchRoomAvailabilitySchema,
    render: ({ status, parameters, result }) => (
      <McpToolCall status={status} name="watch_room_availability" args={parameters} result={result} />
    ),
  }, []);

  useRenderTool({
    name: "weekend_getaway",
    parameters: weekendGetawaySchema,
    render: ({ status, parameters, result }) => (
      <WeekendGetawayToolCall status={status} name="weekend_getaway" args={parameters} result={result} />
    ),
  }, []);

  return null;
}
