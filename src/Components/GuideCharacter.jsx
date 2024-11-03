import React, { useState, useEffect } from 'react';

const GuideCharacter = ({ speaking = false, emotion = 'neutral' }) => {
  const [mouthHeight, setMouthHeight] = useState(0);

  useEffect(() => {
    let animationFrame;
    let startTime;

    const animateMouth = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;

      if (speaking) {
        // シンプルな正弦波アニメーション
        const height = Math.sin(progress / 100) * 10 + 15;
        setMouthHeight(height);
        animationFrame = requestAnimationFrame(animateMouth);
      } else {
        setMouthHeight(0);
      }
    };

    if (speaking) {
      animationFrame = requestAnimationFrame(animateMouth);
    }

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [speaking]);

  return (
    <div className="w-64 h-64 mx-auto relative">
      <svg
        viewBox="0 0 400 400"
        className={`w-full h-full transition-all duration-300 ${
          speaking ? 'animate-subtle-bounce' : ''
        }`}
      >
        {/* Base circle for character */}
        <circle
          cx="200"
          cy="200"
          r="180"
          fill="#FFE5D9"
          className="transition-all duration-300"
        />

        {/* Eyes */}
        <g className={`transition-all duration-300 ${emotion === 'happy' ? 'translate-y-2' : ''}`}>
          {emotion === 'happy' ? (
            <>
              {/* Happy eyes (curved lines) */}
              <path
                d="M140 160 Q160 180 180 160"
                fill="none"
                stroke="#333"
                strokeWidth="8"
                strokeLinecap="round"
              />
              <path
                d="M220 160 Q240 180 260 160"
                fill="none"
                stroke="#333"
                strokeWidth="8"
                strokeLinecap="round"
              />
            </>
          ) : (
            <>
              {/* Normal eyes (circles) */}
              <circle cx="160" cy="160" r="15" fill="#333">
                <animate
                  attributeName="cy"
                  values="160;165;160"
                  dur="4s"
                  repeatCount="indefinite"
                />
              </circle>
              <circle cx="240" cy="160" r="15" fill="#333">
                <animate
                  attributeName="cy"
                  values="160;165;160"
                  dur="4s"
                  repeatCount="indefinite"
                />
              </circle>
            </>
          )}
        </g>

        {/* Mouth */}
        <g className="transition-all duration-100">
          {speaking ? (
            <path
              d={`M160 ${240 - mouthHeight} Q200 ${240 + mouthHeight} 240 ${240 - mouthHeight}`}
              fill="none"
              stroke="#333"
              strokeWidth="8"
              strokeLinecap="round"
            />
          ) : emotion === 'happy' ? (
            <path
              d="M160 240 Q200 280 240 240"
              fill="none"
              stroke="#333"
              strokeWidth="8"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M160 240 Q200 245 240 240"
              fill="none"
              stroke="#333"
              strokeWidth="8"
              strokeLinecap="round"
            />
          )}
        </g>

        {/* Blush */}
        {emotion === 'happy' && (
          <g className="transition-all duration-300">
            <circle cx="120" cy="200" r="20" fill="#FFB7B7" opacity="0.5" />
            <circle cx="280" cy="200" r="20" fill="#FFB7B7" opacity="0.5" />
          </g>
        )}

        {/* Animation effects */}
        {speaking && (
          <g className="speaking-effects">
            <circle cx="320" cy="160" r="5" fill="#6366F1" opacity="0.6">
              <animate
                attributeName="opacity"
                values="0.6;0;0.6"
                dur="1s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="r"
                values="5;8;5"
                dur="1s"
                repeatCount="indefinite"
              />
            </circle>
            <circle cx="340" cy="180" r="4" fill="#6366F1" opacity="0.6">
              <animate
                attributeName="opacity"
                values="0.6;0;0.6"
                dur="1.5s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="r"
                values="4;7;4"
                dur="1.5s"
                repeatCount="indefinite"
              />
            </circle>
          </g>
        )}
      </svg>
    </div>
  );
};

export default GuideCharacter;