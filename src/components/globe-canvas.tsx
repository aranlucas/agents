"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import type { GlobeMethods } from "react-globe.gl";
import type { ArcDatum, PointDatum } from "@/lib/types";

const Globe = dynamic(() => import("react-globe.gl"), { ssr: false });

interface GlobeCanvasProps {
  arcs: ArcDatum[];
  points?: PointDatum[];
}

export function GlobeCanvas({ arcs, points = [] }: GlobeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Reposition globe to centroid of trip legs whenever arcs change
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    if (arcs.length === 0) {
      const controls = globe.controls();
      if (controls) controls.autoRotate = true;
      return;
    }

    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    const controls = globe.controls();
    if (controls) controls.autoRotate = false;

    const lats = arcs.flatMap((a) => [a.startLat, a.endLat]);
    const lngs = arcs.flatMap((a) => [a.startLng, a.endLng]);
    const centroidLat = lats.reduce((s, v) => s + v, 0) / lats.length;
    const centroidLng = lngs.reduce((s, v) => s + v, 0) / lngs.length;

    // Altitude scales with route spread so the whole trip fits in view
    const latSpread = Math.max(...lats) - Math.min(...lats);
    const lngSpread = Math.max(...lngs) - Math.min(...lngs);
    const spread = Math.max(latSpread, lngSpread);
    const altitude = Math.min(3.5, Math.max(1.2, spread / 45));

    globe.pointOfView({ lat: centroidLat, lng: centroidLng, altitude }, 1200);
  }, [arcs]);

  const onGlobeReady = useCallback(() => {
    const globe = globeRef.current;
    if (!globe) return;
    const controls = globe.controls();
    if (controls) {
      controls.autoRotate = arcs.length === 0 && points.length === 0;
      controls.autoRotateSpeed = 0.4;
    }
    if (arcs.length === 0) {
      globe.pointOfView({ lat: 20, lng: 0, altitude: 2.5 }, 0);
    }
  }, [arcs.length]);

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    >
      <Globe
        ref={globeRef}
        width={size.width}
        height={size.height}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        atmosphereAltitude={0.12}
        atmosphereColor="rgba(245,158,11,0.15)"
        arcsData={arcs}
        arcStartLat={(d: object) => (d as ArcDatum).startLat}
        arcStartLng={(d: object) => (d as ArcDatum).startLng}
        arcEndLat={(d: object) => (d as ArcDatum).endLat}
        arcEndLng={(d: object) => (d as ArcDatum).endLng}
        arcColor={(d: object) => (d as ArcDatum).color}
        arcAltitude={0.3}
        arcStroke={(d: object) => (d as ArcDatum).strokeWidth}
        arcDashLength={0.25}
        arcDashGap={1}
        arcDashInitialGap={() => Math.random()}
        arcDashAnimateTime={4000}
        arcsTransitionDuration={0}
        pointsData={points}
        pointLat={(d: object) => (d as PointDatum).lat}
        pointLng={(d: object) => (d as PointDatum).lng}
        pointColor={(d: object) => (d as PointDatum).color}
        pointAltitude={0}
        pointRadius={0.3}
        pointsMerge={false}
        pointLabel={(d: object) => (d as PointDatum).label ?? ""}
        onGlobeReady={onGlobeReady}
      />
    </div>
  );
}
