/**
 * City-level snapshot of product users (event creators + signup participants).
 * Last-resort fallback when geography_snapshot_cache cannot be read (timeout
 * or error) and this server instance has no in-memory last-good payload.
 * Display routes never call PostHog; source is "snapshot" so this is not the
 * live cache row.
 *
 * One person → one city (most recent GeoIP). Datacenter cities filtered out.
 * Copied from the geography_snapshot_cache row (PostHog project 370646, last
 * 90 days) at GEOGRAPHY_SNAPSHOT_GENERATED_AT.
 */
export interface GeographyCity {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  userCount: number;
}

export const GEOGRAPHY_SNAPSHOT_GENERATED_AT = "2026-11-13T15:01:03.324Z";

export const GEOGRAPHY_SNAPSHOT: GeographyCity[] = [
  { city: "Salt Lake City", country: "US", latitude: 40.69039555555558, longitude: -111.9362255555555, userCount: 90 },
  { city: "Phoenix", country: "US", latitude: 33.49290508474575, longitude: -112.09903559322035, userCount: 59 },
  { city: "Eagle Mountain", country: "US", latitude: 40.31410000000003, longitude: -112.00689999999996, userCount: 33 },
  { city: "Houston", country: "US", latitude: 29.77801428571429, longitude: -95.45841785714286, userCount: 28 },
  { city: "Dallas", country: "US", latitude: 32.80447058823529, longitude: -96.82668823529411, userCount: 17 },
  { city: "Tooele", country: "US", latitude: 40.5308, longitude: -112.29829999999998, userCount: 17 },
  { city: "Herriman", country: "US", latitude: 40.51530000000001, longitude: -112.03160000000001, userCount: 16 },
  { city: "Los Angeles", country: "US", latitude: 34.02395, longitude: -118.26791249999998, userCount: 16 },
  { city: "Mesa", country: "US", latitude: 33.392379999999996, longitude: -111.84161999999999, userCount: 15 },
  { city: "Syracuse", country: "US", latitude: 41.0883, longitude: -112.05860000000001, userCount: 15 },
  { city: "Lehi", country: "US", latitude: 40.396257142857145, longitude: -111.86008571428572, userCount: 14 },
  { city: "San Diego", country: "US", latitude: 32.71725, longitude: -117.08195, userCount: 14 },
  { city: "Boise", country: "US", latitude: 43.61649999999999, longitude: -116.2001, userCount: 14 },
  { city: "Peoria", country: "US", latitude: 33.60724615384616, longitude: -112.23349230769233, userCount: 13 },
  { city: "West Valley City", country: "US", latitude: 40.698100000000004, longitude: -111.99990000000001, userCount: 13 },
  { city: "Rexburg", country: "US", latitude: 43.8125, longitude: -111.78549999999997, userCount: 12 },
  { city: "Chandler", country: "US", latitude: 33.20630833333333, longitude: -110.47260000000001, userCount: 12 },
  { city: "Ogden", country: "US", latitude: 41.21563, longitude: -111.9641, userCount: 10 },
  { city: "Las Vegas", country: "US", latitude: 36.13237, longitude: -115.13694000000001, userCount: 10 },
  { city: "Sandy", country: "US", latitude: 40.57692, longitude: -111.84851, userCount: 10 },
  { city: "Valencia", country: "US", latitude: 34.440877777777786, longitude: -118.53795555555558, userCount: 9 },
  { city: "Clearfield", country: "US", latitude: 41.13150000000001, longitude: -112.04690000000002, userCount: 9 },
  { city: "San Antonio", country: "US", latitude: 29.44984444444444, longitude: -98.51921111111112, userCount: 9 },
  { city: "Fort Worth", country: "US", latitude: 32.765074999999996, longitude: -97.31621250000002, userCount: 8 },
  { city: "Spring Hill", country: "US", latitude: 35.75119999999999, longitude: -86.93, userCount: 8 },
  { city: "Glendale", country: "US", latitude: 33.567687500000005, longitude: -112.1802, userCount: 8 },
  { city: "Idaho Falls", country: "US", latitude: 43.5473875, longitude: -111.913075, userCount: 8 },
  { city: "Draper", country: "US", latitude: 40.5247, longitude: -111.86379999999998, userCount: 8 },
  { city: "Denver", country: "US", latitude: 39.725500000000004, longitude: -104.95412857142856, userCount: 7 },
  { city: "Chicago", country: "US", latitude: 41.849628571428575, longitude: -87.67550000000001, userCount: 7 },
  { city: "Nixa", country: "US", latitude: 37.0504, longitude: -93.3002, userCount: 7 },
  { city: "Sacramento", country: "US", latitude: 38.642133333333334, longitude: -121.42505000000001, userCount: 6 },
  { city: "Everett", country: "US", latitude: 42.415, longitude: -71.0527, userCount: 6 },
  { city: "Orem", country: "US", latitude: 40.307483333333344, longitude: -111.69126666666666, userCount: 6 },
  { city: "Scottsdale", country: "US", latitude: 33.55318333333333, longitude: -111.87433333333333, userCount: 6 },
  { city: "American Fork", country: "US", latitude: 40.3769, longitude: -111.7958, userCount: 6 },
  { city: "Nashville", country: "US", latitude: 36.10396666666667, longitude: -86.79841666666665, userCount: 6 },
  { city: "St Louis", country: "US", latitude: 38.65286666666666, longitude: -90.25931666666666, userCount: 6 },
  { city: "Florence", country: "US", latitude: 33.0314, longitude: -111.3873, userCount: 6 },
  { city: "Queen Creek", country: "US", latitude: 33.24869999999999, longitude: -111.63429999999998, userCount: 6 },
  { city: "Santa Clarita", country: "US", latitude: 34.4313, longitude: -118.51386, userCount: 5 },
  { city: "Friendswood", country: "US", latitude: 29.5209, longitude: -95.1922, userCount: 5 },
  { city: "Carlsbad", country: "US", latitude: 33.12504, longitude: -117.30036, userCount: 5 },
  { city: "Orlando", country: "US", latitude: 28.504700000000003, longitude: -81.39876, userCount: 5 },
  { city: "Leesville", country: "US", latitude: 33.9165, longitude: -81.5134, userCount: 5 },
  { city: "Modesto", country: "US", latitude: 37.675259999999994, longitude: -120.95855999999999, userCount: 5 },
  { city: "Columbia", country: "US", latitude: 35.6174, longitude: -87.0318, userCount: 5 },
  { city: "Layton", country: "US", latitude: 41.0854, longitude: -111.9682, userCount: 4 },
  { city: "Kansas City", country: "US", latitude: 39.10315, longitude: -94.5564, userCount: 4 },
  { city: "Melbourne", country: "US", latitude: 28.098125, longitude: -80.6631, userCount: 4 },
  { city: "Oceanside", country: "US", latitude: 33.206325, longitude: -117.31552500000001, userCount: 4 },
  { city: "Newton", country: "US", latitude: 41.8698, longitude: -111.9948, userCount: 4 },
  { city: "Pendleton", country: "US", latitude: 45.6634, longitude: -118.7791, userCount: 4 },
  { city: "South Jordan", country: "US", latitude: 40.5582, longitude: -111.9222, userCount: 4 },
  { city: "Norman", country: "US", latitude: 35.20845, longitude: -97.46855, userCount: 4 },
  { city: "Austin", country: "US", latitude: 30.2625, longitude: -97.7463, userCount: 4 },
  { city: "West Jordan", country: "US", latitude: 40.598, longitude: -111.9619, userCount: 3 },
  { city: "Gilbert", country: "US", latitude: 33.3354, longitude: -111.76803333333334, userCount: 3 },
  { city: "Tempe", country: "US", latitude: 33.41003333333334, longitude: -111.92643333333332, userCount: 3 },
  { city: "North Hollywood", country: "US", latitude: 34.2005, longitude: -118.40249999999999, userCount: 3 },
  { city: "Provo", country: "US", latitude: 40.25033333333334, longitude: -111.65413333333333, userCount: 3 },
  { city: "Ozark", country: "US", latitude: 37.0142, longitude: -93.1986, userCount: 3 },
  { city: "Bullard", country: "US", latitude: 32.1344, longitude: -95.32210000000002, userCount: 3 },
  { city: "Aiken", country: "US", latitude: 33.5546, longitude: -81.721, userCount: 3 },
  { city: "Roy", country: "US", latitude: 41.1645, longitude: -112.019, userCount: 3 },
  { city: "Katy", country: "US", latitude: 29.7388, longitude: -95.8309, userCount: 3 },
  { city: "Carrollton", country: "US", latitude: 32.9657, longitude: -96.8825, userCount: 3 },
  { city: "Oklahoma City", country: "US", latitude: 35.43006666666667, longitude: -97.52166666666666, userCount: 3 },
  { city: "Pleasant Grove", country: "US", latitude: 40.3693, longitude: -111.7408, userCount: 3 },
  { city: "Stockton", country: "US", latitude: 37.96873333333333, longitude: -121.3156, userCount: 3 },
  { city: "Tucson", country: "US", latitude: 32.2163, longitude: -110.9241, userCount: 2 },
  { city: "Eagle River", country: "US", latitude: 61.3179, longitude: -149.5892, userCount: 2 },
  { city: "Surprise", country: "US", latitude: 33.7069, longitude: -112.4332, userCount: 2 },
  { city: "Inglewood", country: "US", latitude: 33.95975, longitude: -118.3528, userCount: 2 },
  { city: "Heber", country: "US", latitude: 40.495, longitude: -111.4102, userCount: 2 },
  { city: "Manteca", country: "US", latitude: 37.778, longitude: -121.2316, userCount: 2 },
  { city: "Pasadena", country: "US", latitude: 31.92405, longitude: -106.67035, userCount: 2 },
  { city: "Chino", country: "US", latitude: 34.0121, longitude: -117.6883, userCount: 2 },
  { city: "Elk Grove", country: "US", latitude: 38.41675, longitude: -121.43535, userCount: 2 },
  { city: "Santaquin", country: "US", latitude: 39.9755, longitude: -111.7852, userCount: 2 },
  { city: "Atlanta", country: "US", latitude: 33.768249999999995, longitude: -84.3445, userCount: 2 },
  { city: "Raleigh", country: "US", latitude: 35.79005, longitude: -78.59710000000001, userCount: 2 },
  { city: "Willcox", country: "US", latitude: 32.373, longitude: -109.8631, userCount: 2 },
  { city: "Escondido", country: "US", latitude: 33.11295, longitude: -117.0882, userCount: 2 },
  { city: "Pearland", country: "US", latitude: 29.5656, longitude: -95.2747, userCount: 2 },
  { city: "Plano", country: "US", latitude: 33.0287, longitude: -96.6826, userCount: 2 },
  { city: "Hayward", country: "US", latitude: 37.6403, longitude: -122.0667, userCount: 2 },
  { city: "League City", country: "US", latitude: 29.5183, longitude: -95.0977, userCount: 2 },
  { city: "Lakeland", country: "US", latitude: 27.9611, longitude: -81.9398, userCount: 2 },
  { city: "Palmer", country: "US", latitude: 61.5994, longitude: -149.1146, userCount: 2 },
  { city: "Milwaukee", country: "US", latitude: 43.0132, longitude: -87.9287, userCount: 2 },
  { city: "Riverside", country: "US", latitude: 33.964349999999996, longitude: -117.45259999999999, userCount: 2 },
  { city: "Lewisburg", country: "US", latitude: 35.4586, longitude: -86.783, userCount: 2 },
  { city: "Goodyear", country: "US", latitude: 33.4345, longitude: -112.38175000000001, userCount: 2 },
  { city: "Anaheim", country: "US", latitude: 33.8207, longitude: -117.9143, userCount: 2 },
  { city: "Seattle", country: "US", latitude: 47.503299999999996, longitude: -122.31694999999999, userCount: 2 },
  { city: "Midvale", country: "US", latitude: 40.6118, longitude: -111.9008, userCount: 2 },
  { city: "Loves Park", country: "US", latitude: 42.3546, longitude: -89.0435, userCount: 2 },
  { city: "Wasilla", country: "US", latitude: 61.5883, longitude: -149.3959, userCount: 2 },
  { city: "Encino", country: "US", latitude: 34.1712, longitude: -118.5186, userCount: 2 },
  { city: "Shawnee", country: "US", latitude: 39.0452, longitude: -94.7189, userCount: 1 },
  { city: "Kanab", country: "US", latitude: 37.0487, longitude: -112.5174, userCount: 1 },
  { city: "Hurst", country: "US", latitude: 32.8209, longitude: -97.1765, userCount: 1 },
  { city: "Tyler", country: "US", latitude: 32.2721, longitude: -95.3176, userCount: 1 },
  { city: "Riverton", country: "US", latitude: 40.518, longitude: -111.9285, userCount: 1 },
  { city: "Charlotte Amalie", country: "VI", latitude: 18.3382, longitude: -64.9319, userCount: 1 },
  { city: "Vista", country: "US", latitude: 33.1981, longitude: -117.2471, userCount: 1 },
  { city: "Hemet", country: "US", latitude: 33.7338, longitude: -116.9299, userCount: 1 },
  { city: "Nampa", country: "US", latitude: 43.5441, longitude: -116.5662, userCount: 1 },
  { city: "Winter Park", country: "US", latitude: 28.5981, longitude: -81.3515, userCount: 1 },
  { city: "Omaha", country: "US", latitude: 41.268, longitude: -96.1156, userCount: 1 },
  { city: "Texas City", country: "US", latitude: 29.3865, longitude: -94.9963, userCount: 1 },
  { city: "Pacoima", country: "US", latitude: 34.2529, longitude: -118.418, userCount: 1 },
  { city: "Indianapolis", country: "US", latitude: 39.8079, longitude: -86.0949, userCount: 1 },
  { city: "Fair Grove", country: "US", latitude: 37.3711, longitude: -93.1462, userCount: 1 },
  { city: "Rockford", country: "US", latitude: 42.2739, longitude: -89.0474, userCount: 1 },
  { city: "Park City", country: "US", latitude: 40.7038, longitude: -111.5437, userCount: 1 },
  { city: "Little Rock", country: "US", latitude: 34.7386, longitude: -92.4231, userCount: 1 },
  { city: "Deltona", country: "US", latitude: 28.9107, longitude: -81.1957, userCount: 1 },
  { city: "Tracy", country: "US", latitude: 37.6567, longitude: -121.4955, userCount: 1 },
  { city: "Vernon Hills", country: "US", latitude: 42.2166, longitude: -87.9795, userCount: 1 },
  { city: "Chinle", country: "US", latitude: 36.1663, longitude: -109.5584, userCount: 1 },
  { city: "Weatherford", country: "US", latitude: 32.7519, longitude: -97.6858, userCount: 1 },
  { city: "Hephzibah", country: "US", latitude: 33.314, longitude: -82.0968, userCount: 1 },
  { city: "Sugar Land", country: "US", latitude: 29.6361, longitude: -95.6485, userCount: 1 },
  { city: "Anchorage", country: "US", latitude: 61.2199, longitude: -149.9077, userCount: 1 },
  { city: "Liberty Hill", country: "US", latitude: 30.6622, longitude: -97.931, userCount: 1 },
  { city: "Spanish Fork", country: "US", latitude: 40.115, longitude: -111.6549, userCount: 1 },
  { city: "Schaumburg", country: "US", latitude: 42.0567, longitude: -88.0525, userCount: 1 },
  { city: "Birmingham", country: "US", latitude: 33.5226, longitude: -86.8033, userCount: 1 },
  { city: "Monrovia", country: "US", latitude: 34.1483, longitude: -118.0016, userCount: 1 },
  { city: "La Jolla", country: "US", latitude: 32.8509, longitude: -117.2722, userCount: 1 },
  { city: "Safford", country: "US", latitude: 32.8273, longitude: -109.6266, userCount: 1 },
  { city: "Altamonte Springs", country: "US", latitude: 28.6623, longitude: -81.4136, userCount: 1 },
  { city: "Satellite Beach", country: "US", latitude: 28.1743, longitude: -80.584, userCount: 1 },
  { city: "Hampton", country: "US", latitude: 33.3871, longitude: -84.283, userCount: 1 },
  { city: "San Tan Valley", country: "US", latitude: 33.1922, longitude: -111.5318, userCount: 1 },
  { city: "Lahore", country: "PK", latitude: 31.5826, longitude: 74.3276, userCount: 1 },
  { city: "Rogersville", country: "US", latitude: 37.117, longitude: -93.0557, userCount: 1 },
  { city: "McAllen", country: "US", latitude: 26.2051, longitude: -98.2335, userCount: 1 },
  { city: "Rigby", country: "US", latitude: 43.6714, longitude: -111.897, userCount: 1 },
  { city: "New York", country: "US", latitude: 40.7126, longitude: -74.0066, userCount: 1 },
  { city: "Walla Walla", country: "US", latitude: 46.0662, longitude: -118.3514, userCount: 1 },
  { city: "Lebanon", country: "US", latitude: 36.1187, longitude: -86.2626, userCount: 1 },
  { city: "Lawrenceburg", country: "US", latitude: 35.2423, longitude: -87.3347, userCount: 1 },
  { city: "Garland", country: "US", latitude: 32.915, longitude: -96.6751, userCount: 1 },
  { city: "Grapevine", country: "US", latitude: 32.9376, longitude: -97.0829, userCount: 1 },
  { city: "Eagle", country: "US", latitude: 43.7034, longitude: -116.359, userCount: 1 },
  { city: "Newhall", country: "US", latitude: 34.3802, longitude: -118.5219, userCount: 1 },
  { city: "Placentia", country: "US", latitude: 33.8744, longitude: -117.8565, userCount: 1 },
  { city: "Concord", country: "US", latitude: 35.4155, longitude: -80.6143, userCount: 1 },
  { city: "Morton", country: "US", latitude: 40.6161, longitude: -89.4635, userCount: 1 },
  { city: "Decatur", country: "US", latitude: 33.2351, longitude: -97.574, userCount: 1 },
  { city: "Yuba City", country: "US", latitude: 39.1061, longitude: -121.6159, userCount: 1 },
  { city: "San Jose", country: "US", latitude: 37.3388, longitude: -121.8916, userCount: 1 },
  { city: "Simi Valley", country: "US", latitude: 34.3046, longitude: -118.6844, userCount: 1 },
  { city: "San Marcos", country: "US", latitude: 33.1432, longitude: -117.1666, userCount: 1 },
  { city: "Moreno Valley", country: "US", latitude: 33.9553, longitude: -117.2457, userCount: 1 },
  { city: "Norwalk", country: "US", latitude: 33.9058, longitude: -118.0897, userCount: 1 },
  { city: "Bountiful", country: "US", latitude: 40.8792, longitude: -111.8686, userCount: 1 },
  { city: "Charlotte", country: "US", latitude: 35.2426, longitude: -80.741, userCount: 1 },
  { city: "Santa Ana", country: "US", latitude: 33.754, longitude: -117.8578, userCount: 1 },
  { city: "San Bernardino", country: "US", latitude: 34.1076, longitude: -117.2885, userCount: 1 },
  { city: "Etters", country: "US", latitude: 40.1524, longitude: -76.8189, userCount: 1 },
  { city: "Fullerton", country: "US", latitude: 33.8693, longitude: -117.9296, userCount: 1 },
  { city: "Jacksonville", country: "US", latitude: 39.7343, longitude: -90.2291, userCount: 1 },
  { city: "Antioch", country: "US", latitude: 36.0595, longitude: -86.6592, userCount: 1 },
  { city: "Denton", country: "US", latitude: 33.2205, longitude: -97.1294, userCount: 1 },
  { city: "Renton", country: "US", latitude: 47.4714, longitude: -122.2203, userCount: 1 },
  { city: "Midlothian", country: "US", latitude: 32.48, longitude: -96.9905, userCount: 1 },
  { city: "Independence", country: "US", latitude: 41.3687, longitude: -81.6379, userCount: 1 },
  { city: "Perth", country: "AU", latitude: -31.947400000000002, longitude: 115.8648, userCount: 1 },
  { city: "Fairview", country: "US", latitude: 35.982, longitude: -87.1214, userCount: 1 },
  { city: "Orange", country: "US", latitude: 33.8242, longitude: -117.8434, userCount: 1 },
  { city: "Honolulu", country: "US", latitude: 21.3571, longitude: -157.9258, userCount: 1 },
  { city: "Spring", country: "US", latitude: 30.0409, longitude: -95.5302, userCount: 1 },
  { city: "Tampa", country: "US", latitude: 28.0508, longitude: -82.4484, userCount: 1 },
  { city: "Portland", country: "US", latitude: 45.4804, longitude: -122.5891, userCount: 1 },
  { city: "Saratoga Springs", country: "US", latitude: 40.3495, longitude: -111.8998, userCount: 1 },
  { city: "Elk Ridge", country: "US", latitude: 40.041, longitude: -111.7316, userCount: 1 },
  { city: "Henderson", country: "US", latitude: 36.0471, longitude: -114.9839, userCount: 1 },
  { city: "Orland Park", country: "US", latitude: 41.6042, longitude: -87.8872, userCount: 1 },
  { city: "Riverbank", country: "US", latitude: 37.7399, longitude: -120.9347, userCount: 1 },
  { city: "Palestine", country: "US", latitude: 31.7583, longitude: -95.6366, userCount: 1 },
  { city: "El Cajon", country: "US", latitude: 32.792699999999996, longitude: -116.9623, userCount: 1 },
  { city: "San Francisco", country: "US", latitude: 37.7797, longitude: -122.4159, userCount: 1 },
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
