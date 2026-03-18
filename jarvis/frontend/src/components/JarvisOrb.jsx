import React from 'react';
import './JarvisOrb.css';

export default function JarvisOrb({ state }) {
  return (
    <div className={`orb-container orb-${state}`}>
      {/* Outer rings */}
      <div className="orb-ring ring-1" />
      <div className="orb-ring ring-2" />
      <div className="orb-ring ring-3" />

      {/* Core orb */}
      <div className="orb-core">
        <div className="orb-inner">
          <div className="orb-plasma" />
          <div className="orb-plasma orb-plasma-2" />
          <div className="orb-center-dot" />
        </div>
      </div>

      {/* Scan lines */}
      <div className="orb-scan" />

      {/* Particles */}
      {[...Array(8)].map((_, i) => (
        <div key={i} className="orb-particle" style={{ '--i': i }} />
      ))}
    </div>
  );
}
