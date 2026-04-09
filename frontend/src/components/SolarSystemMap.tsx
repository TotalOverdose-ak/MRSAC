"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Globe2, Plus, Minus } from "lucide-react";
import { useState, useEffect, useRef } from "react";

type Planet = {
  name: string;
  color: string;
  size: number;
  radius: number;
  speed: number;
  hasRing?: boolean;
  desc?: string;
  exo?: string;
  climate?: string;
  physical?: string;
};

// Increased sizes drastically and tighted orbits for a more cinematic and dense map.
const PLANETS: Planet[] = [
  { name: "MERCURY", color: "#a8a8a8", size: 24, radius: 180, speed: 10, desc: "Mercury is the smallest and innermost planet in the Solar System. Its orbital period around the Sun of 88 days is the shortest of all the planets.", exo: "Containing hydrogen, helium, oxygen, sodium, calcium.", climate: "The surface temperature ranges from 100K to 700K.", physical: "Approximately 70% metallic and 30% silicate material." },
  { name: "VENUS", color: "#e3c16f", size: 40, radius: 280, speed: 15, desc: "Venus is the second planet from the Sun. It is a terrestrial planet and is sometimes called Earth's sister planet.", exo: "96% carbon dioxide, 3% nitrogen.", climate: "Temperatures very extremely hot.", physical: "Radius approximately 6051 km." },
  { name: "EARTH", color: "#4da6ff", size: 48, radius: 400, speed: 20, desc: "Earth is the third planet from the Sun and the only astronomical object known to harbor life.", exo: "78% nitrogen, 21% oxygen, 1% argon.", climate: "Maintains a habitable average temperature of 15°C.", physical: "Dense core consisting mostly of iron and nickel." },
  { name: "MARS", color: "#ff4d4d", size: 32, radius: 520, speed: 25, desc: "Mars is the fourth planet from the Sun and the second-smallest planet in the Solar System.", exo: "95% carbon dioxide, 1.93% argon, 1.89% nitrogen.", climate: "Temperatures vary from -225 °F to 95 °F in equatorial summer.", physical: "Mars is approximately half the diameter of the Earth." },
  { name: "JUPITER", color: "#d5a6bd", size: 100, radius: 720, speed: 40, desc: "Jupiter is the fifth planet from the Sun and the largest in the Solar System. It is a gas giant with a mass more than two and a half times that of all the other planets combined.", exo: "Mainly hydrogen and helium.", climate: "Famous for its Great Red Spot, a massive persistent storm.", physical: "Giant gas shell without a solid surface." },
  { name: "SATURN", color: "#ddb892", size: 85, radius: 950, speed: 55, hasRing: true, desc: "Saturn is the sixth planet from the Sun and the second-largest in the Solar System, after Jupiter. It is best known for its prominent ring system.", exo: "Vast majority hydrogen, some helium.", climate: "Extremely windy and stormy upper atmosphere.", physical: "Rings composed of ice and rock dust." },
  { name: "URANUS", color: "#99ccff", size: 60, radius: 1180, speed: 70, desc: "Uranus is the seventh planet from the Sun. Its name is a reference to the Greek god of the sky.", exo: "Hydrogen, helium, and methane.", climate: "Coldest planetary atmosphere in the Solar System.", physical: "Orbits the Sun on its side via a unique axial tilt." },
  { name: "NEPTUNE", color: "#3366ff", size: 55, radius: 1400, speed: 90, desc: "Neptune is the eighth and farthest-known Solar planet from the Sun. In the Solar System, it is the fourth-largest planet by diameter.", exo: "At high altitudes, atmosphere is 80% hydrogen.", climate: "Weather is characterised by extremely dynamic storm systems.", physical: "Neptune's mass is 10243x10^24 kg. Gravity at 1 bar is 11.15 m/s2." }
];

export default function SolarSystemMap({ onClose }: { onClose: () => void }) {
  const [selectedPlanet, setSelectedPlanet] = useState<Planet | null>(null);
  const constraintsRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(0.4);

  // Calculate min scale to avoid empty space
  useEffect(() => {
    const updateMinScale = () => {
      const minW = window.innerWidth / 3200;
      const minH = window.innerHeight / 3200;
      setMinScale(Math.max(minW, minH, 0.2));
    };
    updateMinScale();
    window.addEventListener('resize', updateMinScale);
    return () => window.removeEventListener('resize', updateMinScale);
  }, []);

  // Zoom via wheel
  useEffect(() => {
    if (selectedPlanet) return;
    const handleWheel = (e: WheelEvent) => {
      setScale(prev => Math.min(Math.max(prev - e.deltaY * 0.001, minScale), 2));
    };
    window.addEventListener('wheel', handleWheel);
    return () => window.removeEventListener('wheel', handleWheel);
  }, [minScale, selectedPlanet]);

  useEffect(() => {
    // 1-8 keyboard shortcuts mapped to planet index
    const handleKeyDown = (e: KeyboardEvent) => {
      // ignore if they are typing in an input
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      
      const keyMap: Record<string, number> = {
        '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7
      };
      
      if (e.key in keyMap) {
        setSelectedPlanet(PLANETS[keyMap[e.key]]);
      } else if (e.key === 'Escape') {
        setSelectedPlanet(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-[100] bg-[#020617] flex items-center justify-center overflow-hidden touch-none selection:bg-white/10"
    >
      {/* Deep Space Background noise/glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03)_0%,transparent_100%)] pointer-events-none" />
      
      <AnimatePresence mode="wait">
        {!selectedPlanet ? (
          <motion.div 
            key="map"
            ref={constraintsRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full h-full relative overflow-hidden"
          >
            {/* Nav */}
            <div className="absolute top-0 left-0 w-full p-8 flex justify-between items-center z-[110] pointer-events-none">
                <div className="font-serif italic text-lg tracking-widest text-white pointer-events-auto">III</div>
                <div className="hidden md:flex gap-16 text-[9px] tracking-[0.2em] font-medium text-white/50 uppercase pointer-events-auto">
                   <span className="hover:text-white transition-colors cursor-pointer">_About</span>
                   <span className="hover:text-white transition-colors cursor-pointer">_Contact</span>
                   <span className="text-white font-bold border-b border-white pb-1">_Planets</span>
                </div>
                <button 
                  onClick={onClose} 
                  className="pointer-events-auto flex items-center justify-center w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10 text-white"
                >
                   <X className="w-4 h-4" />
                </button>
            </div>

            <div className="absolute top-24 left-8 z-[110] font-mono text-white/30 tracking-widest text-[9px] pointer-events-none bg-black/40 px-3 py-1.5 border border-white/5 rounded-full backdrop-blur-md">
              [ DRAG TO EXPLORE ORBITS OR CLICK A PLANET ]
            </div>

            {/* Zoom Controls */}
            <div className="absolute bottom-12 right-12 z-[110] flex flex-col gap-3 pointer-events-auto">
              <button 
                onClick={() => setScale(s => Math.min(s + 0.2, 2))} 
                className="w-12 h-12 rounded-full bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white/20 backdrop-blur-md transition-colors"
              >
                <Plus className="w-5 h-5 text-white/70" />
              </button>
              <button 
                onClick={() => setScale(s => Math.max(s - 0.2, minScale))} 
                className="w-12 h-12 rounded-full bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white/20 backdrop-blur-md transition-colors"
              >
                <Minus className="w-5 h-5 text-white/70" />
              </button>
            </div>

            {/* Draggable Map */}
            <motion.div 
              drag 
              dragConstraints={constraintsRef}
              dragElastic={0}
              animate={{ scale }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="absolute w-[3200px] h-[3200px] flex items-center justify-center cursor-move"
              style={{ left: "calc(50% - 1600px)", top: "calc(50% - 1600px)" }}
            >
              {/* Massive Cinematic SUN */}
              <div 
                className="absolute w-[240px] h-[240px] rounded-full z-50 flex items-center justify-center pointer-events-none"
                style={{
                  background: 'radial-gradient(circle at 50% 50%, #fffadb 0%, #ffdf00 30%, #ff8c00 70%, #ff4500 100%)',
                  boxShadow: '0 0 200px rgba(255, 140, 0, 0.8), 0 0 400px rgba(255, 69, 0, 0.4), inset -10px -10px 40px rgba(0,0,0,0.4)',
                }}
              >
                <div className="absolute inset-0 rounded-full animate-pulse opacity-50 bg-[radial-gradient(circle,rgba(255,255,255,0.8)_0%,transparent_70%)] blur-md" />
              </div>

              {/* ORBITS and PLANETS */}
              {PLANETS.map((planet) => (
                <div 
                  key={planet.name} 
                  className="absolute rounded-full border border-white/20 pointer-events-none" 
                  style={{ width: planet.radius * 2, height: planet.radius * 2 }}
                >
                  <motion.div 
                     className="w-full h-full relative"
                     animate={{ rotate: 360 }}
                     transition={{ duration: planet.speed, repeat: Infinity, ease: "linear" }}
                  >
                    <div 
                      onClick={() => setSelectedPlanet(planet)}
                      className="absolute rounded-full flex items-center justify-center group transform -translate-x-1/2 -translate-y-1/2 cursor-pointer pointer-events-auto transition-transform hover:scale-[1.5]"
                      style={{ 
                        width: planet.size, 
                        height: planet.size, 
                        background: `radial-gradient(circle at 35% 35%, ${planet.color} 0%, rgba(0,0,0,0.8) 75%, black 100%)`, 
                        boxShadow: `inset -${planet.size / 6}px -${planet.size / 6}px ${planet.size / 3}px rgba(0,0,0,0.9), inset ${planet.size / 10}px ${planet.size / 10}px ${planet.size / 5}px rgba(255,255,255,0.3), 0 0 ${planet.size}px ${planet.color}30`,
                        left: '50%', 
                        top: 0 
                      }}
                    >
                      {/* Saturn Ring in Map View */}
                      {planet.hasRing && (
                         <div 
                            className="absolute rounded-[50%] pointer-events-none border-t border-b border-white/40" 
                            style={{ 
                              width: '240%', 
                              height: planet.size * 0.3,
                              transform: 'rotate(20deg)',
                              boxShadow: '0 0 10px rgba(255,255,255,0.1)'
                            }} 
                         />
                      )}
                      
                      {/* Elegant Tooltip */}
                      <div className="absolute top-[120%] left-1/2 -translate-x-1/2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-[#020617]/90 backdrop-blur-md px-3 py-1.5 rounded border border-white/10 select-none pointer-events-none flex items-center gap-2 transform shadow-xl">
                        <Globe2 className="w-3 h-3 text-white/50" />
                        <span className="text-[10px] text-white tracking-[0.2em] font-medium font-sans">{planet.name}</span>
                      </div>
                    </div>
                  </motion.div>
                </div>
              ))}
            </motion.div>
          </motion.div>
        ) : (
          /* DETAILED PLANET VIEW (Reference Design) */
          <motion.div 
            key="detail"
            initial={{ opacity: 0, scale: 0.98, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 1.02, filter: "blur(10px)" }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 z-[200] bg-[#020617] text-white flex flex-col md:flex-row overflow-hidden font-sans cursor-default pointer-events-auto shadow-[0_0_60px_rgba(0,0,0,1)] selection:bg-white/20"
          >
            {/* Top Navigation */}
            <div className="absolute top-0 w-full p-8 md:p-12 flex justify-between items-center z-50 pointer-events-none">
              <div className="flex items-center gap-16 pointer-events-auto cursor-pointer">
                <div className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center font-serif italic text-lg hover:bg-white hover:text-black transition-colors" onClick={() => setSelectedPlanet(null)}>
                  III
                </div>
              </div>

              <div className="hidden md:flex gap-16 text-[9px] tracking-[0.2em] font-medium text-white/50 uppercase pointer-events-auto">
                 <span className="hover:text-white transition-colors cursor-pointer">_About</span>
                 <span className="hover:text-white transition-colors cursor-pointer">_Contact</span>
                 <span className="text-white font-bold border-b border-white pb-1">_Planets</span>
              </div>

              <button 
                onClick={() => setSelectedPlanet(null)} 
                className="pointer-events-auto flex items-center gap-3 group px-5 py-2.5 border border-white/20 rounded-full hover:bg-white transition-colors"
              >
                <span className="text-[10px] uppercase tracking-[0.15em] text-white group-hover:text-black font-semibold">BACK</span>
                <X className="w-4 h-4 text-white group-hover:text-black group-hover:rotate-180 transition-transform duration-500" />
              </button>
            </div>

            {/* Sub-menu lines left */}
            <div className="hidden md:flex flex-col justify-center items-end absolute left-8 top-1/2 -translate-y-1/2 gap-10 text-[10px] font-mono text-white/50 tracking-[0.4em] z-50 drop-shadow-md">
              {PLANETS.map((planet, idx) => {
                const numStr = String(idx + 1).padStart(2, '0');
                const isSelected = selectedPlanet.name === planet.name;
                return (
                  <span 
                    key={planet.name}
                    onClick={() => setSelectedPlanet(planet)}
                    className={`cursor-pointer transition-all ${isSelected ? 'text-white font-bold scale-110' : 'hover:text-white hover:scale-105'}`}
                  >
                    — {numStr}
                  </span>
                )
              })}
            </div>

            {/* Split layout Content */}
            <div className="relative z-20 w-full max-w-7xl mx-auto h-full flex flex-col md:flex-row items-center pt-24 md:pt-0">
              
              {/* Text Section (Left half) */}
              <div className="w-full md:w-1/2 pl-12 pr-6 md:pl-40 md:pr-16 flex flex-col justify-center border-l border-white/5 h-full relative z-20">
                
                <div className="flex items-center gap-4 text-[11px] tracking-[0.4em] text-white/80 font-mono mb-8 border-b border-white/20 pb-4 inline-flex w-fit drop-shadow-md">
                  <span>{String(PLANETS.findIndex(p => p.name === selectedPlanet.name) + 1).padStart(2, '0')}</span>
                  <div className="w-8 h-[1px] bg-white/20" />
                  <span>{String(PLANETS.length).padStart(2, '0')}</span>
                </div>

                <motion.h1 
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 1 }}
                  className="text-7xl md:text-[10rem] font-serif font-light mb-8 text-white capitalize"
                  style={{ letterSpacing: "-0.04em", lineHeight: 0.9 }}
                >
                  {selectedPlanet.name.toLowerCase()}
                </motion.h1>

                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4, duration: 1 }}
                  className="text-base md:text-base leading-[2] font-normal text-white/90 mb-8 max-w-md pr-10"
                >
                  {selectedPlanet.desc}
                </motion.p>
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5, duration: 1 }}
                  className="text-sm md:text-sm leading-[2.2] font-normal text-white/80 mb-16 max-w-md border-l border-white/20 pl-6"
                >
                  Like {selectedPlanet.name === 'EARTH' ? 'Venus' : 'Earth'}, {selectedPlanet.name.toLowerCase()} experiences intense environmental shifts throughout its cycle, offering unparalleled insights into planetary evolution.
                </motion.p>

                {/* Info Footer grid */}
                <motion.div 
                   initial={{ opacity: 0, y: 20 }}
                   animate={{ opacity: 1, y: 0 }}
                   transition={{ delay: 0.6, duration: 1 }}
                   className="mt-auto pb-12 grid grid-cols-2 md:grid-cols-3 gap-8 md:gap-12"
                >
                  <div className="flex flex-col gap-3 border-t border-white/20 pt-4">
                    <span className="text-[10px] tracking-[0.25em] font-bold text-white uppercase">Atmosphere</span>
                    <span className="text-xs text-white/80 font-normal leading-relaxed pr-4">{selectedPlanet.exo}</span>
                  </div>
                  <div className="flex flex-col gap-3 border-t border-white/20 pt-4">
                    <span className="text-[10px] tracking-[0.25em] font-bold text-white uppercase">Climate</span>
                    <span className="text-xs text-white/80 font-normal leading-relaxed pr-4">{selectedPlanet.climate}</span>
                  </div>
                  <div className="hidden md:flex flex-col gap-3 border-t border-white/20 pt-4">
                    <span className="text-[10px] tracking-[0.25em] font-bold text-white uppercase">Physical</span>
                    <span className="text-xs text-white/80 font-normal leading-relaxed pr-4">{selectedPlanet.physical}</span>
                  </div>
                </motion.div>
              </div>
            </div>

            {/* Massive 3D Sphere (Right side absolute) - FULLY REWORKED FOR CINEMATIC QUALITY */}
            <div className="absolute top-0 right-0 w-full h-full pointer-events-none flex items-center justify-end overflow-hidden z-10 custom-planet-container">
              
              <motion.div 
                initial={{ x: '50vw', opacity: 0 }}
                animate={{ x: '25vw', opacity: 1 }}
                exit={{ x: '100vw', opacity: 0 }}
                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                className="absolute right-0 w-[140vw] h-[140vw] md:w-[85vw] md:h-[85vw] rounded-full border-l border-white/5"
                style={{ 
                  backgroundColor: selectedPlanet.color, 
                  background: `radial-gradient(circle at 35% 35%, ${selectedPlanet.color} 0%, rgba(0,0,0,0.85) 75%, black 100%)`,
                  /* Incredible 3D inner and outer shadow shading (no grainy SVG texture) */
                  boxShadow: `inset -80px -80px 150px rgba(0,0,0,0.95), inset 40px 40px 100px rgba(255,255,255,0.15), 0 0 150px ${selectedPlanet.color}20`
                }}
              >
                
                {/* Simulated specular light */}
                <div className="absolute top-[20%] left-[25%] w-[30%] h-[30%] bg-white/10 rounded-full blur-[80px] mix-blend-screen" />

                {/* Optional extremely subtle overlay just for depth, not blurry grain */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-black via-transparent to-white/5" />

                {/* SATURN RINGS in Detail View */}
                {selectedPlanet.hasRing && (
                  <motion.div 
                     initial={{ rotate: 10, scale: 0.8, opacity: 0 }}
                     animate={{ rotate: 25, scale: 1, opacity: 1 }}
                     transition={{ delay: 0.5, duration: 1.5 }}
                     className="absolute top-[10%] left-[-40%] w-[180%] h-[80%] border-t border-b md:border-t-4 md:border-b-4 border-white/20 rounded-[50%] pointer-events-none"
                     style={{ 
                        boxShadow: "inset 0 0 100px rgba(0,0,0,0.8), 0 0 100px rgba(255,255,255,0.15)",
                        background: "radial-gradient(ellipse at center, transparent 40%, rgba(255,255,255,0.05) 50%, transparent 60%)"
                     }}
                  />
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
