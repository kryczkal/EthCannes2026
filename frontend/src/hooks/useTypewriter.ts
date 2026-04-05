import { useState, useEffect } from "react";

export function useTypewriter(text: string, speed = 10): { displayed: string; done: boolean } {
  const [index, setIndex] = useState(0);

  // Reset index when text changes (adjust state during render)
  const [prevText, setPrevText] = useState(text);
  if (text !== prevText) {
    setPrevText(text);
    setIndex(0);
  }

  useEffect(() => {
    if (index >= text.length) return;
    const t = setTimeout(() => setIndex((i) => i + 1), speed);
    return () => clearTimeout(t);
  }, [index, text, speed]);

  return { displayed: text.slice(0, index), done: index >= text.length };
}
