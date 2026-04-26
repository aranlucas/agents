"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import type { GlobeMethods } from "react-globe.gl";
import type { ArcDatum } from "@/lib/types";

const Globe = dynamic(() => import("react-globe.gl"), { ssr: false });

interface GlobeCanvasProps {
  arcs: ArcDatum[];
}

export function GlobeCanvas({ arcs }: GlobeCanvasProps) {
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

  // Pause auto-rotate for 3s when new arcs arrive, then resume
  useEffect(() => {
    if (arcs.length === 0) return;
    const controls = globeRef.current?.controls();
    if (controls) controls.autoRotate = false;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      const c = globeRef.current?.controls();
      if (c) c.autoRotate = true;
    }, 3000);
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [arcs.length]);

  const onGlobeReady = useCallback(() => {
    const controls = globeRef.current?.controls();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.4;
    }
  }, []);

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
        arcDashLength={0.4}
        arcDashGap={0.2}
        arcDashAnimateTime={1500}
        onGlobeReady={onGlobeReady}
      />
    </div>
  );
}
