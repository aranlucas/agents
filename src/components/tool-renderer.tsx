"use client";

import { AddBookingToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/add_booking";
import { AssessTripToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/assess_trip";
import { BuildProfileToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/build_profile";
import { CalculatePointsValueToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/calculate_points_value";
import { CalculateTripCostToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/calculate_trip_cost";
import { CheckVisaToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/check_visa";
import { ConfigureProviderToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/configure_provider";
import { CreateTripToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/create_trip";
import { DestinationInfoToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/destination_info";
import { DetectAccommodationHacksToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/detect_accommodation_hacks";
import { DetectTravelHacksToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/detect_travel_hacks";
import { ExploreDestinationsToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/explore_destinations";
import { ExportIcsToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/export_ics";
import { FindInteractiveToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/find_interactive";
import { FindTripWindowToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/find_trip_window";
import { GetBaggageRulesToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/get_baggage_rules";
import { GetPreferencesToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/get_preferences";
import { GetTripToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/get_trip";
import { GetWeatherToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/get_weather";
import { HotelPricesToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/hotel_prices";
import { HotelReviewsToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/hotel_reviews";
import { HotelRoomsToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/hotel_rooms";
import { InterviewTripToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/interview_trip";
import { ListOpportunityWatchesToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/list_opportunity_watches";
import { ListProvidersToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/list_providers";
import { ListTripsToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/list_trips";
import { LocalEventsToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/local_events";
import { MarkTripBookedToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/mark_trip_booked";
import { NearbyPlacesToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/nearby_places";
import { OnboardProfileToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/onboard_profile";
import { OptimizeBookingToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/optimize_booking";
import { OptimizeMultiCityToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/optimize_multi_city";
import { OptimizeTripDatesToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/optimize_trip_dates";
import { PlanFlightBundleToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/plan_flight_bundle";
import { PlanTripToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/plan_trip";
import { ProviderHealthToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/provider_health";
import { RemoveProviderToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/remove_provider";
import { SearchAirportTransfersToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/search_airport_transfers";
import { SearchAwardsToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/search_awards";
import { SearchDatesToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/search_dates";
import { SearchDealsToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/search_deals";
import { SearchFlightsToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/search_flights";
import { SearchGroundToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/search_ground";
import { SearchHiddenCityToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/search_hidden_city";
import { SearchHotelByNameToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/search_hotel_by_name";
import { SearchHotelsToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/search_hotels";
import { SearchLoungesToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/search_lounges";
import { SearchRestaurantsToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/search_restaurants";
import { SearchRouteToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/search_route";
import { SuggestDatesToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/suggest_dates";
import { SuggestProvidersToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/suggest_providers";
import { TestProviderToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/test_provider";
import { TestToolWithProgressToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/test_tool_with_progress";
import { TravelGuideToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/travel_guide";
import { UpdatePreferencesToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/update_preferences";
import { UpdateTripToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/update_trip";
import { WatchOpportunitiesToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/watch_opportunities";
import { WatchPriceToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/watch_price";
import { WatchRoomAvailabilityToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/watch_room_availability";
import { WeekendGetawayToolRenderRegistration } from "./mcp-tool-call/generated-tool-renderers/weekend_getaway";

export function ToolRenderer() {
  return (
    <>
      <AddBookingToolRenderRegistration />
      <AssessTripToolRenderRegistration />
      <BuildProfileToolRenderRegistration />
      <CalculatePointsValueToolRenderRegistration />
      <CalculateTripCostToolRenderRegistration />
      <CheckVisaToolRenderRegistration />
      <ConfigureProviderToolRenderRegistration />
      <CreateTripToolRenderRegistration />
      <DestinationInfoToolRenderRegistration />
      <DetectAccommodationHacksToolRenderRegistration />
      <DetectTravelHacksToolRenderRegistration />
      <ExploreDestinationsToolRenderRegistration />
      <ExportIcsToolRenderRegistration />
      <FindInteractiveToolRenderRegistration />
      <FindTripWindowToolRenderRegistration />
      <GetBaggageRulesToolRenderRegistration />
      <GetPreferencesToolRenderRegistration />
      <GetTripToolRenderRegistration />
      <GetWeatherToolRenderRegistration />
      <HotelPricesToolRenderRegistration />
      <HotelReviewsToolRenderRegistration />
      <HotelRoomsToolRenderRegistration />
      <InterviewTripToolRenderRegistration />
      <ListOpportunityWatchesToolRenderRegistration />
      <ListProvidersToolRenderRegistration />
      <ListTripsToolRenderRegistration />
      <LocalEventsToolRenderRegistration />
      <MarkTripBookedToolRenderRegistration />
      <NearbyPlacesToolRenderRegistration />
      <OnboardProfileToolRenderRegistration />
      <OptimizeBookingToolRenderRegistration />
      <OptimizeMultiCityToolRenderRegistration />
      <OptimizeTripDatesToolRenderRegistration />
      <PlanFlightBundleToolRenderRegistration />
      <PlanTripToolRenderRegistration />
      <ProviderHealthToolRenderRegistration />
      <RemoveProviderToolRenderRegistration />
      <SearchAirportTransfersToolRenderRegistration />
      <SearchAwardsToolRenderRegistration />
      <SearchDatesToolRenderRegistration />
      <SearchDealsToolRenderRegistration />
      <SearchFlightsToolRenderRegistration />
      <SearchGroundToolRenderRegistration />
      <SearchHiddenCityToolRenderRegistration />
      <SearchHotelByNameToolRenderRegistration />
      <SearchHotelsToolRenderRegistration />
      <SearchLoungesToolRenderRegistration />
      <SearchRestaurantsToolRenderRegistration />
      <SearchRouteToolRenderRegistration />
      <SuggestDatesToolRenderRegistration />
      <SuggestProvidersToolRenderRegistration />
      <TestProviderToolRenderRegistration />
      <TestToolWithProgressToolRenderRegistration />
      <TravelGuideToolRenderRegistration />
      <UpdatePreferencesToolRenderRegistration />
      <UpdateTripToolRenderRegistration />
      <WatchOpportunitiesToolRenderRegistration />
      <WatchPriceToolRenderRegistration />
      <WatchRoomAvailabilityToolRenderRegistration />
      <WeekendGetawayToolRenderRegistration />
    </>
  );
}
