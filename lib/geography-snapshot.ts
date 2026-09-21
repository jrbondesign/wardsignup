/**
 * City-level snapshot of product users (event creators + signup participants).
 * Used when POSTHOG_PERSONAL_API_KEY is unset (e.g. Vercel preview) so the
 * homepage map still renders. Prefer live PostHog when the key is present.
 *
 * One person → one city (most recent GeoIP). Datacenter cities filtered out.
 * Sourced from PostHog project 370646, last 90 days.
 */
export interface GeographyCity {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  userCount: number;
}

export const GEOGRAPHY_SNAPSHOT_GENERATED_AT = "2026-09-08T06:10:00.000Z";

export const GEOGRAPHY_SNAPSHOT: GeographyCity[] = [
  { city: "Phoenix", country: "US", latitude: 33.4985, longitude: -112.089, userCount: 11 },
  { city: "Salt Lake City", country: "US", latitude: 40.7109, longitude: -111.9116, userCount: 9 },
  { city: "Lehi", country: "US", latitude: 40.399, longitude: -111.8758, userCount: 6 },
  { city: "Queen Creek", country: "US", latitude: 33.2487, longitude: -111.6343, userCount: 5 },
  { city: "Mesa", country: "US", latitude: 33.4027, longitude: -111.7623, userCount: 5 },
  { city: "American Fork", country: "US", latitude: 40.3769, longitude: -111.7958, userCount: 3 },
  { city: "Chandler", country: "US", latitude: 33.2727, longitude: -111.8278, userCount: 2 },
  { city: "San Tan Valley", country: "US", latitude: 33.1922, longitude: -111.5318, userCount: 2 },
  { city: "Rexburg", country: "US", latitude: 43.8125, longitude: -111.7855, userCount: 2 },
  { city: "Las Vegas", country: "US", latitude: 36.1214, longitude: -115.141, userCount: 2 },
  { city: "Florence", country: "US", latitude: 33.0314, longitude: -111.3873, userCount: 2 },
  { city: "West Valley City", country: "US", latitude: 40.6981, longitude: -111.9999, userCount: 2 },
  { city: "Dallas", country: "US", latitude: 32.8461, longitude: -96.7622, userCount: 2 },
  { city: "Liberty Hill", country: "US", latitude: 30.6622, longitude: -97.931, userCount: 1 },
  { city: "Los Angeles", country: "US", latitude: 34.0544, longitude: -118.244, userCount: 1 },
  { city: "Bentonville", country: "US", latitude: 36.3529, longitude: -94.2194, userCount: 1 },
  { city: "Houston", country: "US", latitude: 29.6254, longitude: -95.375, userCount: 1 },
  { city: "Rogers", country: "US", latitude: 36.3174, longitude: -94.1548, userCount: 1 },
  { city: "Eagle Mountain", country: "US", latitude: 40.3141, longitude: -112.0069, userCount: 1 },
  { city: "Sugar Land", country: "US", latitude: 29.6361, longitude: -95.6485, userCount: 1 },
  { city: "Park City", country: "US", latitude: 40.7038, longitude: -111.5437, userCount: 1 },
  { city: "Midvale", country: "US", latitude: 40.6118, longitude: -111.9008, userCount: 1 },
  { city: "South Jordan", country: "US", latitude: 40.5582, longitude: -111.9222, userCount: 1 },
  { city: "Tolleson", country: "US", latitude: 33.45, longitude: -112.2593, userCount: 1 },
  { city: "Fayetteville", country: "US", latitude: 36.0557, longitude: -94.1567, userCount: 1 },
  { city: "Portland", country: "US", latitude: 45.4804, longitude: -122.5891, userCount: 1 },
  { city: "Centerton", country: "US", latitude: 36.3598, longitude: -94.2852, userCount: 1 },
  { city: "Boise", country: "US", latitude: 43.6165, longitude: -116.2001, userCount: 1 },
  { city: "Nampa", country: "US", latitude: 43.5441, longitude: -116.5662, userCount: 1 },
];

/** Known cloud / CDN GeoIP cities that inflate pin counts. */
export const GEOGRAPHY_DATACENTER_CITIES = new Set([
  "Boydton",
  "Ashburn",
  "Council Bluffs",
  "Boardman",
  "Des Moines",
  "The Dalles",
  "Reston",
  "Herndon",
  "Secaucus",
  "Slough",
]);

export const GEOGRAPHY_HOGQL = `
SELECT
  city,
  country,
  avg(latitude) AS latitude,
  avg(longitude) AS longitude,
  count() AS user_count
FROM (
  SELECT
    person_id,
    argMax(properties.$geoip_city_name, timestamp) AS city,
    argMax(properties.$geoip_country_code, timestamp) AS country,
    argMax(toFloat(properties.$geoip_latitude), timestamp) AS latitude,
    argMax(toFloat(properties.$geoip_longitude), timestamp) AS longitude
  FROM events
  WHERE timestamp >= now() - INTERVAL 90 DAY
    AND event IN (
      'event_created',
      'signup_completed',
      'item_signup_completed',
      'signup_created',
      'item_signup_created'
    )
    AND properties.$geoip_city_name IS NOT NULL
    AND properties.$geoip_city_name != ''
    AND properties.$geoip_latitude IS NOT NULL
    AND properties.$geoip_longitude IS NOT NULL
  GROUP BY person_id
)
WHERE city NOT IN (
  'Boydton', 'Ashburn', 'Council Bluffs', 'Boardman',
  'Des Moines', 'The Dalles', 'Reston', 'Herndon', 'Secaucus', 'Slough'
)
GROUP BY city, country
ORDER BY user_count DESC
LIMIT 200
`;

export function toGeographyResponse(
  cities: GeographyCity[],
  source: "live" | "snapshot" | "cache",
) {
  const filtered = cities.filter(
    (c) =>
      c.city &&
      !GEOGRAPHY_DATACENTER_CITIES.has(c.city) &&
      Number.isFinite(c.latitude) &&
      Number.isFinite(c.longitude) &&
      c.latitude !== 0 &&
      c.longitude !== 0 &&
      c.userCount > 0,
  );
  return {
    cities: filtered,
    totalCities: filtered.length,
    totalUsers: filtered.reduce((sum, c) => sum + c.userCount, 0),
    source,
    generatedAt:
      source === "snapshot"
        ? GEOGRAPHY_SNAPSHOT_GENERATED_AT
        : new Date().toISOString(),
  };
}
