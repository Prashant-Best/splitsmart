// Chart colors from the validated palette (light surface): categorical slots 1-2 and chrome.
// Text never uses a series color; it stays in the ink tokens.
export const chartTheme = {
  series1: '#2a78d6',
  series2: '#eb6834',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  muted: '#898781',
  inkSecondary: '#52514e',
  cursor: 'rgba(15, 23, 42, 0.04)',
} as const;

export const axisTick = { fill: chartTheme.muted, fontSize: 12 } as const;
