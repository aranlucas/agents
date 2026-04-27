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

  // Stop auto-rotate permanently once results arrive
  useEffect(() => {
    if (arcs.length === 0 && points.length === 0) return;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    const controls = globeRef.current?.controls();
    if (controls) controls.autoRotate = false;
  }, [arcs.length]);

  const onGlobeReady = useCallback(() => {
    const globe = globeRef.current;
    if (globe) {
      globe.pointOfView({ lat: 47.45, lng: -122.31, altitude: 2.0 }, 0);
      const controls = globe.controls();
      if (controls) {
        controls.autoRotate = arcs.length === 0 && points.length === 0;
        controls.autoRotateSpeed = 0.4;
      }
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
