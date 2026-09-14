export function textDimensions(text: string, fontSize: number) {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return { width: fontSize, height: fontSize * 1.4 };
  context.font = `${fontSize}px Inter, system-ui, sans-serif`;
  const lines = text.split('\n');
  return {
    width: Math.max(...lines.map((line) => context.measureText(line).width), fontSize),
    height: Math.max(1, lines.length) * fontSize * 1.4,
  };
}
