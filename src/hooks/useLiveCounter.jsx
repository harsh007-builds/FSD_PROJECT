import { useState, useEffect } from 'react';

/**
 * A custom hook that simulates a fluctuating live metric.
 * It gently increments or decrements the value at regular intervals.
 * 
 * @param {number} initialValue - The starting value.
 * @param {number} min - The minimum allowed value.
 * @param {number} max - The maximum allowed value.
 * @param {number} intervalMs - How often the value updates in milliseconds.
 * @returns {number} The current live value.
 */
export const useLiveCounter = (initialValue, min, max, intervalMs = 3000) => {
  const [count, setCount] = useState(initialValue);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCount(prevCount => {
        // Randomly decide to add, subtract, or stay the same
        const change = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
        
        let nextCount = prevCount + change;
        
        // Constrain within bounds
        if (nextCount < min) nextCount = min;
        if (nextCount > max) nextCount = max;
        
        return nextCount;
      });
    }, intervalMs);

    // Cleanup interval on unmount
    return () => clearInterval(intervalId);
  }, [min, max, intervalMs]);

  return count;
};
