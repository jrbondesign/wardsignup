"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { LoadingSpinner } from "./LoadingSpinner";
import { createClientComponentClient } from "@/lib/auth";

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
  source?: string;
}

export default function GeographyMap() {
  const [data, setData] = useState<GeographyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadData = async () => {
      try {
        const supabase = createClientComponentClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          setError("Not authenticated");
          setLoading(false);
          return;
        }

        const res = await fetch("/api/geography", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? `API error ${res.status}`);
          setLoading(false);
          return;
        }

        setData(await res.json());
        setLoading(false);
      } catch (err) {
        console.error("Geography map error:", err);
        setError("Failed to load geography data");
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

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-xl text-sm">
        {error}
      </div>
    );
  }

  if (!data || data.cities.length === 0) {
    return (
      <div className="bg-[#FAFCFD] border border-[rgba(14,150,176,0.2)] text-[#5A8399] px-5 py-4 rounded-xl text-sm">
        No geographic data available
      </div>
    );
  }

  const getMarkerSize = (userCount: number): number => {
    const maxCount = Math.max(...data.cities.map((c) => c.userCount), 1);
    return 6 + (userCount / maxCount) * 14;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="text-[13px] text-[#5A8399]">
          <span className="font-semibold text-[#0D2B35]">{data.totalCities}</span>{" "}
          cities ·{" "}
          <span className="font-semibold text-[#0D2B35]">{data.totalUsers}</span>{" "}
          people
          <span className="text-[11px] text-[#7A9BAE] ml-2">
            (creators &amp; signups, last 90 days
            {data.source === "snapshot" ? ", snapshot" : ""})
          </span>
        </div>
      </div>

      <div className="relative h-[500px] w-full rounded-xl overflow-hidden border border-[rgba(14,150,176,0.14)] shadow-[0_2px_12px_rgba(8,100,126,0.06)]">
        <MapContainer
          center={[39.5, -98]}
          zoom={4}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
        >
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

      <div className="text-[11px] text-[#7A9BAE] leading-relaxed">
        One pin per city. Counts unique creators and signup participants (not
        visitors). Datacenter GeoIP cities filtered. City-level only.
      </div>
    </div>
  );
}
