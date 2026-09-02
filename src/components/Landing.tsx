import React from "react";

interface LandingProps {
  morph: boolean;
  setMorph: (morph: boolean) => void;
}

const Landing: React.FC<LandingProps> = ({ setMorph }) => {
  return (
    <div className="flex flex-col items-center justify-center w-full">
      <h1
        className="leading-none mb-8 text-center"
        style={{
          fontFamily: "'Abril Fatface', cursive",
          fontSize: "clamp(3rem, 10vw, 7.5rem)",
          letterSpacing: "-0.02em",
        }}
      >
        <span className="whitespace-nowrap">Happy Birthday.</span>
        <br />
        <span>Zoya</span>
      </h1>
      <button
        onClick={() => setMorph(true)}
        className="px-8 py-3 rounded-full bg-white text-neutral-900 font-medium hover:bg-neutral-200 transition-all active:scale-95 cursor-pointer shadow-lg hover:shadow-white/20"
      >
        Click
      </button>
    </div>
  );
};

export default Landing;
