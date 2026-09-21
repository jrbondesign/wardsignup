"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { LoadingSpinner } from "./LoadingSpinner";

const MapContainer = dynamic(
  () => import("react-leaflet").then((mod) => mod.MapContainer),
  { ssr: false },
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((mod) => mod.TileLayer),
  { ssr: false },
);
const CircleMarker = dynamic(
  () => import("react-leaflet").then((mod) => mod.CircleMarker),
  { ssr: false },
);
const Popup = dynamic(
  () => import("react-leaflet").then((mod) => mod.Popup),
  { ssr: false },
);
const MapScrollWheelZoom = dynamic(() => import("./MapScrollWheelZoom"), {
  ssr: false,
});

interface CityData {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  userCount: number;
}

interface GeographyData {
  cities: CityData[];
  totalCities: number;
  totalUsers: number;
}

export default function PublicGeographyMap() {
  const [data, setData] = useState<GeographyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mapActive, setMapActive] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await fetch("/api/geography/public");
        if (!res.ok) {
          setError("Geography map temporarily unavailable");
          setLoading(false);
          return;
        }
        const json = await res.json();
        setData(json);
        setLoading(false);
      } catch (err) {
        console.error("Geography map error:", err);
        setError("Geography map temporarily unavailable");
        setLoading(false);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      void import("leaflet/dist/leaflet.css");
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (error || !data || data.cities.length === 0) {
    return (
      <div className="bg-[#FAFCFD] border border-[rgba(14,150,176,0.2)] text-[#5A8399] px-5 py-4 rounded-xl text-sm text-center">
        {error || "No geographic data available"}
      </div>
    );
  }

  const getMarkerSize = (userCount: number): number => {
    const maxCount = Math.max(...data.cities.map((c) => c.userCount), 1);
    const minSize = 6;
    const maxSize = 20;
    return minSize + (userCount / maxCount) * (maxSize - minSize);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-2 flex-wrap text-center">
        <div className="text-[15px] text-[#5A8399]">
          Creators &amp; signups from{" "}
          <span className="font-semibold text-[#0E96B0] text-[18px]">
            {data.totalCities}
          </span>{" "}
          cities ·{" "}
          <span className="font-semibold text-[#0E96B0] text-[18px]">
            {data.totalUsers}
          </span>{" "}
          people
        </div>
      </div>

      <div
        className="relative z-0 isolate h-[500px] w-full rounded-xl overflow-hidden border border-[rgba(14,150,176,0.14)] shadow-[0_2px_12px_rgba(8,100,126,0.06)]"
        onMouseLeave={() => setMapActive(false)}
      >
        {!mapActive && (
          <button
            type="button"
            onClick={() => setMapActive(true)}
            className="absolute inset-0 z-[1100] flex items-end justify-center pb-4 bg-transparent border-none cursor-pointer"
            aria-label="Click to explore the map"
          >
            <span className="pointer-events-none rounded-full bg-[#0D2B35]/75 text-white text-[13px] font-medium px-3.5 py-1.5 shadow-[0_2px_10px_rgba(8,100,126,0.25)] backdrop-blur-[2px]">
              Click to explore map
            </span>
          </button>
        )}
        <MapContainer
          center={[39.5, -98]}
          zoom={4}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
        >
          <MapScrollWheelZoom enabled={mapActive} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {data.cities.map((city, idx) => (
            <CircleMarker
              key={`${city.city}-${city.country}-${idx}`}
              center={[city.latitude, city.longitude]}
              radius={getMarkerSize(city.userCount)}
              pathOptions={{
                fillColor: "#0E96B0",
                color: "#08647E",
                weight: 1,
                opacity: 0.8,
                fillOpacity: 0.6,
              }}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold text-[#0D2B35]">
                    {city.city}
                    {city.country ? `, ${city.country}` : ""}
                  </div>
                  <div className="text-[#5A8399] text-xs mt-1">
                    {city.userCount}{" "}
                    {city.userCount === 1 ? "person" : "people"}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <div className="text-[11px] text-[#7A9BAE] text-center leading-relaxed">
        One pin per city for event creators and people who signed up. Updated
        daily from city-level location data — no street or IP data.
      </div>
    </div>
  );
}
