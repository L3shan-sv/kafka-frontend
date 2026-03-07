export const API_BASE = "http://localhost:8001";

export const LOCATIONS = [
  { address: "Times Square, NY",        lat: 40.7580,  lng: -73.9855 },
  { address: "JFK Airport, NY",         lat: 40.6413,  lng: -73.7781 },
  { address: "Central Park, NY",        lat: 40.7851,  lng: -73.9683 },
  { address: "Brooklyn Bridge, NY",     lat: 40.7061,  lng: -73.9969 },
  { address: "Grand Central, NY",       lat: 40.7527,  lng: -73.9772 },
  { address: "LaGuardia Airport, NY",   lat: 40.7769,  lng: -73.8740 },
  { address: "Wall Street, NY",         lat: 40.7074,  lng: -74.0113 },
  { address: "Columbia University, NY", lat: 40.8075,  lng: -73.9626 },
];

export const RIDE_TYPES = [
  { id: "standard", label: "UberX",      sub: "Affordable, everyday" },
  { id: "premium",  label: "Uber Black",  sub: "Premium comfort" },
  { id: "xl",       label: "Uber XL",     sub: "Up to 6 people" },
];

export const CANCEL_REASONS = [
  { id: "changed_plans",     label: "Changed my plans" },
  { id: "driver_too_far",    label: "Driver is too far" },
  { id: "found_alternative", label: "Found another ride" },
  { id: "wrong_pickup",      label: "Wrong pickup location" },
];

export const RIDER_IDS = Array.from({ length: 12 }, (_, i) => `user_${i + 1}`);

export const RIDE_STATE_META = {
  idle:       { label: "Ready",          color: "#444" },
  requesting: { label: "Connecting…",    color: "#f5a623" },
  requested:  { label: "Finding driver", color: "#276ef1" },
  matched:    { label: "Driver found",   color: "#06c167" },
  accepted:   { label: "On the way",     color: "#06c167" },
  started:    { label: "In progress",    color: "#06c167" },
  completed:  { label: "Completed",      color: "#06c167" },
  cancelled:  { label: "Cancelled",      color: "#e74c3c" },
  failed:     { label: "Failed",         color: "#e74c3c" },
};